"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  X,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusSelector } from "./status-selector";
import type { ComparisonResult, CDEStatus } from "@/lib/types";

interface Summary {
  totalItems: number;
  comply: number;
  deviate: number;
  exception: number;
  pending: number;
  reviewed: number;
}

interface ComparisonPanelProps {
  comparisons: ComparisonResult[];
  selectedId: string | null;
  onSelect: (comparison: ComparisonResult) => void;
  onStatusChange: (id: string, status: CDEStatus) => void;
  onCommentChange: (id: string, comment: string) => void;
  isLoading: boolean;
  summary: Summary;
}

type FilterStatus = "all" | CDEStatus;

function StatusBadge({ status }: { status: CDEStatus }) {
  const config: Record<CDEStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
    comply: {
      icon: CheckCircle2,
      label: "C",
      className: "bg-success-100 text-success-700 border-success-400",
    },
    deviate: {
      icon: AlertTriangle,
      label: "D",
      className: "bg-warning-100 text-warning-700 border-warning-400",
    },
    exception: {
      icon: XCircle,
      label: "E",
      className: "bg-error-100 text-error-700 border-error-400",
    },
    not_found: {
      icon: HelpCircle,
      label: "?",
      className: "bg-purple-100 text-purple-700 border-purple-400",
    },
    pending: {
      icon: Clock,
      label: "P",
      className: "bg-neutral-100 text-neutral-600 border-neutral-300",
    },
  };
  
  const { icon: Icon, label, className } = config[status];
  
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

interface ComparisonRowProps {
  comparison: ComparisonResult;
  isSelected: boolean;
  onSelect: () => void;
  onStatusChange: (status: CDEStatus) => void;
  onCommentChange: (comment: string) => void;
}

