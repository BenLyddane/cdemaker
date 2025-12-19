"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Sidebar } from "./sidebar";
import { DualPdfViewer } from "./dual-pdf-viewer";
import { ComparisonPanel } from "./comparison-panel";
import { ExtractedDataPanel } from "./extracted-data-panel";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, FolderOpen, Save, Check, X, Pause, Play } from "lucide-react";
import Image from "next/image";
import { UserMenu } from "@/components/auth/user-menu";
import { useUser } from "@stackframe/stack";
import { isStackConfigured } from "@/lib/stack-client";
import { ProjectsModal } from "@/components/projects/projects-modal";
import type { ComparisonResult, CDEStatus, ExtractionResult, ExtractedRow, SubmittalFinding } from "@/lib/types";
import type { PageData } from "@/lib/pdf-utils";
import { extractPages } from "@/lib/pdf-utils";
import { generateCDEPdf, downloadPdf } from "@/lib/pdf-generator";
import type { UploadedDocument, DocumentType } from "./document-list";

// Stream event types from API
type StreamEvent = 
  | { type: "log"; message: string; level: "info" | "success" | "warning" | "error" }
  | { type: "detection"; documentType: string; confidence: string; reason: string }
  | { type: "page_start"; pageNumber: number; totalPages: number }
  | { type: "page_complete"; pageNumber: number; rowCount: number; rows: ExtractedRow[] }
  | { type: "page_error"; pageNumber: number; error: string; retryCount: number }
  | { type: "complete"; totalRows: number; metadata: any };

export interface ExtractionLog {
  id: string;
  timestamp: Date;
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
  documentType?: string;
  logs: ExtractionLog[];
}

// Workflow phases
type WorkflowPhase = "upload" | "extracting" | "reviewing" | "comparing" | "complete";

// Smart batching configuration - stay well under Vercel's 4.5MB limit
const TARGET_BATCH_SIZE_BYTES = 3 * 1024 * 1024; // 3MB target (safe margin)
const MIN_PAGES_PER_BATCH = 1;
const MAX_PAGES_PER_BATCH = 15; // Cap to avoid overly large API calls

/**
 * Create optimal batches of pages based on their actual base64 sizes
 * This allows us to process multiple pages per request while staying under the 4.5MB Vercel limit
 */
function createOptimalBatches(pages: PageData[]): PageData[][] {
  const batches: PageData[][] = [];
  let currentBatch: PageData[] = [];
  let currentSize = 0;
  
  for (const page of pages) {
    // base64 string length roughly equals byte size
    const pageSize = page.base64.length;
    
    // If adding this page would exceed target and we have pages, start new batch
    if (currentSize + pageSize > TARGET_BATCH_SIZE_BYTES && currentBatch.length >= MIN_PAGES_PER_BATCH) {
      batches.push(currentBatch);
      currentBatch = [page];
      currentSize = pageSize;
    } 
    // If current batch is at max pages, start new batch
    else if (currentBatch.length >= MAX_PAGES_PER_BATCH) {
      batches.push(currentBatch);
      currentBatch = [page];
      currentSize = pageSize;
    }
    else {
      currentBatch.push(page);
      currentSize += pageSize;
    }
  }
  
  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  console.log(`[Smart Batching] Created ${batches.length} batches from ${pages.length} pages`);
  batches.forEach((batch, i) => {
    const batchSize = batch.reduce((sum, p) => sum + p.base64.length, 0);
    console.log(`  Batch ${i + 1}: ${batch.length} pages, ~${(batchSize / 1024 / 1024).toFixed(2)}MB`);
  });
  
  return batches;
}

