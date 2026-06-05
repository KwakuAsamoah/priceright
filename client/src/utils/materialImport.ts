import * as XLSX from 'xlsx';
import type { ImportMaterialRow } from '../api';
import { readImportDataRows } from './importWorkbook';

export type ParsedMaterialImportRow = {
  rowNumber: number;
  name: string;
  category: string;
  unit: string;
  currencyCode: string;
  bulkPriceRaw: string;
  bulkQuantityRaw: string;
  supplierType: string;
  errors: string[];
  parsed: ImportMaterialRow | null;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

export function getMaterialImportField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct != null && String(direct).trim() !== '') {
      return String(direct).trim();
    }
  }

  const normalizedKeys = keys.map(normalizeHeader);
  for (const [header, value] of Object.entries(row)) {
    if (value == null || String(value).trim() === '') continue;
    if (normalizedKeys.includes(normalizeHeader(header))) {
      return String(value).trim();
    }
  }

  return '';
}

export function detectWrongMaterialImportTemplate(headers: string[]): string | null {
  const normalized = headers.map(normalizeHeader);
  if (normalized.includes('intermediate name') || normalized.includes('yield %') || normalized.includes('overhead %')) {
    return 'This file looks like an Intermediate Materials template. Import it from Materials → Intermediate tab, or download the Primary Materials import template.';
  }
  return null;
}

function looksLikeMaterialHeader(headers: string[]): boolean {
  return normalizeHeader(headers[0] || '') === 'material name';
}

function isSkippableImportRow(row: Record<string, unknown>): boolean {
  const name = getMaterialImportField(row, ['Material Name', 'name']).toLowerCase();
  if (name === 'material name' || name === 'intermediate name') {
    return true;
  }

  const bulkPrice = getMaterialImportField(row, ['Bulk Price', 'bulkPrice']).toLowerCase();
  const bulkQty = getMaterialImportField(row, ['Bulk Quantity', 'bulkQuantity']).toLowerCase();
  if (bulkPrice === 'bulk price' || bulkQty === 'bulk quantity') {
    return true;
  }

  const yieldPct = getMaterialImportField(row, ['Yield %', 'yieldPercentage']);
  const marginPct = getMaterialImportField(row, ['Margin %', 'marginPercentage']);
  if (yieldPct || marginPct) {
    return true;
  }

  return false;
}

function resolveSupplierType(row: Record<string, unknown>): string {
  const supplierTypeRaw = getMaterialImportField(row, ['Supplier Type', 'supplierType']);
  if (supplierTypeRaw) {
    return supplierTypeRaw;
  }

  const supplierRaw = getMaterialImportField(row, ['Supplier', 'supplier']);
  if (['local', 'foreign'].includes(supplierRaw.toLowerCase())) {
    return supplierRaw;
  }

  return 'Local';
}

function parseLegacyPositionalRow(cells: string[], rowNumber: number): ParsedMaterialImportRow {
  const errors: string[] = [];

  const name = (cells[0] || '').trim();
  const category = (cells[1] || '').trim();
  const unit = (cells[2] || '').trim();
  const currencyCode = (cells[3] || '').trim().toUpperCase();
  const rawBulkPrice = (cells[4] || '').trim();
  const rawBulkQty = (cells[5] || '').trim();
  const supplierTypeRaw = (cells[6] || '').trim();
  const supplierType = supplierTypeRaw || 'Local';

  if (!name) errors.push('Material Name is required.');
  if (!category) errors.push('Category is required.');
  if (!unit) errors.push('Unit is required.');

  const bulkPriceNum = rawBulkPrice === '' ? NaN : parseFloat(rawBulkPrice.replace(/,/g, ''));
  if (rawBulkPrice === '') {
    errors.push('Bulk Price is required');
  } else if (isNaN(bulkPriceNum) || bulkPriceNum <= 0) {
    errors.push(`Bulk Price "${rawBulkPrice}" must be a positive number`);
  }

  const bulkQtyNum = rawBulkQty === '' ? NaN : parseFloat(rawBulkQty.replace(/,/g, ''));
  if (rawBulkQty === '') {
    errors.push('Bulk Quantity is required');
  } else if (isNaN(bulkQtyNum) || bulkQtyNum <= 0) {
    errors.push(`Bulk Quantity "${rawBulkQty}" must be a positive number`);
  }

  if (supplierTypeRaw && !['local', 'foreign'].includes(supplierTypeRaw.toLowerCase())) {
    errors.push('Supplier Type must be Local or Foreign.');
  }

  const parsed: ImportMaterialRow | null =
    errors.length === 0
      ? {
          name,
          category,
          unit,
          currencyCode,
          bulkPrice: bulkPriceNum,
          bulkQuantity: bulkQtyNum,
          supplierType,
        }
      : null;

  return {
    rowNumber,
    name,
    category,
    unit,
    currencyCode,
    bulkPriceRaw: rawBulkPrice,
    bulkQuantityRaw: rawBulkQty,
    supplierType,
    errors,
    parsed,
  };
}

