"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Sidebar } from "./sidebar";
import { PdfViewerPanel } from "./pdf-viewer-panel";
import { ComparisonPanel } from "./comparison-panel";
import { ExtractedDataPanel } from "./extracted-data-panel";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import Image from "next/image";
import type { ComparisonResult, CDEStatus, ExtractionResult, ExtractedRow } from "@/lib/types";
import type { PageData } from "@/lib/pdf-utils";
import { extractPages } from "@/lib/pdf-utils";
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
  const extractionAbortRef = useRef<AbortController | null>(null);
  
  // View state
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedComparison, setSelectedComparison] = useState<string | null>(null);
  const [hoveredExtractedRow, setHoveredExtractedRow] = useState<ExtractedRow | null>(null);
  const [selectedExtractedRow, setSelectedExtractedRow] = useState<ExtractedRow | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
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

  // Process a spec/schedule document with streaming
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
      
      // First, detect document type (non-streaming)
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
      
      // Start streaming extraction
      addLog(`Starting extraction of ${pages.length} pages...`, "info");
      setExtractionProgress(prev => prev ? { ...prev, totalPages: pages.length } : prev);
      
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pages.map(p => ({
            base64: p.base64,
            mimeType: p.mimeType,
            pageNumber: p.pageNumber,
          })),
          documentType: detectedType,
          stream: true,
        }),
        signal: abortController.signal,
      });
      
      if (!response.ok) throw new Error("Extraction failed");
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      
      const decoder = new TextDecoder();
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              
              switch (event.type) {
                case "log":
                  addLog(event.message, event.level);
                  break;
                  
                case "page_start":
                  setExtractionProgress(prev => prev ? { 
                    ...prev, 
                    currentPage: event.pageNumber,
                    totalPages: event.totalPages,
                  } : prev);
                  break;
                  
                case "page_complete":
                  if (event.rows && event.rows.length > 0) {
                    // Incrementally add rows
                    setDocumentExtractions(prev => {
                      const current = prev.get(doc.id);
                      if (!current) return prev;
                      const newMap = new Map(prev);
                      newMap.set(doc.id, {
                        ...current,
                        rows: [...current.rows, ...event.rows],
                        metadata: { ...current.metadata, totalRows: current.rows.length + event.rows.length },
                      });
                      return newMap;
                    });
                    
                    // Update item count
                    setSpecDocuments(prev => prev.map(d => 
                      d.id === doc.id ? { ...d, itemCount: (d.itemCount || 0) + event.rows.length } : d
                    ));
                  }
                  break;
                  
                case "complete":
                  addLog(`Extraction complete! ${event.totalRows} requirements found.`, "success");
                  setSpecDocuments(prev => prev.map(d => {
                    if (d.id !== doc.id) return d;
                    return {
                      ...d,
                      status: "complete" as const,
                      itemCount: event.totalRows,
                    };
                  }));
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE event:", e, line);
            }
          }
        }
      }
      
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
  }, [viewingDocId, addLog]);
  
  // Process a submittal document (no extraction, just store for visual comparison)
  const processSubmittalDocument = useCallback(async (doc: UploadedDocument) => {
    try {
      // Update status to uploading
      setSubmittalDocument({ ...doc, status: "extracting" });
      
      // Extract pages (convert PDF to images)
      const pages = await extractPages(doc.file);
      setDocumentPages(prev => new Map(prev).set(doc.id, pages));
      
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
    } catch (error) {
      console.error("Submittal processing error:", error);
      setSubmittalDocument({
        ...doc,
        status: "error" as const,
        error: String(error),
      });
    }
  }, []);
  
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
          // Navigate to the page
          setCurrentPage(row.pageNumber);
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
        setCurrentPage(row.pageNumber);
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
  const canGeneratePdf = comparisons.length > 0 && !isProcessing;
  const currentPhase = determineWorkflowPhase();
  
  // Combine all documents for sidebar display
  const allDocuments = useMemo(() => {
    const docs = [...specDocuments];
    if (submittalDocument) {
      docs.push(submittalDocument);
    }
    return docs;
  }, [specDocuments, submittalDocument]);
  
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
          <Button variant="outline" size="sm" disabled={!canGeneratePdf} className="gap-2">
            <FileText className="h-4 w-4" />
            Preview Report
          </Button>
          <Button size="sm" disabled={!canGeneratePdf} className="gap-2 bg-bv-blue-400 hover:bg-bv-blue-500">
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Generate PDF
          </Button>
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
          summary={summary}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          workflowPhase={currentPhase}
          extractedRowCount={allExtractedRows.length}
        />
        
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <PdfViewerPanel
              pages={currentPages}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              viewingDocument={viewingDocId && submittalDocument?.id === viewingDocId ? "submittal" : "spec"}
              onDocumentChange={(doc) => {
                if (doc === "submittal" && submittalDocument) {
                  setViewingDocId(submittalDocument.id);
                } else if (specDocuments.length > 0) {
                  setViewingDocId(specDocuments[0].id);
                }
              }}
              hasSpec={specDocuments.length > 0}
              hasSubmittal={!!submittalDocument}
              boundingBox={highlightData?.boundingBox}
              selectedComparison={highlightData?.type === "comparison" ? highlightData.comparison : undefined}
              highlightedRow={highlightData?.type === "extracted" ? highlightData.row : undefined}
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
                isLoading={isExtracting}
                extractionProgress={extractionProgress}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
