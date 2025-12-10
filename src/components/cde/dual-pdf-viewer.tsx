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
  Package,
  Columns,
  Square
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageData } from "@/lib/pdf-utils";
import type { ExtractedRow, DocumentLocation } from "@/lib/types";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SinglePdfPanelProps {
  title: string;
  titleColor: string;
  pages: PageData[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  boundingBox?: BoundingBox;
  zoom: number;
  rotation: number;
  borderColor: string;
  bgColor: string;
  isEmpty: boolean;
  emptyMessage: string;
}

function SinglePdfPanel({
  title,
  titleColor,
  pages,
  currentPage,
  totalPages,
  onPageChange,
  boundingBox,
  zoom,
  rotation,
  borderColor,
  bgColor,
  isEmpty,
  emptyMessage,
}: SinglePdfPanelProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [boxPosition, setBoxPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const currentPageData = pages.find(p => p.pageNumber === currentPage);

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

    setBoxPosition({
      left: boundingBox.x * displayedWidth,
      top: boundingBox.y * displayedHeight,
      width: boundingBox.width * displayedWidth,
      height: boundingBox.height * displayedHeight,
    });
  }, [boundingBox, currentPageData, zoom]);

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col bg-neutral-100 border-r border-neutral-200 last:border-r-0">
        {/* Header */}
        <div className={cn("px-3 py-2 border-b", bgColor)}>
          <div className="flex items-center justify-between">
            <span className={cn("text-detail font-semibold", titleColor)}>{title}</span>
          </div>
        </div>
        
        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center mx-auto mb-3">
              {title.toLowerCase().includes("spec") ? (
                <FileText className="h-6 w-6 text-neutral-400" />
              ) : (
                <Package className="h-6 w-6 text-neutral-400" />
              )}
            </div>
            <p className="text-detail text-neutral-500">{emptyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-neutral-100 border-r border-neutral-200 last:border-r-0 min-w-0">
      {/* Header */}
      <div className={cn("px-3 py-2 border-b flex items-center justify-between", bgColor)}>
        <span className={cn("text-detail font-semibold", titleColor)}>{title}</span>
        
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-micro text-neutral-600 min-w-[60px] text-center">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      {/* PDF Content */}
      <div className="flex-1 overflow-auto p-2">
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
                style={{ transform: `rotate(${rotation}deg)` }}
                onLoad={() => {
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
                  className={cn(
                    "absolute pointer-events-none border-3 rounded-sm animate-pulse",
                    borderColor
                  )}
                  style={{
                    left: boxPosition.left,
                    top: boxPosition.top,
                    width: boxPosition.width,
                    height: boxPosition.height,
                    borderWidth: "3px",
                  }}
                >
                  {/* Corner indicators */}
                  <div className={cn("absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full", bgColor.replace("bg-opacity-10", ""))} />
                  <div className={cn("absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full", bgColor.replace("bg-opacity-10", ""))} />
                  <div className={cn("absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full", bgColor.replace("bg-opacity-10", ""))} />
                  <div className={cn("absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full", bgColor.replace("bg-opacity-10", ""))} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DualPdfViewerProps {
  // Spec document
  specPages: PageData[];
  specCurrentPage: number;
  specTotalPages: number;
  onSpecPageChange: (page: number) => void;
  specBoundingBox?: BoundingBox;
  hasSpec: boolean;
  
  // Submittal document
  submittalPages: PageData[];
  submittalCurrentPage: number;
  submittalTotalPages: number;
  onSubmittalPageChange: (page: number) => void;
  submittalBoundingBox?: BoundingBox;
  hasSubmittal: boolean;
  
  // View mode
  splitView: boolean;
  onToggleSplitView: () => void;
  
  // For single view mode - which document to show
  viewingDocument: "spec" | "submittal";
  onDocumentChange: (doc: "spec" | "submittal") => void;
  
  // Selected row info for header display
  selectedRow?: ExtractedRow;
}

export function DualPdfViewer({
  specPages,
  specCurrentPage,
  specTotalPages,
  onSpecPageChange,
  specBoundingBox,
  hasSpec,
  submittalPages,
  submittalCurrentPage,
  submittalTotalPages,
  onSubmittalPageChange,
  submittalBoundingBox,
  hasSubmittal,
  splitView,
  onToggleSplitView,
  viewingDocument,
  onDocumentChange,
  selectedRow,
}: DualPdfViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // In split view, adjust zoom for smaller panels
  const effectiveZoom = splitView ? Math.min(zoom, 100) : zoom;

  return (
    <div className="h-full flex flex-col bg-neutral-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-neutral-200">
        {/* Left: View mode toggle */}
        <div className="flex items-center gap-2">
          {hasSubmittal && (
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => !splitView && onToggleSplitView()}
                className={cn(
                  "gap-1.5 h-7 px-2.5 rounded-md transition-colors",
                  !splitView 
                    ? "bg-white shadow-sm text-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                <Square className="h-3.5 w-3.5" />
                Single
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => splitView && onToggleSplitView()}
                className={cn(
                  "gap-1.5 h-7 px-2.5 rounded-md transition-colors",
                  splitView 
                    ? "bg-white shadow-sm text-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                <Columns className="h-3.5 w-3.5" />
                Split View
              </Button>
            </div>
          )}
          
          {/* Single view document toggle */}
          {!splitView && (
            <div className="flex items-center gap-2 ml-2">
              <Button
                variant={viewingDocument === "spec" ? "default" : "outline"}
                size="sm"
                onClick={() => onDocumentChange("spec")}
                disabled={!hasSpec}
                className={cn(
                  "gap-1.5 h-7",
                  viewingDocument === "spec" && "bg-bv-blue-400 hover:bg-bv-blue-500"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Spec
              </Button>
              <Button
                variant={viewingDocument === "submittal" ? "default" : "outline"}
                size="sm"
                onClick={() => onDocumentChange("submittal")}
                disabled={!hasSubmittal}
                className={cn(
                  "gap-1.5 h-7",
                  viewingDocument === "submittal" && "bg-purple-500 hover:bg-purple-600"
                )}
              >
                <Package className="h-3.5 w-3.5" />
                Submittal
              </Button>
            </div>
          )}
        </div>
        
        {/* Center: Selected row info */}
        {selectedRow && (
          <div className="flex items-center gap-2 text-detail">
            <span className="font-semibold text-neutral-800">{selectedRow.field}</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-600">
              {selectedRow.value}
              {selectedRow.unit && ` ${selectedRow.unit}`}
            </span>
            {selectedRow.submittalValue && (
              <>
                <span className="text-neutral-400">→</span>
                <span className="text-purple-600">
                  {selectedRow.submittalValue}
                  {selectedRow.submittalUnit && ` ${selectedRow.submittalUnit}`}
                </span>
              </>
            )}
          </div>
        )}
        
        {/* Right: Zoom controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="h-7 w-7 p-0"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-micro text-neutral-600 min-w-[40px] text-center">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="h-7 w-7 p-0"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-5 bg-neutral-200 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="h-7 w-7 p-0"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {/* PDF Content Area */}
      {splitView ? (
        // Split view - show both side by side
        <div className="flex-1 flex overflow-hidden">
          <SinglePdfPanel
            title="Specification"
            titleColor="text-bv-blue-600"
            pages={specPages}
            currentPage={specCurrentPage}
            totalPages={specTotalPages}
            onPageChange={onSpecPageChange}
            boundingBox={specBoundingBox}
            zoom={effectiveZoom}
            rotation={rotation}
            borderColor="border-bv-blue-400"
            bgColor="bg-bv-blue-100"
            isEmpty={!hasSpec}
            emptyMessage="Upload a spec to view"
          />
          <SinglePdfPanel
            title="Submittal"
            titleColor="text-purple-600"
            pages={submittalPages}
            currentPage={submittalCurrentPage}
            totalPages={submittalTotalPages}
            onPageChange={onSubmittalPageChange}
            boundingBox={submittalBoundingBox}
            zoom={effectiveZoom}
            rotation={rotation}
            borderColor="border-purple-400"
            bgColor="bg-purple-100"
            isEmpty={!hasSubmittal}
            emptyMessage="Upload a submittal to view"
          />
        </div>
      ) : (
        // Single view - show one document
        <div className="flex-1 overflow-hidden">
          {viewingDocument === "spec" ? (
            <SinglePdfPanel
              title="Specification"
              titleColor="text-bv-blue-600"
              pages={specPages}
              currentPage={specCurrentPage}
              totalPages={specTotalPages}
              onPageChange={onSpecPageChange}
              boundingBox={specBoundingBox}
              zoom={zoom}
              rotation={rotation}
              borderColor="border-bv-blue-400"
              bgColor="bg-bv-blue-100"
              isEmpty={!hasSpec}
              emptyMessage="Upload a spec to view"
            />
          ) : (
            <SinglePdfPanel
              title="Submittal"
              titleColor="text-purple-600"
              pages={submittalPages}
              currentPage={submittalCurrentPage}
              totalPages={submittalTotalPages}
              onPageChange={onSubmittalPageChange}
              boundingBox={submittalBoundingBox}
              zoom={zoom}
              rotation={rotation}
              borderColor="border-purple-400"
              bgColor="bg-purple-100"
              isEmpty={!hasSubmittal}
              emptyMessage="Upload a submittal to view"
            />
          )}
        </div>
      )}
    </div>
  );
}
