/**
 * Vercel Blob storage utility functions for PDF file management
 */
import { put, del, list, head } from "@vercel/blob";

// Folder structure in blob storage
const FOLDERS = {
  pdfs: "pdfs",
  specifications: "pdfs/specifications",
  schedules: "pdfs/schedules",
  submittals: "pdfs/submittals",
  reports: "reports",
} as const;

export type DocumentType = "specification" | "schedule" | "submittal";

/**
 * Get the folder path for a document type
 */
function getFolderForType(type: DocumentType): string {
  switch (type) {
    case "specification":
      return FOLDERS.specifications;
    case "schedule":
      return FOLDERS.schedules;
    case "submittal":
      return FOLDERS.submittals;
    default:
      return FOLDERS.pdfs;
  }
}

/**
 * Generate a unique filename for storage
 */
function generateFilename(originalName: string, projectId?: string): string {
  const timestamp = Date.now();
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const prefix = projectId ? `${projectId}/` : "";
  return `${prefix}${timestamp}-${sanitizedName}`;
}

/**
 * Upload a PDF file to Vercel Blob storage
 */
export async function uploadPDF(
  file: File | Buffer | ArrayBuffer,
  originalFilename: string,
  documentType: DocumentType,
  projectId?: string
): Promise<{
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}> {
  const folder = getFolderForType(documentType);
  const filename = generateFilename(originalFilename, projectId);
  const pathname = `${folder}/${filename}`;

  // Convert to Blob if needed
  let uploadData: File | Blob | ArrayBuffer | Buffer;
  if (file instanceof File) {
    uploadData = file;
  } else if (file instanceof ArrayBuffer) {
    uploadData = new Blob([file], { type: "application/pdf" });
  } else {
    uploadData = file;
  }

  const blob = await put(pathname, uploadData, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || "application/pdf",
    size: typeof file === "object" && "size" in file ? file.size : 0,
  };
}

/**
 * Upload a PDF from base64 data
 */
export async function uploadPDFFromBase64(
  base64Data: string,
  originalFilename: string,
  documentType: DocumentType,
  projectId?: string
): Promise<{
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}> {
  // Remove data URL prefix if present
  const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, "");
  const buffer = Buffer.from(base64Clean, "base64");

  return uploadPDF(buffer, originalFilename, documentType, projectId);
}

/**
 * Delete a PDF file from storage
 */
export async function deletePDF(url: string): Promise<void> {
  await del(url);
}

/**
 * Delete multiple PDF files from storage
 */
export async function deletePDFs(urls: string[]): Promise<void> {
  await Promise.all(urls.map((url) => del(url)));
}

/**
 * Get metadata for a stored file
 */
export async function getPDFMetadata(url: string): Promise<{
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  url: string;
} | null> {
  try {
    const metadata = await head(url);
    return metadata;
  } catch {
    return null;
  }
}

/**
 * List all PDFs in a folder
 */
export async function listPDFs(
  documentType?: DocumentType,
  projectId?: string
): Promise<
  Array<{
    url: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
  }>
> {
  let prefix: string = FOLDERS.pdfs;

  if (documentType) {
    prefix = getFolderForType(documentType);
  }

  if (projectId) {
    prefix = `${prefix}/${projectId}`;
  }

  const { blobs } = await list({ prefix });

  return blobs.map((blob) => ({
    url: blob.url,
    pathname: blob.pathname,
    size: blob.size,
    uploadedAt: blob.uploadedAt,
  }));
}

/**
 * Upload a generated report (e.g., Excel, PDF export)
 */
export async function uploadReport(
  data: Buffer | ArrayBuffer | Blob,
  filename: string,
  contentType: string,
  projectId?: string
): Promise<{
  url: string;
  pathname: string;
}> {
  const prefix = projectId ? `${projectId}/` : "";
  const timestamp = Date.now();
  const pathname = `${FOLDERS.reports}/${prefix}${timestamp}-${filename}`;

  const blob = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

/**
 * Delete a report from storage
 */
export async function deleteReport(url: string): Promise<void> {
  await del(url);
}

/**
 * List all reports
 */
export async function listReports(projectId?: string): Promise<
  Array<{
    url: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
  }>
> {
  let prefix: string = FOLDERS.reports;

  if (projectId) {
    prefix = `${prefix}/${projectId}`;
  }

  const { blobs } = await list({ prefix });

  return blobs.map((blob) => ({
    url: blob.url,
    pathname: blob.pathname,
    size: blob.size,
    uploadedAt: blob.uploadedAt,
  }));
}

/**
 * Fetch PDF content from a blob URL
 */
export async function fetchPDFContent(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

/**
 * Fetch PDF as base64 for processing
 */
export async function fetchPDFAsBase64(url: string): Promise<string> {
  const arrayBuffer = await fetchPDFContent(url);
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}
