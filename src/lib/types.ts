/**
 * Core types for the CDE Maker application
 */

// Document location reference for linking back to source
export interface DocumentLocation {
  pageNumber: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  textSnippet?: string;
}

// Extracted data row with location tracking
export interface ExtractedRow {
  id: string;
  field: string;
  value: string;
  unit?: string;
  section?: string;
  specNumber?: string; // Full specification number (e.g., "23 34 00", "01 33 00")
  confidence: "high" | "medium" | "low";
  pageNumber: number;
  location?: DocumentLocation;
  rawText?: string;
}

// CDE Status
export type CDEStatus = "comply" | "deviate" | "exception" | "pending";

// Comparison result for a single data point
export interface ComparisonResult {
  id: string;
  
  // Specification/Schedule data
  specField: string;
  specValue: string;
  specUnit?: string;
  specSection?: string;
  specLocation: DocumentLocation;
  
  // Submittal data (if found)
  submittalField?: string;
  submittalValue?: string;
  submittalUnit?: string;
  submittalLocation?: DocumentLocation;
  
  // CDE Assessment
  status: CDEStatus;
  aiExplanation: string;
  userComment?: string;
  
  // Confidence in the match/comparison
  matchConfidence: "high" | "medium" | "low" | "not_found";
  
  // Review state
  isReviewed: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
}

// Full comparison document
export interface CDEDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  
  // Source documents
  specificationFile: {
    name: string;
    pageCount: number;
    type: "specification" | "schedule";
  };
  submittalFile: {
    name: string;
    pageCount: number;
    manufacturer?: string;
    model?: string;
  };
  
  // Comparison results
  comparisons: ComparisonResult[];
  
  // Summary statistics
  summary: {
    totalItems: number;
    comply: number;
    deviate: number;
    exception: number;
    pending: number;
    reviewed: number;
  };
}

// Page extraction result
export interface PageExtractionResult {
  pageNumber: number;
  status: "success" | "failed" | "pending";
  rows: ExtractedRow[];
  error?: string;
  retryCount: number;
  rawResponse?: string;
}

// Full extraction result
export interface ExtractionResult {
  rows: ExtractedRow[];
  metadata: {
    documentType: "specification" | "schedule" | "submittal" | "unknown";
    totalRows: number;
    totalPages: number;
    extractedAt: string;
    processingTime: number;
    manufacturer?: string;
    model?: string;
  };
  pageResults: PageExtractionResult[];
}

// Extraction progress
export interface ExtractionProgress {
  totalPages: number;
  completedPages: number;
  currentPage: number;
  status: "processing" | "completed" | "failed";
  pageStatuses: Array<{
    page: number;
    status: "pending" | "processing" | "success" | "failed" | "retrying";
    retryCount: number;
  }>;
}

// Comparison request
export interface ComparisonRequest {
  specificationData: ExtractionResult;
  submittalData: ExtractionResult;
  specificationPages: Array<{ base64: string; mimeType: string; pageNumber: number }>;
  submittalPages: Array<{ base64: string; mimeType: string; pageNumber: number }>;
}

// Review state for UI
export interface ReviewState {
  currentIndex: number;
  comparisons: ComparisonResult[];
  showSpecPdf: boolean;
  showSubmittalPdf: boolean;
  specPdfPage: number;
  submittalPdfPage: number;
  highlightedComparison?: string;
}
