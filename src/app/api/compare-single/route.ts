import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow, CDEStatus, DocumentLocation, SubmittalFinding, BoundingBox } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
// Using gemini-2.0-flash for faster processing with large context
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_PAGES_PER_BATCH = 30; // Process many pages per call to reduce API requests
const MAX_FINDINGS_PER_SPEC = 3; // Limit findings to prevent bloat

interface PageImage {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

interface BatchFinding {
  pageNumber: number;
  value: string;
  unit?: string;
  confidence: "high" | "medium" | "low";
  boundingBox?: BoundingBox;
  status: CDEStatus;
  explanation: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID for findings
 */
function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if error is a rate limit error (429)
 */
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
 * Compare a single spec requirement against a batch of submittal pages
 * Returns ALL findings found in this batch
 */
async function compareSpecToBatch(
  specRow: ExtractedRow,
  submittalPages: PageImage[],
  batchStartPage: number,
  retryCount: number = 0
): Promise<{
  findings: BatchFinding[];
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

TASK: Search the ${submittalPages.length} submittal pages (pages ${batchStartPage}-${batchStartPage + submittalPages.length - 1}) for the value that DIRECTLY ANSWERS this specification requirement.

=== CRITICAL ACCURACY REQUIREMENTS ===
1. ONLY return findings that DIRECTLY answer the specification requirement
2. The value MUST be for the EXACT equipment/item being specified, not similar items
3. DO NOT include values for:
   - Different models or product variants
   - Optional accessories or add-ons
   - Different sizes or configurations
   - Adjacent or loosely related data
4. If uncertain whether a value directly answers the spec - DO NOT INCLUDE IT
5. QUALITY over QUANTITY: 1 perfect match is better than 10 loosely related ones
6. The finding must answer the question: "Does this submittal meet this specific requirement?"

=== FIELD MATCHING RULES ===
- EXACT MATCH required for: Voltage, Phase, Model numbers, Part numbers, Dimensions, Connection sizes
- HIGHER IS BETTER (exceed = comply): Efficiency %, Warranty, Pressure ratings, Certifications
- LOWER IS BETTER (below = comply): Noise level (dB), Power consumption
- TOLERANCE MATCH: Flow rates, Capacity (±5% acceptable)

=== COMPLIANCE STATUS ===
- "comply": Submittal value definitively meets or exceeds the spec requirement
- "deviate": Values differ but may be acceptable with engineering review
- "exception": Values are incompatible, wrong, or missing

=== BOUNDING BOX REQUIREMENT ===
For EACH finding, provide a bounding box around the specific value found:
- x: distance from LEFT edge (0-1 normalized)
- y: distance from TOP edge (0-1 normalized)
- width/height: size of box (0-1 normalized)

RESPOND WITH STRICT JSON:
{
  "findings": [
    {
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

IMPORTANT:
- Only return findings with HIGH confidence that they directly answer the spec
- If nothing DIRECTLY relevant is found, return {"findings": []}
- Maximum 1-2 findings per spec (the most relevant only)
- pageNumber must be in range ${batchStartPage}-${batchStartPage + submittalPages.length - 1}`;

    // Create image parts with page number labels
    const imageParts: Part[] = submittalPages.map((page, idx) => ({
      inlineData: { 
        data: page.base64, 
        mimeType: page.mimeType 
      },
    }));

    // Add text labels for page numbers
    const pageLabels = submittalPages.map((_, idx) => 
      `[Page ${batchStartPage + idx}]`
    ).join(" ");

    // Send prompt + page labels + all images
    const result = await model.generateContent([
      prompt,
      `Page numbers in order: ${pageLabels}`,
      ...imageParts
    ]);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[compare-single] No valid JSON found in response:", text.substring(0, 200));
      return { findings: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize findings
    const validFindings: BatchFinding[] = (parsed.findings || [])
      .filter((f: any) => 
        f.pageNumber && 
        f.value && 
        f.pageNumber >= batchStartPage && 
        f.pageNumber < batchStartPage + submittalPages.length
      )
      .map((f: any) => ({
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
    // Handle rate limiting with exponential backoff
    if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`[compare-single] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return compareSpecToBatch(specRow, submittalPages, batchStartPage, retryCount + 1);
    }
    
    // General retry for other errors
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * (retryCount + 1);
      console.log(`[compare-single] Error, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      await sleep(delay);
      return compareSpecToBatch(specRow, submittalPages, batchStartPage, retryCount + 1);
    }
    
    console.error("[compare-single] Batch failed after retries:", error);
    return {
      findings: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Select the best match from all findings
 * Priority: highest confidence, then "comply" status, then earliest page
 */
function selectBestMatch(findings: SubmittalFinding[]): SubmittalFinding | null {
  if (findings.length === 0) return null;
  
  // Sort by: confidence (high > medium > low), then status (comply > deviate > exception), then page
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const statusOrder: Record<CDEStatus, number> = { comply: 0, deviate: 1, exception: 2, not_found: 3, pending: 4 };
  
  const sorted = [...findings].sort((a, b) => {
    // First by confidence
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    
    // Then by status (prefer comply)
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    // Finally by page number (earlier is better)
    return a.pageNumber - b.pageNumber;
  });
  
  return sorted[0];
}

/**
 * Determine overall status from all findings
 */
function determineOverallStatus(findings: SubmittalFinding[]): CDEStatus {
  if (findings.length === 0) return "exception";
  
  // If any finding is "comply", overall is comply
  if (findings.some(f => f.status === "comply")) return "comply";
  
  // If any finding is "deviate", overall is deviate
  if (findings.some(f => f.status === "deviate")) return "deviate";
  
  // Otherwise exception
  return "exception";
}

/**
 * Determine overall match confidence
 */
function determineOverallConfidence(findings: SubmittalFinding[]): "high" | "medium" | "low" | "not_found" {
  if (findings.length === 0) return "not_found";
  
  // Return the highest confidence among findings
  if (findings.some(f => f.confidence === "high")) return "high";
  if (findings.some(f => f.confidence === "medium")) return "medium";
  return "low";
}

interface BatchInfo {
  batchIndex: number;
  totalBatches: number;
  startPage: number;
  endPage: number;
  totalPages: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { specRow, submittalPages, scanAllPages = true, batchInfo } = body as {
      specRow: ExtractedRow;
      submittalPages: PageImage[];
      scanAllPages?: boolean; // If false, process only the pages provided (client-side batching)
      batchInfo?: BatchInfo; // Client-side batching metadata
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

    // Log based on batching mode
    if (batchInfo) {
      console.log(`[compare-single] Client batch ${batchInfo.batchIndex + 1}/${batchInfo.totalBatches} for: ${specRow.field}`);
      console.log(`[compare-single] Pages ${batchInfo.startPage}-${batchInfo.endPage} of ${batchInfo.totalPages}`);
    } else {
      console.log(`[compare-single] Comparing: ${specRow.field} = ${specRow.value}`);
      console.log(`[compare-single] Total submittal pages: ${submittalPages.length}, scanAllPages: ${scanAllPages}`);
    }
    
    // Collect all findings from all batches
    const allFindings: SubmittalFinding[] = [];
    const errors: string[] = [];
    
    // Determine how many pages to check
    const pagesToCheck = scanAllPages ? submittalPages.length : Math.min(MAX_PAGES_PER_BATCH, submittalPages.length);
    const totalBatches = Math.ceil(pagesToCheck / MAX_PAGES_PER_BATCH);
    
    // Process pages in batches
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const startIdx = batchIdx * MAX_PAGES_PER_BATCH;
      const endIdx = Math.min(startIdx + MAX_PAGES_PER_BATCH, pagesToCheck);
      const batchPages = submittalPages.slice(startIdx, endIdx);
      const batchStartPage = batchPages[0]?.pageNumber || (startIdx + 1);
      
      console.log(`[compare-single] Processing batch ${batchIdx + 1}/${totalBatches} (pages ${batchStartPage}-${batchStartPage + batchPages.length - 1})`);
      
      const batchResult = await compareSpecToBatch(specRow, batchPages, batchStartPage);
      
      if (batchResult.error) {
        errors.push(`Batch ${batchIdx + 1}: ${batchResult.error}`);
      }
      
      // Add findings with unique IDs
      for (const finding of batchResult.findings) {
        allFindings.push({
          id: generateFindingId(),
          ...finding,
        });
      }
      
      // Small delay between batches to avoid rate limiting
      if (batchIdx < totalBatches - 1) {
        await sleep(200);
      }
    }
    
    console.log(`[compare-single] Found ${allFindings.length} total findings`);
    
    // Select best match and determine overall status
    const bestMatch = selectBestMatch(allFindings);
    const overallStatus = determineOverallStatus(allFindings);
    const overallConfidence = determineOverallConfidence(allFindings);
    
    // Build submittal location from best match
    let submittalLocation: DocumentLocation | undefined;
    if (bestMatch) {
      submittalLocation = {
        pageNumber: bestMatch.pageNumber,
        boundingBox: bestMatch.boundingBox,
      };
    }
    
    // Generate overall explanation
    let explanation: string;
    if (allFindings.length === 0) {
      explanation = "No matching data found in submittal";
    } else if (allFindings.length === 1) {
      explanation = bestMatch?.explanation || "Found in submittal";
    } else {
      explanation = `${allFindings.length} occurrences found. Best match: ${bestMatch?.explanation || "See details"}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        rowId: specRow.id,
        
        // All findings for multi-finding UI
        findings: allFindings,
        totalFindings: allFindings.length,
        
        // Best match for backward compatibility
        status: overallStatus,
        matchConfidence: overallConfidence,
        explanation,
        submittalValue: bestMatch?.value,
        submittalUnit: bestMatch?.unit,
        submittalLocation,
        
        // Processing stats
        batchesProcessed: totalBatches,
        pagesScanned: pagesToCheck,
        errors: errors.length > 0 ? errors : undefined,
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
