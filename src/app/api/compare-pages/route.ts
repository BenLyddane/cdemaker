import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
// Using Gemini 3 Flash for speed ($0.50/$3) - this endpoint is optimized for fast page detection + CDE
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// Configuration
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_SPECS_PER_REQUEST = 10; // Can check many specs at once

interface PageImage {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

type CDEStatus = "comply" | "deviate" | "exception" | "not_found";

interface PageRelevance {
  specId: string;
  relevantPages: number[];
  confidence: "high" | "medium" | "low";
  summary?: string;
  // Quick CDE assessment (no bounding boxes)
  status: CDEStatus;
  bestValue?: string;
  bestPage?: number;
  explanation?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Fast page relevance detection - returns only page numbers, no bounding boxes
 * This is Phase 1 of the two-phase comparison approach
 */
async function detectRelevantPages(
  specRows: ExtractedRow[],
  submittalPages: PageImage[],
  retryCount: number = 0
): Promise<{
  results: PageRelevance[];
  error?: string;
}> {
  try {
    // Build specs list for prompt
    const specsSection = specRows.map((row, idx) => `
SPEC #${idx + 1} (ID: ${row.id}):
  - Field: ${row.field}
  - Required Value: ${row.value}
  - Unit: ${row.unit || "N/A"}
  - Section: ${row.section || "General"}`).join("\n");

    const pageNumbers = submittalPages.map(p => p.pageNumber);
    const pageRange = `${Math.min(...pageNumbers)}-${Math.max(...pageNumbers)}`;

    const prompt = `You are a construction document reviewer performing a QUICK SCAN to identify which submittal pages contain information relevant to specific specification requirements AND provide an initial CDE (Comply/Deviate/Exception) assessment.

=== SPECIFICATION REQUIREMENTS TO FIND (${specRows.length} items) ===
${specsSection}

=== TASK ===
Quickly scan all ${submittalPages.length} submittal pages (pages ${pageRange}) and for each specification:
1. Identify WHICH PAGES contain relevant information
2. Provide a quick CDE assessment (comply/deviate/exception/not_found)
3. Note the best matching value you found

=== IMPORTANT INSTRUCTIONS ===
1. This is a FAST scan - identify pages and make quick CDE judgments
2. Look for:
   - Equipment data sheets with relevant specifications
   - Performance tables/charts
   - Technical specifications
   - Certification pages
   - Dimensional drawings
3. Be INCLUSIVE for pages - if a page MIGHT have relevant info, include it
4. For CDE status:
   - "comply": Submittal value meets or exceeds spec requirement
   - "deviate": Values differ but may be acceptable  
   - "exception": Values don't match or are missing
   - "not_found": No relevant data found in any page

=== CDE MATCHING RULES ===
- HIGHER IS BETTER: Efficiency %, Warranty duration, Pressure ratings → exceed = comply
- LOWER IS BETTER: Noise dB, Power consumption → below = comply  
- EXACT MATCH: Voltage, Phase, Model numbers, Dimensions → must match

RESPOND WITH STRICT JSON:
{
  "results": [
    {
      "specId": "<exact ID from spec>",
      "relevantPages": [<page numbers where this spec might be answered>],
      "confidence": "high" | "medium" | "low",
      "status": "comply" | "deviate" | "exception" | "not_found",
      "bestValue": "<best matching value found, or null>",
      "bestPage": <page number of best match, or null>,
      "explanation": "Brief CDE reasoning (max 10 words)"
    }
  ]
}

RULES:
- Include ALL specs in results, even if no relevant pages found
- For not_found specs: relevantPages=[], bestValue=null, bestPage=null
- Page numbers must be within the provided range (${pageRange})
- This is a FAST scan - make quick judgments`;

    // Create image parts
    const imageParts: Part[] = submittalPages.map((page) => ({
      inlineData: { 
        data: page.base64, 
        mimeType: page.mimeType 
      },
    }));

    // Page labels
    const pageLabels = submittalPages.map(p => `[Page ${p.pageNumber}]`).join(" ");

    const result = await model.generateContent([
      prompt,
      `Page numbers in order: ${pageLabels}`,
      ...imageParts
    ]);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[compare-pages] No valid JSON found in response:", text.substring(0, 200));
      return { 
        results: specRows.map(r => ({ 
          specId: r.id, 
          relevantPages: [] as number[], 
          confidence: "low" as const,
          status: "not_found" as CDEStatus,
        })) 
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Get valid spec IDs
    const validSpecIds = new Set(specRows.map(r => r.id));
    const validPageNumbers = new Set(pageNumbers);
    
    // Validate and normalize results
    const validResults: PageRelevance[] = (parsed.results || [])
      .filter((r: any) => r.specId && validSpecIds.has(r.specId))
      .map((r: any) => ({
        specId: r.specId,
        relevantPages: (r.relevantPages || []).filter((p: number) => validPageNumbers.has(p)),
        confidence: r.confidence || "medium",
        status: r.status || "not_found" as CDEStatus,
        bestValue: r.bestValue || undefined,
        bestPage: r.bestPage || undefined,
        explanation: r.explanation || undefined,
        summary: r.summary,
      }));
    
    // Ensure all specs have a result
    const resultMap = new Map(validResults.map(r => [r.specId, r]));
    const completeResults: PageRelevance[] = specRows.map(row => 
      resultMap.get(row.id) || { 
        specId: row.id, 
        relevantPages: [] as number[], 
        confidence: "low" as const,
        status: "not_found" as CDEStatus,
      }
    );
    
    return { results: completeResults };
  } catch (error) {
    if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`[compare-pages] Rate limited, retrying in ${delay}ms`);
      await sleep(delay);
      return detectRelevantPages(specRows, submittalPages, retryCount + 1);
    }
    
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * (retryCount + 1);
      await sleep(delay);
      return detectRelevantPages(specRows, submittalPages, retryCount + 1);
    }
    
