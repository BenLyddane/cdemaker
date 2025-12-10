/**
 * API routes for extraction management (extracted data from PDFs)
 * Supports both full saves and incremental autosave updates
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  saveExtraction,
  getExtractionByDocument,
  dbRowsToExtractedRows,
} from "@/lib/db";
import { ExtractionResult, ExtractedRow } from "@/lib/types";

function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(databaseUrl);
}

// GET /api/extractions?documentId=xxx - Get extraction for a document
// GET /api/extractions?projectId=xxx - Get all extractions for a project
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get("documentId");
    const projectId = searchParams.get("projectId");

    if (projectId) {
      // Get all extractions for a project
      const sql = getSQL();
      const result = await sql`
        SELECT 
          e.*,
          d.name as document_name,
          d.type as document_type
        FROM extractions e
        JOIN documents d ON e.document_id = d.id
        WHERE d.project_id = ${projectId}
        ORDER BY e.extracted_at DESC
      `;
      
      // Get rows for each extraction
      const extractions = [];
      for (const extraction of result) {
        const rows = await sql`
          SELECT * FROM extracted_rows WHERE extraction_id = ${extraction.id}
          ORDER BY page_number, id
        `;
        extractions.push({
          ...extraction,
          rows: dbRowsToExtractedRows(rows as any),
        });
      }
      
      return NextResponse.json({ extractions });
    }

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID or Project ID is required" },
        { status: 400 }
      );
    }

    const result = await getExtractionByDocument(documentId);
    if (!result) {
      return NextResponse.json(
        { error: "Extraction not found" },
        { status: 404 }
      );
    }

    // Convert DB rows to application format
    const rows = dbRowsToExtractedRows(result.rows);

    return NextResponse.json({
      extraction: result.extraction,
      rows,
    });
  } catch (error) {
    console.error("Error fetching extraction:", error);
    return NextResponse.json(
      { error: "Failed to fetch extraction" },
      { status: 500 }
    );
  }
}

// POST /api/extractions - Save extraction results
// Supports two modes:
// 1. Full save: { documentId, extractionResult } - replaces all data
// 2. Incremental: { projectId, rows, incremental: true } - upserts rows
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, extractionResult, projectId, rows, incremental } = body;

    // Incremental autosave mode
    if (incremental && projectId && rows && Array.isArray(rows)) {
      const sql = getSQL();
      
      // Upsert rows - insert new ones, update existing ones by ID
      const savedRows = [];
      for (const row of rows as ExtractedRow[]) {
        // Check if row exists
        const existing = await sql`
          SELECT id FROM extracted_rows WHERE id = ${row.id}
        `;
        
        if (existing.length > 0) {
          // Update existing row
          const updated = await sql`
            UPDATE extracted_rows
            SET
              field = ${row.field},
              value = ${row.value},
              unit = ${row.unit || null},
              section = ${row.section || null},
              spec_number = ${row.specNumber || null},
              confidence = ${row.confidence},
              page_number = ${row.pageNumber},
              location = ${row.location ? JSON.stringify(row.location) : null},
              raw_text = ${row.rawText || null},
              cde_status = ${row.cdeStatus || null},
              cde_comment = ${row.cdeComment || null},
              cde_source = ${row.cdeSource || null},
              is_reviewed = ${row.isReviewed || false},
              submittal_value = ${row.submittalValue || null},
              submittal_unit = ${row.submittalUnit || null},
              submittal_location = ${row.submittalLocation ? JSON.stringify(row.submittalLocation) : null},
              match_confidence = ${row.matchConfidence || null},
              updated_at = NOW()
            WHERE id = ${row.id}
            RETURNING *
          `;
          savedRows.push(updated[0]);
        } else {
          // Insert new row - need to find or create an extraction first
          // For now, we'll try to find an existing extraction for the project
          let extractionId: string | null = null;
          
          const existingExtraction = await sql`
            SELECT e.id FROM extractions e
            JOIN documents d ON e.document_id = d.id
            WHERE d.project_id = ${projectId}
            LIMIT 1
          `;
          
          if (existingExtraction.length > 0) {
            extractionId = existingExtraction[0].id as string;
          } else {
            // Create a placeholder extraction if none exists
            // This shouldn't normally happen in the workflow
            console.warn("No existing extraction found for project, skipping row save");
            continue;
          }
          
          const inserted = await sql`
            INSERT INTO extracted_rows (
              id, extraction_id, field, value, unit, section, spec_number,
              confidence, page_number, location, raw_text,
              cde_status, cde_comment, cde_source, is_reviewed,
              submittal_value, submittal_unit, submittal_location, match_confidence
            )
            VALUES (
              ${row.id},
              ${extractionId},
              ${row.field},
              ${row.value},
              ${row.unit || null},
              ${row.section || null},
              ${row.specNumber || null},
              ${row.confidence},
              ${row.pageNumber},
              ${row.location ? JSON.stringify(row.location) : null},
              ${row.rawText || null},
              ${row.cdeStatus || null},
              ${row.cdeComment || null},
              ${row.cdeSource || null},
              ${row.isReviewed || false},
              ${row.submittalValue || null},
              ${row.submittalUnit || null},
              ${row.submittalLocation ? JSON.stringify(row.submittalLocation) : null},
              ${row.matchConfidence || null}
            )
            ON CONFLICT (id) DO UPDATE SET
              field = EXCLUDED.field,
              value = EXCLUDED.value,
              unit = EXCLUDED.unit,
              section = EXCLUDED.section,
              spec_number = EXCLUDED.spec_number,
              confidence = EXCLUDED.confidence,
              page_number = EXCLUDED.page_number,
              location = EXCLUDED.location,
              raw_text = EXCLUDED.raw_text,
              cde_status = EXCLUDED.cde_status,
              cde_comment = EXCLUDED.cde_comment,
              cde_source = EXCLUDED.cde_source,
              is_reviewed = EXCLUDED.is_reviewed,
              submittal_value = EXCLUDED.submittal_value,
              submittal_unit = EXCLUDED.submittal_unit,
              submittal_location = EXCLUDED.submittal_location,
              match_confidence = EXCLUDED.match_confidence,
              updated_at = NOW()
            RETURNING *
          `;
          savedRows.push(inserted[0]);
        }
      }
      
      return NextResponse.json({
        success: true,
        savedCount: savedRows.length,
        rows: dbRowsToExtractedRows(savedRows as any),
      });
    }

    // Full save mode (original behavior)
    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    if (!extractionResult || !extractionResult.rows || !extractionResult.metadata) {
      return NextResponse.json(
        { error: "Valid extraction result is required" },
        { status: 400 }
      );
    }

    const result = await saveExtraction(
      documentId,
      extractionResult as ExtractionResult
    );

    // Convert DB rows to application format
    const savedRows = dbRowsToExtractedRows(result.rows);

    return NextResponse.json(
      {
        extraction: result.extraction,
        rows: savedRows,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error saving extraction:", error);
    return NextResponse.json(
      { error: "Failed to save extraction" },
      { status: 500 }
    );
  }
}

// PATCH /api/extractions - Update specific row fields (for autosave)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { rowId, updates } = body as {
      rowId: string;
      updates: Partial<ExtractedRow>;
    };

    if (!rowId) {
      return NextResponse.json(
        { error: "Row ID is required" },
        { status: 400 }
      );
    }

    const sql = getSQL();
    
    // Build dynamic update
    const result = await sql`
      UPDATE extracted_rows
      SET
        cde_status = COALESCE(${updates.cdeStatus || null}, cde_status),
        cde_comment = COALESCE(${updates.cdeComment || null}, cde_comment),
        cde_source = COALESCE(${updates.cdeSource || null}, cde_source),
        is_reviewed = COALESCE(${updates.isReviewed ?? null}, is_reviewed),
        submittal_value = COALESCE(${updates.submittalValue || null}, submittal_value),
        submittal_unit = COALESCE(${updates.submittalUnit || null}, submittal_unit),
        submittal_location = COALESCE(${updates.submittalLocation ? JSON.stringify(updates.submittalLocation) : null}, submittal_location),
        match_confidence = COALESCE(${updates.matchConfidence || null}, match_confidence),
        updated_at = NOW()
      WHERE id = ${rowId}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Row not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      row: dbRowsToExtractedRows([result[0] as any])[0],
    });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json(
      { error: "Failed to update row" },
      { status: 500 }
    );
  }
}
