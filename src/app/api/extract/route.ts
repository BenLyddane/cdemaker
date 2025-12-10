import { NextRequest } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface PageInput {
  base64: string;
  mimeType: string;
  pageNumber: number;
}

interface ExtractedRow {
  id: string;
  field: string;
  value: string;
  unit?: string;
  section?: string;
  specNumber?: string;
  confidence: "high" | "medium" | "low";
  pageNumber: number;
  rawText?: string;
  location?: {
    pageNumber: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    textSnippet?: string;
  };
}

type DocumentType = "specification" | "schedule" | "submittal" | "unknown";

// Event types for streaming
type StreamEvent = 
  | { type: "log"; message: string; level: "info" | "success" | "warning" | "error" }
  | { type: "detection"; documentType: DocumentType; confidence: string; reason: string }
  | { type: "page_start"; pageNumber: number; totalPages: number }
  | { type: "page_complete"; pageNumber: number; rowCount: number; rows: ExtractedRow[] }
  | { type: "page_error"; pageNumber: number; error: string; retryCount: number }
  | { type: "complete"; totalRows: number; metadata: any };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectDocumentType(page: PageInput): Promise<{
  detectedType: DocumentType;
  confidence: "high" | "medium" | "low";
  reason: string;
}> {
  const prompt = `Analyze this document page and determine what type of construction/engineering document it is.

DOCUMENT TYPES:
1. "specification" - A written specification document with paragraphs describing requirements
2. "schedule" - An equipment schedule, typically a table listing equipment with columns
3. "submittal" - A manufacturer's product data sheet showing product specifications

RESPOND WITH STRICT JSON:
{
  "detectedType": "specification" | "schedule" | "submittal" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reason": "Brief explanation"
}

Key indicators:
- Specification: Paragraph text, section numbers, "shall" language
- Schedule: Tabular format, equipment tags (AHU-1, P-1), columns for specs
- Submittal: Product photos, manufacturer logo, model numbers prominently displayed`;

  try {
    const imagePart: Part = {
      inlineData: { data: page.base64, mimeType: page.mimeType },
    };
    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { detectedType: "unknown", confidence: "low", reason: "Could not parse response" };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      detectedType: parsed.detectedType || "unknown",
      confidence: parsed.confidence || "low",
      reason: parsed.reason || "Unknown",
    };
  } catch (error) {
    console.error("Document type detection error:", error);
    return { detectedType: "unknown", confidence: "low", reason: "Detection failed" };
  }
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
  totalPages: number,
  sendEvent: (event: StreamEvent) => void
): Promise<{
  pageNumber: number;
  status: "success" | "failed";
  rows: ExtractedRow[];
  error?: string;
  retryCount: number;
}> {
  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const prompt = createExtractionPrompt(documentType, page.pageNumber, totalPages);
      const imagePart: Part = {
        inlineData: { data: page.base64, mimeType: page.mimeType },
      };
      
      if (retryCount > 0) {
        sendEvent({ 
          type: "log", 
          message: `Retrying page ${page.pageNumber} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`, 
          level: "warning" 
        });
      }
      
      sendEvent({ 
        type: "log", 
        message: `Sending page ${page.pageNumber} to AI for analysis...`, 
        level: "info" 
      });
      
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      
      sendEvent({ 
        type: "log", 
        message: `Page ${page.pageNumber}: Received ${text.length} chars from AI`, 
        level: "info" 
      });
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in AI response");
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.pageContent?.hasData === false || !parsed.rows || parsed.rows.length === 0) {
        sendEvent({ 
          type: "log", 
          message: `Page ${page.pageNumber}: No extractable data found`, 
          level: "info" 
        });
        return { pageNumber: page.pageNumber, status: "success", rows: [], retryCount };
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
      
      sendEvent({ 
        type: "log", 
        message: `Page ${page.pageNumber}: Extracted ${rows.length} requirements`, 
        level: "success" 
      });
      
      return { pageNumber: page.pageNumber, status: "success", rows, retryCount };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;
      
      sendEvent({ 
        type: "log", 
        message: `Page ${page.pageNumber} error: ${lastError.message}`, 
        level: "error" 
      });
      
      if (retryCount <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * retryCount);
      }
    }
  }
  
  sendEvent({ 
    type: "page_error", 
    pageNumber: page.pageNumber, 
    error: lastError?.message || "Unknown error", 
    retryCount 
  });
  
  return { 
    pageNumber: page.pageNumber, 
    status: "failed", 
    rows: [], 
    error: lastError?.message || "Unknown error", 
    retryCount 
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pages, documentType: providedType, autoDetect = true, detectOnly = false, stream = true } = body as {
    pages: PageInput[];
    documentType?: DocumentType;
    autoDetect?: boolean;
    detectOnly?: boolean;
    stream?: boolean;
  };

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return new Response(JSON.stringify({ error: "No pages provided" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // If streaming is requested, use SSE
  if (stream && !detectOnly) {
    const encoder = new TextEncoder();
    
    const readable = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: StreamEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        try {
          let documentType: DocumentType = providedType || "unknown";
          let detectionResult = null;

          // Document type detection
          if (!providedType || autoDetect) {
            sendEvent({ type: "log", message: "Analyzing document type...", level: "info" });
            detectionResult = await detectDocumentType(pages[0]);
            documentType = detectionResult.detectedType;
            
            sendEvent({ 
              type: "detection", 
              documentType, 
              confidence: detectionResult.confidence, 
              reason: detectionResult.reason 
            });
            
            sendEvent({ 
              type: "log", 
              message: `Document identified as: ${documentType} (${detectionResult.confidence} confidence)`, 
              level: "success" 
            });
            sendEvent({ 
              type: "log", 
              message: `Reason: ${detectionResult.reason}`, 
              level: "info" 
            });
          }

          const totalPages = pages.length;
          sendEvent({ type: "log", message: `Starting extraction of ${totalPages} pages...`, level: "info" });

          const allRows: ExtractedRow[] = [];
          const pageResults: any[] = [];

          // Process pages sequentially to stream results
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            sendEvent({ type: "page_start", pageNumber: page.pageNumber, totalPages });
            sendEvent({ 
              type: "log", 
              message: `Processing page ${page.pageNumber} of ${totalPages}...`, 
              level: "info" 
            });

            const result = await extractPageWithRetry(page, documentType, totalPages, sendEvent);
            pageResults.push(result);

            if (result.status === "success" && result.rows.length > 0) {
              allRows.push(...result.rows);
              sendEvent({ 
                type: "page_complete", 
                pageNumber: page.pageNumber, 
                rowCount: result.rows.length,
                rows: result.rows 
              });
            } else if (result.status === "success") {
              sendEvent({ 
                type: "page_complete", 
                pageNumber: page.pageNumber, 
                rowCount: 0,
                rows: [] 
              });
            }
          }

          // Deduplicate rows
          const seen = new Map<string, ExtractedRow>();
          for (const row of allRows) {
            const key = `${row.field}:${row.value}:${row.unit || ""}`.toLowerCase();
            if (!seen.has(key)) {
              seen.set(key, row);
            } else {
              const existing = seen.get(key)!;
              const order = { high: 3, medium: 2, low: 1 };
              if (order[row.confidence] > order[existing.confidence]) seen.set(key, row);
            }
          }
          const uniqueRows = Array.from(seen.values());

          sendEvent({ 
            type: "log", 
            message: `Extraction complete! ${uniqueRows.length} unique requirements found.`, 
            level: "success" 
          });

          // Send final complete event
          sendEvent({
            type: "complete",
            totalRows: uniqueRows.length,
            metadata: {
              documentType,
              detectedType: detectionResult ? {
                type: detectionResult.detectedType,
                confidence: detectionResult.confidence,
                reason: detectionResult.reason,
              } : undefined,
              totalRows: uniqueRows.length,
              totalPages,
              extractedAt: new Date().toISOString(),
              successfulPages: pageResults.filter(r => r.status === "success").length,
              failedPages: pageResults.filter(r => r.status === "failed").length,
            },
          });

          controller.close();
        } catch (error) {
          sendEvent({ 
            type: "log", 
            message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`, 
            level: "error" 
          });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Non-streaming mode (for detectOnly or explicit non-stream)
  try {
    let documentType: DocumentType = providedType || "unknown";
    let detectionResult = null;

    if (!providedType || autoDetect) {
      detectionResult = await detectDocumentType(pages[0]);
      documentType = detectionResult.detectedType;
    }

    if (detectOnly) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          rows: [],
          metadata: {
            documentType,
            detectedType: detectionResult ? {
              type: detectionResult.detectedType,
              confidence: detectionResult.confidence,
              reason: detectionResult.reason,
            } : undefined,
            totalRows: 0,
            totalPages: pages.length,
            extractedAt: new Date().toISOString(),
            successfulPages: 0,
            failedPages: 0,
            detectOnly: true,
          },
          pageResults: [],
        },
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Non-streaming extraction (fallback)
    const totalPages = pages.length;
    const results = [];
    const noopSendEvent = () => {};

    for (const page of pages) {
      const result = await extractPageWithRetry(page, documentType, totalPages, noopSendEvent);
      results.push(result);
    }

    const allRows: ExtractedRow[] = [];
    results.filter(r => r.status === "success").forEach(r => allRows.push(...r.rows));

    const seen = new Map<string, ExtractedRow>();
    for (const row of allRows) {
      const key = `${row.field}:${row.value}:${row.unit || ""}`.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, row);
      } else {
        const existing = seen.get(key)!;
        const order = { high: 3, medium: 2, low: 1 };
        if (order[row.confidence] > order[existing.confidence]) seen.set(key, row);
      }
    }
    const uniqueRows = Array.from(seen.values());

    return new Response(JSON.stringify({
      success: true,
      data: {
        rows: uniqueRows,
        metadata: {
          documentType,
          detectedType: detectionResult ? {
            type: detectionResult.detectedType,
            confidence: detectionResult.confidence,
            reason: detectionResult.reason,
          } : undefined,
          totalRows: uniqueRows.length,
          totalPages,
          extractedAt: new Date().toISOString(),
          successfulPages: results.filter(r => r.status === "success").length,
          failedPages: results.filter(r => r.status === "failed").length,
        },
        pageResults: results,
      },
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Extraction failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
