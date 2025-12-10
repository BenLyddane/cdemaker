/**
 * API routes for extraction management (extracted data from PDFs)
 */
import { NextRequest, NextResponse } from "next/server";
import {
  saveExtraction,
  getExtractionByDocument,
  dbRowsToExtractedRows,
} from "@/lib/db";
import { ExtractionResult } from "@/lib/types";

// GET /api/extractions?documentId=xxx - Get extraction for a document
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, extractionResult } = body;

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
    const rows = dbRowsToExtractedRows(result.rows);

    return NextResponse.json(
      {
        extraction: result.extraction,
        rows,
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
