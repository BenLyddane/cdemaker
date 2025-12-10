/**
 * Database utility functions using Neon serverless driver
 */
import { neon, neonConfig, NeonQueryFunction } from "@neondatabase/serverless";
import {
  ExtractedRow,
  ExtractionResult,
  ComparisonResult,
  DocumentLocation,
  CDEStatus,
} from "./types";

// Neon configuration - fetchConnectionCache is now always true by default
// neonConfig.fetchConnectionCache = true; // deprecated, now default behavior

// Get the SQL client
function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(databaseUrl);
}

// ============================================================================
// Project Operations
// ============================================================================

export interface Project {
  id: string;
  name: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createProject(name: string, userId?: string): Promise<Project> {
  const sql = getSQL();
  const result = await sql`
    INSERT INTO projects (name, user_id)
    VALUES (${name}, ${userId || null})
    RETURNING *
  `;
  return result[0] as Project;
}

export async function getProjects(userId?: string): Promise<Project[]> {
  const sql = getSQL();
  if (userId) {
    const result = await sql`
      SELECT * FROM projects WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return result as Project[];
  }
  // If no userId, return projects without a user_id (anonymous projects)
  const result = await sql`
    SELECT * FROM projects WHERE user_id IS NULL
    ORDER BY created_at DESC
  `;
  return result as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const sql = getSQL();
  const result = await sql`
    SELECT * FROM projects WHERE id = ${id}
  `;
  return (result[0] as Project) || null;
}

export async function updateProject(
  id: string,
  name: string
): Promise<Project | null> {
  const sql = getSQL();
  const result = await sql`
    UPDATE projects
    SET name = ${name}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result[0] as Project) || null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const sql = getSQL();
  const result = await sql`
    DELETE FROM projects WHERE id = ${id}
    RETURNING id
  `;
  return result.length > 0;
}

// ============================================================================
// Document Operations
// ============================================================================

export interface Document {
  id: string;
  project_id: string | null;
  name: string;
  type: "specification" | "schedule" | "submittal";
  blob_url: string;
  page_count: number | null;
  manufacturer: string | null;
  model: string | null;
  uploaded_at: string;
}

export async function createDocument(
  data: Omit<Document, "id" | "uploaded_at">
): Promise<Document> {
  const sql = getSQL();
  const result = await sql`
    INSERT INTO documents (project_id, name, type, blob_url, page_count, manufacturer, model)
    VALUES (${data.project_id}, ${data.name}, ${data.type}, ${data.blob_url}, ${data.page_count}, ${data.manufacturer}, ${data.model})
    RETURNING *
  `;
  return result[0] as Document;
}

export async function getDocuments(projectId?: string): Promise<Document[]> {
  const sql = getSQL();
  if (projectId) {
    const result = await sql`
      SELECT * FROM documents WHERE project_id = ${projectId}
      ORDER BY uploaded_at DESC
    `;
    return result as Document[];
  }
  const result = await sql`
    SELECT * FROM documents
    ORDER BY uploaded_at DESC
  `;
  return result as Document[];
}

export async function getDocument(id: string): Promise<Document | null> {
  const sql = getSQL();
  const result = await sql`
    SELECT * FROM documents WHERE id = ${id}
  `;
  return (result[0] as Document) || null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const sql = getSQL();
  const result = await sql`
    DELETE FROM documents WHERE id = ${id}
    RETURNING id
  `;
  return result.length > 0;
}

// ============================================================================
// Extraction Operations
// ============================================================================

export interface Extraction {
  id: string;
  document_id: string;
  document_type: string | null;
  total_rows: number | null;
  processing_time: number | null;
  metadata: Record<string, unknown> | null;
  extracted_at: string;
}

export interface ExtractedRowDB {
  id: string;
  extraction_id: string;
  field: string | null;
  value: string | null;
  unit: string | null;
  section: string | null;
  spec_number: string | null;
  confidence: "high" | "medium" | "low" | null;
  page_number: number | null;
  location: Record<string, unknown> | null;
  raw_text: string | null;
  // CDE fields
  cde_status: "comply" | "deviate" | "exception" | "pending" | null;
  cde_comment: string | null;
  cde_source: "ai" | "human" | null;
  is_reviewed: boolean;
  submittal_value: string | null;
  submittal_unit: string | null;
  submittal_location: Record<string, unknown> | null;
  match_confidence: "high" | "medium" | "low" | "not_found" | null;
  updated_at: string | null;
}

export async function saveExtraction(
  documentId: string,
  extractionResult: ExtractionResult
): Promise<{ extraction: Extraction; rows: ExtractedRowDB[] }> {
  const sql = getSQL();

  // Create extraction record
  const extractionData = await sql`
    INSERT INTO extractions (document_id, document_type, total_rows, processing_time, metadata)
    VALUES (
      ${documentId},
      ${extractionResult.metadata.documentType},
      ${extractionResult.metadata.totalRows},
      ${extractionResult.metadata.processingTime},
      ${JSON.stringify(extractionResult.metadata)}
    )
    RETURNING *
  `;
  const extraction = extractionData[0] as Extraction;

  // Insert all extracted rows
  const rows: ExtractedRowDB[] = [];
  for (const row of extractionResult.rows) {
    const rowResult = await sql`
      INSERT INTO extracted_rows (extraction_id, field, value, unit, section, spec_number, confidence, page_number, location, raw_text)
      VALUES (
        ${extraction.id},
        ${row.field},
        ${row.value},
        ${row.unit || null},
        ${row.section || null},
        ${row.specNumber || null},
        ${row.confidence},
        ${row.pageNumber},
        ${row.location ? JSON.stringify(row.location) : null},
        ${row.rawText || null}
      )
      RETURNING *
    `;
    rows.push(rowResult[0] as ExtractedRowDB);
  }

  return { extraction, rows };
}

export async function getExtractionByDocument(
  documentId: string
): Promise<{ extraction: Extraction; rows: ExtractedRowDB[] } | null> {
  const sql = getSQL();

  const extractionResult = await sql`
    SELECT * FROM extractions WHERE document_id = ${documentId}
    ORDER BY extracted_at DESC LIMIT 1
  `;

  if (!extractionResult[0]) return null;

  const extraction = extractionResult[0] as Extraction;

  const rows = await sql`
    SELECT * FROM extracted_rows WHERE extraction_id = ${extraction.id}
    ORDER BY page_number, id
  `;

  return { extraction, rows: rows as ExtractedRowDB[] };
}

// Convert DB rows to application ExtractedRow type
export function dbRowsToExtractedRows(dbRows: ExtractedRowDB[]): ExtractedRow[] {
  return dbRows.map((row) => ({
    id: row.id,
    field: row.field || "",
    value: row.value || "",
    unit: row.unit || undefined,
    section: row.section || undefined,
    specNumber: row.spec_number || undefined,
    confidence: row.confidence || "medium",
    pageNumber: row.page_number || 1,
    location: row.location as unknown as DocumentLocation | undefined,
    rawText: row.raw_text || undefined,
    // CDE fields
    cdeStatus: row.cde_status || undefined,
    cdeComment: row.cde_comment || undefined,
    cdeSource: row.cde_source || undefined,
    isReviewed: row.is_reviewed || false,
    submittalValue: row.submittal_value || undefined,
    submittalUnit: row.submittal_unit || undefined,
    submittalLocation: row.submittal_location as unknown as DocumentLocation | undefined,
    matchConfidence: row.match_confidence || undefined,
  }));
}

// ============================================================================
// CDE Report Operations
// ============================================================================

export interface CDEReport {
  id: string;
  project_id: string | null;
  name: string;
  spec_document_id: string | null;
  submittal_document_id: string | null;
  summary: {
    totalItems: number;
    comply: number;
    deviate: number;
    exception: number;
    pending: number;
    reviewed: number;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ComparisonDB {
  id: string;
  cde_report_id: string;
  spec_field: string | null;
  spec_value: string | null;
  spec_unit: string | null;
  spec_section: string | null;
  spec_location: Record<string, unknown> | null;
  submittal_field: string | null;
  submittal_value: string | null;
  submittal_unit: string | null;
  submittal_location: Record<string, unknown> | null;
  status: CDEStatus;
  ai_explanation: string | null;
  user_comment: string | null;
  match_confidence: "high" | "medium" | "low" | "not_found" | null;
  is_reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export async function createCDEReport(data: {
  projectId?: string;
  name: string;
  specDocumentId: string;
  submittalDocumentId: string;
  comparisons: ComparisonResult[];
}): Promise<{ report: CDEReport; comparisons: ComparisonDB[] }> {
  const sql = getSQL();

  // Calculate summary
  const summary = {
    totalItems: data.comparisons.length,
    comply: data.comparisons.filter((c) => c.status === "comply").length,
    deviate: data.comparisons.filter((c) => c.status === "deviate").length,
    exception: data.comparisons.filter((c) => c.status === "exception").length,
    pending: data.comparisons.filter((c) => c.status === "pending").length,
    reviewed: data.comparisons.filter((c) => c.isReviewed).length,
  };

  // Create report
  const reportResult = await sql`
    INSERT INTO cde_reports (project_id, name, spec_document_id, submittal_document_id, summary)
    VALUES (${data.projectId || null}, ${data.name}, ${data.specDocumentId}, ${data.submittalDocumentId}, ${JSON.stringify(summary)})
    RETURNING *
  `;
  const report = reportResult[0] as CDEReport;

  // Insert comparisons
  const comparisons: ComparisonDB[] = [];
  for (const comp of data.comparisons) {
    const compResult = await sql`
      INSERT INTO comparisons (
        cde_report_id, spec_field, spec_value, spec_unit, spec_section, spec_location,
        submittal_field, submittal_value, submittal_unit, submittal_location,
        status, ai_explanation, user_comment, match_confidence, is_reviewed, reviewed_at, reviewed_by
      )
      VALUES (
        ${report.id},
        ${comp.specField},
        ${comp.specValue},
        ${comp.specUnit || null},
        ${comp.specSection || null},
        ${JSON.stringify(comp.specLocation)},
        ${comp.submittalField || null},
        ${comp.submittalValue || null},
        ${comp.submittalUnit || null},
        ${comp.submittalLocation ? JSON.stringify(comp.submittalLocation) : null},
        ${comp.status},
        ${comp.aiExplanation},
        ${comp.userComment || null},
        ${comp.matchConfidence},
        ${comp.isReviewed},
        ${comp.reviewedAt || null},
        ${comp.reviewedBy || null}
      )
      RETURNING *
    `;
    comparisons.push(compResult[0] as ComparisonDB);
  }

  return { report, comparisons };
}

export async function getCDEReports(projectId?: string): Promise<CDEReport[]> {
  const sql = getSQL();
  if (projectId) {
    const result = await sql`
      SELECT * FROM cde_reports WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `;
    return result as CDEReport[];
  }
  const result = await sql`
    SELECT * FROM cde_reports
    ORDER BY created_at DESC
  `;
  return result as CDEReport[];
}

export async function getCDEReport(
  id: string
): Promise<{ report: CDEReport; comparisons: ComparisonDB[] } | null> {
  const sql = getSQL();

  const reportResult = await sql`
    SELECT * FROM cde_reports WHERE id = ${id}
  `;

  if (!reportResult[0]) return null;

  const report = reportResult[0] as CDEReport;

  const comparisons = await sql`
    SELECT * FROM comparisons WHERE cde_report_id = ${id}
    ORDER BY id
  `;

  return { report, comparisons: comparisons as ComparisonDB[] };
}

export async function updateComparison(
  id: string,
  data: {
    status?: CDEStatus;
    userComment?: string;
    isReviewed?: boolean;
    reviewedBy?: string;
  }
): Promise<ComparisonDB | null> {
  const sql = getSQL();

  // Check if there's anything to update
  const hasUpdates = data.status !== undefined || 
                     data.userComment !== undefined || 
                     data.isReviewed !== undefined || 
                     data.reviewedBy !== undefined;
  
  if (!hasUpdates) return null;

  const result = await sql`
    UPDATE comparisons
    SET status = COALESCE(${data.status || null}, status),
        user_comment = COALESCE(${data.userComment || null}, user_comment),
        is_reviewed = COALESCE(${data.isReviewed ?? null}, is_reviewed),
        reviewed_at = ${data.isReviewed ? sql`NOW()` : sql`reviewed_at`},
        reviewed_by = COALESCE(${data.reviewedBy || null}, reviewed_by)
    WHERE id = ${id}
    RETURNING *
  `;

  return (result[0] as ComparisonDB) || null;
}

export async function updateCDEReportSummary(reportId: string): Promise<void> {
  const sql = getSQL();

  // Recalculate summary from comparisons
  const summary = await sql`
    SELECT
      COUNT(*)::int as "totalItems",
      COUNT(*) FILTER (WHERE status = 'comply')::int as comply,
      COUNT(*) FILTER (WHERE status = 'deviate')::int as deviate,
      COUNT(*) FILTER (WHERE status = 'exception')::int as exception,
      COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
      COUNT(*) FILTER (WHERE is_reviewed = true)::int as reviewed
    FROM comparisons
    WHERE cde_report_id = ${reportId}
  `;

  await sql`
    UPDATE cde_reports
    SET summary = ${JSON.stringify(summary[0])}, updated_at = NOW()
    WHERE id = ${reportId}
  `;
}

export async function deleteCDEReport(id: string): Promise<boolean> {
  const sql = getSQL();
  const result = await sql`
    DELETE FROM cde_reports WHERE id = ${id}
    RETURNING id
  `;
  return result.length > 0;
}

// Convert DB comparisons to application ComparisonResult type
export function dbComparisonsToResults(
  dbComparisons: ComparisonDB[]
): ComparisonResult[] {
  return dbComparisons.map((comp) => ({
    id: comp.id,
    specField: comp.spec_field || "",
    specValue: comp.spec_value || "",
    specUnit: comp.spec_unit || undefined,
    specSection: comp.spec_section || undefined,
    specLocation: comp.spec_location as unknown as DocumentLocation,
    submittalField: comp.submittal_field || undefined,
    submittalValue: comp.submittal_value || undefined,
    submittalUnit: comp.submittal_unit || undefined,
    submittalLocation: comp.submittal_location as unknown as DocumentLocation | undefined,
    status: comp.status,
    aiExplanation: comp.ai_explanation || "",
    userComment: comp.user_comment || undefined,
    matchConfidence: comp.match_confidence || "medium",
    isReviewed: comp.is_reviewed,
    reviewedAt: comp.reviewed_at || undefined,
    reviewedBy: comp.reviewed_by || undefined,
  }));
}
