"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { toast } from "sonner";
import { 
  Search, 
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  AlertCircle,
  Hash,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  MessageSquare,
  Package,
  Sparkles,
  User,
  Loader2,
  Pause,
  Upload,
  ArrowRight,
  Keyboard,
  Layers,
  RotateCw,
  HelpCircle,
  Lock,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractedRow, CDEStatus, SubmittalFinding } from "@/lib/types";
import type { ExtractionProgress } from "./cde-workspace";

interface ExtractedDataPanelProps {
  rows: ExtractedRow[];
  hoveredRowId: string | null;
  onRowHover: (row: ExtractedRow | null) => void;
  onRowSelect: (row: ExtractedRow) => void;
  onRowDelete?: (rowId: string) => void;
  onRowEdit?: (rowId: string, updates: Partial<ExtractedRow>) => void;
  onStatusChange?: (rowId: string, status: CDEStatus) => void;
  onCommentChange?: (rowId: string, comment: string) => void;
  onAcceptAiDecision?: (rowId: string) => void;
  onActiveFindingChange?: (rowId: string, findingIndex: number) => void;
  onRetryAiCde?: (rowId: string) => void;
  isLoading: boolean;
  isAiCdeProcessing?: boolean;
  selectedRowId: string | null;
  lockedRowId?: string | null; // Row ID that is locked for PDF review
  extractionProgress?: ExtractionProgress | null;
  hasSubmittal?: boolean;
  onPause?: () => void;
  isPaused?: boolean;
}

type ConfidenceFilter = "all" | "high" | "medium" | "low";
type StatusFilter = "all" | CDEStatus | "unreviewed";
type SortField = "field" | "page" | "confidence" | "specNumber" | "status";

// CDE Status Quick Select Component
const statusConfig: Record<CDEStatus, {
  icon: typeof CheckCircle2;
  label: string;
  shortLabel: string;
  className: string;
  activeClassName: string;
}> = {
  comply: {
    icon: CheckCircle2,
    label: "Comply",
    shortLabel: "C",
    className: "bg-green-100 text-green-700 border-green-400 hover:bg-green-200",
    activeClassName: "ring-2 ring-green-400",
  },
  deviate: {
    icon: AlertTriangle,
    label: "Deviate",
    shortLabel: "D",
    className: "bg-yellow-100 text-yellow-700 border-yellow-400 hover:bg-yellow-200",
    activeClassName: "ring-2 ring-yellow-400",
  },
  exception: {
    icon: XCircle,
    label: "Exception",
    shortLabel: "E",
    className: "bg-red-100 text-red-700 border-red-400 hover:bg-red-200",
    activeClassName: "ring-2 ring-red-400",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    shortLabel: "P",
    className: "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200",
    activeClassName: "ring-2 ring-neutral-400",
  },
  not_found: {
    icon: HelpCircle,
    label: "Not Found",
    shortLabel: "?",
    className: "bg-purple-100 text-purple-700 border-purple-400 hover:bg-purple-200",
    activeClassName: "ring-2 ring-purple-400",
  },
};

