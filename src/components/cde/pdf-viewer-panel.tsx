"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  FileText,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageData } from "@/lib/pdf-utils";
import type { ComparisonResult, ExtractedRow } from "@/lib/types";

interface BoundingBox {
  x: number;      // Normalized 0-1 (left edge as fraction of page width)
  y: number;      // Normalized 0-1 (top edge as fraction of page height)
  width: number;  // Normalized 0-1 (width as fraction of page width)
  height: number; // Normalized 0-1 (height as fraction of page height)
}

interface PdfViewerPanelProps {
  pages: PageData[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  viewingDocument: "spec" | "submittal";
  onDocumentChange: (doc: "spec" | "submittal") => void;
  hasSpec: boolean;
  hasSubmittal: boolean;
  boundingBox?: BoundingBox;
  selectedComparison?: ComparisonResult;
  highlightedRow?: ExtractedRow;
}

export function PdfViewerPanel({
  pages,
  currentPage,
  totalPages,
  onPageChange,
  viewingDocument,
  onDocumentChange,
  hasSpec,
  hasSubmittal,
  boundingBox,
  selectedComparison,
  highlightedRow,
}: PdfViewerPanelProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // Get current page data
  const currentPageData = pages.find(p => p.pageNumber === currentPage);
  
  // Calculate bounding box position relative to displayed image
  const [boxPosition, setBoxPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  
  // Update bounding box position when image loads or zoom changes
  useEffect(() => {
    if (!boundingBox || !imageRef.current || !currentPageData) {
      setBoxPosition(null);
      return;
    }
    
    const img = imageRef.current;
    const displayedWidth = img.clientWidth;
    const displayedHeight = img.clientHeight;
    
    if (!displayedWidth || !displayedHeight) {
      setBoxPosition(null);
      return;
    }
    
    // Bounding box coordinates are normalized (0-1)
    // Convert to pixel positions on the displayed image
    setBoxPosition({
      left: boundingBox.x * displayedWidth,
      top: boundingBox.y * displayedHeight,
      width: boundingBox.width * displayedWidth,
      height: boundingBox.height * displayedHeight,
    });
  }, [boundingBox, currentPageData, zoom]);
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  
  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    } 
  };
  
  // Determine what to show in the info bar
  const infoBarContent = selectedComparison || highlightedRow;
  const isHighlightingExtractedRow = !!highlightedRow && !selectedComparison;
  
  // Empty state
  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col bg-neutral-100">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Button
              variant={viewingDocument === "spec" ? "default" : "outline"}
              size="sm"
              onClick={() => onDocumentChange("spec")}
              disabled={!hasSpec}
              className={cn(
                "gap-2",
                viewingDocument === "spec" && "bg-bv-blue-400 hover:bg-bv-blue-500"
              )}
            >
              <FileText className="h-4 w-4" />
              Spec
            </Button>
            <Button
              variant={viewingDocument === "submittal" ? "default" : "outline"}
              size="sm"
              onClick={() => onDocumentChange("submittal")}
              disabled={!hasSubmittal}
              className={cn(
                "gap-2",
                viewingDocument === "submittal" && "bg-purple-400 hover:bg-purple-500"
              )}
            >
              <Package className="h-4 w-4" />
              Submittal
            </Button>
          </div>
        </div>
        
        {/* Empty Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-200 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-neutral-400" />
            </div>
            <p className="text-body-sm text-neutral-500">
              {viewingDocument === "spec" 
                ? "Upload a specification to view it here"
                : "Upload a submittal to view it here"
              }
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-neutral-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-neutral-200">
        {/* Document Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewingDocument === "spec" ? "default" : "outline"}
            size="sm"
            onClick={() => onDocumentChange("spec")}
            disabled={!hasSpec}
            className={cn(
              "gap-2",
              viewingDocument === "spec" && "bg-bv-blue-400 hover:bg-bv-blue-500"
            )}
          >
            <FileText className="h-4 w-4" />
            Spec
          </Button>
          <Button
            variant={viewingDocument === "submittal" ? "default" : "outline"}
            size="sm"
            onClick={() => onDocumentChange("submittal")}
            disabled={!hasSubmittal}
            className={cn(
              "gap-2",
              viewingDocument === "submittal" && "bg-purple-400 hover:bg-purple-500"
            )}
          >
            <Package className="h-4 w-4" />
            Submittal
          </Button>
        </div>
        
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-detail text-neutral-600 min-w-[80px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="h-8 w-8 p-0"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-detail text-neutral-600 min-w-[50px] text-center">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-neutral-200 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="h-8 w-8 p-0"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Selected/Highlighted Item Info Bar */}
      {highlightedRow && (
        <div className="px-4 py-2 bg-bv-blue-100 border-b border-bv-blue-200">
          <div className="flex items-center gap-3 text-detail">
            <span className="font-semibold text-bv-blue-700">
              {highlightedRow.field}
            </span>
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-600">
              Value: <span className="font-medium">{highlightedRow.value}</span>
              {highlightedRow.unit && ` ${highlightedRow.unit}`}
            </span>
            {highlightedRow.section && (
              <>
                <span className="text-neutral-500">|</span>
                <span className="text-neutral-500">{highlightedRow.section}</span>
              </>
            )}
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-400 text-micro">
              Page {highlightedRow.pageNumber}
            </span>
          </div>
        </div>
      )}
      
