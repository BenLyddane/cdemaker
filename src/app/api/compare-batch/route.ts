import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow, CDEStatus, SubmittalFinding, BoundingBox } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
// Using flash for speed - processes multiple rows in one call
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

interface PageImage {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

interface BatchFinding {
  specId: string; // Which spec row this finding is for
  pageNumber: number;
  value: string;
  unit?: string;
  confidence: "high" | "medium" | "low";
  boundingBox?: BoundingBox;
  status: CDEStatus;
  explanation: string;
}

interface SpecRowResult {
  rowId: string;
  findings: SubmittalFinding[];
  status: CDEStatus;
  matchConfidence: "high" | "medium" | "low" | "not_found";
  explanation: string;
  submittalValue?: string;
  submittalUnit?: string;
  submittalLocation?: {
    pageNumber: number;
    boundingBox?: BoundingBox;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("429") || 
           message.includes("rate limit") || 
           message.includes("quota") ||
           message.includes("resource exhausted");
  }
  return false;
}

/**
 * Compare MULTIPLE spec requirements against submittal pages in ONE API call
 * This is the key optimization - batch multiple specs together
 */
async function compareMultipleSpecsToBatch(
  specRows: ExtractedRow[],
  submittalPages: PageImage[],
  batchStartPage: number,
  retryCount: number = 0
): Promise<{
  findings: BatchFinding[];
  error?: string;
}> {
  try {
    // Build the specs list for the prompt
    const specsSection = specRows.map((row, idx) => `
SPEC #${idx + 1} (ID: ${row.id}):
  - Field: ${row.field}
  - Required Value: ${row.value}
  - Unit: ${row.unit || "N/A"}
  - Section: ${row.section || "General"}`).join("\n");

    const prompt = `You are a construction document reviewer comparing MULTIPLE specification requirements against manufacturer submittal data IN ONE PASS.

=== SPECIFICATION REQUIREMENTS TO VERIFY (${specRows.length} items) ===
${specsSection}

=== TASK ===
Search the ${submittalPages.length} submittal pages (pages ${batchStartPage}-${batchStartPage + submittalPages.length - 1}) and find values that DIRECTLY ANSWER each specification requirement.

=== CRITICAL RULES ===
1. ONLY return findings that DIRECTLY answer a specification requirement
2. Each finding MUST include the "specId" field matching one of the spec IDs above
3. The value MUST be for the EXACT equipment/item being specified
4. QUALITY over QUANTITY: Better to miss uncertain matches than include wrong ones
5. Maximum 1-2 findings per spec requirement

=== COMPLIANCE STATUS ===
- "comply": Submittal value meets or exceeds the spec requirement
- "deviate": Values differ but may be acceptable with review
- "exception": Values are incompatible or wrong

=== BOUNDING BOX ===
Provide normalized coordinates (0-1) for where you found each value.

RESPOND WITH STRICT JSON:
{
  "findings": [
    {
      "specId": "<ID of the spec this finding answers>",
      "pageNumber": <page number where found>,
      "value": "<exact value found>",
      "unit": "<unit or null>",
      "confidence": "high" | "medium" | "low",
      "status": "comply" | "deviate" | "exception",
      "boundingBox": { "x": <0-1>, "y": <0-1>, "width": <0-1>, "height": <0-1> },
      "explanation": "Brief explanation (max 15 words)"
    }
  ]
}

RULES:
- Return ONLY findings with high confidence
- If nothing relevant found for a spec, don't include it
- pageNumber must be in range ${batchStartPage}-${batchStartPage + submittalPages.length - 1}
- specId MUST exactly match one of the provided spec IDs`;

    // Create image parts
    const imageParts: Part[] = submittalPages.map((page) => ({
      inlineData: { 
        data: page.base64, 
        mimeType: page.mimeType 
      },
    }));

    // Page labels
    const pageLabels = submittalPages.map((_, idx) => 
      `[Page ${batchStartPage + idx}]`
    ).join(" ");

    const result = await model.generateContent([
      prompt,
      `Page numbers in order: ${pageLabels}`,
      ...imageParts
    ]);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[compare-batch] No valid JSON found in response:", text.substring(0, 200));
      return { findings: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Get valid spec IDs
    const validSpecIds = new Set(specRows.map(r => r.id));
    
    // Validate and normalize findings
    const validFindings: BatchFinding[] = (parsed.findings || [])
      .filter((f: any) => 
        f.specId &&
        validSpecIds.has(f.specId) &&
        f.pageNumber && 
        f.value && 
        f.pageNumber >= batchStartPage && 
        f.pageNumber < batchStartPage + submittalPages.length
      )
      .map((f: any) => ({
        specId: f.specId,
        pageNumber: f.pageNumber,
        value: f.value,
        unit: f.unit || undefined,
        confidence: f.confidence || "medium",
        boundingBox: f.boundingBox || undefined,
        status: f.status || "deviate",
        explanation: f.explanation || "Found in submittal",
      }));
    
    return { findings: validFindings };
  } catch (error) {
    if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`[compare-batch] Rate limited, retrying in ${delay}ms`);
      await sleep(delay);
      return compareMultipleSpecsToBatch(specRows, submittalPages, batchStartPage, retryCount + 1);
    }
    
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * (retryCount + 1);
      await sleep(delay);
      return compareMultipleSpecsToBatch(specRows, submittalPages, batchStartPage, retryCount + 1);
    }
    