    console.error("[compare-pages] Failed after retries:", error);
    return {
      results: specRows.map(r => ({ 
        specId: r.id, 
        relevantPages: [] as number[], 
        confidence: "low" as const,
        status: "not_found" as CDEStatus,
      })),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { specRows, submittalPages } = body as {
      specRows: ExtractedRow[];
      submittalPages: PageImage[];
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

    console.log(`[compare-pages] Detecting relevant pages for ${specRows.length} specs across ${submittalPages.length} pages`);
    
    // Process specs in batches if there are many
    const allResults: PageRelevance[] = [];
    
    for (let i = 0; i < specRows.length; i += MAX_SPECS_PER_REQUEST) {
      const batchSpecs = specRows.slice(i, i + MAX_SPECS_PER_REQUEST);
      const batchResult = await detectRelevantPages(batchSpecs, submittalPages);
      allResults.push(...batchResult.results);
      
      // Small delay between batches
      if (i + MAX_SPECS_PER_REQUEST < specRows.length) {
        await sleep(100);
      }
    }
    
    // Calculate summary stats
    const specsWithPages = allResults.filter(r => r.relevantPages.length > 0).length;
    const allRelevantPages = new Set(allResults.flatMap(r => r.relevantPages));
    
    console.log(`[compare-pages] Found relevant pages for ${specsWithPages}/${specRows.length} specs, ${allRelevantPages.size} unique pages`);

    return NextResponse.json({
      success: true,
      data: {
        results: allResults,
        summary: {
          totalSpecs: specRows.length,
          specsWithRelevantPages: specsWithPages,
          uniqueRelevantPages: Array.from(allRelevantPages).sort((a, b) => a - b),
          totalPagesScanned: submittalPages.length,
        },
      },
    });
  } catch (error) {
    console.error("Page detection error:", error);
    return NextResponse.json(
      {
        error: "Page detection failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
