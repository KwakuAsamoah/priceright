import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { settingsApi } from '../api';
import { formatExportNumber } from './exportFormat';

const NAVY: [number, number, number] = [15, 40, 71];
const ALT_ROW: [number, number, number] = [248, 250, 252];
const GREY_BORDER: [number, number, number] = [203, 213, 225];
const FOOTER_GREY: [number, number, number] = [148, 163, 184];
const SUBTITLE_GREY: [number, number, number] = [100, 116, 139];
const MARGIN = 14;
const HEADER_BOTTOM = 36;

export interface PDFColumn {
  header: string;
  dataKey: string;
  width?: number;
}

export interface PDFOptions {
  title: string;
  subtitle?: string;
  columns: PDFColumn[];
  rows: Record<string, unknown>[];
  landscape?: boolean;
  companyName?: string;
  filename?: string;
  footerText?: string;
}

async function resolveCompanyName(companyName?: string): Promise<string> {
  if (companyName?.trim()) {
    return companyName.trim();
  }
  try {
    const settings = await settingsApi.getAll();
    const companySetting = settings.find(
      (entry: { settingKey: string; settingValue: string }) => entry.settingKey === 'companyName',
    );
    if (companySetting?.settingValue?.trim()) {
      return companySetting.settingValue.trim();
    }
  } catch {
    // Use default.
  }
  return 'PriceRight';
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatExportNumber(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

function formatGeneratedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim() || 'export.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

function drawPageHeader(
  doc: jsPDF,
  company: string,
  title: string,
  subtitle: string | undefined,
  generatedDate: string,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(company, MARGIN, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SUBTITLE_GREY);
  doc.text(`Generated: ${generatedDate}`, pageWidth - MARGIN, 12, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(title, MARGIN, 20);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SUBTITLE_GREY);
    doc.text(subtitle, MARGIN, 27);
  }
}

function drawPageFooters(doc: jsPDF, company: string, footerText?: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...FOOTER_GREY);
    doc.text(company, MARGIN, pageHeight - 8);
    const pageLabel = footerText || `Page ${page} of ${totalPages}`;
    doc.text(pageLabel, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
}

function buildTablePdfDocument(
  options: PDFOptions,
  company: string,
  generatedDate: string,
): jsPDF {
  const landscape = options.landscape ?? false;
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const head = [options.columns.map((column) => column.header)];
  const body = options.rows.map((row) =>
    options.columns.map((column) => formatCellValue(row[column.dataKey])),
  );

  const columnStyles: Record<number, { cellWidth?: number }> = {};
  options.columns.forEach((column, index) => {
    if (column.width) {
      columnStyles[index] = { cellWidth: column.width };
    }
  });

  autoTable(doc, {
    head,
    body,
    startY: HEADER_BOTTOM,
    margin: { top: HEADER_BOTTOM, left: MARGIN, right: MARGIN, bottom: 14 },
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: GREY_BORDER,
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: ALT_ROW,
    },
    columnStyles,
    showHead: 'everyPage',
    didDrawPage: () => {
      drawPageHeader(doc, company, options.title, options.subtitle, generatedDate);
    },
  });

  drawPageFooters(doc, company, options.footerText);
  return doc;
}

export async function generateTablePDF(options: PDFOptions): Promise<void> {
  const company = await resolveCompanyName(options.companyName);
  const generatedDate = formatGeneratedDate();
  const doc = buildTablePdfDocument(options, company, generatedDate);
  doc.save(sanitizeFilename(options.filename || `${options.title}.pdf`));
}

export async function printTable(options: PDFOptions): Promise<void> {
  const company = await resolveCompanyName(options.companyName);
  const generatedDate = formatGeneratedDate();
  const doc = buildTablePdfDocument(options, company, generatedDate);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked. Allow pop-ups to open the PDF for printing.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function htmlToParagraphs(html: string): string[] {
  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks = container.querySelectorAll('p, li, h1, h2, h3, h4, blockquote');
  const paragraphs: string[] = [];

  blocks.forEach((element) => {
    const text = element.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (element.tagName === 'LI') {
      paragraphs.push(`• ${text}`);
      return;
    }
    paragraphs.push(text);
  });

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const fallback = container.textContent?.replace(/\s+/g, ' ').trim();
  return fallback ? [fallback] : [];
}

export function slugifyFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'article'}.pdf`;
}

export async function generateArticlePDF(options: {
  title: string;
  content: string;
  companyName?: string;
  filename?: string;
}): Promise<void> {
  const company = await resolveCompanyName(options.companyName);
  const generatedDate = formatGeneratedDate();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let cursorY = HEADER_BOTTOM;

  drawPageHeader(doc, company, options.title, undefined, generatedDate);
  cursorY = 42;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(options.title, contentWidth);
  doc.text(titleLines, MARGIN, cursorY);
  cursorY += titleLines.length * 7 + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);

  for (const paragraph of htmlToParagraphs(options.content)) {
    const lines = doc.splitTextToSize(paragraph, contentWidth);
    const blockHeight = lines.length * 5 + 4;

    if (cursorY + blockHeight > pageHeight - 16) {
      doc.addPage();
      drawPageHeader(doc, company, options.title, undefined, generatedDate);
      cursorY = HEADER_BOTTOM;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
    }

    doc.text(lines, MARGIN, cursorY);
    cursorY += blockHeight;
  }

  drawPageFooters(doc, company);
  doc.save(sanitizeFilename(options.filename || slugifyFilename(options.title)));
}
