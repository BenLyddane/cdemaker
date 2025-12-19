"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Square,
  Maximize2
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
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [boxPosition, setBoxPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const currentPageData = pages.find(p => p.pageNumber === currentPage);

  // Calculate bounding box position based on displayed image size
  const updateBoundingBox = useCallback(() => {
    if (!boundingBox || !imageRef.current) {
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
  }, [boundingBox]);

  // Update bounding box when zoom changes or image loads
  useEffect(() => {
    updateBoundingBox();
  }, [updateBoundingBox, zoom, imageDimensions]);

  // Handle image load to get natural dimensions
  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
      // Update bounding box after a small delay to ensure image is rendered
      requestAnimationFrame(() => {
        updateBoundingBox();
      });
    }
  }, [updateBoundingBox]);

  // Scroll to bounding box when it changes
  useEffect(() => {
    if (boundingBox && containerRef.current && imageDimensions) {
      const container = containerRef.current;
      const zoomFactor = zoom / 100;
      
      // Calculate pixel positions based on image dimensions and zoom
      const imgWidth = imageDimensions.width * zoomFactor;
      const imgHeight = imageDimensions.height * zoomFactor;
      
      const boxLeft = boundingBox.x * imgWidth;
      const boxTop = boundingBox.y * imgHeight;
      const boxWidth = boundingBox.width * imgWidth;
      const boxHeight = boundingBox.height * imgHeight;
      
      // Calculate the position to scroll to (center the bounding box in view)
      const scrollLeft = boxLeft - (container.clientWidth / 2) + (boxWidth / 2);
      const scrollTop = boxTop - (container.clientHeight / 2) + (boxHeight / 2);
      
      container.scrollTo({
        left: Math.max(0, scrollLeft),
        top: Math.max(0, scrollTop),
        behavior: 'smooth',
      });
    }
  }, [boundingBox, zoom, imageDimensions]);

  // Calculate scaled image dimensions based on zoom
  const scaledWidth = imageDimensions ? (imageDimensions.width * zoom) / 100 : undefined;
  const scaledHeight = imageDimensions ? (imageDimensions.height * zoom) / 100 : undefined;

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
    <div className="flex-1 flex flex-col bg-neutral-100 border-r border-neutral-200 last:border-r-0 min-w-0" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className={cn("px-3 py-2 border-b flex items-center justify-between flex-shrink-0", bgColor)}>
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
      
      {/* PDF Content - Scrollable container with explicit overflow */}
      <div 
        ref={containerRef}
        className="flex-1 bg-neutral-200"
        style={{ 
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        {/* Content wrapper */}
        <div 
          className="p-4"
          style={{ 
            display: 'inline-block',
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          {currentPageData && (
            <div 
              className="relative shadow-lg bg-white"
              style={{
                width: scaledWidth ? `${scaledWidth}px` : 'auto',
                height: scaledHeight ? `${scaledHeight}px` : 'auto',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <img
                ref={imageRef}
                src={`data:${currentPageData.mimeType};base64,${currentPageData.base64}`}
                alt={`Page ${currentPage}`}
                className="block"
                style={{ 
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                }}
                onLoad={handleImageLoad}
              />
              
              {/* Bounding Box Overlay - uses normalized coordinates directly as percentages */}
              {boundingBox && (
                <div
                  className={cn(
                    "absolute pointer-events-none rounded-sm animate-pulse",
                    borderColor
                  )}
                  style={{
                    left: `${boundingBox.x * 100}%`,
                    top: `${boundingBox.y * 100}%`,
                    width: `${boundingBox.width * 100}%`,
                    height: `${boundingBox.height * 100}%`,
                    borderWidth: "3px",
                    borderStyle: "solid",
                    backgroundColor: borderColor === 'border-bv-blue-400' 
                      ? 'rgba(74, 58, 255, 0.1)' 
                      : 'rgba(204, 152, 246, 0.1)',
                  }}
                >
                  {/* Corner indicators */}
                  <div className={cn("absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full", borderColor.replace('border-', 'bg-'))} />
                  <div className={cn("absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full", borderColor.replace('border-', 'bg-'))} />
                  <div className={cn("absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full", borderColor.replace('border-', 'bg-'))} />
                  <div className={cn("absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full", borderColor.replace('border-', 'bg-'))} />
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
  // Start at a reasonable zoom level
  const [zoom, setZoom] = useState(75);
  const [rotation, setRotation] = useState(0);

  // Preset zoom levels
  const zoomPresets = [25, 50, 75, 100, 125, 150, 200];
  
  const handleZoomIn = () => {
    const currentIndex = zoomPresets.findIndex(z => z >= zoom);
    if (currentIndex < zoomPresets.length - 1) {
      setZoom(zoomPresets[currentIndex + 1]);
    } else if (zoom < 200) {
      setZoom(Math.min(zoom + 25, 200));
    }
  };
  
  const handleZoomOut = () => {
    const currentIndex = zoomPresets.findIndex(z => z >= zoom);
    if (currentIndex > 0) {
      setZoom(zoomPresets[currentIndex - 1]);
    } else if (zoom > 25) {
      setZoom(Math.max(zoom - 25, 25));
    }
  };
  
  const handleZoomFit = () => {
    // Reset to a reasonable fit size
    setZoom(splitView ? 50 : 75);
  };
  
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <div className="flex-1 flex flex-col bg-neutral-100" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-neutral-200 shrink-0">
        {/* Left: View mode toggle */}
        <div className="flex items-center gap-2">
          {hasSubmittal && (
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => splitView && onToggleSplitView()}
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
                onClick={() => !splitView && onToggleSplitView()}
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
        
        {/* Right: Zoom controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 25}
            className="h-7 w-7 p-0"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-micro text-neutral-600 min-w-[45px] text-center font-medium">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="h-7 w-7 p-0"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomFit}
            className="h-7 w-7 p-0"
            title="Fit to view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-5 bg-neutral-200 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="h-7 w-7 p-0"
            title="Rotate"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {/* PDF Content Area */}
      {splitView ? (
        // Split view - show both side by side
        <div className="flex-1 flex" style={{ minHeight: 0, overflow: 'hidden' }}>
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
        </div>
      ) : (
        // Single view - show one document
        // Note: flex flex-col is required for SinglePdfPanel's flex-1 to work properly
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
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
