import * as XLSX from 'xlsx';

export function readImportDataRows(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const sheetName =
    workbook.SheetNames.find((name) => name === 'Import Data')
    ?? workbook.SheetNames[workbook.SheetNames.length - 1];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
}

export async function parseImportFileRows(file: File): Promise<Record<string, unknown>[]> {
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  if (extension === 'csv') {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));

    if (lines.length < 1) {
      throw new Error('CSV file is empty');
    }

    const headers = lines[0].split(',').map((header) => header.trim());
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(',').map((part) => part.trim());
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = parts[index] ?? '';
      });
      rows.push(row);
    }

    return rows;
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    return readImportDataRows(workbook);
  }

  throw new Error('Unsupported file type');
}
