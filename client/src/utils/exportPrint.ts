import type { ColumnDef, ReportRow } from './reportExport';

function escapeExportHtml(value: unknown): string {
  return String(value ?? '')
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
};

export function printExportTable(options: PrintExportTableOptions): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }

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

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeExportHtml(options.title)}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #0f172a; padding: 32px 40px; }
          h1 { margin: 0 0 6px; font-size: 20px; }
          .meta { margin: 0 0 20px; font-size: 12px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 12px; }
          th { background: #0f172a; color: #ffffff; }
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
  `);

  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
  return true;
}

export function printReportPayload(
  title: string,
  subtitle: string | undefined,
  columns: ColumnDef[],
  rows: ReportRow[],
): boolean {
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
