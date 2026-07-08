import * as XLSX from 'xlsx';

export type ReportCell = string | number | boolean | null | undefined;
export type ReportRow = Record<string, ReportCell>;
export type ColumnDef = { key: string; label: string };

type WorkbookSheet = {
  name: string;
  rows: ReportRow[];
  columns: ColumnDef[];
};

function toCsvCellValue(value: ReportCell): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toWorksheetRows(rows: ReportRow[], columns: ColumnDef[]) {
  return rows.map((row) => {
    const normalized: Record<string, ReportCell> = {};
    columns.forEach((column) => {
      const value = row[column.key];
      normalized[column.label] = value === null || value === undefined ? '' : value;
    });
    return normalized;
  });
}

export function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const previousTitle = document.title;
  const sanitizedFilename = (filename || 'report').replace(/\.pdf$/i, '');
  document.title = sanitizedFilename;

  element.classList.add('printable-report');

  window.setTimeout(() => {
    window.print();
    element.classList.remove('printable-report');
    document.title = previousTitle;
  }, 40);
}

export async function exportInChunks<T>(
  rows: T[],
  processChunk: (chunk: T[]) => void,
  chunkSize = 100,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    processChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function exportToExcel(data: ReportRow[], columns: ColumnDef[], filename: string) {
  exportToExcelWorkbook(
    [
      {
        name: 'Report',
        rows: data,
        columns,
      },
    ],
    filename,
  );
}

export async function exportToExcelWorkbookAsync(sheets: WorkbookSheet[], filename: string) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheetRows: Record<string, ReportCell>[] = [];
    await exportInChunks(sheet.rows, (chunk) => {
      chunk.forEach((row) => {
        const normalized: Record<string, ReportCell> = {};
        sheet.columns.forEach((column) => {
          const value = row[column.key];
          normalized[column.label] = value === null || value === undefined ? '' : value;
        });
        worksheetRows.push(normalized);
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
    worksheet['!cols'] = sheet.columns.map((column) => ({
      wch: Math.max(14, column.label.length + 2),
    }));

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet');
  }

  const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeName);
}

export function exportToExcelWorkbook(sheets: WorkbookSheet[], filename: string) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheetRows = toWorksheetRows(sheet.rows, sheet.columns);
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
    worksheet['!cols'] = sheet.columns.map((column) => ({
      wch: Math.max(14, column.label.length + 2),
    }));

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet');
  });

  const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeName);
}

export function exportToCsv(data: ReportRow[], columns: ColumnDef[], filename: string) {
  const headers = columns.map((column) => toCsvCellValue(column.label)).join(',');
  const lines = data.map((row) => columns.map((column) => toCsvCellValue(row[column.key] ?? '')).join(','));
  const csv = [headers, ...lines].join('\r\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const safeName = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