    console.error("[compare-batch] Failed after retries:", error);
    return {
      findings: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process findings into per-row results
 */
function processResultsForRows(
  specRows: ExtractedRow[],
  allFindings: BatchFinding[]
): SpecRowResult[] {
  return specRows.map(row => {
    // Get findings for this row
    const rowFindings = allFindings
      .filter(f => f.specId === row.id)
      .map(f => ({
        id: generateFindingId(),
        pageNumber: f.pageNumber,
        value: f.value,
        unit: f.unit,
        confidence: f.confidence,
        boundingBox: f.boundingBox,
        status: f.status,
        explanation: f.explanation,
      }));
    
    // Determine status and confidence
    let status: CDEStatus = "not_found";
    let matchConfidence: "high" | "medium" | "low" | "not_found" = "not_found";
    let explanation = "No matching data found in submittal";
    let bestMatch: typeof rowFindings[0] | null = null;
    
    if (rowFindings.length > 0) {
      // Sort by confidence then status
      const sorted = [...rowFindings].sort((a, b) => {
        const confOrder = { high: 0, medium: 1, low: 2 };
        const statOrder: Record<CDEStatus, number> = { comply: 0, deviate: 1, exception: 2, not_found: 3, pending: 4 };
        const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
        if (confDiff !== 0) return confDiff;
        return statOrder[a.status] - statOrder[b.status];
      });
      
      bestMatch = sorted[0];
      
      // Overall status
      if (rowFindings.some(f => f.status === "comply")) status = "comply";
      else if (rowFindings.some(f => f.status === "deviate")) status = "deviate";
      else status = "exception";
      
      // Overall confidence
      if (rowFindings.some(f => f.confidence === "high")) matchConfidence = "high";
      else if (rowFindings.some(f => f.confidence === "medium")) matchConfidence = "medium";
      else matchConfidence = "low";
      
      explanation = rowFindings.length > 1 
        ? `${rowFindings.length} occurrences found. Best: ${bestMatch?.explanation}`
        : bestMatch?.explanation || "Found in submittal";
    }
    
    return {
      rowId: row.id,
      findings: rowFindings,
      status,
      matchConfidence,
      explanation,
      submittalValue: bestMatch?.value,
      submittalUnit: bestMatch?.unit,
      submittalLocation: bestMatch ? {
        pageNumber: bestMatch.pageNumber,
        boundingBox: bestMatch.boundingBox,
      } : undefined,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { specRows, submittalPages, batchInfo } = body as {
      specRows: ExtractedRow[]; // Multiple spec rows to check at once
      submittalPages: PageImage[];
      batchInfo?: {
        batchIndex: number;
        totalBatches: number;
        startPage: number;
        endPage: number;
        totalPages: number;
      };
    };

    if (!specRows || specRows.length === 0) {
      return NextResponse.json(
        { error: "Spec rows are required" },
        { status: 400 }
      );
    }

    if (!submittalPages || submittalPages.length === 0) {
      return NextResponse.json(
        { error: "Submittal pages are required" },
        { status: 400 }
      );
    }

    const batchStartPage = submittalPages[0]?.pageNumber || 1;
    
    console.log(`[compare-batch] Processing ${specRows.length} specs against ${submittalPages.length} pages`);
    if (batchInfo) {
      console.log(`[compare-batch] Page batch ${batchInfo.batchIndex + 1}/${batchInfo.totalBatches}`);
    }
    
    // Process all specs against all pages in ONE API call
    const result = await compareMultipleSpecsToBatch(specRows, submittalPages, batchStartPage);
    
    // Process findings into per-row results
    const rowResults = processResultsForRows(specRows, result.findings);
    
    console.log(`[compare-batch] Found ${result.findings.length} total findings for ${specRows.length} specs`);

    return NextResponse.json({
      success: true,
      data: {
        results: rowResults,
        totalFindings: result.findings.length,
        specsProcessed: specRows.length,
        pagesScanned: submittalPages.length,
        error: result.error,
      },
    });
  } catch (error) {
    console.error("Batch comparison error:", error);
    return NextResponse.json(
      {
        error: "Comparison failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
