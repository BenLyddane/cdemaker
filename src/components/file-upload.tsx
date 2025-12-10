"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, FileText, Image, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  label: string;
  description: string;
  acceptedTypes?: string[];
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  selectedFile?: File | null;
  isProcessing?: boolean;
  progress?: number;
  variant?: "specification" | "submittal";
  compact?: boolean;
}

const acceptedMimeTypes: Record<string, string[]> = {
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "application/pdf": [".pdf"],
};

export function FileUpload({
  label,
  description,
  onFileSelect,
  onFileRemove,
  selectedFile,
  isProcessing = false,
  progress = 0,
  variant = "specification",
  compact = false,
}: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
      setDragOver(false);
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedMimeTypes,
    maxFiles: 1,
    disabled: isProcessing,
    onDragEnter: () => setDragOver(true),
    onDragLeave: () => setDragOver(false),
  });

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="h-8 w-8 text-bv-blue-400" />;
    }
    if (file.type === "application/pdf") {
      return <FileText className="h-8 w-8 text-error-400" />;
    }
    return <File className="h-8 w-8 text-neutral-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Compact mode - just a button to add more
  if (compact && !selectedFile) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-3 transition-all duration-200 cursor-pointer",
          "hover:border-bv-blue-400 hover:bg-bv-blue-100/50",
          isDragActive || dragOver
            ? "border-bv-blue-400 bg-bv-blue-100"
            : "border-neutral-200 bg-neutral-50",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-neutral-500">
          <Plus className="h-4 w-4" />
          <span className="text-detail">Add another document</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {label && (
        <label className="text-body-sm font-semibold text-neutral-800 mb-2 block">
          {label}
        </label>
      )}
      
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-8 transition-all duration-200 cursor-pointer",
            "hover:border-bv-blue-400 hover:bg-bv-blue-100/50",
            isDragActive || dragOver
              ? "border-bv-blue-400 bg-bv-blue-100"
              : "border-neutral-200 bg-neutral-50",
            isProcessing && "opacity-50 cursor-not-allowed"
          )}
        >
          <input {...getInputProps()} />
          
          <div className="flex flex-col items-center justify-center text-center">
            <div
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4",
                variant === "specification"
                  ? "bg-bv-blue-100"
                  : "bg-purple-100"
              )}
            >
              <Upload
                className={cn(
                  "h-8 w-8",
                  variant === "specification"
                    ? "text-bv-blue-400"
                    : "text-purple-400"
                )}
              />
            </div>
            
            <p className="text-body-sm font-medium text-neutral-800 mb-1">
              {isDragActive ? "Drop the file here" : "Drag and drop your file here"}
            </p>
            {description && (
              <p className="text-detail text-neutral-600 mb-4">{description}</p>
            )}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-bv-blue-400 text-bv-blue-400 hover:bg-bv-blue-100"
            >
              Browse Files
            </Button>
            
            <p className="text-micro text-neutral-400 mt-3">
              Supports: PDF, PNG, JPG, JPEG
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-lg p-4 bg-white">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">{getFileIcon(selectedFile)}</div>
            
            <div className="flex-grow min-w-0">
              <p className="text-body-sm font-medium text-neutral-800 truncate">
                {selectedFile.name}
              </p>
              <p className="text-detail text-neutral-500">
                {formatFileSize(selectedFile.size)}
              </p>
              
              {isProcessing && (
                <div className="mt-3">
                  <Progress value={progress} className="h-2" />
                  <p className="text-micro text-neutral-500 mt-1">
                    Processing... {progress}%
                  </p>
                </div>
              )}
            </div>
            
            {!isProcessing && onFileRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove();
                }}
                className="flex-shrink-0 h-8 w-8 p-0 text-neutral-400 hover:text-error-400 hover:bg-error-100"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