export function CDEWorkspace() {
  // Document state - separate spec/schedule from submittal
  const [specDocuments, setSpecDocuments] = useState<UploadedDocument[]>([]);
  const [submittalDocument, setSubmittalDocument] = useState<UploadedDocument | null>(null);
  const [documentPages, setDocumentPages] = useState<Map<string, PageData[]>>(new Map());
  const [documentExtractions, setDocumentExtractions] = useState<Map<string, ExtractionResult>>(new Map());
  
  // Workflow state
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>("upload");
  
  // Comparison results
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [summary, setSummary] = useState({
    totalItems: 0,
    comply: 0,
    deviate: 0,
    exception: 0,
    pending: 0,
    reviewed: 0,
  });
  
  // Processing state
  const [isExtracting, setIsExtracting] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  
  // Extraction progress state
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const pausedDocRef = useRef<{ doc: UploadedDocument; lastPage: number } | null>(null);
  
  // AI CDE processing queue
  const aiCdeQueueRef = useRef<ExtractedRow[]>([]);
  const aiCdeProcessingRef = useRef<boolean>(false);
  const aiCdePausedRef = useRef<boolean>(false);
  const submittalPagesRef = useRef<PageData[] | null>(null);
  
  // Pre-computed batches for submittal pages (computed once when submittal is uploaded)
  const submittalBatchesRef = useRef<PageData[][] | null>(null);
  
  // View state
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [submittalCurrentPage, setSubmittalCurrentPage] = useState(1);
  const [selectedComparison, setSelectedComparison] = useState<string | null>(null);
  const [hoveredExtractedRow, setHoveredExtractedRow] = useState<ExtractedRow | null>(null);
  const [selectedExtractedRow, setSelectedExtractedRow] = useState<ExtractedRow | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitView, setSplitView] = useState(true); // Default to split view when submittal exists
  const [viewingDocument, setViewingDocument] = useState<"spec" | "submittal">("spec");
  
  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);
  
  // Get all extracted rows from spec documents
  const allExtractedRows = useMemo(() => {
    const rows: ExtractedRow[] = [];
    specDocuments.forEach(doc => {
      const extraction = documentExtractions.get(doc.id);
      if (extraction?.rows) {
        rows.push(...extraction.rows);
      }
    });
    return rows;
  }, [specDocuments, documentExtractions]);
  
  // Determine current workflow phase
  const determineWorkflowPhase = useCallback((): WorkflowPhase => {
    if (isExtracting) return "extracting";
    if (isComparing) return "comparing";
    if (comparisons.length > 0) return "complete";
    
    const hasCompletedSpecs = specDocuments.some(d => d.status === "complete");
    if (hasCompletedSpecs) return "reviewing";
    
    return "upload";
  }, [specDocuments, isExtracting, isComparing, comparisons.length]);
  
  // Helper to add a log entry
  const addLog = useCallback((message: string, level: "info" | "success" | "warning" | "error") => {
    setExtractionProgress(prev => {
      if (!prev) return prev;
      const newLog: ExtractionLog = {
        id: generateId(),
        timestamp: new Date(),
        message,
        level,
      };
      return {
        ...prev,
        logs: [...prev.logs, newLog],
      };
    });
  }, []);

  // Update a row with AI CDE results (supports multiple findings)
  const updateRowWithAiResult = useCallback((rowId: string, result: {
    status: CDEStatus;
    matchConfidence: "high" | "medium" | "low" | "not_found";
    explanation: string;
    submittalValue?: string;
    submittalUnit?: string;
    submittalLocation?: { pageNumber: number; boundingBox?: { x: number; y: number; width: number; height: number } };
    findings?: SubmittalFinding[];
    totalFindings?: number;
  }) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          newRows[rowIndex] = {
            ...newRows[rowIndex],
            cdeStatus: result.status,
            cdeComment: result.explanation,
            cdeSource: "ai",
            aiSuggestedStatus: result.status,
            aiSuggestedComment: result.explanation,
            isAiProcessing: false,
            submittalValue: result.submittalValue,
            submittalUnit: result.submittalUnit,
            submittalLocation: result.submittalLocation,
            matchConfidence: result.matchConfidence,
            // New multi-finding support
            submittalFindings: result.findings || [],
            activeFindingIndex: 0, // Start with best match (first in array)
          };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);

  // Helper to update row progress during AI CDE processing
  const updateRowProgress = useCallback((rowId: string, progressUpdate: Partial<ExtractedRow>) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          newRows[rowIndex] = { ...newRows[rowIndex], ...progressUpdate };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);

  // Process a single row with AI CDE - uses smart batching to maximize pages per request
  const processRowWithAiCde = useCallback(async (row: ExtractedRow, submittalPages: PageData[]) => {
    // Use pre-computed batches if available, otherwise compute them
    const batches = submittalBatchesRef.current || createOptimalBatches(submittalPages);
    const totalBatches = batches.length;
    const totalPages = submittalPages.length;
    
    // Update row to show scanning status with total info
    updateRowProgress(row.id, {
      aiCdeStatus: "scanning",
      aiCdeTotalPages: totalPages,
      aiCdeTotalBatches: totalBatches,
      aiCdePagesScanned: 0,
      aiCdeBatchesCompleted: 0,
    });
    
    try {
      const allFindings: SubmittalFinding[] = [];
      let hasError = false;
      let pagesScanned = 0;
      
      console.log(`[AI CDE] Processing "${row.field}" across ${totalPages} pages in ${totalBatches} batches (smart batching)`);
      
      // Process pages using smart batches
      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const batchPages = batches[batchIdx];
        const startPage = batchPages[0]?.pageNumber || 1;
        const endPage = batchPages[batchPages.length - 1]?.pageNumber || batchPages.length;
        
        // Update progress - show which pages are being scanned
        updateRowProgress(row.id, {
          aiCdePagesScanned: pagesScanned,
          aiCdeBatchesCompleted: batchIdx,
        });
        
        try {
          const response = await fetch("/api/compare-single", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              specRow: row,
              submittalPages: batchPages.map(p => ({
                base64: p.base64,
                mimeType: p.mimeType,
                pageNumber: p.pageNumber,
              })),
              scanAllPages: false, // Single batch mode - we handle batching client-side
              batchInfo: {
                batchIndex: batchIdx,
                totalBatches,
                startPage,
                endPage,
                totalPages,
              },
            }),
          });

          if (!response.ok) {
            const statusCode = response.status;
            console.error(`[AI CDE] Batch ${batchIdx + 1}/${totalBatches} failed for row ${row.id}: ${statusCode}`);
            
            // If we hit a 413 (payload too large), log for debugging
            if (statusCode === 413) {
              const batchSize = batchPages.reduce((sum, p) => sum + p.base64.length, 0);
              console.error(`[AI CDE] 413 Error - batch was ${(batchSize / 1024 / 1024).toFixed(2)}MB with ${batchPages.length} pages`);
            }
            
            hasError = true;
            pagesScanned += batchPages.length;
            continue; // Try next batch even if this one fails
          }

          const result = await response.json();
          if (result.success && result.data?.findings) {
            allFindings.push(...result.data.findings);
          }
          
          pagesScanned += batchPages.length;
          
          // Small delay between batches to avoid rate limiting
          if (batchIdx < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (batchError) {
          console.error(`[AI CDE] Batch ${batchIdx + 1}/${totalBatches} error:`, batchError);
          hasError = true;
          pagesScanned += batchPages.length;
          // Continue with next batch
        }
      }
      
      // Final progress update
      updateRowProgress(row.id, {
        aiCdePagesScanned: totalPages,
        aiCdeBatchesCompleted: totalBatches,
      });
      
      // If we got any findings, update the row with aggregated results
      if (allFindings.length > 0) {
        // Sort findings by confidence then status
        const confidenceOrder = { high: 0, medium: 1, low: 2 };
        const statusOrder: Record<CDEStatus, number> = { comply: 0, deviate: 1, exception: 2, not_found: 3, pending: 4 };
        
        allFindings.sort((a, b) => {
          const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
          if (confDiff !== 0) return confDiff;
          return statusOrder[a.status] - statusOrder[b.status];
        });
        
        const bestMatch = allFindings[0];
        
        // Determine overall status
        let overallStatus: CDEStatus = "exception";
        if (allFindings.some(f => f.status === "comply")) overallStatus = "comply";
        else if (allFindings.some(f => f.status === "deviate")) overallStatus = "deviate";
        
        // Determine overall confidence
        let matchConfidence: "high" | "medium" | "low" | "not_found" = "not_found";
        if (allFindings.some(f => f.confidence === "high")) matchConfidence = "high";
        else if (allFindings.some(f => f.confidence === "medium")) matchConfidence = "medium";
        else if (allFindings.length > 0) matchConfidence = "low";
        
        updateRowWithAiResult(row.id, {
          status: overallStatus,
          matchConfidence,
          explanation: allFindings.length > 1 
            ? `${allFindings.length} occurrences found. Best: ${bestMatch.explanation}`
            : bestMatch.explanation,
          submittalValue: bestMatch.value,
          submittalUnit: bestMatch.unit,
          submittalLocation: {
            pageNumber: bestMatch.pageNumber,
            boundingBox: bestMatch.boundingBox,
          },
          findings: allFindings,
          totalFindings: allFindings.length,
        });
        
        console.log(`[AI CDE] Found ${allFindings.length} total findings for "${row.field}"`);
      } else {
        // No findings - mark as not_found
        updateRowWithAiResult(row.id, {
          status: "not_found",
          matchConfidence: "not_found",
          explanation: hasError ? "Search failed - please retry" : "No matching data found in submittal",
          findings: [],
          totalFindings: 0,
        });
      }
    } catch (error) {
      console.error(`AI CDE error for row ${row.id}:`, error);
      // Mark as no longer processing
      setDocumentExtractions(prev => {
        const newMap = new Map(prev);
        for (const [docId, extraction] of newMap.entries()) {
          const rowIndex = extraction.rows.findIndex(r => r.id === row.id);
          if (rowIndex !== -1) {
            const newRows = [...extraction.rows];
            newRows[rowIndex] = { ...newRows[rowIndex], isAiProcessing: false };
            newMap.set(docId, { ...extraction, rows: newRows });
            break;
          }
        }
        return newMap;
      });
    }
  }, [updateRowWithAiResult, updateRowProgress]);

  // Process the AI CDE queue
  const processAiCdeQueue = useCallback(async () => {
    if (aiCdeProcessingRef.current) return;
    if (aiCdeQueueRef.current.length === 0) return;
    if (!submittalPagesRef.current) return;

    aiCdeProcessingRef.current = true;
    aiCdePausedRef.current = false; // Reset pause flag when starting
    const submittalPages = submittalPagesRef.current;

    while (aiCdeQueueRef.current.length > 0 && !aiCdePausedRef.current) {
      const row = aiCdeQueueRef.current.shift();
      if (row) {
        await processRowWithAiCde(row, submittalPages);
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // If paused, clear remaining queue and mark rows as not processing
    if (aiCdePausedRef.current && aiCdeQueueRef.current.length > 0) {
      const remainingRowIds = aiCdeQueueRef.current.map(r => r.id);
      aiCdeQueueRef.current = []; // Clear the queue
      
      // Mark remaining rows as no longer processing
      setDocumentExtractions(prev => {
        const newMap = new Map(prev);
        for (const [docId, extraction] of newMap.entries()) {
          const hasRemainingRows = extraction.rows.some(r => remainingRowIds.includes(r.id));
          if (hasRemainingRows) {
            const newRows = extraction.rows.map(r => 
              remainingRowIds.includes(r.id) ? { ...r, isAiProcessing: false } : r
            );
            newMap.set(docId, { ...extraction, rows: newRows });
          }
        }
        return newMap;
      });
    }

    aiCdeProcessingRef.current = false;
  }, [processRowWithAiCde]);

  // Queue rows for AI CDE processing
  const queueRowsForAiCde = useCallback((rows: ExtractedRow[], docId: string) => {
    // Calculate starting queue position (existing queue + 1)
    const startQueuePosition = aiCdeQueueRef.current.length + 1;
    const totalPages = submittalPagesRef.current?.length || 0;
    const totalBatches = submittalBatchesRef.current?.length || Math.ceil(totalPages / MAX_PAGES_PER_BATCH);
    
    // Mark rows as queued with queue positions
    setDocumentExtractions(prev => {
      const current = prev.get(docId);
      if (!current) return prev;
      
      const newMap = new Map(prev);
      let queuePosition = startQueuePosition;
      
      const newRows = current.rows.map(r => {
        const matchingRow = rows.find(newRow => newRow.id === r.id);
        if (matchingRow) {
          return { 
            ...r, 
            isAiProcessing: true,
            aiCdeStatus: "queued" as const,
            aiCdeQueuePosition: queuePosition++,
            aiCdeTotalPages: totalPages,
            aiCdeTotalBatches: totalBatches,
            aiCdePagesScanned: 0,
            aiCdeBatchesCompleted: 0,
          };
        }
        return r;
      });
      newMap.set(docId, { ...current, rows: newRows });
      return newMap;
    });

    // Add to queue
    aiCdeQueueRef.current.push(...rows);

    // Start processing if not already running
    processAiCdeQueue();
  }, [processAiCdeQueue]);

  // Process a spec/schedule document with page-by-page extraction
  const processSpecDocument = useCallback(async (doc: UploadedDocument) => {
    const abortController = new AbortController();
    extractionAbortRef.current = abortController;
    
    try {
      // Update status to extracting
      setSpecDocuments(prev => prev.map(d => 
        d.id === doc.id ? { ...d, status: "extracting" as const } : d
      ));
      
      // Initialize extraction progress
      setExtractionProgress({
        currentPage: 0,
        totalPages: 0,
        logs: [{ id: generateId(), timestamp: new Date(), message: "Converting PDF to images...", level: "info" }],
      });
      
      // Extract pages (convert PDF to images)
      const pages = await extractPages(doc.file);
      setDocumentPages(prev => new Map(prev).set(doc.id, pages));
      
      addLog(`PDF converted: ${pages.length} pages`, "success");
      
      // First, detect document type (with just the first page - small payload)
      addLog("Detecting document type...", "info");
      const detectResponse = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: [{ base64: pages[0].base64, mimeType: pages[0].mimeType, pageNumber: 1 }],
          detectOnly: true,
        }),
        signal: abortController.signal,
      });
      
      if (!detectResponse.ok) throw new Error("Detection failed");
      
      const detectResult = await detectResponse.json();
      const detectedType = detectResult.data?.metadata?.detectedType?.type || "unknown";
      const confidence = detectResult.data?.metadata?.detectedType?.confidence || "low";
      const reason = detectResult.data?.metadata?.detectedType?.reason || "Unknown";
      
      addLog(`Document type: ${detectedType} (${confidence} confidence)`, "success");
      addLog(`Reason: ${reason}`, "info");
      
      // If detected as submittal, notify user
      if (detectedType === "submittal") {
        addLog("This appears to be a submittal. Please upload it in the Submittal section.", "error");
        setSpecDocuments(prev => prev.map(d => {
          if (d.id !== doc.id) return d;
          return {
            ...d,
            status: "error" as const,
            detectedType: "submittal",
            confidence,
            reason: "This appears to be a submittal. Please upload it in the Submittal section.",
            error: "Document appears to be a submittal, not a spec/schedule",
          };
        }));
        setExtractionProgress(null);
        return;
      }
      
      // Update document with detected type
      setSpecDocuments(prev => prev.map(d => 
        d.id === doc.id ? { ...d, status: "extracting" as const, detectedType, confidence, reason } : d
      ));
      
      // Initialize extraction result
      const extractionResult: ExtractionResult = {
        rows: [],
        metadata: {
          documentType: detectedType as any,
          totalRows: 0,
          totalPages: pages.length,
          extractedAt: new Date().toISOString(),
          processingTime: 0,
        },
        pageResults: [],
      };
      setDocumentExtractions(prev => new Map(prev).set(doc.id, extractionResult));
      
      // Set viewing document if first one
      if (!viewingDocId) {
        setViewingDocId(doc.id);
      }
      
      // Process pages one at a time to avoid payload size limits
      addLog(`Starting page-by-page extraction of ${pages.length} pages...`, "info");
      setExtractionProgress(prev => prev ? { ...prev, totalPages: pages.length } : prev);
      
      let totalExtractedRows = 0;
      let successfulPages = 0;
      let failedPages = 0;
      
      for (let i = 0; i < pages.length; i++) {
        // Check if aborted
        if (abortController.signal.aborted) {
          addLog("Extraction cancelled by user", "warning");
          break;
        }
        
        const page = pages[i];
        const pageNum = i + 1;
        
        // Update progress
        setExtractionProgress(prev => prev ? { 
          ...prev, 
          currentPage: pageNum,
        } : prev);
        
        addLog(`Processing page ${pageNum} of ${pages.length}...`, "info");
        
        try {
          // Send single page to the new endpoint
          const response = await fetch("/api/extract-page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page: {
                base64: page.base64,
                mimeType: page.mimeType,
                pageNumber: page.pageNumber,
              },
              documentType: detectedType,
              totalPages: pages.length,
            }),
            signal: abortController.signal,
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Page ${pageNum} extraction failed: ${errorText}`);
          }
          
          const result = await response.json();
          
          if (result.success && result.data) {
            const { rows, rowCount, pageContent } = result.data;
            
            console.log(`[Extraction] Page ${pageNum} returned ${rowCount} rows:`, rows);
            
            if (rows && rows.length > 0) {
              // Incrementally add rows - use timestamp to ensure unique IDs
              const timestampedRows = rows.map((row: ExtractedRow, idx: number) => ({
                ...row,
                id: `${doc.id}-page${pageNum}-row${idx}-${Date.now()}`,
              }));
              
              console.log(`[Extraction] Adding ${timestampedRows.length} rows to doc ${doc.id}`);
              
              setDocumentExtractions(prev => {
                const current = prev.get(doc.id);
                if (!current) {
                  console.warn(`[Extraction] No extraction found for doc ${doc.id}, creating new one`);
                  // Create a new extraction if it doesn't exist
                  const newMap = new Map(prev);
                  newMap.set(doc.id, {
                    rows: timestampedRows,
                    metadata: {
                      documentType: "specification" as const,
                      totalRows: timestampedRows.length,
                      totalPages: pages.length,
                      extractedAt: new Date().toISOString(),
                      processingTime: 0,
                    },
                    pageResults: [],
                  });
                  return newMap;
                }
                const newMap = new Map(prev);
                const newRows = [...current.rows, ...timestampedRows];
                console.log(`[Extraction] Updated doc ${doc.id}: ${current.rows.length} -> ${newRows.length} rows`);
                newMap.set(doc.id, {
                  ...current,
                  rows: newRows,
                  metadata: { ...current.metadata, totalRows: newRows.length },
                });
                return newMap;
              });
              
              totalExtractedRows += rowCount;
              
              // Update item count
              setSpecDocuments(prev => prev.map(d => 
                d.id === doc.id ? { ...d, itemCount: (d.itemCount || 0) + rowCount } : d
              ));
              
              addLog(`Page ${pageNum}: Extracted ${rowCount} requirements`, "success");
              
              // Queue rows for AI CDE if submittal is available
              // IMPORTANT: Use timestampedRows (with correct IDs) not the raw API rows
              if (submittalPagesRef.current && submittalPagesRef.current.length > 0) {
                addLog(`Queuing ${rowCount} items for AI CDE...`, "info");
                queueRowsForAiCde(timestampedRows, doc.id);
              }
            } else {
              addLog(`Page ${pageNum}: No extractable requirements found`, "info");
            }
            
            successfulPages++;
          } else {
            addLog(`Page ${pageNum}: Extraction returned no data`, "warning");
            failedPages++;
          }
        } catch (pageError) {
          if ((pageError as Error).name === "AbortError") {
            throw pageError; // Re-throw abort errors
          }
          console.error(`Page ${pageNum} error:`, pageError);
          addLog(`Page ${pageNum} failed: ${pageError instanceof Error ? pageError.message : "Unknown error"}`, "error");
          failedPages++;
          // Continue with next page instead of failing entire extraction
        }
        
        // Small delay between pages to avoid rate limiting
        if (i < pages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Extraction complete
      addLog(`Extraction complete! ${totalExtractedRows} requirements found from ${successfulPages} pages (${failedPages} failed)`, "success");
      setSpecDocuments(prev => prev.map(d => {
        if (d.id !== doc.id) return d;
        return {
          ...d,
          status: "complete" as const,
          itemCount: totalExtractedRows,
        };
      }));
      
      setWorkflowPhase("reviewing");
      setExtractionProgress(null);
      
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        addLog("Extraction cancelled", "warning");
      } else {
        console.error("Document processing error:", error);
        addLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        setSpecDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: "error" as const, error: String(error) } : d
        ));
      }
      setExtractionProgress(null);
    } finally {
      extractionAbortRef.current = null;
    }
  }, [viewingDocId, addLog, queueRowsForAiCde]);
  
  // Process a submittal document (no extraction, just store for visual comparison)
  const processSubmittalDocument = useCallback(async (doc: UploadedDocument) => {
    try {
      // Update status to uploading
      setSubmittalDocument({ ...doc, status: "extracting" });
      
      // Extract pages (convert PDF to images)
      const pages = await extractPages(doc.file);
      setDocumentPages(prev => new Map(prev).set(doc.id, pages));
      
      // Store pages in ref for AI CDE processing
      submittalPagesRef.current = pages;
      
      // Pre-compute optimal batches for this submittal (done once, reused for all rows)
      submittalBatchesRef.current = createOptimalBatches(pages);
      console.log(`[Submittal] Pre-computed ${submittalBatchesRef.current.length} batches for ${pages.length} pages`);
      
      // Detect document type to confirm it's a submittal
      const detectResponse = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: [{ base64: pages[0].base64, mimeType: pages[0].mimeType, pageNumber: 1 }],
          detectOnly: true,
        }),
      });
      
      if (!detectResponse.ok) throw new Error("Detection failed");
      
      const detectResult = await detectResponse.json();
      const detectedType = detectResult.data?.metadata?.detectedType?.type || "submittal";
      const confidence = detectResult.data?.metadata?.detectedType?.confidence || "medium";
      const reason = detectResult.data?.metadata?.detectedType?.reason || "Assumed submittal";
      
      // Update submittal document
      setSubmittalDocument({
        ...doc,
        status: "complete" as const,
        detectedType: "submittal", // Force it as submittal regardless of detection
        confidence,
        reason,
        itemCount: pages.length,
      });
      
      // If there are already extracted rows, queue them for AI CDE
      // This handles the case where user uploads submittal while spec is being extracted
      // Note: We access documentExtractions via a ref-like pattern to avoid stale closure
      // Calculate rows to queue BEFORE any setState, then queue after
      const rowsToQueue: { rows: ExtractedRow[]; docId: string }[] = [];
      
      // Use a callback to get the current state and calculate what needs queuing
      setDocumentExtractions(prev => {
        for (const [docId, extraction] of prev.entries()) {
          // Only queue rows that don't have AI CDE results yet
          const unprocessedRows = extraction.rows.filter(r => !r.cdeStatus && !r.isAiProcessing);
          if (unprocessedRows.length > 0) {
            rowsToQueue.push({ rows: unprocessedRows, docId });
          }
        }
        return prev; // Return unchanged - we're just reading
      });
      
      // Queue rows after state is read (using setTimeout to ensure state update completes)
      // This is needed because we need the rows data from the state read above
      if (rowsToQueue.length > 0) {
        // Use queueMicrotask for cleaner async handling than setTimeout
        queueMicrotask(() => {
          for (const { rows, docId } of rowsToQueue) {
            queueRowsForAiCde(rows, docId);
          }
        });
      }
      
    } catch (error) {
      console.error("Submittal processing error:", error);
      setSubmittalDocument({
        ...doc,
        status: "error" as const,
        error: String(error),
      });
    }
  }, [queueRowsForAiCde]);
  
  // Add spec document
  const handleAddSpecDocument = useCallback(async (file: File) => {
    const newDoc: UploadedDocument = {
      id: generateId(),
      file,
      detectedType: "unknown",
      confidence: "low",
      reason: "Detecting...",
      status: "uploading",
      itemCount: 0,
    };
    
    setSpecDocuments(prev => [...prev, newDoc]);
    setIsExtracting(true);
    setWorkflowPhase("extracting");
    
    await processSpecDocument(newDoc);
    
    setIsExtracting(false);
  }, [processSpecDocument]);
  
  // Add submittal document
  const handleAddSubmittalDocument = useCallback(async (file: File) => {
    const newDoc: UploadedDocument = {
      id: generateId(),
      file,
      detectedType: "submittal",
      confidence: "low",
      reason: "Processing...",
      status: "uploading",
      itemCount: 0,
    };
    
    await processSubmittalDocument(newDoc);
  }, [processSubmittalDocument]);
  
  // Remove spec document
  const handleRemoveSpecDocument = useCallback((id: string) => {
    setSpecDocuments(prev => prev.filter(d => d.id !== id));
    setDocumentPages(prev => { const m = new Map(prev); m.delete(id); return m; });
    setDocumentExtractions(prev => { const m = new Map(prev); m.delete(id); return m; });
    if (viewingDocId === id) {
      const remaining = specDocuments.filter(d => d.id !== id);
      setViewingDocId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [specDocuments, viewingDocId]);
  
  // Remove submittal document
  const handleRemoveSubmittalDocument = useCallback(() => {
    if (submittalDocument) {
      setDocumentPages(prev => { const m = new Map(prev); m.delete(submittalDocument.id); return m; });
      setSubmittalDocument(null);
    }
  }, [submittalDocument]);
  
  // Change document type
  const handleTypeChange = useCallback((id: string, type: DocumentType) => {
    setSpecDocuments(prev => prev.map(d => 
      d.id === id ? { ...d, manualType: type } : d
    ));
  }, []);
  
  // Handle extracted row hover (for PDF highlighting)
  const handleExtractedRowHover = useCallback((row: ExtractedRow | null) => {
    setHoveredExtractedRow(row);
    if (row) {
      // Find which document this row is from
      for (const doc of specDocuments) {
        const extraction = documentExtractions.get(doc.id);
        if (extraction?.rows.some(r => r.id === row.id)) {
          if (viewingDocId !== doc.id) {
            setViewingDocId(doc.id);
          }
          // Navigate spec viewer to the page
          setCurrentPage(row.pageNumber);
          
          // Also navigate submittal viewer if row has submittal location
          if (row.submittalLocation?.pageNumber) {
            setSubmittalCurrentPage(row.submittalLocation.pageNumber);
          }
          break;
        }
      }
    }
  }, [specDocuments, documentExtractions, viewingDocId]);
  
  // Handle extracted row select
  const handleExtractedRowSelect = useCallback((row: ExtractedRow) => {
    setSelectedExtractedRow(row);
    // Find which document this row is from and navigate
    for (const doc of specDocuments) {
      const extraction = documentExtractions.get(doc.id);
      if (extraction?.rows.some(r => r.id === row.id)) {
        setViewingDocId(doc.id);
        // Navigate spec viewer to the page
        setCurrentPage(row.pageNumber);
        
        // Also navigate submittal viewer if row has submittal location
        if (row.submittalLocation?.pageNumber) {
          setSubmittalCurrentPage(row.submittalLocation.pageNumber);
        }
        break;
      }
    }
  }, [specDocuments, documentExtractions]);
  
  // Delete extracted row
  const handleDeleteExtractedRow = useCallback((rowId: string) => {
    // Find and update the extraction that contains this row
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        if (extraction.rows.some(r => r.id === rowId)) {
          newMap.set(docId, {
            ...extraction,
            rows: extraction.rows.filter(r => r.id !== rowId),
          });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Edit extracted row
  const handleEditExtractedRow = useCallback((rowId: string, updates: Partial<ExtractedRow>) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          newRows[rowIndex] = { ...newRows[rowIndex], ...updates };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Handle CDE status change on extracted row
  const handleExtractedRowStatusChange = useCallback((rowId: string, status: CDEStatus) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          newRows[rowIndex] = { 
            ...newRows[rowIndex], 
            cdeStatus: status,
            isReviewed: true,
          };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Handle CDE comment change on extracted row
  const handleExtractedRowCommentChange = useCallback((rowId: string, comment: string) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          newRows[rowIndex] = { 
            ...newRows[rowIndex], 
            cdeComment: comment,
          };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Retry AI CDE for a single row
  const handleRetryAiCde = useCallback((rowId: string) => {
    if (!submittalPagesRef.current || submittalPagesRef.current.length === 0) {
      toast.error("No submittal uploaded", {
        description: "Please upload a submittal document first.",
      });
      return;
    }
    
    // Find the row and its document
    let targetRow: ExtractedRow | null = null;
    let targetDocId: string | null = null;
    
    for (const doc of specDocuments) {
      const extraction = documentExtractions.get(doc.id);
      const row = extraction?.rows.find(r => r.id === rowId);
      if (row) {
        targetRow = row;
        targetDocId = doc.id;
        break;
      }
    }
    
    if (!targetRow || !targetDocId) return;
    
    // Clear existing CDE results and queue for reprocessing
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      const extraction = prev.get(targetDocId!);
      if (extraction) {
        const newRows = extraction.rows.map(r => {
          if (r.id === rowId) {
            return {
              ...r,
              cdeStatus: undefined,
              cdeComment: undefined,
              cdeSource: undefined,
              aiSuggestedStatus: undefined,
              aiSuggestedComment: undefined,
              submittalValue: undefined,
              submittalUnit: undefined,
              submittalLocation: undefined,
              matchConfidence: undefined,
              submittalFindings: undefined,
              activeFindingIndex: undefined,
              isReviewed: false,
              isAiProcessing: true,
            };
          }
          return r;
        });
        newMap.set(targetDocId!, { ...extraction, rows: newRows });
      }
      return newMap;
    });
    
    // Queue just this single row for processing
    aiCdeQueueRef.current.push(targetRow);
    processAiCdeQueue();
    
    toast.info("Retrying AI CDE", {
      description: `Re-analyzing "${targetRow.field.slice(0, 30)}${targetRow.field.length > 30 ? '...' : ''}"`,
    });
  }, [specDocuments, documentExtractions, processAiCdeQueue]);
  
  // Accept AI decision - marks the AI suggestion as human-reviewed
  const handleAcceptAiDecision = useCallback((rowId: string) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          const row = newRows[rowIndex];
          newRows[rowIndex] = { 
            ...row, 
            isReviewed: true,
            cdeSource: "human", // Mark as human-reviewed now
          };
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Change the active finding index for a row (multi-finding navigation)
  const handleActiveFindingChange = useCallback((rowId: string, findingIndex: number) => {
    setDocumentExtractions(prev => {
      const newMap = new Map(prev);
      for (const [docId, extraction] of newMap.entries()) {
        const rowIndex = extraction.rows.findIndex(r => r.id === rowId);
        if (rowIndex !== -1) {
          const newRows = [...extraction.rows];
          const row = newRows[rowIndex];
          const findings = row.submittalFindings || [];
          
          // Validate finding index
          if (findingIndex >= 0 && findingIndex < findings.length) {
            const activeFinding = findings[findingIndex];
            
            // Update row with new active finding
            newRows[rowIndex] = { 
              ...row, 
              activeFindingIndex: findingIndex,
              // Update the "best match" fields to reflect the active finding
              submittalValue: activeFinding.value,
              submittalUnit: activeFinding.unit,
              submittalLocation: {
                pageNumber: activeFinding.pageNumber,
                boundingBox: activeFinding.boundingBox,
              },
              // Also update comment to show this finding's explanation
              cdeComment: activeFinding.explanation,
            };
            
            // Navigate PDF viewer to the finding's page
            setSubmittalCurrentPage(activeFinding.pageNumber);
          }
          
          newMap.set(docId, { ...extraction, rows: newRows });
          break;
        }
      }
      return newMap;
    });
  }, []);
  
  // Create CDE (run comparison)
  const handleCreateCDE = useCallback(async () => {
    if (!submittalDocument) return;
    
    const submittalPages = documentPages.get(submittalDocument.id);
    if (!submittalPages) return;
    
    setIsComparing(true);
    setWorkflowPhase("comparing");
    
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specificationData: { rows: allExtractedRows },
          submittalPages: submittalPages.map(p => ({
            base64: p.base64,
            mimeType: p.mimeType,
            pageNumber: p.pageNumber,
          })),
        }),
      });
      
      if (!response.ok) throw new Error("Comparison failed");
      
      const result = await response.json();
      setComparisons(result.data.comparisons);
      setSummary(result.data.summary);
      setWorkflowPhase("complete");
    } catch (error) {
      console.error("Comparison error:", error);
      setWorkflowPhase("reviewing");
    }
    
    setIsComparing(false);
  }, [submittalDocument, documentPages, allExtractedRows]);
  
  // Check if can create CDE
  const canCreateCDE = useMemo(() => {
    const hasExtractedData = allExtractedRows.length > 0;
    const hasSubmittal = submittalDocument?.status === "complete";
    return hasExtractedData && hasSubmittal && !isComparing;
  }, [allExtractedRows, submittalDocument, isComparing]);
  
  // Handle status change
  const handleStatusChange = useCallback((id: string, newStatus: CDEStatus) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, status: newStatus, isReviewed: true } : c
    ));
  }, []);
  
  // Handle comment change
  const handleCommentChange = useCallback((id: string, comment: string) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, userComment: comment } : c
    ));
  }, []);
  
  // Get current pages for viewer
  const currentPages = viewingDocId ? documentPages.get(viewingDocId) || [] : [];
  const totalPages = currentPages.length;
  
  // Find selected comparison data
  const selectedComparisonData = comparisons.find(c => c.id === selectedComparison);
  
  // Determine which highlighting to show
  const highlightData = useMemo(() => {
    // If we're in review mode and have a hovered/selected row
    if (workflowPhase === "reviewing" || workflowPhase === "upload" || workflowPhase === "extracting") {
      const row = hoveredExtractedRow || selectedExtractedRow;
      if (row) {
        return {
          type: "extracted" as const,
          row,
          boundingBox: row.location?.boundingBox,
        };
      }
    }
    // If we're in comparison mode
    if (selectedComparisonData) {
      return {
        type: "comparison" as const,
        comparison: selectedComparisonData,
        boundingBox: selectedComparisonData.specLocation?.boundingBox,
      };
    }
    return null;
  }, [workflowPhase, hoveredExtractedRow, selectedExtractedRow, selectedComparisonData]);
  
  const isProcessing = isExtracting || isComparing;
  const currentPhase = determineWorkflowPhase();
  
  // Calculate summary from extracted rows (for manual CDE)
  const extractedRowsSummary = useMemo(() => {
    const total = allExtractedRows.length;
    const comply = allExtractedRows.filter(r => r.cdeStatus === "comply").length;
    const deviate = allExtractedRows.filter(r => r.cdeStatus === "deviate").length;
    const exception = allExtractedRows.filter(r => r.cdeStatus === "exception").length;
    const notFound = allExtractedRows.filter(r => r.cdeStatus === "not_found").length;
    const pending = total - comply - deviate - exception - notFound;
    const reviewed = allExtractedRows.filter(r => r.isReviewed).length;
    
    return { totalItems: total, comply, deviate, exception, pending, reviewed, notFound };
  }, [allExtractedRows]);
  
  // Use extracted rows summary if no AI comparison done, otherwise use comparison summary
  const displaySummary = comparisons.length > 0 ? summary : extractedRowsSummary;
  
  // Can generate PDF if any extracted rows exist (don't require review)
  const canGeneratePdf = allExtractedRows.length > 0;
  
  // Combine all documents for sidebar display
  const allDocuments = useMemo(() => {
    const docs = [...specDocuments];
    if (submittalDocument) {
      docs.push(submittalDocument);
    }
    return docs;
  }, [specDocuments, submittalDocument]);
  
  // Auth state - always call hook (React Rules of Hooks requirement), then conditionally use result
  const stackUser = useUser();
  const user = isStackConfigured ? stackUser : null;
  const isSignedIn = Boolean(user);
  
  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Check if there's any work to save
  const hasWorkToSave = specDocuments.length > 0 || comparisons.length > 0;
  
  // Clear save message after delay
  const clearSaveMessage = useCallback(() => {
    setTimeout(() => setSaveMessage(null), 3000);
  }, []);
  
  // PDF generation state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Generate PDF handler
  const handleGeneratePdf = useCallback(async () => {
    if (allExtractedRows.length === 0) return;
    
    setIsGeneratingPdf(true);
    
    try {
      // Get spec pages
      const specPages: PageData[] = [];
      specDocuments.forEach(doc => {
        const pages = documentPages.get(doc.id);
        if (pages) {
          specPages.push(...pages);
        }
      });
      
      // Get submittal pages
      const submittalPagesList: PageData[] = submittalDocument 
        ? documentPages.get(submittalDocument.id) || []
        : [];
      
      // Generate the PDF
      const pdfBlob = await generateCDEPdf(
        specPages,
        submittalPagesList,
        allExtractedRows,
        {
          projectName: currentProjectName || "CDE Report",
          includeUnreviewed: true,
        }
      );
      
      // Trigger download
      const filename = `${(currentProjectName || "cde-report").replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPdf(pdfBlob, filename);
      
      toast.success("PDF generated successfully", {
        description: `Downloaded: ${filename}`,
      });
      
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF", {
        description: "Please try again or contact support if the issue persists.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [allExtractedRows, specDocuments, documentPages, submittalDocument, currentProjectName]);
  
  // Check if AI CDE is actively processing
  const isAiCdeProcessing = useMemo(() => {
    return allExtractedRows.some(r => r.isAiProcessing);
  }, [allExtractedRows]);

  // Pause handler - stops both extraction AND AI CDE processing
  const handlePauseExtraction = useCallback(() => {
    let paused = false;
    
    // Pause extraction if running
    if (extractionAbortRef.current && isExtracting) {
      // Store current progress for potential resume
      const currentDoc = specDocuments.find(d => d.status === "extracting");
      if (currentDoc && extractionProgress) {
        pausedDocRef.current = {
          doc: currentDoc,
          lastPage: extractionProgress.currentPage,
        };
      }
      
      // Abort the extraction
      extractionAbortRef.current.abort();
      setIsExtracting(false);
      
      // Update document status to paused
      if (currentDoc) {
        setSpecDocuments(prev => prev.map(d => 
          d.id === currentDoc.id ? { ...d, status: "complete" as const } : d
        ));
      }
      
      paused = true;
    }
    
    // Also pause AI CDE processing if running
    if (isAiCdeProcessing || aiCdeQueueRef.current.length > 0) {
      aiCdePausedRef.current = true;
      
      // Clear the queue and mark all processing rows as not processing
      const queuedRowIds = aiCdeQueueRef.current.map(r => r.id);
      aiCdeQueueRef.current = [];
      
      // Mark queued rows as no longer processing
      setDocumentExtractions(prev => {
        const newMap = new Map(prev);
        for (const [docId, extraction] of newMap.entries()) {
          const hasProcessingRows = extraction.rows.some(r => r.isAiProcessing || queuedRowIds.includes(r.id));
          if (hasProcessingRows) {
            const newRows = extraction.rows.map(r => 
              (r.isAiProcessing || queuedRowIds.includes(r.id)) ? { ...r, isAiProcessing: false } : r
            );
            newMap.set(docId, { ...extraction, rows: newRows });
          }
        }
        return newMap;
      });
      
      paused = true;
    }
    
    if (paused) {
      setIsPaused(true);
      addLog("Processing paused - data saved", "warning");
      setWorkflowPhase("reviewing");
    }
  }, [isExtracting, isAiCdeProcessing, specDocuments, extractionProgress, addLog]);
  
  // Resume extraction handler (note: full resume requires backend support for page-based extraction)
  const handleResumeExtraction = useCallback(() => {
    // For now, just clear the paused state - full resume would require backend changes
    setIsPaused(false);
    pausedDocRef.current = null;
  }, []);
  
  // Save project function
  const handleSaveProject = useCallback(async () => {
    if (!user) return;
    
    const projectName = currentProjectName || prompt("Enter a name for this project:");
    if (!projectName) return;
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      // Create or update project
      const response = await fetch("/api/projects", {
        method: currentProjectId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentProjectId,
          name: projectName,
          userId: user.id,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save project");
      }
      
      const result = await response.json();
      // API returns project directly, not wrapped in data
      setCurrentProjectId(result.id);
      setCurrentProjectName(projectName);
      
      setSaveMessage({ type: "success", text: "Project saved!" });
      clearSaveMessage();
    } catch (error) {
      console.error("Save error:", error);
      setSaveMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save" });
      clearSaveMessage();
    } finally {
      setIsSaving(false);
    }
  }, [user, currentProjectId, currentProjectName, clearSaveMessage]);
  
  return (
    <div className="flex flex-col h-screen bg-neutral-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-4">
          <Image src="/logo/logo-full-color.svg" alt="BuildVision" width={140} height={32} priority />
          <div className="h-6 w-px bg-neutral-200" />
          <h1 className="text-body-md font-semibold text-neutral-800">CDE Maker</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Projects button - only visible when signed in */}
          {isSignedIn && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setShowProjectsModal(true)}
            >
              <FolderOpen className="h-4 w-4" />
              My Projects
            </Button>
          )}
          
          {/* Save button - only visible when signed in and has work */}
          {isSignedIn && hasWorkToSave && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={handleSaveProject}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {currentProjectId ? "Save" : "Save Project"}
              </Button>
              
              {/* Save status message */}
              {saveMessage && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-detail font-medium transition-all ${
                  saveMessage.type === "success" 
                    ? "bg-green-100 text-green-700" 
                    : "bg-red-100 text-red-700"
                }`}>
                  {saveMessage.type === "success" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {saveMessage.text}
                </div>
              )}
            </div>
          )}
          
          <div className="h-6 w-px bg-neutral-200" />
          
          <Button 
            size="sm" 
            disabled={!canGeneratePdf || isGeneratingPdf} 
            className="gap-2 bg-bv-blue-400 hover:bg-bv-blue-500"
            onClick={handleGeneratePdf}
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isGeneratingPdf ? "Generating..." : "Generate Report"}
          </Button>
          
          <div className="h-6 w-px bg-neutral-200" />
          
          {/* Auth - always visible */}
          <UserMenu />
        </div>
      </header>
      
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          specDocuments={specDocuments}
          submittalDocument={submittalDocument}
          onAddSpecDocument={handleAddSpecDocument}
          onAddSubmittalDocument={handleAddSubmittalDocument}
          onRemoveSpecDocument={handleRemoveSpecDocument}
          onRemoveSubmittalDocument={handleRemoveSubmittalDocument}
          onTypeChange={handleTypeChange}
          onCreateCDE={handleCreateCDE}
          isExtracting={isExtracting}
          isComparing={isComparing}
          canCreateCDE={canCreateCDE}
          summary={displaySummary}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          workflowPhase={currentPhase}
          extractedRowCount={allExtractedRows.length}
        />
        
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
            <DualPdfViewer
              // Spec document
              specPages={specDocuments.length > 0 ? (documentPages.get(specDocuments[0].id) || []) : []}
              specCurrentPage={currentPage}
              specTotalPages={specDocuments.length > 0 ? (documentPages.get(specDocuments[0].id)?.length || 0) : 0}
              onSpecPageChange={setCurrentPage}
              specBoundingBox={highlightData?.boundingBox}
              hasSpec={specDocuments.length > 0}
              
              // Submittal document
              submittalPages={submittalDocument ? (documentPages.get(submittalDocument.id) || []) : []}
              submittalCurrentPage={submittalCurrentPage}
              submittalTotalPages={submittalDocument ? (documentPages.get(submittalDocument.id)?.length || 0) : 0}
              onSubmittalPageChange={setSubmittalCurrentPage}
              submittalBoundingBox={
                highlightData?.type === "extracted" && highlightData.row.submittalLocation?.boundingBox
                  ? highlightData.row.submittalLocation.boundingBox
                  : undefined
              }
              hasSubmittal={!!submittalDocument}
              
              // View mode
              splitView={splitView && !!submittalDocument}
              onToggleSplitView={() => setSplitView(!splitView)}
              viewingDocument={viewingDocument}
              onDocumentChange={(doc: "spec" | "submittal") => setViewingDocument(doc)}
              
              // Selected row for header display
              selectedRow={hoveredExtractedRow || selectedExtractedRow || undefined}
            />
          </div>
          
          <div className="h-[45%] min-h-[300px] border-t border-neutral-200">
            {currentPhase === "complete" ? (
              <ComparisonPanel
                comparisons={comparisons}
                selectedId={selectedComparison}
                onSelect={(c) => setSelectedComparison(c.id)}
                onStatusChange={handleStatusChange}
                onCommentChange={handleCommentChange}
                isLoading={isComparing}
                summary={summary}
              />
            ) : (
              <ExtractedDataPanel
                rows={allExtractedRows}
                hoveredRowId={hoveredExtractedRow?.id || null}
                selectedRowId={selectedExtractedRow?.id || null}
                onRowHover={handleExtractedRowHover}
                onRowSelect={handleExtractedRowSelect}
                onRowDelete={handleDeleteExtractedRow}
                onRowEdit={handleEditExtractedRow}
                onStatusChange={handleExtractedRowStatusChange}
                onCommentChange={handleExtractedRowCommentChange}
                onAcceptAiDecision={handleAcceptAiDecision}
                onActiveFindingChange={handleActiveFindingChange}
                onRetryAiCde={handleRetryAiCde}
                isLoading={isExtracting}
                isAiCdeProcessing={isAiCdeProcessing}
                extractionProgress={extractionProgress}
                hasSubmittal={!!submittalDocument}
                onPause={handlePauseExtraction}
                isPaused={isPaused}
              />
            )}
          </div>
        </main>
      </div>
      
      {/* Projects Modal */}
      {isSignedIn && user && (
        <ProjectsModal
          isOpen={showProjectsModal}
          onClose={() => setShowProjectsModal(false)}
          onLoadProject={(projectId) => {
            // TODO: Implement full project loading
            // For now, just set the project ID and show a message
            setCurrentProjectId(projectId);
            toast.info("Project loaded", {
              description: "Full state restoration coming soon.",
            });
          }}
          userId={user.id}
        />
      )}
    </div>
  );
}
