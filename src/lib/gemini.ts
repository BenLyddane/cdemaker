import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import type { 
  ExtractedRow, 
  ExtractionResult, 
  PageExtractionResult, 
  ExtractionProgress 
} from "./types";

// Re-export types for backwards compatibility
export type { ExtractedRow, PageExtractionResult, ExtractionProgress };
// Alias ExtractionResult as ExtractedData for backwards compatibility
export type ExtractedData = ExtractionResult;

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

// Use Gemini 2.0 Flash for extraction
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Configuration
const MAX_CONCURRENT_REQUESTS = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Convert a file to a generative AI part
 */
export function fileToGenerativePart(base64Data: string, mimeType: string): Part {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a detailed extraction prompt for complete CDE-able requirements
 */
function createExtractionPrompt(
  documentType: "specification" | "schedule" | "submittal",
  pageNumber: number,
  totalPages: number
): string {
  const basePrompt = `You are an expert construction document analyzer extracting requirements for a Comply/Deviate/Exception (CDE) review process.

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
4. **ABSOLUTELY CRITICAL - FULL SPECIFICATION NUMBER EXTRACTION:**
   
   ⚠️ IMPORTANT: You MUST ALWAYS include the FULL specification reference path, not just the section number!
   
   FORMAT: "[Section #] [Article].[Paragraph].[Subparagraph].[Item]"
   
   EXAMPLES - CORRECT vs WRONG:
   ❌ WRONG: "23 70 00" (missing subsection - NEVER do this!)
   ✅ CORRECT: "23 70 00 1.4.B" (with full path)
   ✅ CORRECT: "23 70 00 1.4.B.1" (with item number)
   ✅ CORRECT: "23 70 00 2.1.A.2.a" (deeply nested)
   
   MORE CORRECT EXAMPLES:
   - "23 70 00 1.4.B" for Shop Drawings requirement in Part 1, Article 1.4, Paragraph B
   - "23 70 00 1.4.B.1" for the first item under Shop Drawings
   - "23 70 00 2.2.A" for equipment in Part 2, Article 2.2, Paragraph A
   - "01 33 00 1.2.C.3" for submittal item
   
   HOW TO BUILD THE FULL SPEC NUMBER:
   1. Start with 6-digit section number from header (e.g., "23 70 00")
   2. Find the PART number (PART 1 = 1, PART 2 = 2, PART 3 = 3)
   3. Find the Article number (1.1, 1.2, 1.3, 1.4, 2.1, 2.2, etc.)
   4. Find the Paragraph letter (A, B, C, D, E, F...)
   5. Add item numbers if present (1, 2, 3...)
   6. Add sub-letters if present (a, b, c...)
   
   EXAMPLE - Looking at this document structure:
   
   SECTION 23 70 00 - AIR HANDLING
   PART 1 - GENERAL
     1.4 SUBMITTALS
       A. Prepare submissions...
       B. Shop Drawings
         1. Air Handling Equipment...
         2. Fans...
   
   For "Shop Drawings" → specNumber: "23 70 00 1.4.B"
   For "Air Handling Equipment" item → specNumber: "23 70 00 1.4.B.1"
   For "Fans" item → specNumber: "23 70 00 1.4.B.2"
   
   ⚠️ NEVER RETURN JUST THE SECTION NUMBER! Always include 1.4.B or similar suffix!

5. Include warranty requirements, notes, submittal requirements, performance specs, etc.
6. For SCHEDULES/TABLES:
   - Extract each row of the schedule as a separate item
   - Include the TABLE/SCHEDULE TITLE as the section name
   - Include ALL column headers in a meaningful way for the field name
   - The specNumber should reference the schedule location, e.g., "23 84 15 SCHEDULE A Row 1"

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
    "specNumber": "XX XX XX (main section number from header/footer)",
    "specTitle": "Section title if visible"
  },
  "rows": [
    {
      "field": "Requirement name/category",
      "value": "Complete requirement text including all relevant details",
      "unit": "unit if applicable, null otherwise",
      "section": "Category (Electrical, Mechanical, Submittal, Warranty, Performance, etc.)",
      "specNumber": "FULL PATH: e.g. '23 34 00 - 2.1.A' or '01 33 00 - PART 1 - 1.2.B'",
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

  return basePrompt;
}

/**
 * Extract data from a single page with retry logic
 */
async function extractPageWithRetry(
  pageBase64: string,
  mimeType: string,
  documentType: "specification" | "schedule" | "submittal",
  pageNumber: number,
  totalPages: number,
  maxRetries: number = MAX_RETRIES
): Promise<PageExtractionResult> {
  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const prompt = createExtractionPrompt(documentType, pageNumber, totalPages);
      const imagePart = fileToGenerativePart(pageBase64, mimeType);

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Handle pages with no data
      if (parsed.pageContent?.hasData === false || !parsed.rows || parsed.rows.length === 0) {
        return {
          pageNumber,
          status: "success",
          rows: [],
          retryCount,
          rawResponse: text,
        };
      }

      // Get page-level spec number as fallback
      const pageSpecNumber = parsed.pageContent?.specNumber || null;
      
      const rows: ExtractedRow[] = parsed.rows.map((row: any, index: number) => {
        // Build location with bounding box if provided
        const location = row.boundingBox ? {
          pageNumber,
          boundingBox: {
            x: typeof row.boundingBox.x === 'number' ? row.boundingBox.x : 0,
            y: typeof row.boundingBox.y === 'number' ? row.boundingBox.y : 0,
            width: typeof row.boundingBox.width === 'number' ? row.boundingBox.width : 1,
            height: typeof row.boundingBox.height === 'number' ? row.boundingBox.height : 0.1,
          },
          textSnippet: row.rawText || row.value?.substring(0, 100),
        } : {
          pageNumber,
          textSnippet: row.rawText || row.value?.substring(0, 100),
        };
        
        return {
          id: `page${pageNumber}-row${index}`,
          field: row.field || "",
          value: row.value || "",
          unit: row.unit || undefined,
          section: row.section || "General",
          specNumber: row.specNumber || pageSpecNumber || undefined,
          confidence: row.confidence || "medium",
          pageNumber,
          rawText: row.rawText || undefined,
          location,
        };
      });

      return {
        pageNumber,
        status: "success",
        rows,
        retryCount,
        rawResponse: text,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;

      if (retryCount <= maxRetries) {
        console.log(`Retrying page ${pageNumber} (attempt ${retryCount}/${maxRetries})...`);
        await sleep(RETRY_DELAY_MS * retryCount); // Exponential backoff
      }
    }
  }

  return {
    pageNumber,
    status: "failed",
    rows: [],
    error: lastError?.message || "Unknown error",
    retryCount,
  };
}

/**
 * Process multiple pages with concurrency limit
 */
async function processPagesConcurrently(
  pages: Array<{ base64: string; mimeType: string; pageNumber: number }>,
  documentType: "specification" | "schedule" | "submittal",
  totalPages: number,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<PageExtractionResult[]> {
  const results: PageExtractionResult[] = [];
  const pageStatuses: ExtractionProgress["pageStatuses"] = pages.map((p) => ({
    page: p.pageNumber,
    status: "pending" as const,
    retryCount: 0,
  }));

  // Process in batches of MAX_CONCURRENT_REQUESTS
  for (let i = 0; i < pages.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = pages.slice(i, i + MAX_CONCURRENT_REQUESTS);

    // Update status to processing
    batch.forEach((p) => {
      const statusIndex = pageStatuses.findIndex((s) => s.page === p.pageNumber);
      if (statusIndex !== -1) {
        pageStatuses[statusIndex].status = "processing";
      }
    });

    onProgress?.({
      totalPages,
      completedPages: results.length,
      currentPage: batch[0].pageNumber,
      status: "processing",
      pageStatuses: [...pageStatuses],
    });

    // Process batch concurrently
    const batchPromises = batch.map(async (page) => {
      const result = await extractPageWithRetry(
        page.base64,
        page.mimeType,
        documentType,
        page.pageNumber,
        totalPages
      );

      // Update status
      const statusIndex = pageStatuses.findIndex((s) => s.page === page.pageNumber);
      if (statusIndex !== -1) {
        pageStatuses[statusIndex].status = result.status === "success" ? "success" : "failed";
        pageStatuses[statusIndex].retryCount = result.retryCount;
      }

      return result;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    onProgress?.({
      totalPages,
      completedPages: results.length,
      currentPage: batch[batch.length - 1].pageNumber,
      status: "processing",
      pageStatuses: [...pageStatuses],
    });
  }

  return results;
}

/**
 * Main extraction function for specifications/schedules
 * Processes each page individually for maximum accuracy
 */
export async function extractDocumentData(
  pages: Array<{ base64: string; mimeType: string; pageNumber: number }>,
  documentType: "specification" | "schedule" | "submittal",
  onProgress?: (progress: ExtractionProgress) => void
): Promise<ExtractedData> {
  const startTime = Date.now();
  const totalPages = pages.length;

  // Process all pages with concurrency control
  const pageResults = await processPagesConcurrently(
    pages,
    documentType,
    totalPages,
    onProgress
  );

  // Combine all rows from successful pages
  const allRows: ExtractedRow[] = [];
  pageResults
    .filter((r) => r.status === "success")
    .forEach((result) => {
      allRows.push(...result.rows);
    });

  // Deduplicate rows based on field+value combination
  const uniqueRows = deduplicateRows(allRows);

  const processingTime = Date.now() - startTime;

  onProgress?.({
    totalPages,
    completedPages: totalPages,
    currentPage: totalPages,
    status: "completed",
    pageStatuses: pageResults.map((r) => ({
      page: r.pageNumber,
      status: r.status === "success" ? "success" : "failed",
      retryCount: r.retryCount,
    })),
  });

  return {
    rows: uniqueRows,
    metadata: {
      documentType,
      totalRows: uniqueRows.length,
      totalPages,
      extractedAt: new Date().toISOString(),
      processingTime,
    },
    pageResults,
  };
}

/**
 * Deduplicate rows while preserving unique data
 */
function deduplicateRows(rows: ExtractedRow[]): ExtractedRow[] {
  const seen = new Map<string, ExtractedRow>();

  for (const row of rows) {
    const key = `${row.field}:${row.value}:${row.unit || ""}`.toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, row);
    } else {
      // If we've seen this before, keep the one with higher confidence
      const existing = seen.get(key)!;
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      if (confidenceOrder[row.confidence] > confidenceOrder[existing.confidence]) {
        seen.set(key, row);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Verify extraction by re-processing pages with low confidence
 */
export async function verifyLowConfidenceRows(
  rows: ExtractedRow[],
  pages: Array<{ base64: string; mimeType: string; pageNumber: number }>
): Promise<ExtractedRow[]> {
  const lowConfidenceRows = rows.filter((r) => r.confidence === "low");

  if (lowConfidenceRows.length === 0) {
    return rows;
  }

  // Group by page number
  const pageGroups = new Map<number, ExtractedRow[]>();
  for (const row of lowConfidenceRows) {
    if (!pageGroups.has(row.pageNumber)) {
      pageGroups.set(row.pageNumber, []);
    }
    pageGroups.get(row.pageNumber)!.push(row);
  }

  // Re-process pages with low confidence data
  const pagesToReprocess = pages.filter((p) => pageGroups.has(p.pageNumber));

  if (pagesToReprocess.length === 0) {
    return rows;
  }

  const reprocessedResults = await processPagesConcurrently(
    pagesToReprocess,
    "specification",
    pages.length
  );

  // Merge reprocessed results
  const verifiedRows = [...rows];
  for (const result of reprocessedResults) {
    if (result.status === "success") {
      for (const newRow of result.rows) {
        const existingIndex = verifiedRows.findIndex(
          (r) =>
            r.pageNumber === newRow.pageNumber &&
            r.field.toLowerCase() === newRow.field.toLowerCase()
        );

        if (existingIndex !== -1) {
          // Update with potentially higher confidence
          if (newRow.confidence !== "low") {
            verifiedRows[existingIndex] = {
              ...verifiedRows[existingIndex],
              value: newRow.value,
              confidence: newRow.confidence,
            };
          }
        }
      }
    }
  }

  return verifiedRows;
}

/**
 * Retry failed pages
 */
export async function retryFailedPages(
  failedPageResults: PageExtractionResult[],
  pages: Array<{ base64: string; mimeType: string; pageNumber: number }>,
  documentType: "specification" | "schedule" | "submittal",
  onProgress?: (progress: ExtractionProgress) => void
): Promise<PageExtractionResult[]> {
  const failedPageNumbers = failedPageResults.map((r) => r.pageNumber);
  const pagesToRetry = pages.filter((p) => failedPageNumbers.includes(p.pageNumber));

  if (pagesToRetry.length === 0) {
    return [];
  }

  return processPagesConcurrently(pagesToRetry, documentType, pages.length, onProgress);
}