function StatusQuickSelect({ 
  value, 
  onChange,
  disabled = false,
}: { 
  value?: CDEStatus; 
  onChange: (status: CDEStatus) => void;
  disabled?: boolean;
}) {
  const statuses: CDEStatus[] = ["comply", "deviate", "exception"];
  
  return (
    <div className="flex items-center gap-1">
      {statuses.map((status) => {
        const config = statusConfig[status];
        const Icon = config.icon;
        const isSelected = status === value;
        
        return (
          <button
            key={status}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onChange(status);
            }}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded border transition-all",
              isSelected 
                ? cn(config.className, config.activeClassName)
                : "text-neutral-400 border-neutral-200 hover:text-neutral-600 hover:bg-neutral-100",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            title={config.label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = {
    high: {
      label: "High",
      className: "bg-green-100 text-green-700 border-green-400",
    },
    medium: {
      label: "Med",
      className: "bg-yellow-100 text-yellow-700 border-yellow-400",
    },
    low: {
      label: "Low",
      className: "bg-red-100 text-red-700 border-red-400",
    },
  };
  
  const { label, className } = config[confidence];
  
  return (
    <Badge variant="outline" className={cn("text-micro", className)}>
      {label}
    </Badge>
  );
}

// HoverCard wrapper for truncated text
function TruncatedText({ 
  text, 
  maxWidth = 150,
  className = "",
  subText,
}: { 
  text: string; 
  maxWidth?: number;
  className?: string;
  subText?: string;
}) {
  const needsHover = text.length > 30; // Show hover card if text is long
  
  if (!needsHover) {
    return (
      <div className={className}>
        <div className="truncate" style={{ maxWidth }}>{text}</div>
        {subText && <div className="text-micro text-neutral-400 truncate">{subText}</div>}
      </div>
    );
  }
  
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn("cursor-help", className)}>
          <div className="truncate" style={{ maxWidth }}>{text}</div>
          {subText && <div className="text-micro text-neutral-400 truncate">{subText}</div>}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3" align="start">
        <div className="space-y-2">
          <p className="text-detail text-neutral-800 whitespace-pre-wrap break-words">{text}</p>
          {subText && (
            <p className="text-micro text-neutral-500 border-t pt-2">{subText}</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// HoverCard wrapper for value with unit
function ValueWithHover({ 
  value, 
  unit,
  maxWidth = 200,
}: { 
  value: string; 
  unit?: string;
  maxWidth?: number;
}) {
  const displayText = unit ? `${value} ${unit}` : value;
  const needsHover = displayText.length > 40;
  
  if (!needsHover) {
    return (
      <div className="flex items-center gap-1">
        <span className="truncate" style={{ maxWidth }}>{value}</span>
        {unit && <span className="text-neutral-400 flex-shrink-0">{unit}</span>}
      </div>
    );
  }
  
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <span className="truncate" style={{ maxWidth }}>{value}</span>
          {unit && <span className="text-neutral-400 flex-shrink-0">{unit}</span>}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-3" align="start">
        <div className="space-y-2">
          <p className="text-detail text-neutral-800 whitespace-pre-wrap break-words">{value}</p>
          {unit && (
            <p className="text-micro text-neutral-500 border-t pt-2">Unit: {unit}</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface DataRowProps {
  row: ExtractedRow;
  isHovered: boolean;
  isSelected: boolean;
  isLocked: boolean; // PDF view is locked to this row
  onHover: (hovered: boolean) => void;
  onSelect: () => void;
  onDelete?: () => void;
  onEdit?: (updates: Partial<ExtractedRow>) => void;
  onStatusChange?: (status: CDEStatus) => void;
  onCommentChange?: (comment: string) => void;
  onAcceptAiDecision?: () => void;
  onActiveFindingChange?: (findingIndex: number) => void;
  onRetryAiCde?: () => void;
  hasSubmittal?: boolean;
}

function DataRow({
  row,
  isHovered,
  isSelected,
  isLocked,
  onHover,
  onSelect,
  onDelete,
  onEdit,
  onStatusChange,
  onCommentChange,
  onAcceptAiDecision,
  onActiveFindingChange,
  onRetryAiCde,
  hasSubmittal,
}: DataRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [editedField, setEditedField] = useState(row.field);
  const [editedValue, setEditedValue] = useState(row.value);
  const [editedComment, setEditedComment] = useState(row.cdeComment || "");
  
  const handleSaveEdit = () => {
    if (onEdit) {
      onEdit({ field: editedField, value: editedValue });
    }
    setIsEditing(false);
  };
  
  const handleCancelEdit = () => {
    setEditedField(row.field);
    setEditedValue(row.value);
    setIsEditing(false);
  };
  
  const handleSaveComment = () => {
    if (onCommentChange) {
      onCommentChange(editedComment);
    }
    setIsEditingComment(false);
  };
  
  const handleCancelComment = () => {
    setEditedComment(row.cdeComment || "");
    setIsEditingComment(false);
  };
  
  return (
    <tr 
      className={cn(
        "group cursor-pointer transition-colors relative",
        isLocked && "bg-orange-50 ring-1 ring-inset ring-orange-300",
        isHovered && !isLocked && "bg-bv-blue-100/70",
        isSelected && !isHovered && !isLocked && "bg-bv-blue-50",
        row.isReviewed && !isHovered && !isSelected && !isLocked && "bg-green-50/30",
        !isHovered && !isSelected && !row.isReviewed && !isLocked && "hover:bg-neutral-50"
      )}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
    >
      {/* Spec Number */}
      <td className="px-3 py-2.5 text-detail text-neutral-500">
        <div className="flex items-center gap-1.5">
          {/* Lock indicator */}
          {isLocked && (
            <span title="PDF locked - click to unlock">
              <Lock className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
            </span>
          )}
          {row.specNumber ? (
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  {!isLocked && <Hash className="h-3 w-3 flex-shrink-0 text-bv-blue-400" />}
                  <span className="font-mono text-detail text-neutral-700 whitespace-nowrap">
                    {row.specNumber}
                  </span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto max-w-[400px] p-2" align="start">
                <div className="font-mono text-detail text-neutral-800">
                  {row.specNumber}
                </div>
              </HoverCardContent>
            </HoverCard>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </div>
      </td>
      
      {/* Field */}
      <td className="px-3 py-2.5 text-detail font-medium text-neutral-800">
        {isEditing ? (
          <Input
            value={editedField}
            onChange={(e) => setEditedField(e.target.value)}
            className="h-7 text-detail"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <TruncatedText 
            text={row.field} 
            maxWidth={140}
            subText={row.section}
          />
        )}
      </td>
      
      {/* Spec Value */}
      <td className="px-3 py-2.5 text-detail text-neutral-600">
        {isEditing ? (
          <Input
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            className="h-7 text-detail"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div>
            <ValueWithHover value={row.value} unit={row.unit} maxWidth={120} />
            <div className="text-micro text-neutral-400 flex items-center gap-1 mt-0.5">
              <FileText className="h-3 w-3" />
              <span>p.{row.pageNumber}</span>
            </div>
          </div>
        )}
      </td>
      
      {/* Submittal Value (if available) */}
      <td className="px-3 py-2.5 text-detail text-neutral-600" onClick={(e) => e.stopPropagation()}>
        {row.submittalFindings && row.submittalFindings.length > 0 ? (
          <div>
            {/* Show current active finding value */}
            <ValueWithHover 
              value={row.submittalFindings[row.activeFindingIndex || 0]?.value || row.submittalValue || ""} 
              unit={row.submittalFindings[row.activeFindingIndex || 0]?.unit || row.submittalUnit} 
              maxWidth={120} 
            />
            
            {/* Multi-finding navigation */}
            <div className="flex items-center gap-1 mt-1">
              {row.submittalFindings.length > 1 ? (
                <>
                  <Badge 
                    variant="outline" 
                    className="text-micro bg-purple-50 text-purple-600 border-purple-300 gap-1 px-1.5"
                    title={`${row.submittalFindings.length} matches found in submittal`}
                  >
                    <Layers className="h-3 w-3" />
                    {row.submittalFindings.length}
                  </Badge>
                  
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-neutral-400 hover:text-bv-blue-500"
                      onClick={() => {
                        const currentIndex = row.activeFindingIndex || 0;
                        const newIndex = currentIndex > 0 ? currentIndex - 1 : row.submittalFindings!.length - 1;
                        onActiveFindingChange?.(newIndex);
                      }}
                      title="Previous match"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-micro text-neutral-500 min-w-[32px] text-center">
                      {(row.activeFindingIndex || 0) + 1}/{row.submittalFindings.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-neutral-400 hover:text-bv-blue-500"
                      onClick={() => {
                        const currentIndex = row.activeFindingIndex || 0;
                        const newIndex = currentIndex < row.submittalFindings!.length - 1 ? currentIndex + 1 : 0;
                        onActiveFindingChange?.(newIndex);
                      }}
                      title="Next match"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <span className="text-micro text-green-600 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    p.{row.submittalFindings[row.activeFindingIndex || 0]?.pageNumber}
                  </span>
                </>
              ) : (
                <span className="text-micro text-green-600 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  <span>p.{row.submittalFindings[0]?.pageNumber}</span>
                </span>
              )}
            </div>
          </div>
        ) : row.submittalValue ? (
          <div>
            <ValueWithHover value={row.submittalValue} unit={row.submittalUnit} maxWidth={120} />
            {row.submittalLocation && (
              <div className="text-micro text-green-600 flex items-center gap-1 mt-0.5">
                <Package className="h-3 w-3" />
                <span>p.{row.submittalLocation.pageNumber}</span>
              </div>
            )}
          </div>
        ) : hasSubmittal ? (
          <span className="text-neutral-400 italic text-micro">Not found</span>
        ) : (
          <span className="text-neutral-300 text-micro">—</span>
        )}
      </td>
      
      {/* CDE Status */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {/* Detailed AI Processing Status */}
          {row.isAiProcessing && (
            <div className="flex flex-col gap-0.5">
              {/* Queued status - show queue position */}
              {row.aiCdeStatus === "queued" && (
                <div className="flex items-center gap-1.5 text-neutral-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-micro font-medium">
                    Queued #{row.aiCdeQueuePosition || "?"}
                  </span>
                  {row.aiCdeTotalPages && (
                    <span className="text-micro text-neutral-400">
                      ({row.aiCdeTotalPages} pages)
                    </span>
                  )}
                </div>
              )}
              
              {/* Scanning status - show progress */}
              {row.aiCdeStatus === "scanning" && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-purple-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-micro font-medium">
                      Scanning batch {(row.aiCdeBatchesCompleted || 0) + 1}/{row.aiCdeTotalBatches || "?"}
                    </span>
                  </div>
                  {row.aiCdeTotalPages && (
                    <div className="flex items-center gap-1">
                      <div className="h-1 w-16 bg-neutral-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 transition-all duration-300"
                          style={{ 
                            width: `${Math.round(((row.aiCdePagesScanned || 0) / row.aiCdeTotalPages) * 100)}%` 
                          }}
                        />
                      </div>
                      <span className="text-micro text-neutral-400">
                        {row.aiCdePagesScanned || 0}/{row.aiCdeTotalPages}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Fallback for old-style isAiProcessing without detailed status */}
              {!row.aiCdeStatus && (
                <div className="flex items-center gap-1.5 text-purple-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-micro">AI checking...</span>
                </div>
              )}
            </div>
          )}
          
          {/* Status selector or badge */}
          {!row.isAiProcessing && (
            <>
              {onStatusChange ? (
                <StatusQuickSelect
                  value={row.cdeStatus}
                  onChange={onStatusChange}
                />
              ) : (
                row.cdeStatus ? (
                  <Badge variant="outline" className={cn("text-micro", statusConfig[row.cdeStatus].className)}>
                    {statusConfig[row.cdeStatus].shortLabel}
                  </Badge>
                ) : (
                  <span className="text-neutral-300">—</span>
                )
              )}
              
              {/* AI/Human badge */}
              {row.cdeStatus && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-micro gap-1",
                    row.cdeSource === "ai" && !row.isReviewed
                      ? "bg-purple-50 text-purple-600 border-purple-300"
                      : row.isReviewed 
                        ? "bg-blue-50 text-blue-600 border-blue-300"
                        : "bg-neutral-50 text-neutral-500 border-neutral-300"
                  )}
                  title={row.cdeSource === "ai" && !row.isReviewed 
                    ? "AI suggested - click Accept to confirm" 
                    : row.isReviewed 
                      ? "Human reviewed" 
                      : "Source unknown"
                  }
                >
                  {row.cdeSource === "ai" && !row.isReviewed ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      AI
                    </>
                  ) : row.isReviewed ? (
                    <>
                      <User className="h-3 w-3" />
                      ✓
                    </>
                  ) : null}
                </Badge>
              )}
              
              {/* Accept AI Decision Button - only show if AI actually found it in submittal */}
              {row.cdeSource === "ai" && !row.isReviewed && row.cdeStatus && onAcceptAiDecision && 
               (row.submittalValue || (row.matchConfidence && row.matchConfidence !== "not_found")) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcceptAiDecision();
                  }}
                  className="h-6 px-2 text-micro gap-1 bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 hover:border-purple-400"
                  title="Accept AI decision as reviewed"
                >
                  <Check className="h-3 w-3" />
                  Accept
                </Button>
              )}
            </>
          )}
        </div>
      </td>
      
      {/* Comment */}
      <td className="px-3 py-2.5 max-w-[180px]" onClick={(e) => e.stopPropagation()}>
        {isEditingComment ? (
          <div className="flex items-center gap-1">
            <Input
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              className="h-7 text-micro"
              placeholder="Add comment..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveComment();
                if (e.key === "Escape") handleCancelComment();
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveComment}
              className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelComment}
              className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div 
            className="flex items-center gap-1 group/comment cursor-pointer hover:bg-neutral-100 rounded px-1 py-0.5 -mx-1"
            onClick={() => onCommentChange && setIsEditingComment(true)}
          >
            {row.cdeComment ? (
              <span className="text-micro text-neutral-600 truncate flex-1" title={row.cdeComment}>
                {row.cdeComment}
              </span>
            ) : (
              <span className="text-micro text-neutral-400 italic">
                {onCommentChange ? "Click to add..." : "—"}
              </span>
            )}
            {onCommentChange && (
              <MessageSquare className="h-3 w-3 text-neutral-400 opacity-0 group-hover/comment:opacity-100 flex-shrink-0" />
            )}
          </div>
        )}
      </td>
      
      {/* Actions */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveEdit}
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelEdit}
              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0",
                isHovered ? "text-bv-blue-400" : "text-neutral-400"
              )}
              onClick={() => onSelect()}
              title="View in PDF"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {/* Retry AI CDE button - show for not_found or when submittal exists but no match */}
            {onRetryAiCde && hasSubmittal && !row.isAiProcessing && (
              (row.cdeStatus === "not_found" || (!row.submittalValue && !row.submittalFindings?.length)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-purple-400 hover:text-purple-600 hover:bg-purple-100"
                  onClick={onRetryAiCde}
                  title="Retry AI CDE search"
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
              )
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-bv-blue-400"
                onClick={() => setIsEditing(true)}
                title="Edit"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-red-600"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function ExtractedDataPanel({
  rows,
  hoveredRowId,
  onRowHover,
  onRowSelect,
  onRowDelete,
  onRowEdit,
  onStatusChange,
  onCommentChange,
  onAcceptAiDecision,
  onActiveFindingChange,
  onRetryAiCde,
  isLoading,
  isAiCdeProcessing = false,
  selectedRowId,
  lockedRowId = null,
  extractionProgress,
  hasSubmittal = false,
  onPause,
  isPaused = false,
}: ExtractedDataPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current && extractionProgress?.logs) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [extractionProgress?.logs]);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [sortField, setSortField] = useState<SortField>("page");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let filtered = [...rows];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.field.toLowerCase().includes(query) ||
        r.value.toLowerCase().includes(query) ||
        r.section?.toLowerCase().includes(query) ||
        r.specNumber?.toLowerCase().includes(query)
      );
    }
    
    // Apply confidence filter
    if (confidenceFilter !== "all") {
      filtered = filtered.filter(r => r.confidence === confidenceFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === "field") {
        comparison = a.field.localeCompare(b.field);
      } else if (sortField === "page") {
        comparison = a.pageNumber - b.pageNumber;
      } else if (sortField === "confidence") {
        const order = { high: 0, medium: 1, low: 2 };
        comparison = order[a.confidence] - order[b.confidence];
      } else if (sortField === "specNumber") {
        const aSpec = a.specNumber || "";
        const bSpec = b.specNumber || "";
        comparison = aSpec.localeCompare(bSpec);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  }, [rows, searchQuery, confidenceFilter, sortField, sortDirection]);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Summary stats
  const stats = useMemo(() => ({
    total: rows.length,
    high: rows.filter(r => r.confidence === "high").length,
    medium: rows.filter(r => r.confidence === "medium").length,
    low: rows.filter(r => r.confidence === "low").length,
  }), [rows]);
  
  // Get the latest log message for status display
  const latestLog = extractionProgress?.logs[extractionProgress.logs.length - 1];
  const progressPercent = extractionProgress?.totalPages && extractionProgress.totalPages > 0 
    ? Math.round((extractionProgress.currentPage / extractionProgress.totalPages) * 100)
    : 0;
  
  // Keyboard shortcuts for quick status changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if we have a selected row and onStatusChange is available
      if (!selectedRowId || !onStatusChange) return;
      
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      
      const selectedRow = rows.find(r => r.id === selectedRowId);
      if (!selectedRow) return;
      
      let newStatus: CDEStatus | null = null;
      
      switch (e.key.toLowerCase()) {
        case "c":
          newStatus = "comply";
          break;
        case "d":
          newStatus = "deviate";
          break;
        case "e":
          newStatus = "exception";
          break;
        case "a":
          // Accept AI decision if available
          if (selectedRow.cdeSource === "ai" && !selectedRow.isReviewed && onAcceptAiDecision) {
            e.preventDefault();
            onAcceptAiDecision(selectedRowId);
            toast.success("AI decision accepted", {
              description: `Marked "${selectedRow.field}" as reviewed`,
            });
          }
          return;
        case "arrowdown":
          // Navigate to next row
          e.preventDefault();
          const currentIndex = filteredRows.findIndex(r => r.id === selectedRowId);
          if (currentIndex < filteredRows.length - 1) {
            onRowSelect(filteredRows[currentIndex + 1]);
          }
          return;
        case "arrowup":
          // Navigate to previous row
          e.preventDefault();
          const prevIndex = filteredRows.findIndex(r => r.id === selectedRowId);
          if (prevIndex > 0) {
            onRowSelect(filteredRows[prevIndex - 1]);
          }
          return;
        default:
          return;
      }
      
      if (newStatus) {
        e.preventDefault();
        onStatusChange(selectedRowId, newStatus);
        toast.success(`Status set to ${newStatus}`, {
          description: `"${selectedRow.field.slice(0, 30)}${selectedRow.field.length > 30 ? '...' : ''}"`,
        });
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRowId, onStatusChange, onAcceptAiDecision, rows, filteredRows, onRowSelect]);
  
  // Empty state (but not loading)
  if (rows.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-xl mx-auto">
            {/* Workflow guide */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-bv-blue-100 flex items-center justify-center mb-2 border-2 border-bv-blue-400">
                  <Upload className="h-5 w-5 text-bv-blue-600" />
                </div>
                <span className="text-detail font-medium text-bv-blue-700">1. Upload</span>
                <span className="text-micro text-neutral-500">Spec / Schedule</span>
              </div>
              
              <ArrowRight className="h-5 w-5 text-neutral-300 mt-[-20px]" />
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-2 border-2 border-neutral-300">
                  <FileText className="h-5 w-5 text-neutral-400" />
                </div>
                <span className="text-detail font-medium text-neutral-500">2. Review</span>
                <span className="text-micro text-neutral-400">Extracted Data</span>
              </div>
              
              <ArrowRight className="h-5 w-5 text-neutral-300 mt-[-20px]" />
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-2 border-2 border-neutral-300">
                  <CheckCircle2 className="h-5 w-5 text-neutral-400" />
                </div>
                <span className="text-detail font-medium text-neutral-500">3. Mark CDE</span>
                <span className="text-micro text-neutral-400">C / D / E Status</span>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-body-sm font-medium text-neutral-700 mb-2">
                Ready to start your CDE review
              </p>
              <p className="text-detail text-neutral-500 mb-6">
                Upload a specification or schedule document in the sidebar to begin extracting requirements.
              </p>
              
              {/* Keyboard shortcut hints */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-50 rounded-lg border border-neutral-200">
                <Keyboard className="h-4 w-4 text-neutral-400" />
                <span className="text-micro text-neutral-500">
                  Tip: Use <kbd className="px-1.5 py-0.5 bg-white rounded border text-micro font-mono">C</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white rounded border text-micro font-mono">D</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white rounded border text-micro font-mono">E</kbd> 
                  keys for quick status changes
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body-sm font-semibold text-neutral-800">
              Extracted Data Review
            </h3>
            {isLoading && extractionProgress ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 border-2 border-bv-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-micro text-bv-blue-600">
                  {latestLog?.message || "Extracting..."}
                </span>
                {extractionProgress.totalPages > 0 && (
                  <span className="text-micro text-neutral-400">
                    (Page {extractionProgress.currentPage}/{extractionProgress.totalPages})
                  </span>
                )}
                {onPause && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onPause}
                    className="h-6 px-2 text-micro gap-1 ml-2 text-yellow-700 border-yellow-400 hover:bg-yellow-100"
                    title="Pause all processing - data will be saved"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </Button>
                )}
              </div>
            ) : isAiCdeProcessing ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-micro text-purple-600">
                  AI CDE analyzing submittal...
                </span>
                <span className="text-micro text-neutral-400">
                  ({rows.filter(r => r.isAiProcessing).length} remaining)
                </span>
                {onPause && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onPause}
                    className="h-6 px-2 text-micro gap-1 ml-2 text-yellow-700 border-yellow-400 hover:bg-yellow-100"
                    title="Pause AI CDE - data will be saved"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-micro text-neutral-500">
                  {selectedRowId 
                    ? "Use keyboard: C=Comply, D=Deviate, E=Exception, ↑↓=Navigate"
                    : "Click a row to select, hover to preview in PDF"
                  }
                </p>
                {selectedRowId && (
                  <Badge variant="outline" className="text-micro bg-bv-blue-50 text-bv-blue-600 border-bv-blue-300 gap-1">
                    <Keyboard className="h-3 w-3" />
                    Shortcuts active
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-micro">
            <span className="px-2 py-1 rounded bg-green-100 text-green-700">
              {stats.high} high
            </span>
            <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">
              {stats.medium} medium
            </span>
            <span className="px-2 py-1 rounded bg-red-100 text-red-700">
              {stats.low} low
            </span>
          </div>
        </div>
        
        {/* Progress bar during extraction */}
        {isLoading && extractionProgress && extractionProgress.totalPages > 0 && (
          <div className="mt-2">
            <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-bv-blue-400 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search fields, values, spec #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button
            variant={confidenceFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setConfidenceFilter("all")}
            className={cn(
              "h-8",
              confidenceFilter === "all" && "bg-bv-blue-400"
            )}
          >
            All ({stats.total})
          </Button>
          <Button
            variant={confidenceFilter === "high" ? "default" : "outline"}
            size="sm"
            onClick={() => setConfidenceFilter("high")}
            className={cn(
              "h-8",
              confidenceFilter === "high" && "bg-green-500"
            )}
          >
            High ({stats.high})
          </Button>
          <Button
            variant={confidenceFilter === "medium" ? "default" : "outline"}
            size="sm"
            onClick={() => setConfidenceFilter("medium")}
            className={cn(
              "h-8",
              confidenceFilter === "medium" && "bg-yellow-500"
            )}
          >
            Medium ({stats.medium})
          </Button>
          <Button
            variant={confidenceFilter === "low" ? "default" : "outline"}
            size="sm"
            onClick={() => setConfidenceFilter("low")}
            className={cn(
              "h-8",
              confidenceFilter === "low" && "bg-red-500"
            )}
          >
            Low ({stats.low})
          </Button>
        </div>
        
        {/* Results count */}
        <div className="text-detail text-neutral-500">
          {filteredRows.length} of {rows.length} items
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 sticky top-0 z-10">
            <tr>
              <th 
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("specNumber")}
              >
                <div className="flex items-center gap-1">
                  Spec #
                  {sortField === "specNumber" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("field")}
              >
                <div className="flex items-center gap-1">
                  Field
                  {sortField === "field" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600">
                Spec Value
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600">
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Submittal
                </div>
              </th>
              <th 
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  Status
                  {sortField === "status" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600">
                Comment
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredRows.map((row) => (
              <DataRow
                key={row.id}
                row={row}
                isHovered={hoveredRowId === row.id}
                isSelected={selectedRowId === row.id}
                isLocked={lockedRowId === row.id}
                onHover={(hovered) => onRowHover(hovered ? row : null)}
                onSelect={() => onRowSelect(row)}
                onDelete={onRowDelete ? () => onRowDelete(row.id) : undefined}
                onEdit={onRowEdit ? (updates) => onRowEdit(row.id, updates) : undefined}
                onStatusChange={onStatusChange ? (status) => onStatusChange(row.id, status) : undefined}
                onCommentChange={onCommentChange ? (comment) => onCommentChange(row.id, comment) : undefined}
                onAcceptAiDecision={onAcceptAiDecision ? () => onAcceptAiDecision(row.id) : undefined}
                onActiveFindingChange={onActiveFindingChange ? (index) => onActiveFindingChange(row.id, index) : undefined}
                onRetryAiCde={onRetryAiCde ? () => onRetryAiCde(row.id) : undefined}
                hasSubmittal={hasSubmittal}
              />
            ))}
          </tbody>
        </table>
        
        {filteredRows.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-detail text-neutral-400">
                No items match your filters
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
