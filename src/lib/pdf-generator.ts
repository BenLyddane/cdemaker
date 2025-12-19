/**
 * PDF Generator for CDE Reports
 * Generates annotated PDFs showing spec and submittal pages with C/D/E status
 */

import { jsPDF } from "jspdf";
import type { ExtractedRow, CDEStatus } from "./types";
import type { PageData } from "./pdf-utils";

// Status colors and labels
const STATUS_CONFIG: Record<CDEStatus, { color: [number, number, number]; label: string; bgColor: [number, number, number] }> = {
  comply: { color: [11, 134, 75], label: "C", bgColor: [178, 255, 218] },      // Green
  deviate: { color: [204, 147, 0], label: "D", bgColor: [255, 236, 170] },     // Yellow
  exception: { color: [236, 67, 67], label: "E", bgColor: [255, 218, 218] },   // Red
  not_found: { color: [147, 51, 234], label: "?", bgColor: [243, 232, 255] },  // Purple
  pending: { color: [108, 108, 113], label: "P", bgColor: [237, 237, 237] },   // Gray
};

interface PDFGeneratorOptions {
  projectName?: string;
  includeUnreviewed?: boolean;
}

interface PageAnnotation {
  itemNumber: number;
  row: ExtractedRow;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Generate a CDE report PDF
 */
export async function generateCDEPdf(
  specPages: PageData[],
  submittalPages: PageData[],
  extractedRows: ExtractedRow[],
  options: PDFGeneratorOptions = {}
): Promise<Blob> {
  const { projectName = "CDE Report", includeUnreviewed = true } = options;
  
  // Filter rows based on options
  const rowsToInclude = includeUnreviewed 
    ? extractedRows 
    : extractedRows.filter(r => r.isReviewed || r.cdeStatus);
  
  // Create PDF in landscape for better page viewing
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);
  
  // =========================================================================
  // Title/Summary Page
  // =========================================================================
  addTitlePage(pdf, projectName, rowsToInclude, pageWidth, pageHeight, margin);
  
  // =========================================================================
  // Specification Pages
  // =========================================================================
  if (specPages.length > 0 && rowsToInclude.length > 0) {
    // Group rows by spec page
    const rowsBySpecPage = new Map<number, ExtractedRow[]>();
    rowsToInclude.forEach(row => {
      const pageNum = row.pageNumber;
      if (!rowsBySpecPage.has(pageNum)) {
        rowsBySpecPage.set(pageNum, []);
      }
      rowsBySpecPage.get(pageNum)!.push(row);
    });
    
    // Add section header
    pdf.addPage();
    addSectionHeader(pdf, "PART 1: SPECIFICATION PAGES", pageWidth, margin);
    
    // Add each spec page that has extracted data
    for (const specPage of specPages) {
      const pageRows = rowsBySpecPage.get(specPage.pageNumber);
      if (!pageRows || pageRows.length === 0) continue;
      
      pdf.addPage();
      await addAnnotatedPage(
        pdf, 
        specPage, 
        pageRows, 
        "spec",
        pageWidth, 
        pageHeight, 
        margin, 
        contentWidth
      );
    }
  }
  
  // =========================================================================
  // Submittal Pages (ALL pages, not just matched ones)
  // =========================================================================
  if (submittalPages.length > 0) {
    // Group rows by submittal page for annotation
    const rowsBySubmittalPage = new Map<number, ExtractedRow[]>();
    rowsToInclude.forEach(row => {
      if (row.submittalLocation?.pageNumber) {
        const pageNum = row.submittalLocation.pageNumber;
        if (!rowsBySubmittalPage.has(pageNum)) {
          rowsBySubmittalPage.set(pageNum, []);
        }
        rowsBySubmittalPage.get(pageNum)!.push(row);
      }
    });
    
    // Add section header
    pdf.addPage();
    addSectionHeader(pdf, "PART 2: SUBMITTAL PAGES", pageWidth, margin);
    
    // Add ALL submittal pages (annotated if they have matched data)
    for (const submittalPage of submittalPages) {
      const pageRows = rowsBySubmittalPage.get(submittalPage.pageNumber) || [];
      
      pdf.addPage();
      await addAnnotatedPage(
        pdf, 
        submittalPage, 
        pageRows, 
        "submittal",
        pageWidth, 
        pageHeight, 
        margin, 
        contentWidth
      );
    }
  }
  