export function parseMaterialImportRecord(
  row: Record<string, unknown>,
  rowNumber: number,
): ParsedMaterialImportRow {
  const errors: string[] = [];

  const name = getMaterialImportField(row, ['Material Name', 'name']);
  const category = getMaterialImportField(row, ['Category', 'category']);
  const unit = getMaterialImportField(row, ['Unit', 'unit']);
  const currencyCode = getMaterialImportField(row, ['Purchase Currency', 'Currency Code', 'currencyCode', 'currency']).toUpperCase();
  const rawBulkPrice = getMaterialImportField(row, ['Bulk Price', 'bulkPrice']);
  const rawBulkQty = getMaterialImportField(row, ['Bulk Quantity', 'bulkQuantity']);
  const supplierType = resolveSupplierType(row);
  const supplierTypeRaw = getMaterialImportField(row, ['Supplier Type', 'supplierType'])
    || (['local', 'foreign'].includes(getMaterialImportField(row, ['Supplier', 'supplier']).toLowerCase())
      ? getMaterialImportField(row, ['Supplier', 'supplier'])
      : '');

  if (!name) errors.push('Material Name is required.');
  if (!category) errors.push('Category is required.');
  if (!unit) errors.push('Unit is required.');

  const bulkPriceNum = rawBulkPrice === '' ? NaN : parseFloat(rawBulkPrice.replace(/,/g, ''));
  if (rawBulkPrice === '') {
    errors.push('Bulk Price is required');
  } else if (isNaN(bulkPriceNum) || bulkPriceNum <= 0) {
    errors.push(`Bulk Price "${rawBulkPrice}" must be a positive number`);
  }

  const bulkQtyNum = rawBulkQty === '' ? NaN : parseFloat(rawBulkQty.replace(/,/g, ''));
  if (rawBulkQty === '') {
    errors.push('Bulk Quantity is required');
  } else if (isNaN(bulkQtyNum) || bulkQtyNum <= 0) {
    errors.push(`Bulk Quantity "${rawBulkQty}" must be a positive number`);
  }

  if (supplierTypeRaw && !['local', 'foreign'].includes(supplierTypeRaw.toLowerCase())) {
    errors.push('Supplier Type must be Local or Foreign.');
  }

  const parsed: ImportMaterialRow | null =
    errors.length === 0
      ? {
          name,
          category,
          unit,
          currencyCode,
          bulkPrice: bulkPriceNum,
          bulkQuantity: bulkQtyNum,
          supplierType,
        }
      : null;

  return {
    rowNumber,
    name,
    category,
    unit,
    currencyCode,
    bulkPriceRaw: rawBulkPrice,
    bulkQuantityRaw: rawBulkQty,
    supplierType,
    errors,
    parsed,
  };
}

export function parseMaterialImportRecords(
  records: Record<string, unknown>[],
  headers: string[],
  legacyLines?: string[][],
): ParsedMaterialImportRow[] {
  const wrongTemplateMessage = detectWrongMaterialImportTemplate(headers);
  if (wrongTemplateMessage) {
    throw new Error(wrongTemplateMessage);
  }

  if (looksLikeMaterialHeader(headers)) {
    const result: ParsedMaterialImportRow[] = [];
    let rowNumber = 2;

    for (const record of records) {
      if (isSkippableImportRow(record)) {
        rowNumber += 1;
        continue;
      }
      if (Object.values(record).every((value) => String(value ?? '').trim() === '')) {
        rowNumber += 1;
        continue;
      }

      result.push(parseMaterialImportRecord(record, rowNumber));
      rowNumber += 1;
    }

    return result;
  }

  if (legacyLines) {
    return legacyLines.map((cells, index) => parseLegacyPositionalRow(cells, index + 1));
  }

  throw new Error(
    'Unrecognized file format. Download the Materials import template and keep the column headers in row 1.',
  );
}

export function parseMaterialImportCsv(
  fileText: string,
  parseCsvLine: (line: string) => string[],
  parseCsvText: (text: string) => string[],
): ParsedMaterialImportRow[] {
  const allLines = parseCsvText(fileText).filter((line) => line.length > 0 && !line.startsWith('#'));
  if (allLines.length === 0) return [];

  const headers = parseCsvLine(allLines[0]);
  const records = allLines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });

  const legacyLines = looksLikeMaterialHeader(headers)
    ? undefined
    : allLines.map((line) => parseCsvLine(line));

  return parseMaterialImportRecords(records, headers, legacyLines);
}

export async function parseMaterialImportFile(
  file: File,
  parseCsvLine: (line: string) => string[],
  parseCsvText: (text: string) => string[],
): Promise<ParsedMaterialImportRow[]> {
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  if (extension === 'csv') {
    const text = await file.text();
    return parseMaterialImportCsv(text, parseCsvLine, parseCsvText);
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const jsonData = readImportDataRows(workbook) as Record<string, unknown>[];
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    return parseMaterialImportRecords(jsonData, headers);
  }

  throw new Error('Only CSV and Excel (.xlsx, .xls) files are supported for materials import.');
}
