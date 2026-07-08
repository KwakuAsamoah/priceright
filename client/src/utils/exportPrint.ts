import type { ColumnDef, ReportRow } from './reportExport';
import { formatExportNumber } from './exportFormat';
import { printHtmlContent } from './printPage';

function formatPrintCell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatExportNumber(value);
  }
  return String(value ?? '');
}

function escapeExportHtml(value: unknown): string {
  return formatPrintCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type PrintExportTableOptions = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<unknown>>;
  rightAlignFromColumn?: number;
  landscape?: boolean;
  fontSize?: string;
};

export async function printExportTable(options: PrintExportTableOptions): Promise<boolean> {
  const rightAlignFrom = options.rightAlignFromColumn ?? Number.POSITIVE_INFINITY;
  const headerCells = options.headers
    .map((header, index) => {
      const align = index >= rightAlignFrom ? 'right' : 'left';
      return `<th style="text-align:${align};">${escapeExportHtml(header)}</th>`;
    })
    .join('');

  const bodyRows = options.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => {
          const align = index >= rightAlignFrom ? 'right' : 'left';
          return `<td style="text-align:${align};">${escapeExportHtml(cell)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const printedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const tableFontSize = options.fontSize || '12px';
  const pageSize = options.landscape ? 'A4 landscape' : 'A4 portrait';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeExportHtml(options.title)}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: ${tableFontSize}; color: #0f172a; padding: 32px 40px; }
          h1 { margin: 0 0 6px; font-size: 20px; }
          .meta { margin: 0 0 20px; font-size: 12px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: ${tableFontSize}; }
          th { background: #0f172a; color: #ffffff; }
          @page { size: ${pageSize}; margin: 12mm; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeExportHtml(options.title)}</h1>
        <div class="meta">
          ${escapeExportHtml(options.subtitle || '')}
          ${options.subtitle ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : ''}
          Printed: ${escapeExportHtml(printedDate)}
        </div>
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;

  return printHtmlContent(html, { landscape: options.landscape });
}

export function printReportPayload(
  title: string,
  subtitle: string | undefined,
  columns: ColumnDef[],
  rows: ReportRow[],
): Promise<boolean> {
  const headers = columns.map((column) => column.label);
  const dataRows = rows.map((row) => columns.map((column) => row[column.key] ?? ''));
  const firstNumericColumn = columns.findIndex((column) => {
    const sample = rows.find((row) => {
      const value = row[column.key];
      return typeof value === 'number' && Number.isFinite(value);
    });
    return sample != null;
  });

  return printExportTable({
    title,
    subtitle,
    headers,
    rows: dataRows,
    rightAlignFromColumn: firstNumericColumn >= 0 ? firstNumericColumn : undefined,
  });
}
