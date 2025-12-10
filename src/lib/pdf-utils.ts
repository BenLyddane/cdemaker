/**
 * PDF and Image utilities for page extraction
 * Works in browser environment
 */

export interface PageData {
  base64: string;
  mimeType: string;
  pageNumber: number;
  width?: number;
  height?: number;
}

/**
 * Convert a File to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Extract pages from a PDF file using pdf.js
 * Renders each page to a canvas and exports as PNG
 */
export async function extractPdfPages(file: File): Promise<PageData[]> {
  // Dynamically import pdfjs to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist");
  
  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pages: PageData[] = [];

  // Render each page to canvas and extract as image
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Use higher scale for better quality (2x for good OCR results)
    const scale = 2;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    
    if (!context) {
      throw new Error("Could not get canvas context");
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render page
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    };
    await page.render(renderContext as any).promise;

    // Convert to base64 PNG
    const dataUrl = canvas.toDataURL("image/png", 1.0);
    const base64 = dataUrl.split(",")[1];

    pages.push({
      base64,
      mimeType: "image/png",
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
    });

    // Clean up
    canvas.remove();
  }

  return pages;
}

/**
 * Process an image file (returns single page)
 */
export async function extractImagePage(file: File): Promise<PageData[]> {
  const base64 = await fileToBase64(file);
  
  return [{
    base64,
    mimeType: file.type,
    pageNumber: 1,
  }];
}

/**
 * Main function to extract pages from any supported file
 */
export async function extractPages(file: File): Promise<PageData[]> {
  const fileType = file.type;

  if (fileType === "application/pdf") {
    return extractPdfPages(file);
  }

  if (fileType.startsWith("image/")) {
    return extractImagePage(file);
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

/**
 * Get file type category
 */
export function getFileCategory(file: File): "pdf" | "image" | "unknown" {
  if (file.type === "application/pdf") {
    return "pdf";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  return "unknown";
}

/**
 * Validate file for extraction
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const supportedTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
  ];

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum of 50MB (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  if (!supportedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Supported: PDF, PNG, JPG, GIF, WebP`,
    };
  }

  return { valid: true };
}
