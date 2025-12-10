/**
 * API routes for CDE report management
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createCDEReport,
  getCDEReports,
  getCDEReport,
  deleteCDEReport,
  updateComparison,
  updateCDEReportSummary,
  dbComparisonsToResults,
} from "@/lib/db";
import { CDEStatus, ComparisonResult } from "@/lib/types";

// GET /api/reports - List all reports
// GET /api/reports?projectId=xxx - List reports for a project
// GET /api/reports?id=xxx - Get a specific report with comparisons
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const projectId = searchParams.get("projectId");

    if (id) {
      const result = await getCDEReport(id);
      if (!result) {
        return NextResponse.json(
          { error: "Report not found" },
          { status: 404 }
        );
      }

      // Convert DB comparisons to application format
      const comparisons = dbComparisonsToResults(result.comparisons);

      return NextResponse.json({
        report: result.report,
        comparisons,
      });
    }

    const reports = await getCDEReports(projectId || undefined);
    return NextResponse.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}

// POST /api/reports - Create a new CDE report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, name, specDocumentId, submittalDocumentId, comparisons } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Report name is required" },
        { status: 400 }
      );
    }

    if (!specDocumentId || typeof specDocumentId !== "string") {
      return NextResponse.json(
        { error: "Specification document ID is required" },
        { status: 400 }
      );
    }

    if (!submittalDocumentId || typeof submittalDocumentId !== "string") {
      return NextResponse.json(
        { error: "Submittal document ID is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(comparisons) || comparisons.length === 0) {
      return NextResponse.json(
        { error: "Comparisons array is required" },
        { status: 400 }
      );
    }

    const result = await createCDEReport({
      projectId: projectId || undefined,
      name,
      specDocumentId,
      submittalDocumentId,
      comparisons: comparisons as ComparisonResult[],
    });

    // Convert DB comparisons to application format
    const resultComparisons = dbComparisonsToResults(result.comparisons);

    return NextResponse.json(
      {
        report: result.report,
        comparisons: resultComparisons,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating report:", error);
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 }
    );
  }
}

// PATCH /api/reports - Update a comparison within a report
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { comparisonId, reportId, status, userComment, isReviewed, reviewedBy } = body;

    if (!comparisonId || typeof comparisonId !== "string") {
      return NextResponse.json(
        { error: "Comparison ID is required" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !["comply", "deviate", "exception", "pending"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    const updated = await updateComparison(comparisonId, {
      status: status as CDEStatus | undefined,
      userComment,
      isReviewed,
      reviewedBy,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Comparison not found or no changes made" },
        { status: 404 }
      );
    }

    // Update report summary if status changed
    if (reportId && status) {
      await updateCDEReportSummary(reportId);
    }

    return NextResponse.json({
      success: true,
      comparison: updated,
    });
  } catch (error) {
    console.error("Error updating comparison:", error);
    return NextResponse.json(
      { error: "Failed to update comparison" },
      { status: 500 }
    );
  }
}

// DELETE /api/reports - Delete a report
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Report ID is required" },
        { status: 400 }
      );
    }

    const deleted = await deleteCDEReport(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting report:", error);
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 500 }
    );
  }
}
