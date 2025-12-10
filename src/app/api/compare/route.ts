import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow, ComparisonResult, CDEStatus } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
 */
async function compareSpecToSubmittalImages(
  specRow: ExtractedRow,
  submittalPages: PageImage[],
  retryCount: number = 0
): Promise<{
  specId: string;
  status: CDEStatus;
  matchConfidence: "high" | "medium" | "low" | "not_found";
  explanation: string;
  foundOnPage?: number;
  submittalValue?: string;
  error?: string;
}> {
  try {
    const prompt = `You are a construction document reviewer comparing a specification requirement against manufacturer submittal data.

SPECIFICATION REQUIREMENT TO VERIFY:
- Field: ${specRow.field}
- Required Value: ${specRow.value}
- Unit: ${specRow.unit || "N/A"}
- Section: ${specRow.section || "General"}

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

RESPOND WITH STRICT JSON:
{
  "status": "comply" | "deviate" | "exception",
  "matchConfidence": "high" | "medium" | "low" | "not_found",
  "foundOnPage": <page number where found, or null if not found>,
  "submittalValue": "<actual value found in submittal, or null>",
  "explanation": "Brief explanation (max 20 words). State values and result."
}`;

    // Create image parts from submittal pages (limit to first 10 pages to stay within limits)
    const pagesToSend = submittalPages.slice(0, 10);
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
    
    return {
      specId: specRow.id,
      status: parsed.status || "exception",
      matchConfidence: parsed.matchConfidence || "low",
      explanation: parsed.explanation || "Unable to determine",
      foundOnPage: parsed.foundOnPage || undefined,
      submittalValue: parsed.submittalValue || undefined,
    };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * (retryCount + 1));
      return compareSpecToSubmittalImages(specRow, submittalPages, retryCount + 1);
    }
    
    return {
      specId: specRow.id,
      status: "pending" as CDEStatus,
      matchConfidence: "not_found",
      explanation: "Comparison failed after retries",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Legacy comparison using extracted data (fallback)
 */
async function compareSingleItem(
  specRow: ExtractedRow,
  submittalRows: ExtractedRow[],
  retryCount: number = 0
): Promise<{
  specId: string;
  submittalId: string | null;
  status: CDEStatus;
  matchConfidence: "high" | "medium" | "low" | "not_found";
  explanation: string;
  error?: string;
}> {
  try {
    const submittalData = submittalRows.map((r) => ({
      id: r.id,
      field: r.field,
      value: r.value,
      unit: r.unit,
      section: r.section,
    }));

    const prompt = `Compare this specification requirement against submittal data.

SPECIFICATION REQUIREMENT:
- Field: ${specRow.field}
- Value: ${specRow.value}
- Unit: ${specRow.unit || "N/A"}
- Section: ${specRow.section || "General"}

SUBMITTAL DATA:
${JSON.stringify(submittalData, null, 2)}

TASK: Find matching submittal data and determine compliance status.

RESPOND WITH STRICT JSON:
{
  "submittalId": "matching submittal item id or null if not found",
  "status": "comply" | "deviate" | "exception",
  "matchConfidence": "high" | "medium" | "low" | "not_found",
  "explanation": "Brief explanation (max 15 words)"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      specId: specRow.id,
      submittalId: parsed.submittalId || null,
      status: parsed.status || "exception",
      matchConfidence: parsed.matchConfidence || "low",
      explanation: parsed.explanation || "Unable to determine",
    };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * (retryCount + 1));
      return compareSingleItem(specRow, submittalRows, retryCount + 1);
    }
    
    return {
      specId: specRow.id,
      submittalId: null,
      status: "pending" as CDEStatus,
      matchConfidence: "not_found",
      explanation: "Comparison failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { specificationData, submittalData, submittalPages } = body as {
      specificationData: { rows: ExtractedRow[] };
      submittalData?: { rows: ExtractedRow[] };
      submittalPages?: PageImage[];
    };

    if (!specificationData?.rows) {
      return NextResponse.json(
        { error: "Specification data is required" },
        { status: 400 }
      );
    }

    const specRows = specificationData.rows;
    const allResults: ComparisonResult[] = [];
    const errors: string[] = [];

    // Determine comparison mode: visual (with images) or legacy (with extracted data)
    const useVisualComparison = submittalPages && submittalPages.length > 0;
    
    console.log(`[compare] Mode: ${useVisualComparison ? 'VISUAL (images)' : 'LEGACY (extracted data)'}`);
    console.log(`[compare] Processing ${specRows.length} spec items`);

    for (let i = 0; i < specRows.length; i++) {
      const specRow = specRows[i];
      console.log(`[compare] Item ${i + 1}/${specRows.length}: ${specRow.field}`);
      
      if (useVisualComparison) {
        // NEW: Visual comparison - AI reads submittal images directly
        const result = await compareSpecToSubmittalImages(specRow, submittalPages);
        
        if (result.error) {
          errors.push(`Item ${i + 1} (${specRow.field}): ${result.error}`);
        }

        allResults.push({
          id: `cmp-${specRow.id}`,
          specField: specRow.field,
          specValue: specRow.value,
          specUnit: specRow.unit,
          specSection: specRow.section,
          specLocation: {
            pageNumber: specRow.pageNumber,
            textSnippet: specRow.rawText,
          },
          submittalField: specRow.field,
          submittalValue: result.submittalValue,
          submittalUnit: specRow.unit,
          submittalLocation: result.foundOnPage ? {
            pageNumber: result.foundOnPage,
          } : undefined,
          status: result.status,
          aiExplanation: result.explanation,
          matchConfidence: result.matchConfidence,
          isReviewed: false,
        });
      } else {
        // LEGACY: Compare against extracted submittal data
        const submittalRows = submittalData?.rows || [];
        const result = await compareSingleItem(specRow, submittalRows);
        
        if (result.error) {
          errors.push(`Item ${i + 1} (${specRow.field}): ${result.error}`);
        }

        const submittalRow = result.submittalId
          ? submittalRows.find((r) => r.id === result.submittalId)
          : undefined;

        allResults.push({
          id: `cmp-${specRow.id}`,
          specField: specRow.field,
          specValue: specRow.value,
          specUnit: specRow.unit,
          specSection: specRow.section,
          specLocation: {
            pageNumber: specRow.pageNumber,
            textSnippet: specRow.rawText,
          },
          submittalField: submittalRow?.field,
          submittalValue: submittalRow?.value,
          submittalUnit: submittalRow?.unit,
          submittalLocation: submittalRow ? {
            pageNumber: submittalRow.pageNumber,
            textSnippet: submittalRow.rawText,
          } : undefined,
          status: result.status,
          aiExplanation: result.explanation,
          matchConfidence: result.matchConfidence,
          isReviewed: false,
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < specRows.length - 1) {
        await sleep(300);
      }
    }

    // Calculate summary
    const summary = {
      totalItems: allResults.length,
      comply: allResults.filter((r) => r.status === "comply").length,
      deviate: allResults.filter((r) => r.status === "deviate").length,
      exception: allResults.filter((r) => r.status === "exception").length,
      pending: allResults.filter((r) => r.status === "pending").length,
      reviewed: allResults.filter((r) => r.isReviewed).length,
    };

    console.log(`[compare] Complete. ${summary.comply} comply, ${summary.deviate} deviate, ${summary.exception} exception`);

    return NextResponse.json({
      success: true,
      data: {
        comparisons: allResults,
        summary,
        comparisonMode: useVisualComparison ? "visual" : "legacy",
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Comparison error:", error);
    return NextResponse.json(
      {
        error: "Comparison failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
