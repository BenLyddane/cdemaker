/**
 * API routes for document management (PDF uploads)
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createDocument,
  getDocuments,
  getDocument,
  deleteDocument,
} from "@/lib/db";
import { uploadPDF, deletePDF, DocumentType } from "@/lib/storage";

// GET /api/documents - List all documents
// GET /api/documents?projectId=xxx - List documents for a project
// GET /api/documents?id=xxx - Get a specific document
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const projectId = searchParams.get("projectId");

    if (id) {
      const document = await getDocument(id);
      if (!document) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(document);
    }

    const documents = await getDocuments(projectId || undefined);
    return NextResponse.json(documents);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST /api/documents - Upload a new document
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;
    const type = formData.get("type") as DocumentType | null;
    const projectId = formData.get("projectId") as string | null;
    const pageCount = formData.get("pageCount") as string | null;
    const manufacturer = formData.get("manufacturer") as string | null;
    const model = formData.get("model") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!type || !["specification", "schedule", "submittal"].includes(type)) {
      return NextResponse.json(
        { error: "Valid document type is required (specification, schedule, or submittal)" },
        { status: 400 }
      );
    }

    const fileName = name || file.name;

    // Upload to Vercel Blob
    const uploadResult = await uploadPDF(
      file,
      fileName,
      type,
      projectId || undefined
    );

    // Save to database
    const document = await createDocument({
      project_id: projectId,
      name: fileName,
      type,
      blob_url: uploadResult.url,
      page_count: pageCount ? parseInt(pageCount, 10) : null,
      manufacturer: manufacturer || null,
      model: model || null,
    });

    return NextResponse.json(
      {
        document,
        storage: {
          url: uploadResult.url,
          pathname: uploadResult.pathname,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}

// DELETE /api/documents - Delete a document
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Get document to find blob URL
    const document = await getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Delete from Vercel Blob
    try {
      await deletePDF(document.blob_url);
    } catch (blobError) {
      console.error("Error deleting from blob storage:", blobError);
      // Continue with database deletion even if blob deletion fails
    }

    // Delete from database
    const deleted = await deleteDocument(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete document from database" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