  // =========================================================================
  // PART 3: Detailed Data Table (Full Data Appendix)
  // =========================================================================
  if (rowsToInclude.length > 0) {
    pdf.addPage();
    addSectionHeader(pdf, "PART 3: DETAILED DATA TABLE", pageWidth, margin);
    
    pdf.addPage();
    addDetailedDataTable(pdf, rowsToInclude, pageWidth, pageHeight, margin);
  }
  
  // Return as blob
  return pdf.output("blob");
}

/**
 * Add title/summary page
 */
function addTitlePage(
  pdf: jsPDF,
  projectName: string,
  rows: ExtractedRow[],
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const centerX = pageWidth / 2;
  
  // Title
  pdf.setFontSize(28);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(42, 42, 47); // Neutral 800
  pdf.text("CDE Report", centerX, margin + 60, { align: "center" });
  
  // Project name
  pdf.setFontSize(18);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(108, 108, 113); // Neutral 600
  pdf.text(projectName, centerX, margin + 95, { align: "center" });
  
  // Date
  pdf.setFontSize(12);
  const date = new Date().toLocaleDateString("en-US", { 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  pdf.text(`Generated: ${date}`, centerX, margin + 120, { align: "center" });
  
  // Summary stats
  const summary = {
    total: rows.length,
    comply: rows.filter(r => r.cdeStatus === "comply").length,
    deviate: rows.filter(r => r.cdeStatus === "deviate").length,
    exception: rows.filter(r => r.cdeStatus === "exception").length,
    notFound: rows.filter(r => r.cdeStatus === "not_found").length,
    pending: rows.filter(r => !r.cdeStatus || r.cdeStatus === "pending").length,
    // Reviewed = any item with a definitive status (C/D/E/?)
    reviewed: rows.filter(r => r.cdeStatus && r.cdeStatus !== "pending").length,
  };
  
  const summaryY = margin + 180;
  const boxWidth = 85;
  const boxHeight = 70;
  const gap = 15;
  const totalBoxWidth = (boxWidth * 5) + (gap * 4);
  const startX = (pageWidth - totalBoxWidth) / 2;
  
  // Summary boxes
  const boxes = [
    { label: "Comply", count: summary.comply, color: STATUS_CONFIG.comply },
    { label: "Deviate", count: summary.deviate, color: STATUS_CONFIG.deviate },
    { label: "Exception", count: summary.exception, color: STATUS_CONFIG.exception },
    { label: "Not Found", count: summary.notFound, color: STATUS_CONFIG.not_found },
    { label: "Pending", count: summary.pending, color: STATUS_CONFIG.pending },
  ];
  
  boxes.forEach((box, i) => {
    const x = startX + (i * (boxWidth + gap));
    
    // Background
    pdf.setFillColor(...box.color.bgColor);
    pdf.roundedRect(x, summaryY, boxWidth, boxHeight, 8, 8, "F");
    
    // Count
    pdf.setFontSize(28);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...box.color.color);
    pdf.text(String(box.count), x + boxWidth / 2, summaryY + 35, { align: "center" });
    
    // Label
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text(box.label, x + boxWidth / 2, summaryY + 55, { align: "center" });
  });
  
  // Total items
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(42, 42, 47);
  pdf.text(`Total Items: ${summary.total}`, centerX, summaryY + boxHeight + 40, { align: "center" });
  pdf.text(`Reviewed: ${summary.reviewed} / ${summary.total}`, centerX, summaryY + boxHeight + 60, { align: "center" });
  
  // Legend explanation
  const legendY = summaryY + boxHeight + 120;
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("Legend", margin, legendY);
  
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  const legendItems = [
    { badge: "C", label: "Comply - Submittal meets specification requirements", color: STATUS_CONFIG.comply },
    { badge: "D", label: "Deviate - Submittal differs from specification but may be acceptable", color: STATUS_CONFIG.deviate },
    { badge: "E", label: "Exception - Submittal does not meet specification requirements", color: STATUS_CONFIG.exception },
    { badge: "?", label: "Not Found - Could not locate matching value in submittal", color: STATUS_CONFIG.not_found },
    { badge: "P", label: "Pending - Not yet reviewed", color: STATUS_CONFIG.pending },
  ];
  
  legendItems.forEach((item, i) => {
    const y = legendY + 25 + (i * 25);
    
    // Badge
    pdf.setFillColor(...item.color.bgColor);
    pdf.roundedRect(margin, y - 10, 20, 16, 3, 3, "F");
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...item.color.color);
    pdf.text(item.badge, margin + 10, y, { align: "center" });
    
    // Label
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(83, 82, 87); // Neutral 700
    pdf.text(item.label, margin + 30, y);
  });
}

