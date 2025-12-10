"use client";

import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock,
  Loader2,
  FileText,
  Table,
  Package,
  Trash2,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadedDocument, DocumentType } from "./document-list";

type WorkflowPhase = "upload" | "extracting" | "reviewing" | "comparing" | "complete";

interface Summary {
  totalItems: number;
  comply: number;
  deviate: number;
  exception: number;
  pending: number;
  reviewed: number;
}

interface SidebarProps {
  specDocuments: UploadedDocument[];
  submittalDocument: UploadedDocument | null;
  onAddSpecDocument: (file: File) => void;
  onAddSubmittalDocument: (file: File) => void;
  onRemoveSpecDocument: (id: string) => void;
  onRemoveSubmittalDocument: () => void;
  onTypeChange: (id: string, type: DocumentType) => void;
  onCreateCDE: () => void;
  isExtracting: boolean;
  isComparing: boolean;
  canCreateCDE: boolean;
  summary: Summary;
  collapsed: boolean;
  onToggleCollapse: () => void;
  workflowPhase: WorkflowPhase;
  extractedRowCount: number;
}

const typeConfig = {
  specification: {
    icon: FileText,
    label: "Spec",
    bgColor: "bg-bv-blue-100",
    textColor: "text-bv-blue-700",
  },
  schedule: {
    icon: Table,
    label: "Schedule",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
  },
  submittal: {
    icon: Package,
    label: "Submittal",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
  },
  unknown: {
    icon: FileText,
    label: "Unknown",
    bgColor: "bg-neutral-100",
    textColor: "text-neutral-600",
  },
};

