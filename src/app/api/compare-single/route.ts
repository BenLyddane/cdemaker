import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow, CDEStatus, DocumentLocation } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

interface PageImage {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compare a single spec requirement against submittal images visually
 * Returns AI CDE result with submittal location
 */
async function compareSpecToSubmittal(
  specRow: ExtractedRow,
  submittalPages: PageImage[],
  retryCount: number = 0
): Promise<{
  status: CDEStatus;
  matchConfidence: "high" | "medium" | "low" | "not_found";
  explanation: string;
  submittalValue?: string;
  submittalUnit?: string;
  submittalLocation?: DocumentLocation;
  error?: string;
}> {
  try {
    const prompt = `You are a construction document reviewer comparing a specification requirement against manufacturer submittal data.

SPECIFICATION REQUIREMENT TO VERIFY:
- Field: ${specRow.field}
- Required Value: ${specRow.value}
- Unit: ${specRow.unit || "N/A"}
- Section: ${specRow.section || "General"}
- Spec Number: ${specRow.specNumber || "N/A"}

TASK: Search through ALL the submittal pages provided and find where this specification value appears. Determine if the submittal meets the requirement.

FIELD TYPE RULES:
1. EXACT MATCH required for: Voltage, Phase, Model numbers, Part numbers, Dimensions, Connection sizes
2. HIGHER IS BETTER (exceed = comply): Ratings (salt spray, corrosion), Efficiency %, Warranty, Pressure ratings, Certifications count
3. LOWER IS BETTER (below = comply): Noise level (dB), Power consumption (watts)
4. MATCH OR CLOSE: Flow rates, Capacity (±5% acceptable)

COMPLIANCE STATUS:
- "comply": Submittal value matches OR exceeds spec (where higher is better) OR is below spec (where lower is better)
- "deviate": Values differ slightly, may be acceptable with engineering review
- "exception": Values incompatible, missing, or wrong direction

BOUNDING BOX: If you find the relevant data in the submittal, provide normalized coordinates (0-1) for where it appears.

RESPOND WITH STRICT JSON:
{
  "status": "comply" | "deviate" | "exception",
  "matchConfidence": "high" | "medium" | "low" | "not_found",
  "foundOnPage": <page number where found, or null if not found>,
  "submittalValue": "<actual value found in submittal, or null>",
  "submittalUnit": "<unit from submittal if different from spec, or null>",
  "boundingBox": {
    "x": <normalized x coordinate 0-1 of left edge>,
    "y": <normalized y coordinate 0-1 of top edge>,
    "width": <normalized width 0-1>,
    "height": <normalized height 0-1>
  } or null if not found,
  "explanation": "Brief explanation (max 20 words). State values and result."
}`;

    // Create image parts from submittal pages (limit to first 8 pages for single item)
    const pagesToSend = submittalPages.slice(0, 8);
    const imageParts: Part[] = pagesToSend.map(page => ({
      inlineData: { data: page.base64, mimeType: page.mimeType },
    }));

    // Send prompt + all images
    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Build submittal location if found
    let submittalLocation: DocumentLocation | undefined;
    if (parsed.foundOnPage && parsed.boundingBox) {
      submittalLocation = {
        pageNumber: parsed.foundOnPage,
        boundingBox: parsed.boundingBox,
      };
    } else if (parsed.foundOnPage) {
      submittalLocation = {
        pageNumber: parsed.foundOnPage,
      };
    }
    
    return {
      status: parsed.status || "exception",
      matchConfidence: parsed.matchConfidence || "low",
      explanation: parsed.explanation || "Unable to determine",
      submittalValue: parsed.submittalValue || undefined,
      submittalUnit: parsed.submittalUnit || undefined,
      submittalLocation,
    };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * (retryCount + 1));
      return compareSpecToSubmittal(specRow, submittalPages, retryCount + 1);
    }
    
    return {
      status: "pending" as CDEStatus,
      matchConfidence: "not_found",
      explanation: "Comparison failed after retries",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { specRow, submittalPages } = body as {
      specRow: ExtractedRow;
      submittalPages: PageImage[];
    };

    if (!specRow) {
      return NextResponse.json(
        { error: "Spec row is required" },
        { status: 400 }
      );
    }

    if (!submittalPages || submittalPages.length === 0) {
      return NextResponse.json(
        { error: "Submittal pages are required" },
        { status: 400 }
      );
    }

    console.log(`[compare-single] Comparing: ${specRow.field} = ${specRow.value}`);
    
    const result = await compareSpecToSubmittal(specRow, submittalPages);
    
    console.log(`[compare-single] Result: ${result.status} (${result.matchConfidence})`);

    return NextResponse.json({
      success: true,
      data: {
        rowId: specRow.id,
        ...result,
      },
    });
  } catch (error) {
    console.error("Single comparison error:", error);
    return NextResponse.json(
      {
        error: "Comparison failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
