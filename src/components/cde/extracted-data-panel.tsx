"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { 
  Search, 
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  AlertCircle,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractedRow } from "@/lib/types";
import type { ExtractionProgress } from "./cde-workspace";

interface ExtractedDataPanelProps {
  rows: ExtractedRow[];
  hoveredRowId: string | null;
  onRowHover: (row: ExtractedRow | null) => void;
  onRowSelect: (row: ExtractedRow) => void;
  onRowDelete?: (rowId: string) => void;
  onRowEdit?: (rowId: string, updates: Partial<ExtractedRow>) => void;
  isLoading: boolean;
  selectedRowId: string | null;
  extractionProgress?: ExtractionProgress | null;
}

type ConfidenceFilter = "all" | "high" | "medium" | "low";
type SortField = "field" | "page" | "confidence" | "specNumber";

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
  onHover: (hovered: boolean) => void;
  onSelect: () => void;
  onDelete?: () => void;
  onEdit?: (updates: Partial<ExtractedRow>) => void;
}

function DataRow({
  row,
  isHovered,
  isSelected,
  onHover,
  onSelect,
  onDelete,
  onEdit,
}: DataRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedField, setEditedField] = useState(row.field);
  const [editedValue, setEditedValue] = useState(row.value);
  
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
  
  return (
    <tr 
      className={cn(
        "group cursor-pointer transition-colors",
        isHovered && "bg-bv-blue-100/70",
        isSelected && !isHovered && "bg-bv-blue-50",
        !isHovered && !isSelected && "hover:bg-neutral-50"
      )}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
    >
      {/* Spec Number */}
      <td className="px-3 py-3 text-detail text-neutral-500 min-w-[180px]">
        {row.specNumber ? (
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help">
                <Hash className="h-3 w-3 flex-shrink-0 text-bv-blue-400" />
                <span className="font-mono text-micro text-neutral-700 truncate max-w-[150px]">
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
      </td>
      
      {/* Field */}
      <td className="px-3 py-3 text-detail font-medium text-neutral-800">
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
            maxWidth={180}
            subText={row.section}
          />
        )}
      </td>
      
      {/* Value */}
      <td className="px-3 py-3 text-detail text-neutral-600">
        {isEditing ? (
          <Input
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            className="h-7 text-detail"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <ValueWithHover value={row.value} unit={row.unit} maxWidth={250} />
        )}
      </td>
      
      {/* Confidence */}
      <td className="px-3 py-3">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      
      {/* Page */}
      <td className="px-3 py-3 text-detail text-neutral-500">
        <div className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          <span>{row.pageNumber}</span>
        </div>
      </td>
      
      {/* Actions */}
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
  isLoading,
  selectedRowId,
  extractionProgress,
}: ExtractedDataPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);
  
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
  
  // Empty state (but not loading)
  if (rows.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-neutral-400" />
            </div>
            <p className="text-body-sm text-neutral-600">No extracted data yet</p>
            <p className="text-detail text-neutral-400">
              Upload a specification or schedule to extract data
            </p>
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
              </div>
            ) : (
              <p className="text-micro text-neutral-500">
                Hover over a row to see its location in the document
              </p>
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
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100 w-24"
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
                  Field / Section
                  {sortField === "field" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600">
                Value
              </th>
              <th 
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("confidence")}
              >
                <div className="flex items-center gap-1">
                  Confidence
                  {sortField === "confidence" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("page")}
              >
                <div className="flex items-center gap-1">
                  Page
                  {sortField === "page" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-detail font-semibold text-neutral-600 w-24">
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
                onHover={(hovered) => onRowHover(hovered ? row : null)}
                onSelect={() => onRowSelect(row)}
                onDelete={onRowDelete ? () => onRowDelete(row.id) : undefined}
                onEdit={onRowEdit ? (updates) => onRowEdit(row.id, updates) : undefined}
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