/**
 * Add section header page
 */
function addSectionHeader(
  pdf: jsPDF,
  title: string,
  pageWidth: number,
  margin: number
) {
  const centerX = pageWidth / 2;
  
  pdf.setFontSize(24);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(74, 58, 255); // BV Blue 400
  pdf.text(title, centerX, 100, { align: "center" });
  
  // Decorative line
  pdf.setDrawColor(74, 58, 255);
  pdf.setLineWidth(2);
  pdf.line(margin + 100, 120, pageWidth - margin - 100, 120);
}

/**
 * Add an annotated page with bounding boxes and legend
 */
async function addAnnotatedPage(
  pdf: jsPDF,
  pageData: PageData,
  rows: ExtractedRow[],
  type: "spec" | "submittal",
  pageWidth: number,
  pageHeight: number,
  margin: number,
  contentWidth: number
) {
  // Layout: Image on left (60%), Legend on right (40%)
  const imageWidth = contentWidth * 0.58;
  const legendWidth = contentWidth * 0.38;
  const legendX = margin + imageWidth + (contentWidth * 0.04);
  
  // Page header
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(108, 108, 113);
  const headerText = type === "spec" 
    ? `Specification - Page ${pageData.pageNumber}`
    : `Submittal - Page ${pageData.pageNumber}`;
  pdf.text(headerText, margin, margin - 10);
  
  // Add the page image
  const imageY = margin;
  const imgData = `data:${pageData.mimeType};base64,${pageData.base64}`;
  
  // Calculate image dimensions to fit
  const maxImageHeight = pageHeight - margin * 2 - 20;
  
  // Estimate aspect ratio (assuming standard document)
  const aspectRatio = 8.5 / 11; // Letter paper
  let imgDisplayWidth = imageWidth;
  let imgDisplayHeight = imgDisplayWidth / aspectRatio;
  
  if (imgDisplayHeight > maxImageHeight) {
    imgDisplayHeight = maxImageHeight;
    imgDisplayWidth = imgDisplayHeight * aspectRatio;
  }
  
  // Add image
  try {
    pdf.addImage(imgData, "PNG", margin, imageY, imgDisplayWidth, imgDisplayHeight);
  } catch (e) {
    // If image fails, add placeholder
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, imageY, imgDisplayWidth, imgDisplayHeight, "F");
    pdf.setFontSize(12);
    pdf.setTextColor(150, 150, 150);
    pdf.text("Image could not be loaded", margin + imgDisplayWidth / 2, imageY + imgDisplayHeight / 2, { align: "center" });
  }
  
  // Draw bounding boxes on the image
  rows.forEach((row, index) => {
    const bbox = type === "spec" 
      ? row.location?.boundingBox 
      : row.submittalLocation?.boundingBox;
    
    if (bbox) {
      const boxX = margin + (bbox.x * imgDisplayWidth);
      const boxY = imageY + (bbox.y * imgDisplayHeight);
      const boxW = bbox.width * imgDisplayWidth;
      const boxH = bbox.height * imgDisplayHeight;
      
      // Get status color with defensive check
      const rawStatus = row.cdeStatus;
      const status = (rawStatus && STATUS_CONFIG[rawStatus]) ? rawStatus : "pending";
      const statusConfig = STATUS_CONFIG[status];
      
      // Draw bounding box
      pdf.setDrawColor(...statusConfig.color);
      pdf.setLineWidth(1.5);
      pdf.rect(boxX, boxY, boxW, boxH);
      
      // Draw item number badge to the left of bounding box
      const badgeSize = 14;
      const badgeX = boxX - badgeSize - 4;
      const badgeY = boxY;
      
      // Badge background
      pdf.setFillColor(...statusConfig.bgColor);
      pdf.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 2, 2, "F");
      
      // Badge text (item number)
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...statusConfig.color);
      pdf.text(String(index + 1), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 3, { align: "center" });
      
      // Status badge next to number
      const statusBadgeX = badgeX - badgeSize - 2;
      pdf.setFillColor(...statusConfig.bgColor);
      pdf.roundedRect(statusBadgeX, badgeY, badgeSize, badgeSize, 2, 2, "F");
      pdf.text(statusConfig.label, statusBadgeX + badgeSize / 2, badgeY + badgeSize / 2 + 3, { align: "center" });
    }
  });
  
  // Legend section on the right
  const legendY = margin;
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(42, 42, 47);
  pdf.text("Items on this page:", legendX, legendY);
  
  // Add each item to legend
  let currentY = legendY + 20;
  const lineHeight = 12;
  const maxLegendHeight = pageHeight - margin * 2 - 40;
  
  rows.forEach((row, index) => {
    if (currentY > legendY + maxLegendHeight - 60) {
      // Too many items, add "and X more..."
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(108, 108, 113);
      pdf.text(`... and ${rows.length - index} more items`, legendX, currentY);
      return;
    }
    
    // Get status color with defensive check
    const rawStatus = row.cdeStatus;
    const status = (rawStatus && STATUS_CONFIG[rawStatus]) ? rawStatus : "pending";
    const statusConfig = STATUS_CONFIG[status];
    
    // Item number and status badge
    const badgeWidth = 18;
    pdf.setFillColor(...statusConfig.bgColor);
    pdf.roundedRect(legendX, currentY - 9, badgeWidth, 12, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...statusConfig.color);
    pdf.text(`${index + 1}`, legendX + badgeWidth / 2, currentY - 1, { align: "center" });
    
    // Status badge
    pdf.setFillColor(...statusConfig.bgColor);
    pdf.roundedRect(legendX + badgeWidth + 4, currentY - 9, 14, 12, 2, 2, "F");
    pdf.text(statusConfig.label, legendX + badgeWidth + 11, currentY - 1, { align: "center" });
    
    // Field name
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(42, 42, 47);
    const fieldText = truncateText(row.field, 25);
    pdf.text(fieldText, legendX + badgeWidth + 24, currentY - 1);
    
    currentY += lineHeight;
    
    // Value (for spec) or spec reference (for submittal)
    if (type === "spec") {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(83, 82, 87);
      const valueText = truncateText(row.value, 35);
      pdf.text(valueText, legendX + 8, currentY - 1);
    } else {
      // For submittal, show spec number reference
      if (row.specNumber) {
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(74, 58, 255);
        pdf.text(`Spec §${row.specNumber}`, legendX + 8, currentY - 1);
      }
    }
    
    currentY += lineHeight;
    
    // Explanation/comment
    if (row.cdeComment) {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(108, 108, 113);
      const commentLines = wrapText(row.cdeComment, 40);
      commentLines.slice(0, 2).forEach(line => {
        pdf.text(line, legendX + 8, currentY - 1);
        currentY += lineHeight - 2;
      });
      if (commentLines.length > 2) {
        pdf.text("...", legendX + 8, currentY - 1);
        currentY += lineHeight - 2;
      }
    }
    
    currentY += 8; // Gap between items
  });
}

