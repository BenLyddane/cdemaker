/**
 * Core types for the CDE Maker application
 */

// Bounding box for highlighting areas in documents
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Document location reference for linking back to source
export interface DocumentLocation {
  pageNumber: number;
  boundingBox?: BoundingBox;
  textSnippet?: string;
}

// Individual finding from submittal document (multi-pass search result)
export interface SubmittalFinding {
  id: string;                           // Unique ID for this finding
  pageNumber: number;
  value: string;
  unit?: string;
  confidence: "high" | "medium" | "low";
  boundingBox?: BoundingBox;
  status: CDEStatus;                    // AI's suggested status for this finding
  explanation: string;
}

// Extracted data row with location tracking and CDE review fields
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
  
  // CDE Review fields (always available for manual review)
  cdeStatus?: CDEStatus;           // Comply/Deviate/Exception/Pending
  cdeComment?: string;             // User or AI explanation
  isReviewed?: boolean;            // Track if item has been reviewed
  
  // AI vs Human tracking
  cdeSource?: "ai" | "human";      // Who made the CDE decision
  aiSuggestedStatus?: CDEStatus;   // Original AI suggestion (preserved after human edit)
  aiSuggestedComment?: string;     // Original AI explanation
  humanConfirmedAt?: string;       // ISO timestamp when user confirmed/changed
  isAiProcessing?: boolean;        // True while AI CDE is running for this row
  
  // AI CDE Progress Tracking (for detailed status display)
  aiCdeStatus?: "queued" | "scanning" | "complete" | "error";  // Granular AI CDE status
  aiCdeQueuePosition?: number;     // Position in queue (1-based, undefined = not queued)
  aiCdePagesScanned?: number;      // Pages checked so far
  aiCdeTotalPages?: number;        // Total pages to check
  aiCdeBatchesCompleted?: number;  // Batches completed
  aiCdeTotalBatches?: number;      // Total batches to process
  aiCdeError?: string;             // Error message if status is "error"
  
  // Submittal reference (populated by AI CDE when submittal is provided)
  submittalValue?: string;         // Value found in submittal (best match)
  submittalUnit?: string;          // Unit from submittal (best match)
  submittalLocation?: DocumentLocation;  // Location in submittal document (best match)
  matchConfidence?: "high" | "medium" | "low" | "not_found";  // AI confidence in match
  
  // Multi-pass search results - all findings from submittal
  submittalFindings?: SubmittalFinding[];  // All findings from multi-pass search
  activeFindingIndex?: number;              // Currently selected finding (0-based, default 0)
}

// CDE Status
export type CDEStatus = "comply" | "deviate" | "exception" | "pending" | "not_found";

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
