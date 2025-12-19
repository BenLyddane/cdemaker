import { NextRequest } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { ExtractedRow } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface PageInput {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

type DocumentType = "specification" | "schedule" | "submittal" | "unknown";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createExtractionPrompt(documentType: DocumentType, pageNumber: number, totalPages: number): string {
  return `You are an expert construction document analyzer extracting requirements for a Comply/Deviate/Exception (CDE) review process.

DOCUMENT INFO:
- Type: ${documentType}
- Page: ${pageNumber} of ${totalPages}

YOUR GOAL: Extract COMPLETE, MEANINGFUL REQUIREMENTS that a reviewer can mark as Comply, Deviate, or Exception when comparing to submittals.

WHAT TO EXTRACT:
Each extracted item should be a COMPLETE requirement that stands alone. Consolidate related information into single items.

Examples of GOOD extractions (complete, CDE-able):
- "Electrical Requirements" → "120V/1-phase/60Hz, 15 amp dedicated circuit required"
- "Warranty" → "Manufacturer shall provide minimum 1 year parts and labor warranty"
- "Fan Performance" → "Minimum 2000 CFM at 0.5 in. w.g. static pressure"
- "Shop Drawings" → "Submit shop drawings per Section 01 33 00 including wiring diagrams"
- "Certifications" → "UL Listed, ETL certified, ASHRAE 62.1 compliant"
- "Material" → "Housing shall be 18 gauge galvanized steel minimum"

Examples of BAD extractions (too fragmented):
- "Voltage" → "120" (too fragmented - combine with related electrical specs)
- "CFM" → "2000" (missing context - include full performance requirement)
- "1.2" → "SUBMITTALS" (just a section header, not a requirement)

EXTRACTION RULES:
1. Extract COMPLETE requirements - each row should be something reviewable
2. CONSOLIDATE related specs (electrical together, dimensions together, etc.)
3. Include the FULL requirement text, not just values
4. Look for the specification section number (e.g., "23 34 00", "01 33 00") on the page header/footer
5. Include warranty requirements, notes, submittal requirements, performance specs, etc.
6. For tables/schedules, each equipment row is one item with all its specs combined

BOUNDING BOX INSTRUCTIONS:
For each extracted item, provide the bounding box coordinates as NORMALIZED values (0.0 to 1.0):
- x: left edge as fraction of page width (0.0 = left edge, 1.0 = right edge)
- y: top edge as fraction of page height (0.0 = top edge, 1.0 = bottom edge)  
- width: width as fraction of page width
- height: height as fraction of page height

The bounding box should encompass the ENTIRE text for that requirement.

OUTPUT FORMAT (strict JSON):
{
  "pageContent": {
    "hasData": true/false,
    "specNumber": "XX XX XX or null if not visible",
    "specTitle": "Section title if visible"
  },
  "rows": [
    {
      "field": "Requirement name/category",
      "value": "Complete requirement text including all relevant details",
      "unit": "unit if applicable, null otherwise",
      "section": "Category (Electrical, Mechanical, Submittal, Warranty, Performance, etc.)",
      "specNumber": "XX XX XX (from page header) or null",
      "confidence": "high" | "medium" | "low",
      "boundingBox": {
        "x": 0.0-1.0,
        "y": 0.0-1.0,
        "width": 0.0-1.0,
        "height": 0.0-1.0
      },
      "rawText": "Original text verbatim if significantly different from parsed value"
    }
  ]
}

CONFIDENCE LEVELS:
- "high": Text is clear, requirement is unambiguous
- "medium": Slightly unclear but interpretation is reasonable
- "low": Text quality poor or requirement meaning uncertain

IMPORTANT:
- If a page has no extractable requirements (blank, cover page, TOC with no specs), return {"pageContent": {"hasData": false}, "rows": []}
- DO NOT extract page headers/footers as requirements unless they contain spec data
- Prefer FEWER, MORE COMPLETE items over MANY FRAGMENTED items
- Each row should answer: "What requirement does the submittal need to meet?"`;
}

async function extractPageWithRetry(
  page: PageInput, 
  documentType: DocumentType, 
  totalPages: number
): Promise<{
  status: "success" | "failed";
  rows: ExtractedRow[];
  error?: string;
  retryCount: number;
  pageContent?: {
    hasData: boolean;
    specNumber?: string;
    specTitle?: string;
  };
}> {
  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const prompt = createExtractionPrompt(documentType, page.pageNumber, totalPages);
      const imagePart: Part = {
        inlineData: { data: page.base64, mimeType: page.mimeType },
      };
      
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in AI response");
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.pageContent?.hasData === false || !parsed.rows || parsed.rows.length === 0) {
        return { 
          status: "success", 
          rows: [], 
          retryCount,
          pageContent: parsed.pageContent,
        };
      }
      
      // Get page-level spec number as fallback
      const pageSpecNumber = parsed.pageContent?.specNumber || null;
      
      const rows: ExtractedRow[] = parsed.rows.map((row: any, index: number) => {
        // Build location with bounding box if provided
        const location = row.boundingBox ? {
          pageNumber: page.pageNumber,
          boundingBox: {
            x: typeof row.boundingBox.x === 'number' ? row.boundingBox.x : 0,
            y: typeof row.boundingBox.y === 'number' ? row.boundingBox.y : 0,
            width: typeof row.boundingBox.width === 'number' ? row.boundingBox.width : 1,
            height: typeof row.boundingBox.height === 'number' ? row.boundingBox.height : 0.1,
          },
          textSnippet: row.rawText || row.value?.substring(0, 100),
        } : {
          pageNumber: page.pageNumber,
          textSnippet: row.rawText || row.value?.substring(0, 100),
        };
        
        return {
          id: `page${page.pageNumber}-row${index}-${Date.now()}`,
          field: row.field || "",
          value: row.value || "",
          unit: row.unit || undefined,
          section: row.section || "General",
          specNumber: row.specNumber || pageSpecNumber || undefined,
          confidence: row.confidence || "medium",
          pageNumber: page.pageNumber,
          rawText: row.rawText || undefined,
          location,
        };
      });
      
      return { 
        status: "success", 
        rows, 
        retryCount,
        pageContent: parsed.pageContent,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;
      
      if (retryCount <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * retryCount);
      }
    }
  }
  
  return { 
    status: "failed", 
    rows: [], 
    error: lastError?.message || "Unknown error", 
    retryCount 
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { page, documentType = "specification", totalPages = 1 } = body as {
      page: PageInput;
      documentType?: DocumentType;
      totalPages?: number;
    };

    if (!page || !page.base64 || !page.mimeType) {
      return new Response(JSON.stringify({ error: "No valid page provided" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await extractPageWithRetry(page, documentType, totalPages);

    return new Response(JSON.stringify({
      success: result.status === "success",
      data: {
        pageNumber: page.pageNumber,
        rows: result.rows,
        rowCount: result.rows.length,
        pageContent: result.pageContent,
        error: result.error,
        retryCount: result.retryCount,
      },
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Page extraction error:", error);
    return new Response(JSON.stringify({ 
      error: "Page extraction failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