/**
 * Truncate text to max characters
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + "...";
}

/**
 * Wrap text to multiple lines
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  words.forEach(word => {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Add detailed data table showing all data without truncation
 */
function addDetailedDataTable(
  pdf: jsPDF,
  rows: ExtractedRow[],
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const contentWidth = pageWidth - (margin * 2);
  const lineHeight = 14;
  const headerHeight = 30;
  let currentY = margin + 20;
  
  // Column widths (proportional)
  const colWidths = {
    status: contentWidth * 0.06,
    spec: contentWidth * 0.10,
    field: contentWidth * 0.20,
    specValue: contentWidth * 0.22,
    submittalValue: contentWidth * 0.22,
    comment: contentWidth * 0.20,
  };
  
  // Column positions
  const colX = {
    status: margin,
    spec: margin + colWidths.status,
    field: margin + colWidths.status + colWidths.spec,
    specValue: margin + colWidths.status + colWidths.spec + colWidths.field,
    submittalValue: margin + colWidths.status + colWidths.spec + colWidths.field + colWidths.specValue,
    comment: margin + colWidths.status + colWidths.spec + colWidths.field + colWidths.specValue + colWidths.submittalValue,
  };
  
  // Draw table header
  const drawTableHeader = () => {
    // Header background
    pdf.setFillColor(74, 58, 255); // BV Blue
    pdf.rect(margin, currentY, contentWidth, headerHeight, "F");
    
    // Header text
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    
    pdf.text("Status", colX.status + 4, currentY + 18);
    pdf.text("Spec #", colX.spec + 4, currentY + 18);
    pdf.text("Field", colX.field + 4, currentY + 18);
    pdf.text("Spec Value", colX.specValue + 4, currentY + 18);
    pdf.text("Submittal Value", colX.submittalValue + 4, currentY + 18);
    pdf.text("Comment", colX.comment + 4, currentY + 18);
    
    currentY += headerHeight;
  };
  
  // Check if we need a new page
  const checkNewPage = (requiredHeight: number) => {
    if (currentY + requiredHeight > pageHeight - margin) {
      pdf.addPage();
      currentY = margin + 20;
      drawTableHeader();
    }
  };
  
  // Draw initial header
  drawTableHeader();
  
  // Draw each row
  rows.forEach((row, index) => {
    // Calculate row height based on content
    const fieldLines = wrapText(row.field || "", 20);
    const specValueLines = wrapText(row.value || "", 22);
    const submittalValueLines = wrapText(row.submittalValue || "—", 22);
    const commentLines = wrapText(row.cdeComment || "", 20);
    
    const maxLines = Math.max(
      fieldLines.length,
      specValueLines.length,
      submittalValueLines.length,
      commentLines.length,
      1
    );
    const rowHeight = Math.max(maxLines * lineHeight + 10, 30);
    
    // Check if we need new page
    checkNewPage(rowHeight);
    
    // Alternating row background
    if (index % 2 === 0) {
      pdf.setFillColor(248, 248, 248);
      pdf.rect(margin, currentY, contentWidth, rowHeight, "F");
    }
    
    // Get status config
    const rawStatus = row.cdeStatus;
    const status = (rawStatus && STATUS_CONFIG[rawStatus]) ? rawStatus : "pending";
    const statusConfig = STATUS_CONFIG[status];
    
    // Status badge
    const badgeY = currentY + 6;
    pdf.setFillColor(...statusConfig.bgColor);
    pdf.roundedRect(colX.status + 4, badgeY, 20, 16, 3, 3, "F");
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...statusConfig.color);
    pdf.text(statusConfig.label, colX.status + 14, badgeY + 11, { align: "center" });
    
    // Text content
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(42, 42, 47);
    
    // Spec number
    pdf.text(row.specNumber || "—", colX.spec + 4, currentY + 16);
    
    // Field name (wrapped)
    let textY = currentY + 16;
    fieldLines.forEach(line => {
      pdf.text(line, colX.field + 4, textY);
      textY += lineHeight;
    });
    
    // Spec value (wrapped)
    textY = currentY + 16;
    specValueLines.forEach(line => {
      pdf.text(line, colX.specValue + 4, textY);
      textY += lineHeight;
    });
    
    // Submittal value (wrapped)
    textY = currentY + 16;
    pdf.setTextColor(status === "not_found" ? 147 : 42, status === "not_found" ? 51 : 42, status === "not_found" ? 234 : 47);
    submittalValueLines.forEach(line => {
      pdf.text(line, colX.submittalValue + 4, textY);
      textY += lineHeight;
    });
    
    // Comment (wrapped)
    textY = currentY + 16;
    pdf.setTextColor(108, 108, 113);
    pdf.setFont("helvetica", "italic");
    commentLines.forEach(line => {
      pdf.text(line, colX.comment + 4, textY);
      textY += lineHeight;
    });
    
    // Draw row border
    pdf.setDrawColor(201, 203, 207);
    pdf.setLineWidth(0.5);
    pdf.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);
    
    currentY += rowHeight;
  });
  
  // Draw table borders
  pdf.setDrawColor(201, 203, 207);
  pdf.setLineWidth(1);
  pdf.rect(margin, margin + 20, contentWidth, currentY - margin - 20);
  
  // Draw column borders
  Object.values(colX).forEach(x => {
    pdf.line(x, margin + 20, x, currentY);
  });
}

/**
 * Trigger download of the PDF
 */
export function downloadPdf(blob: Blob, filename: string = "cde-report.pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