function ComparisonRow({
  comparison,
  isSelected,
  onSelect,
  onStatusChange,
  onCommentChange,
}: ComparisonRowProps) {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [editedComment, setEditedComment] = useState(
    comparison.userComment || comparison.aiExplanation
  );
  
  const handleSaveComment = () => {
    onCommentChange(editedComment);
    setIsEditingComment(false);
  };
  
  const handleCancelComment = () => {
    setEditedComment(comparison.userComment || comparison.aiExplanation);
    setIsEditingComment(false);
  };
  
  const displayComment = comparison.userComment || comparison.aiExplanation;
  
  return (
    <tr 
      className={cn(
        "group cursor-pointer transition-colors hover:bg-neutral-50",
        isSelected && "bg-bv-blue-100/50"
      )}
      onClick={onSelect}
    >
      {/* Field */}
      <td className="px-4 py-3 text-detail font-medium text-neutral-800 max-w-[200px]">
        <div className="truncate" title={comparison.specField}>
          {comparison.specField}
        </div>
        {comparison.specSection && (
          <div className="text-micro text-neutral-400 truncate">
            {comparison.specSection}
          </div>
        )}
      </td>
      
      {/* Spec Value */}
      <td className="px-4 py-3 text-detail text-neutral-600">
        <div className="flex items-center gap-1">
          <span className="truncate max-w-[120px]" title={comparison.specValue}>
            {comparison.specValue}
          </span>
          {comparison.specUnit && (
            <span className="text-neutral-400">{comparison.specUnit}</span>
          )}
        </div>
        <div className="text-micro text-neutral-400">
          Page {comparison.specLocation.pageNumber}
        </div>
      </td>
      
      {/* Submittal Value */}
      <td className="px-4 py-3 text-detail text-neutral-600">
        {comparison.submittalValue ? (
          <>
            <div className="flex items-center gap-1">
              <span className="truncate max-w-[120px]" title={comparison.submittalValue}>
                {comparison.submittalValue}
              </span>
              {comparison.submittalUnit && (
                <span className="text-neutral-400">{comparison.submittalUnit}</span>
              )}
            </div>
            {comparison.submittalLocation && (
              <div className="text-micro text-neutral-400">
                Page {comparison.submittalLocation.pageNumber}
              </div>
            )}
          </>
        ) : (
          <span className="text-neutral-400 italic">Not found</span>
        )}
      </td>
      
      {/* Status */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <StatusSelector
          value={comparison.status}
          onChange={onStatusChange}
        />
      </td>
      
      {/* Comment */}
      <td className="px-4 py-3 max-w-[250px]" onClick={(e) => e.stopPropagation()}>
        {isEditingComment ? (
          <div className="flex items-center gap-2">
            <Input
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              className="h-8 text-detail"
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
              className="h-7 w-7 p-0 text-success-600 hover:text-success-700 hover:bg-success-100"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelComment}
              className="h-7 w-7 p-0 text-error-600 hover:text-error-700 hover:bg-error-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group/comment">
            <span 
              className="text-detail text-neutral-600 truncate flex-1"
              title={displayComment}
            >
              {displayComment}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingComment(true)}
              className="h-7 w-7 p-0 opacity-0 group-hover/comment:opacity-100 transition-opacity"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </td>
      
      {/* View Button */}
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0",
            isSelected ? "text-bv-blue-400" : "text-neutral-400"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export function ComparisonPanel({
  comparisons,
  selectedId,
  onSelect,
  onStatusChange,
  onCommentChange,
  isLoading,
  summary,
}: ComparisonPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [showReviewedOnly, setShowReviewedOnly] = useState(false);
  const [sortField, setSortField] = useState<"field" | "status">("field");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  // Filter and sort comparisons
  const filteredComparisons = useMemo(() => {
    let filtered = [...comparisons];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.specField.toLowerCase().includes(query) ||
        c.specValue.toLowerCase().includes(query) ||
        c.submittalValue?.toLowerCase().includes(query) ||
        c.aiExplanation.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    // Apply reviewed filter
    if (showReviewedOnly) {
      filtered = filtered.filter(c => c.isReviewed);
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === "field") {
        comparison = a.specField.localeCompare(b.specField);
      } else if (sortField === "status") {
        const statusOrder: Record<CDEStatus, number> = { comply: 0, deviate: 1, exception: 2, not_found: 3, pending: 4 };
        comparison = statusOrder[a.status] - statusOrder[b.status];
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  }, [comparisons, searchQuery, statusFilter, showReviewedOnly, sortField, sortDirection]);
  
  const handleSort = (field: "field" | "status") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-bv-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-body-sm text-neutral-600">Comparing documents...</p>
            <p className="text-detail text-neutral-400">This may take a moment</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Empty state
  if (comparisons.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-neutral-400" />
            </div>
            <p className="text-body-sm text-neutral-600">No comparison data yet</p>
            <p className="text-detail text-neutral-400">
              Upload both documents to start comparing
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search fields, values..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "h-8",
                statusFilter === "all" && "bg-bv-blue-400"
              )}
            >
              All ({summary.totalItems})
            </Button>
            <Button
              variant={statusFilter === "comply" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("comply")}
              className={cn(
                "h-8 gap-1",
                statusFilter === "comply" && "bg-success-400"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {summary.comply}
            </Button>
            <Button
              variant={statusFilter === "deviate" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("deviate")}
              className={cn(
                "h-8 gap-1",
                statusFilter === "deviate" && "bg-warning-400"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {summary.deviate}
            </Button>
            <Button
              variant={statusFilter === "exception" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("exception")}
              className={cn(
                "h-8 gap-1",
                statusFilter === "exception" && "bg-error-400"
              )}
            >
              <XCircle className="h-3 w-3" />
              {summary.exception}
            </Button>
            {summary.pending > 0 && (
              <Button
                variant={statusFilter === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("pending")}
                className="h-8 gap-1"
              >
                <Clock className="h-3 w-3" />
                {summary.pending}
              </Button>
            )}
          </div>
          
          {/* Reviewed Toggle */}
          <Button
            variant={showReviewedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowReviewedOnly(!showReviewedOnly)}
            className={cn("h-8", showReviewedOnly && "bg-bv-blue-400")}
          >
            Reviewed Only
          </Button>
        </div>
        
        {/* Results count */}
        <div className="text-detail text-neutral-500">
          {filteredComparisons.length} of {comparisons.length} items
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 sticky top-0">
            <tr>
              <th 
                className="px-4 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("field")}
              >
                <div className="flex items-center gap-1">
                  Field
                  {sortField === "field" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-4 py-2 text-left text-detail font-semibold text-neutral-600">
                Spec Value
              </th>
              <th className="px-4 py-2 text-left text-detail font-semibold text-neutral-600">
                Submittal Value
              </th>
              <th 
                className="px-4 py-2 text-left text-detail font-semibold text-neutral-600 cursor-pointer hover:bg-neutral-100"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  Status
                  {sortField === "status" && (
                    sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-4 py-2 text-left text-detail font-semibold text-neutral-600">
                Comment
              </th>
              <th className="px-4 py-2 text-left text-detail font-semibold text-neutral-600 w-12">
                View
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredComparisons.map((comparison) => (
              <ComparisonRow
                key={comparison.id}
                comparison={comparison}
                isSelected={comparison.id === selectedId}
                onSelect={() => onSelect(comparison)}
                onStatusChange={(status) => onStatusChange(comparison.id, status)}
                onCommentChange={(comment) => onCommentChange(comparison.id, comment)}
              />
            ))}
          </tbody>
        </table>
        
        {filteredComparisons.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-detail text-neutral-400">
              No items match your filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
