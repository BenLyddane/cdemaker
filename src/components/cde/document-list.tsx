"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Table,
  Package,
  HelpCircle,
  Trash2,
  CheckCircle2,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DocumentType = "specification" | "schedule" | "submittal" | "unknown";

export interface UploadedDocument {
  id: string;
  file: File;
  detectedType: DocumentType;
  manualType?: DocumentType;
  confidence: "high" | "medium" | "low";
  reason: string;
  status: "uploading" | "extracting" | "complete" | "error";
  itemCount: number;
  error?: string;
}

interface DocumentListProps {
  documents: UploadedDocument[];
  onAddDocument: (file: File) => void;
  onRemoveDocument: (id: string) => void;
  onTypeChange: (id: string, type: DocumentType) => void;
  isProcessing: boolean;
  maxDocuments?: number;
}

const typeConfig = {
  specification: {
    icon: FileText,
    label: "Specification",
    description: "Written spec with requirements",
    bgColor: "bg-bv-blue-100",
    textColor: "text-bv-blue-700",
    borderColor: "border-bv-blue-300",
  },
  schedule: {
    icon: Table,
    label: "Schedule",
    description: "Equipment schedule table",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
    borderColor: "border-purple-400",
  },
  submittal: {
    icon: Package,
    label: "Submittal",
    description: "Manufacturer data sheet",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    borderColor: "border-green-400",
  },
  unknown: {
    icon: HelpCircle,
    label: "Unknown",
    description: "Unable to detect type",
    bgColor: "bg-neutral-100",
    textColor: "text-neutral-600",
    borderColor: "border-neutral-300",
  },
};

function DocumentCard({
  doc,
  onRemove,
  onTypeChange,
}: {
  doc: UploadedDocument;
  onRemove: () => void;
  onTypeChange: (type: DocumentType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const effectiveType = doc.manualType || doc.detectedType;
  const config = typeConfig[effectiveType];
  const Icon = config.icon;

  const confidenceColor = {
    high: "text-green-600",
    medium: "text-yellow-600",
    low: "text-red-600",
  };

  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all",
      doc.status === "extracting" ? "border-bv-blue-400 bg-bv-blue-50" :
      doc.status === "complete" ? "border-neutral-200 bg-white" :
      doc.status === "error" ? "border-red-300 bg-red-50" :
      "border-neutral-200 bg-neutral-50"
    )}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn("p-1.5 rounded", config.bgColor)}>
            <Icon className={cn("h-4 w-4", config.textColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-detail font-medium text-neutral-800 truncate">
              {doc.file.name}
            </p>
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
                <span className="text-micro text-red-600">
                  Error: {doc.error}
                </span>
              ) : (
                <span className="text-micro text-neutral-500">
                  Uploading...
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-neutral-400 hover:text-red-600"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Type Badge */}
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className={cn("gap-1", config.bgColor, config.textColor, config.borderColor)}>
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
        {doc.manualType && doc.manualType !== doc.detectedType && (
          <span className="text-micro text-neutral-400">(manually set)</span>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-neutral-100 space-y-3">
          {/* AI Detection Info */}
          <div className="text-micro">
            <p className="text-neutral-500">
              AI detected: <span className={confidenceColor[doc.confidence]}>{doc.detectedType}</span>
              {" "}({doc.confidence} confidence)
            </p>
            <p className="text-neutral-400 italic">{doc.reason}</p>
          </div>

          {/* Manual Type Selector */}
          <div>
            <label className="text-micro text-neutral-600 block mb-1">Change document type:</label>
            <Select
              value={doc.manualType || doc.detectedType}
              onValueChange={(value) => onTypeChange(value as DocumentType)}
            >
              <SelectTrigger className="h-8 text-detail">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="specification">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Specification
                  </div>
                </SelectItem>
                <SelectItem value="schedule">
                  <div className="flex items-center gap-2">
                    <Table className="h-4 w-4" />
                    Schedule
                  </div>
                </SelectItem>
                <SelectItem value="submittal">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Submittal
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentList({
  documents,
  onAddDocument,
  onRemoveDocument,
  onTypeChange,
  isProcessing,
  maxDocuments = 5,
}: DocumentListProps) {
  const canAddMore = documents.length < maxDocuments && !isProcessing;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-detail font-semibold text-neutral-700">Documents</h3>
        <span className="text-micro text-neutral-400">{documents.length} / {maxDocuments}</span>
      </div>

      {/* Document Cards */}
      <div className="space-y-2">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            onRemove={() => onRemoveDocument(doc.id)}
            onTypeChange={(type) => onTypeChange(doc.id, type)}
          />
        ))}
      </div>

      {/* Add Document Button */}
      {documents.length === 0 ? (
        <FileUpload
          label="Add Document"
          description="Upload spec, schedule, or submittal (PDF)"
          onFileSelect={onAddDocument}
          onFileRemove={() => {}}
          selectedFile={null}
          isProcessing={isProcessing}
          variant="specification"
        />
      ) : canAddMore ? (
        <FileUpload
          label=""
          description=""
          onFileSelect={onAddDocument}
          onFileRemove={() => {}}
          selectedFile={null}
          isProcessing={isProcessing}
          variant="specification"
          compact
        />
      ) : null}

      {/* Hint */}
      {documents.length === 0 && (
        <p className="text-micro text-neutral-400 text-center">
          Upload at least 2 documents to compare
        </p>
      )}
    </div>
  );
}