      {selectedComparison && !highlightedRow && (
        <div className="px-4 py-2 bg-bv-blue-100 border-b border-bv-blue-200">
          <div className="flex items-center gap-3 text-detail">
            <span className="font-semibold text-bv-blue-700">
              {selectedComparison.specField}
            </span>
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-600">
              Spec: <span className="font-medium">{selectedComparison.specValue}</span>
              {selectedComparison.specUnit && ` ${selectedComparison.specUnit}`}
            </span>
            {selectedComparison.submittalValue && (
              <>
                <span className="text-neutral-500">→</span>
                <span className="text-neutral-600">
                  Submittal: <span className="font-medium">{selectedComparison.submittalValue}</span>
                  {selectedComparison.submittalUnit && ` ${selectedComparison.submittalUnit}`}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* PDF Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4"
      >
        <div 
          className="flex items-center justify-center min-h-full"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
          }}
        >
          {currentPageData && (
            <div className="relative shadow-lg">
              <img
                ref={imageRef}
                src={`data:${currentPageData.mimeType};base64,${currentPageData.base64}`}
                alt={`Page ${currentPage}`}
                className="max-w-full h-auto bg-white"
                style={{
                  transform: `rotate(${rotation}deg)`,
                }}
                onLoad={() => {
                  // Trigger recalculation of bounding box using normalized coordinates
                  if (boundingBox && imageRef.current) {
                    const img = imageRef.current;
                    const displayedWidth = img.clientWidth;
                    const displayedHeight = img.clientHeight;
                    
                    if (displayedWidth && displayedHeight) {
                      setBoxPosition({
                        left: boundingBox.x * displayedWidth,
                        top: boundingBox.y * displayedHeight,
                        width: boundingBox.width * displayedWidth,
                        height: boundingBox.height * displayedHeight,
                      });
                    }
                  }
                }}
              />
              
              {/* Bounding Box Overlay */}
              {boxPosition && (
                <div
                  className="absolute pointer-events-none border-2 border-bv-blue-400 bg-bv-blue-400/10 rounded-sm animate-pulse"
                  style={{
                    left: boxPosition.left,
                    top: boxPosition.top,
                    width: boxPosition.width,
                    height: boxPosition.height,
                  }}
                >
                  {/* Corner indicators */}
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-bv-blue-400 rounded-full" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-bv-blue-400 rounded-full" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-bv-blue-400 rounded-full" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-bv-blue-400 rounded-full" />
                </div>
              )}
              
              {/* Page highlight indicator when showing extracted row but no bounding box */}
              {!boxPosition && highlightedRow && highlightedRow.pageNumber === currentPage && (
                <div className="absolute inset-0 border-4 border-bv-blue-400/50 pointer-events-none rounded">
                  <div className="absolute top-2 right-2 bg-bv-blue-400 text-white text-micro px-2 py-1 rounded">
                    {highlightedRow.field}
                  </div>
                </div>
              )}
              
              {/* Page highlight indicator when no bounding box but page is relevant (comparison) */}
              {!boxPosition && !highlightedRow && selectedComparison && (
                <div className="absolute inset-0 border-4 border-bv-blue-400/50 pointer-events-none rounded">
                  <div className="absolute top-2 right-2 bg-bv-blue-400 text-white text-micro px-2 py-1 rounded">
                    Relevant Page
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