function DocumentCard({
  doc,
  onRemove,
  compact = false,
}: {
  doc: UploadedDocument;
  onRemove: () => void;
  compact?: boolean;
}) {
  const effectiveType = doc.manualType || doc.detectedType;
  const config = typeConfig[effectiveType];
  const Icon = config.icon;

  return (
    <div className={cn(
      "rounded-lg border p-2 transition-all",
      doc.status === "extracting" ? "border-bv-blue-400 bg-bv-blue-50" :
      doc.status === "complete" ? "border-neutral-200 bg-white" :
      doc.status === "error" ? "border-red-300 bg-red-50" :
      "border-neutral-200 bg-neutral-50"
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn("p-1 rounded", config.bgColor)}>
            <Icon className={cn("h-3 w-3", config.textColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-micro font-medium text-neutral-800 truncate">
              {doc.file.name}
            </p>
            {!compact && (
              <div className="flex items-center gap-2 mt-0.5">
                {doc.status === "extracting" ? (
                  <span className="text-micro text-bv-blue-600 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting...
                  </span>
                ) : doc.status === "complete" ? (
                  <span className="text-micro text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {doc.itemCount} items
                  </span>
                ) : doc.status === "error" ? (
                  <span className="text-micro text-red-600 truncate" title={doc.error}>
                    Error
                  </span>
                ) : (
                  <span className="text-micro text-neutral-500">
                    Uploading...
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-neutral-400 hover:text-red-600 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({
  specDocuments,
  submittalDocument,
  onAddSpecDocument,
  onAddSubmittalDocument,
  onRemoveSpecDocument,
  onRemoveSubmittalDocument,
  onTypeChange,
  onCreateCDE,
  isExtracting,
  isComparing,
  canCreateCDE,
  summary,
  collapsed,
  onToggleCollapse,
  workflowPhase,
  extractedRowCount,
}: SidebarProps) {
  const hasResults = summary.totalItems > 0;
  const isProcessing = isExtracting || isComparing;
  const hasCompletedSpecs = specDocuments.some(d => d.status === "complete");
  
  return (
    <aside 
      className={cn(
        "relative bg-white border-r border-neutral-200 transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-80"
      )}
    >
      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapse}
        className="absolute -right-3 top-4 h-6 w-6 rounded-full border border-neutral-200 bg-white p-0 shadow-sm hover:bg-neutral-50 z-10"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>
      
      {collapsed ? (
        // Collapsed view
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="text-micro font-semibold text-neutral-600">
            {specDocuments.length + (submittalDocument ? 1 : 0)}
          </div>
          {extractedRowCount > 0 && (
            <Badge variant="outline" className="text-micro">
              {extractedRowCount}
            </Badge>
          )}
          {hasResults && (
            <>
              <div className="w-8 h-px bg-neutral-200" />
              <div className="flex flex-col gap-2 items-center">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-micro">{summary.comply}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="text-micro">{summary.deviate}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-micro">{summary.exception}</span>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        // Expanded view
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Workflow Progress Indicator */}
          <div className="p-4 border-b border-neutral-100 bg-neutral-50">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1 flex-1">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold",
                  workflowPhase === "upload" || workflowPhase === "extracting" 
                    ? "bg-bv-blue-400 text-white" 
                    : "bg-green-400 text-white"
                )}>
                  1
                </div>
                <div className={cn(
                  "h-0.5 flex-1",
                  hasCompletedSpecs ? "bg-green-400" : "bg-neutral-200"
                )} />
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold",
                  workflowPhase === "reviewing" 
                    ? "bg-bv-blue-400 text-white" 
                    : hasCompletedSpecs && (submittalDocument || workflowPhase === "complete")
                    ? "bg-green-400 text-white"
                    : "bg-neutral-200 text-neutral-500"
                )}>
                  2
                </div>
                <div className={cn(
                  "h-0.5 flex-1",
                  workflowPhase === "complete" ? "bg-green-400" : "bg-neutral-200"
                )} />
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-micro font-semibold",
                  workflowPhase === "comparing" || workflowPhase === "complete"
                    ? "bg-bv-blue-400 text-white" 
                    : "bg-neutral-200 text-neutral-500"
                )}>
                  3
                </div>
              </div>
            </div>
            <div className="flex justify-between text-micro text-neutral-500">
              <span>Extract</span>
              <span>Review</span>
              <span>CDE</span>
            </div>
          </div>
          
          {/* Step 1: Spec/Schedule Upload Section */}
          <div className="p-4 border-b border-neutral-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-1 rounded",
                  specDocuments.length > 0 ? "bg-bv-blue-100" : "bg-neutral-100"
                )}>
                  <FileText className={cn(
                    "h-4 w-4",
                    specDocuments.length > 0 ? "text-bv-blue-700" : "text-neutral-500"
                  )} />
                </div>
                <h3 className="text-detail font-semibold text-neutral-700">
                  Spec / Schedule
                </h3>
              </div>
              {extractedRowCount > 0 && (
                <Badge variant="outline" className="text-micro bg-bv-blue-100 text-bv-blue-700 border-bv-blue-300">
                  {extractedRowCount} items
                </Badge>
              )}
            </div>
            
            {/* Spec Document Cards */}
            <div className="space-y-2 mb-3">
              {specDocuments.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onRemove={() => onRemoveSpecDocument(doc.id)}
                />
              ))}
            </div>
            
            {/* Add Spec Button */}
            {specDocuments.length < 3 && (
              <FileUpload
                label=""
                description=""
                onFileSelect={onAddSpecDocument}
                onFileRemove={() => {}}
                selectedFile={null}
                isProcessing={isExtracting}
                variant="specification"
                compact
              />
            )}
            
            {specDocuments.length === 0 && (
              <p className="text-micro text-neutral-400 text-center mt-2">
                Upload a specification or schedule to extract data
              </p>
            )}
          </div>
          
          {/* Step 2: Submittal Upload Section (only shows after spec extraction) */}
          {hasCompletedSpecs && (
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1 rounded",
                    submittalDocument ? "bg-green-100" : "bg-neutral-100"
                  )}>
                    <Package className={cn(
                      "h-4 w-4",
                      submittalDocument ? "text-green-700" : "text-neutral-500"
                    )} />
                  </div>
                  <h3 className="text-detail font-semibold text-neutral-700">
                    Submittal
                  </h3>
                </div>
              </div>
              
              {/* Submittal Document Card */}
              {submittalDocument ? (
                <DocumentCard
                  doc={submittalDocument}
                  onRemove={onRemoveSubmittalDocument}
                />
              ) : (
                <>
                  <FileUpload
                    label=""
                    description=""
                    onFileSelect={onAddSubmittalDocument}
                    onFileRemove={() => {}}
                    selectedFile={null}
                    isProcessing={false}
                    variant="submittal"
                    compact
                  />
                  <p className="text-micro text-neutral-400 text-center mt-2">
                    Upload manufacturer submittal for comparison
                  </p>
                </>
              )}
            </div>
          )}
          
          {/* Step 3: Create CDE Button */}
          {hasCompletedSpecs && (
            <div className="p-4 border-b border-neutral-100">
              <Button
                onClick={onCreateCDE}
                disabled={!canCreateCDE}
                className="w-full gap-2 bg-bv-blue-400 hover:bg-bv-blue-500"
              >
                {isComparing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating CDE...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Create CDE
                  </>
                )}
              </Button>
              
              {!canCreateCDE && !isComparing && (
                <p className="mt-2 text-micro text-neutral-400 text-center">
                  {!submittalDocument 
                    ? "Upload a submittal to create CDE" 
                    : submittalDocument.status !== "complete"
                    ? "Waiting for submittal processing..."
                    : extractedRowCount === 0
                    ? "No extracted data available"
                    : "Ready to create CDE"
                  }
                </p>
              )}
            </div>
          )}
          
          {/* Results Summary (after CDE creation) */}
          {hasResults && (
            <div className="p-4 space-y-3">
              <h3 className="text-detail font-semibold text-neutral-700">CDE Results</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-green-100/50">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-700" />
                    <span className="text-detail text-neutral-700">Comply</span>
                  </div>
                  <span className="text-detail font-semibold text-green-700">
                    {summary.comply}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-100/50">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-700" />
                    <span className="text-detail text-neutral-700">Deviate</span>
                  </div>
                  <span className="text-detail font-semibold text-yellow-700">
                    {summary.deviate}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-100/50">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-700" />
                    <span className="text-detail text-neutral-700">Exception</span>
                  </div>
                  <span className="text-detail font-semibold text-red-700">
                    {summary.exception}
                  </span>
                </div>
                
                {summary.pending > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-100">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-neutral-500" />
                      <span className="text-detail text-neutral-700">Pending</span>
                    </div>
                    <span className="text-detail font-semibold text-neutral-500">
                      {summary.pending}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-micro text-neutral-500">Reviewed</span>
                  <span className="text-micro text-neutral-500">
                    {summary.reviewed} / {summary.totalItems}
                  </span>
                </div>
                <Progress 
                  value={(summary.reviewed / summary.totalItems) * 100} 
                  className="h-1.5"
                />
              </div>
            </div>
          )}
          
          {/* Empty state hint */}
          {specDocuments.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <PlusCircle className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-detail text-neutral-400">
                  Start by uploading a<br/>spec or schedule
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
