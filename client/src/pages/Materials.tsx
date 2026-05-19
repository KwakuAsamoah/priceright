import * as XLSX from 'xlsx';
import { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowDownToLine, BarChart2, CheckCircle2, Clock3, Copy, Eye, EyeOff, FileSpreadsheet, FileText, FileUp, Loader2, Pencil, Plus, Printer, Settings2, Tags, Trash2, Upload, X } from 'lucide-react';
import OverflowMenu from '../components/OverflowMenu';
import TableSettingsDropdown from '../components/TableSettingsDropdown';
import ActionDropdown from '../components/ActionDropdown';
import { materialsApi, currenciesApi, exchangeRatesApi, settingsApi, templateUrl, downloadTemplate } from '../api';
import type { ImportMaterialRow, ImportResult } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import useAppToast from '../hooks/useAppToast';
import usePersistedColumns from '../hooks/usePersistedColumns';
import useUndoAction from '../hooks/useUndoAction';

interface Material {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category: string;
  unit: string;
  bulkQuantity: string;
  bulkPrice: string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode: string;
  purchaseCurrencySymbol: string;
  baseCurrencySymbol: string;
  unitPrice: string;
  supplier: string;
  isActive: boolean;
}

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

interface ExchangeRate {
  id: number;
  currencyId: number;
  rateToBase: number;
  effectiveDate?: string | number | null;
  updatedAt?: string | number | null;
}

interface ExchangeRateRecalculationSummary {
  materialsUpdated: number;
  productsReviewed: number;
  productsNowNeedsReview: number;
}

interface ExchangeRateUpdateResponse {
  success?: boolean;
  rate?: ExchangeRate;
  recalculation?: ExchangeRateRecalculationSummary;
  recalculationFailed?: boolean;
}

interface MaterialUsage {
  materialId: number;
  materialName: string;
  productCount: number;
  products: string[];
}

interface UsageCheckResult {
  canDelete: number[];
  inUse: MaterialUsage[];
}

type MaterialColumnKey =
  | 'material'
  | 'category'
  | 'unit'
  | 'unitCost'
  | 'bulkPricing'
  | 'supplier'
  | 'status'
  | 'actions';

const MATERIAL_COLUMN_OPTIONS: Array<{ key: MaterialColumnKey; label: string }> = [
  { key: 'material', label: 'Material Name' },
  { key: 'category', label: 'Category' },
  { key: 'unit', label: 'Unit' },
  { key: 'unitCost', label: 'Unit Cost' },
  { key: 'bulkPricing', label: 'Bulk Pricing' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' },
];

const DEFAULT_MATERIAL_COLUMNS: MaterialColumnKey[] = MATERIAL_COLUMN_OPTIONS.map((option) => option.key);

function parseConfiguredList(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  const text = rawValue.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0);
    }
  } catch {
    // Ignore and fallback to delimited parsing
  }

  return text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeChoiceValue(selectedValue: string, customValue: string, fallback = '') {
  const resolved = selectedValue === '__custom__' ? customValue : selectedValue;
  const trimmed = resolved.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
}

function buildDuplicateName(baseName: string, existingNames: Set<string>) {
  const normalizedBase = (baseName || 'Untitled Material').trim();
  let candidate = `${normalizedBase} (Copy)`;
  let counter = 2;
  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${normalizedBase} (Copy ${counter})`;
    counter += 1;
  }
  return candidate;
}

function formatListMessage(title: string, lines: string[]) {
  const cleanLines = lines.filter((line) => line && line.trim().length > 0);
  if (cleanLines.length === 0) return title;
  return [title, ...cleanLines.map((line) => `• ${line}`)].join('\n');
}

function formatRateValue(value: number) {
  return Number(value || 0).toFixed(2);
}

function getCurrencyFlag(code: string) {
  const map: Record<string, string> = {
    USD: 'US',
    EUR: 'EU',
    GBP: 'GB',
    CAD: 'CA',
    AUD: 'AU',
    JPY: 'JP',
    CNY: 'CN',
    ZAR: 'ZA',
    NGN: 'NG',
    KES: 'KE',
  };

  const countryCode = map[(code || '').toUpperCase()];
  if (!countryCode || countryCode.length !== 2) return '';

  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

function parseDateInput(value: string | number | null | undefined): Date | null {
  if (value == null) return null;
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

type ParsedImportPreviewRow = {
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

interface MaterialsPageProps {
  materialType?: 'primary' | 'intermediate';
}

export default function Materials({ materialType = 'primary' }: MaterialsPageProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState('GHS');
  const [editingRateCurrencyId, setEditingRateCurrencyId] = useState<number | null>(null);
  const [editingRateValue, setEditingRateValue] = useState('');
  const [savingRateCurrencyId, setSavingRateCurrencyId] = useState<number | null>(null);
  const [recentlySavedCurrencyId, setRecentlySavedCurrencyId] = useState<number | null>(null);
  const [exchangeRateNotice, setExchangeRateNotice] = useState('');
  const [configuredMaterialCategories, setConfiguredMaterialCategories] = useState<string[]>([]);
  const [configuredMaterialUnits, setConfiguredMaterialUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [visibleColumns, setVisibleColumns] = usePersistedColumns<MaterialColumnKey>(
    'priceright_columns_materials',
    DEFAULT_MATERIAL_COLUMNS,
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<number>>(new Set());
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ParsedImportPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importRuntimeError, setImportRuntimeError] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState<Material | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedMaterialForUsage, setSelectedMaterialForUsage] = useState<Material | null>(null);
  const [selectedMaterialUsage, setSelectedMaterialUsage] = useState<MaterialUsage | null>(null);
  const [loadingMaterialUsage, setLoadingMaterialUsage] = useState(false);
  
  // New state for bulk actions
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = useState('');
  const [bulkCustomCategoryValue, setBulkCustomCategoryValue] = useState('');
  const materialsTableSettingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [usageData, setUsageData] = useState<UsageCheckResult | null>(null);
  const [loadingUsageCheck, setLoadingUsageCheck] = useState(false);
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  useUndoAction();

  const [materialCustomCategoryValue, setMaterialCustomCategoryValue] = useState('');
  const [materialCustomUnitValue, setMaterialCustomUnitValue] = useState('');
  const MAX_IMPORT_ROWS = 500;

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    unit: 'kg',
    bulkQuantity: '',
    bulkPrice: '',
    purchaseCurrencyId: 0,
    supplier: '',
  });

  useEffect(() => {
    loadData(selectedStatus);
  }, [selectedStatus]);

  useEffect(() => {
    if (recentlySavedCurrencyId == null) return;
    const timeout = window.setTimeout(() => setRecentlySavedCurrencyId(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [recentlySavedCurrencyId]);

  useEffect(() => {
    if (!exchangeRateNotice) return;
    const timeout = window.setTimeout(() => setExchangeRateNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [exchangeRateNotice]);

  async function loadData(statusFilter: 'all' | 'active' | 'inactive' = selectedStatus) {
    try {
      const [materialsData, currenciesData, settingsData, exchangeRatesData] = await Promise.all([
        materialsApi.getAll(statusFilter, materialType),
        currenciesApi.getAll(),
        settingsApi.getAll(),
        exchangeRatesApi.getAll(),
      ]);
      const safeMaterials = Array.isArray(materialsData) ? materialsData : [];
      const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];
      const safeExchangeRates = Array.isArray(exchangeRatesData) ? exchangeRatesData : [];

      setMaterials(safeMaterials);
      setCurrencies(safeCurrencies.filter((c: Currency) => c.isActive));
      setExchangeRates(safeExchangeRates);

      const materialCategoriesSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'materialCategories');
      const materialUnitsSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'materialUnits');
      const baseCurrencySetting = (settingsData || []).find((entry: any) => entry.settingKey === 'baseCurrency');
      setConfiguredMaterialCategories(parseConfiguredList(materialCategoriesSetting?.settingValue));
      setConfiguredMaterialUnits(parseConfiguredList(materialUnitsSetting?.settingValue));
      setBaseCurrencyCode(baseCurrencySetting?.settingValue || 'GHS');

      if (safeCurrencies.length > 0) {
        setFormData((prev) => ({ ...prev, purchaseCurrencyId: safeCurrencies[0].id }));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setMaterials([]);
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const resolvedCategory = normalizeChoiceValue(formData.category, materialCustomCategoryValue);
      const resolvedUnit = normalizeChoiceValue(formData.unit, materialCustomUnitValue, 'kg');

      if (!resolvedCategory || !resolvedUnit) {
        showToastMessage('Please provide both category and unit of measurement', 'error');
        return;
      }

      const payload = {
        ...formData,
        category: resolvedCategory,
        unit: resolvedUnit,
        bulkQuantity: parseFloat(formData.bulkQuantity),
        bulkPrice: parseFloat(formData.bulkPrice),
      };

      if (editingMaterial) {
        await materialsApi.update(editingMaterial.id, payload);
      } else {
        await materialsApi.create(payload);
      }
      setShowAddModal(false);
      setEditingMaterial(null);
      resetForm();
      loadData(selectedStatus);
    } catch (error) {
      console.error('Error saving material:', error);
      showToastMessage('Failed to save material', 'error');
    }
  }

  function resetImportState() {
    setImportFile(null);
    setImportPreview([]);
    setImportResult(null);
    setImportRuntimeError('');
  }

  function parseImportCsv(fileText: string): ParsedImportPreviewRow[] {
    try {
      const allLines = parseCsvText(fileText).map((line) => line.trim());
      const nonEmpty = allLines.filter((line) => line.length > 0 && !line.startsWith('#'));

      if (nonEmpty.length === 0) return [];

      const firstCells = parseCsvLine(nonEmpty[0]).map((v) => v.trim().toLowerCase());
      const firstLooksLikeHeader =
        firstCells[0] === 'material name' &&
        firstCells[1] === 'category' &&
        firstCells[2] === 'unit';

      const dataLines = firstLooksLikeHeader ? nonEmpty.slice(1) : nonEmpty;
      const lineOffset = firstLooksLikeHeader ? 2 : 1;

      const result: ParsedImportPreviewRow[] = [];

      for (let index = 0; index < dataLines.length; index++) {
        const line = dataLines[index];
        const cells = parseCsvLine(line);

        // Skip blank rows (all cells empty)
        if (cells.every((c) => c.trim() === '')) continue;

        const rowNumber = index + lineOffset;
        const errors: string[] = [];

        const name = (cells[0] || '').trim();
        const category = (cells[1] || '').trim();
        const unit = (cells[2] || '').trim();
        const currencyCode = (cells[3] || '').trim().toUpperCase();
        const rawBulkPrice = (cells[4] || '').trim();
        const rawBulkQty = (cells[5] || '').trim();
        const supplierTypeRaw = (cells[6] || '').trim();

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

        const supplierType = supplierTypeRaw || 'Local';
        if (supplierTypeRaw && !['local', 'foreign'].includes(supplierTypeRaw.toLowerCase())) {
          errors.push('Supplier Type must be Local or Foreign.');
        }

        const parsed: ImportMaterialRow | null =
          errors.length === 0
            ? { name, category, unit, currencyCode, bulkPrice: bulkPriceNum, bulkQuantity: bulkQtyNum, supplierType }
            : null;

        result.push({
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
        });
      }

      return result;
    } catch (err) {
      setImportRuntimeError(
        `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      return [];
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportResult(null);
    setImportRuntimeError('');

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (extension !== 'csv') {
      setImportPreview([]);
      setImportRuntimeError('Only CSV files are supported for materials import.');
      return;
    }

    const textReader = new FileReader();
    textReader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const rows = parseImportCsv(text);

        if (rows.length > MAX_IMPORT_ROWS) {
          setImportPreview(rows);
          setImportRuntimeError(`CSV has ${rows.length} rows. Maximum supported is ${MAX_IMPORT_ROWS}.`);
          return;
        }

        setImportPreview(rows);
      } catch (error) {
        console.error('Error reading CSV file:', error);
        setImportPreview([]);
        setImportRuntimeError('Error reading CSV file. Please check the format.');
      }
    };
    textReader.readAsText(file);
  }

  async function handleImport() {
    const validRows = importPreview
      .filter((row) => row.errors.length === 0 && row.parsed)
      .map((row) => row.parsed as ImportMaterialRow);

    if (validRows.length === 0) {
      showToastMessage('No valid rows to import', 'error');
      return;
    }
    if (validRows.length > MAX_IMPORT_ROWS) {
      showToastMessage(`Maximum ${MAX_IMPORT_ROWS} rows allowed`, 'error');
      return;
    }

    setImporting(true);
    setImportRuntimeError('');
    setImportResult(null);

    try {
      const response = await materialsApi.importMaterials(validRows);
      setImportResult(response);
      await loadData(selectedStatus);

      if (response.skipped === 0) {
        setShowImportModal(false);
        resetImportState();
        showToastMessage(`Import complete: ${response.imported} materials added, ${response.updated} updated.`, 'success');
      } else {
        showToastMessage(`Import complete with ${response.skipped} errors. Check the error report.`, 'error');
      }
    } catch (error: any) {
      console.error('Error importing materials:', error);
      const rawMessage = String(error?.message || '');
      const isNetworkError = rawMessage.toLowerCase().includes('failed to fetch')
        || rawMessage.toLowerCase().includes('networkerror')
        || rawMessage.toLowerCase().includes('load failed');
      const message = isNetworkError
        ? 'Cannot reach the server. Make sure the PriceRight server is running, then try import again.'
        : (error?.message || 'Failed to import materials');
      setImportRuntimeError(message);
      showToastMessage(message, 'error');
    } finally {
      setImporting(false);
    }
  }

  function downloadMaterialFailureReport() {
    if (!importResult || importResult.errors.length === 0) return;

    const validRows = importPreview
      .filter((row) => row.errors.length === 0 && row.parsed)
      .map((row) => row.parsed as ImportMaterialRow);

    const rows = importResult.errors.map((failure) => {
      const source = validRows[failure.row - 1] || {
        name: '',
        category: '',
        unit: '',
        currencyCode: '',
        bulkPrice: '',
        bulkQuantity: '',
        supplierType: '',
      };

      return [
        failure.row,
        source.name,
        source.category,
        source.unit,
        source.currencyCode || '',
        source.bulkPrice,
        source.bulkQuantity,
        source.supplierType || '',
        failure.error,
      ];
    });

    const date = new Date().toISOString().split('T')[0];
    downloadCsv(
      `materials-import-failures-${date}.csv`,
      ['Row', 'Material Name', 'Category', 'Unit', 'Purchase Currency', 'Bulk Price', 'Bulk Quantity', 'Supplier Type', 'Error'],
      rows
    );
  }

  function getHowToFix(error: string): string {
    if (error.includes('Bulk Price is required')) return 'Enter a positive number in column E (Bulk Price). Example: 25';
    if (error.includes('Bulk Quantity is required')) return 'Enter a positive number in column F (Bulk Quantity). Example: 50';
    if (/Bulk Price.*positive number/.test(error)) return 'Remove any symbols or commas. Numbers only. Example: 320.50';
    if (/Bulk Quantity.*positive number/.test(error)) return 'Enter a whole number greater than zero. Example: 25';
    if (error.includes('Currency')) return 'Check Settings → Currencies. Use a configured code or leave blank for GHS.';
    if (error.includes('Material Name is required')) return 'Enter a name in column A (Material Name).';
    if (error.includes('Category is required')) return 'Enter a category in column B (Category).';
    if (error.includes('Unit is required')) return 'Enter a unit in column C (Unit). Example: Kg, L, Ea.';
    if (error.includes('Supplier Type')) return 'Enter either Local or Foreign in column G (Supplier Type).';
    return 'Check the CSV format and correct this row.';
  }

  function downloadParseErrorReport() {
    const errorRows = importPreview.filter((row) => row.errors.length > 0);
    if (errorRows.length === 0) return;
    const rows = errorRows.map((row) => [
      row.rowNumber,
      row.name,
      row.category,
      row.unit,
      row.currencyCode,
      row.bulkPriceRaw,
      row.bulkQuantityRaw,
      row.supplierType,
      row.errors.join('; '),
      row.errors.map(getHowToFix).join('; '),
    ]);
    const date = new Date().toISOString().split('T')[0];
    downloadCsv(
      `materials-import-errors-${date}.csv`,
      ['Line #', 'Material Name', 'Category', 'Unit', 'Currency', 'Bulk Price', 'Bulk Quantity', 'Supplier Type', 'Error', 'How to Fix'],
      rows
    );
  }

  function handleBulkExport() {
    if (selectedMaterials.size === 0) {
      showToastMessage('No selected materials to export', 'error');
      return;
    }
    
    const selectedMatList = filteredMaterials.filter((m) => selectedMaterials.has(m.id));
    if (selectedMatList.length === 0) {
      showToastMessage('Selected materials are not visible in the current filter. Clear filters and retry export.', 'error');
      return;
    }

    try {
    const exportData = selectedMatList.map((material) => ({
      'Material Name': material.name,
      'SKU': material.sku || '',
      'Category': material.category,
      'Unit': material.unit,
      'Bulk Quantity': parseFloat(material.bulkQuantity).toFixed(2),
      'Bulk Price': parseFloat(material.bulkPrice).toFixed(2),
      'Currency': material.purchaseCurrencyCode,
      'Unit Cost': parseFloat(material.unitPrice).toFixed(2),
      'Supplier': material.supplier,
      'Description': material.description || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const columnWidths = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 30 },
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Materials_Selected_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    const exportedNames = selectedMatList.map((material) => material.name);
    const exportedPreview = exportedNames.slice(0, 5).join(', ');
    const exportedSuffix = exportedNames.length > 5 ? ` +${exportedNames.length - 5} more` : '';
    showToastMessage(
      formatListMessage(
        `Exported ${selectedMatList.length} material${selectedMatList.length !== 1 ? 's' : ''}`,
        [`Materials: ${exportedPreview}${exportedSuffix}`]
      ),
      'success'
    );
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to export selected materials', 'error');
    }
  }

  function handleExportFilteredMaterialsExcel() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to export', 'error');
      return;
    }

    const exportData = filteredMaterials.map((material) => ({
      'Material Name': material.name,
      'SKU': material.sku || '',
      'Category': material.category,
      'Unit': material.unit,
      'Bulk Quantity': parseFloat(material.bulkQuantity).toFixed(2),
      'Bulk Price': parseFloat(material.bulkPrice).toFixed(2),
      'Currency': material.purchaseCurrencyCode,
      'Unit Cost': parseFloat(material.unitPrice).toFixed(2),
      'Supplier': material.supplier,
      'Status': material.isActive ? 'Active' : 'Inactive',
      'Description': material.description || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Materials_Filtered_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    showToastMessage(`Exported ${filteredMaterials.length} filtered material${filteredMaterials.length !== 1 ? 's' : ''} to Excel`, 'success');
  }

  function escapeCsvCell(value: unknown) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
    const csv = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportFilteredMaterialsCsv() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to export', 'error');
      return;
    }

    const rows = filteredMaterials.map((material) => [
      material.name,
      material.sku || '-',
      material.category,
      material.unit,
      Number(material.bulkQuantity || 0).toFixed(2),
      Number(material.bulkPrice || 0).toFixed(2),
      material.purchaseCurrencyCode,
      Number(material.unitPrice || 0).toFixed(2),
      material.supplier,
      material.isActive ? 'Active' : 'Inactive',
    ]);

    downloadCsv(
      `materials-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Material Name', 'SKU', 'Category', 'Unit', 'Bulk Quantity', 'Bulk Price', 'Currency', 'Unit Cost', 'Supplier', 'Status'],
      rows
    );

    showToastMessage(`Exported ${filteredMaterials.length} filtered material${filteredMaterials.length !== 1 ? 's' : ''} to CSV`, 'success');
  }

  function handlePrintFilteredMaterials() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to print', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredMaterials
      .map(
        (material) => `
          <tr>
            <td>${material.name}</td>
            <td>${material.sku || '-'}</td>
            <td>${material.category}</td>
            <td>${material.unit}</td>
            <td style="text-align:right;">${Number(material.bulkQuantity || 0).toFixed(2)}</td>
            <td style="text-align:right;">${Number(material.bulkPrice || 0).toFixed(2)}</td>
            <td>${material.purchaseCurrencyCode}</td>
            <td style="text-align:right;">${Number(material.unitPrice || 0).toFixed(2)}</td>
            <td>${material.supplier}</td>
            <td>${material.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Raw Materials Report</title>
          <style>
            body { font-family: 'Open Sans', sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 25px; }
            .meta { margin-bottom: 12px; color: #475569; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; text-align: left; }
            th { background: #f8fafc; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Raw Materials Report</h1>
          <div class="meta">Generated ${new Date().toLocaleString()} • ${filteredMaterials.length} record(s)</div>
          <table>
            <thead>
              <tr>
                <th>Material</th><th>SKU</th><th>Category</th><th>Unit</th><th>Bulk Qty</th><th>Bulk Price</th><th>Currency</th><th>Unit Cost</th><th>Supplier</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  async function handleViewPriceHistory(material: Material) {
    setSelectedMaterialForHistory(material);
    setShowPriceHistory(true);
    setLoadingHistory(true);
    
    try {
      const history = await materialsApi.getPriceHistory(material.id);
      setPriceHistory(history);
    } catch (error) {
      console.error('Error loading price history:', error);
      showToastMessage('Failed to load price history', 'error');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleViewMaterialUsage(material: Material) {
    setSelectedMaterialForUsage(material);
    setSelectedMaterialUsage(null);
    setShowUsageModal(true);
    setLoadingMaterialUsage(true);

    try {
      const result = await materialsApi.checkUsage([material.id]);
      const usageList = Array.isArray(result?.inUse) ? result.inUse : [];
      const usageRecord = usageList.find((entry: MaterialUsage) => entry.materialId === material.id) || null;
      setSelectedMaterialUsage(usageRecord);
    } catch (error) {
      console.error('Error loading material usage:', error);
      showToastMessage('Failed to load material usage', 'error');
    } finally {
      setLoadingMaterialUsage(false);
    }
  }

  async function handleDelete(id: number) {
    if (window.confirm('Are you sure you want to delete this material?')) {
      try {
        await materialsApi.delete(id);
        loadData(selectedStatus);
        showToastMessage('Material deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting material:', error);
        showToastMessage('Failed to delete material', 'error');
      }
    }
  }

  async function handleDuplicate(material: Material) {
    try {
      const existingNames = new Set(materials.map((item) => (item.name || '').trim().toLowerCase()));
      const duplicatedName = buildDuplicateName(material.name, existingNames);
      const duplicatedSku = material.sku ? `${material.sku}-COPY` : '';

      await materialsApi.create({
        name: duplicatedName,
        sku: duplicatedSku,
        description: material.description || '',
        category: material.category,
        unit: material.unit,
        bulkQuantity: parseFloat(material.bulkQuantity),
        bulkPrice: parseFloat(material.bulkPrice),
        purchaseCurrencyId: material.purchaseCurrencyId,
        supplier: material.supplier,
      });

      await loadData();
      showToastMessage(`Duplicated material: ${duplicatedName}`, 'success');
    } catch (error: any) {
      console.error('Error duplicating material:', error);
      showToastMessage(error?.message || 'Failed to duplicate material', 'error');
    }
  }

  async function handleToggleMaterialActive(material: Material) {
    const nextActiveState = !material.isActive;
    if (!nextActiveState) {
      const confirmed = window.confirm(
        `Mark ${material.name} as inactive?\nIt will remain in existing BOMs but will be flagged in the filter.`
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      await materialsApi.update(material.id, { isActive: nextActiveState });
      showToastMessage(`Material marked as ${nextActiveState ? 'active' : 'inactive'}`, 'success');
      await loadData(selectedStatus);
    } catch (error) {
      console.error('Error updating material status:', error);
      showToastMessage('Failed to update material status', 'error');
    }
  }

  async function handleBulkSetActiveState(isActive: boolean) {
    if (selectedMaterials.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedMaterials).map((id) => materialsApi.update(id, { isActive }))
      );
      showToastMessage(
        `Set ${selectedMaterials.size} material${selectedMaterials.size !== 1 ? 's' : ''} ${isActive ? 'active' : 'inactive'}`,
        'success'
      );
      await loadData(selectedStatus);
    } catch (error) {
      console.error('Error bulk updating material status:', error);
      showToastMessage('Failed to update selected material statuses', 'error');
    }
  }

  function handleSelectAll() {
    if (selectedMaterials.size === filteredMaterials.length && filteredMaterials.length > 0) {
      setSelectedMaterials(new Set());
    } else {
      setSelectedMaterials(new Set(filteredMaterials.map((material) => material.id)));
    }
  }

  function handleSelectMaterial(id: number) {
    const nextSelected = new Set(selectedMaterials);
    if (nextSelected.has(id)) {
      nextSelected.delete(id);
    } else {
      nextSelected.add(id);
    }
    setSelectedMaterials(nextSelected);
  }

  async function handleOpenDeleteModal() {
    if (selectedMaterials.size === 0) return;

    setLoadingUsageCheck(true);
    try {
      const selectedIds = Array.from(selectedMaterials);
      const result = await materialsApi.checkUsage(selectedIds);
      setUsageData(result);
      setShowDeleteModal(true);
    } catch (error: any) {
      console.error('Error checking material usage:', error);
      showToastMessage(error?.message || 'Failed to check material usage', 'error');
    } finally {
      setLoadingUsageCheck(false);
    }
  }

  async function handleConfirmDelete() {
    if (!usageData || usageData.canDelete.length === 0) return;

    try {
      await Promise.all(usageData.canDelete.map((id) => materialsApi.delete(id)));
      setShowDeleteModal(false);
      setUsageData(null);
      setSelectedMaterials(new Set());
      await loadData(selectedStatus);

      const blockedCount = usageData.inUse.length;
      if (blockedCount > 0) {
        showToastMessage(
          `Deleted ${usageData.canDelete.length} material${usageData.canDelete.length !== 1 ? 's' : ''}. ${blockedCount} could not be deleted due to usage.`,
          'success'
        );
      } else {
        showToastMessage(
          `Deleted ${usageData.canDelete.length} material${usageData.canDelete.length !== 1 ? 's' : ''}`,
          'success'
        );
      }
    } catch (error: any) {
      console.error('Error deleting selected materials:', error);
      showToastMessage(error?.message || 'Failed to delete selected materials', 'error');
    }
  }

  async function handleBulkCategoryChange() {
    const nextCategory = normalizeChoiceValue(bulkCategoryValue, bulkCustomCategoryValue);
    if (!nextCategory || selectedMaterials.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedMaterials).map((id) => materialsApi.update(id, { category: nextCategory }))
      );

      setShowCategoryModal(false);
      setBulkCategoryValue('');
      setBulkCustomCategoryValue('');
      setSelectedMaterials(new Set());
      await loadData(selectedStatus);
      showToastMessage(`Updated category for selected materials to ${nextCategory}`, 'success');
    } catch (error: any) {
      console.error('Error bulk updating category:', error);
      showToastMessage(error?.message || 'Failed to update category', 'error');
    }
  }

  function handleEdit(material: Material) {
    const knownCategory = materialCategories.includes(material.category);
    const knownUnit = materialUnits.includes(material.unit);

    setMaterialCustomCategoryValue(knownCategory ? '' : material.category);
    setMaterialCustomUnitValue(knownUnit ? '' : material.unit);

    setEditingMaterial(material);
    setFormData({
      name: material.name,
      sku: material.sku || '',
      description: material.description || '',
      category: knownCategory ? material.category : '__custom__',
      unit: knownUnit ? material.unit : '__custom__',
      bulkQuantity: material.bulkQuantity,
      bulkPrice: material.bulkPrice,
      purchaseCurrencyId: material.purchaseCurrencyId,
      supplier: material.supplier,
    });
    setShowAddModal(true);
  }

  function resetForm() {
    const defaultUnit = materialUnits.includes('kg') ? 'kg' : materialUnits[0] || 'kg';
    setMaterialCustomCategoryValue('');
    setMaterialCustomUnitValue('');
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '',
      unit: defaultUnit,
      bulkQuantity: '',
      bulkPrice: '',
      purchaseCurrencyId: currencies[0]?.id || 0,
      supplier: '',
    });
  }

  const materialCategories = useMemo(() => {
    const observed = materials
      .map((m) => (m.category || '').trim())
      .filter((category) => category.length > 0);
    return Array.from(new Set([...configuredMaterialCategories, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredMaterialCategories, materials]);

  const materialUnits = useMemo(() => {
    const observed = materials
      .map((m) => (m.unit || '').trim())
      .filter((unit) => unit.length > 0);
    return Array.from(new Set([...configuredMaterialUnits, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredMaterialUnits, materials]);

  const filteredMaterials = useMemo(() => {
    return materials
      .filter((material) => {
        const matchesSearch =
          searchTerm === '' ||
          material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.supplier.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      })
      .sort((a, b) => {
        let aValue: any = a[sortField as keyof Material];
        let bValue: any = b[sortField as keyof Material];

        if (sortField === 'unitPrice' || sortField === 'bulkPrice' || sortField === 'bulkQuantity') {
          aValue = parseFloat(aValue as string);
          bValue = parseFloat(bValue as string);
        }

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [materials, searchTerm, sortField, sortOrder]);

  const foreignCurrencyRates = useMemo(() => {
    return currencies
      .filter((currency) => currency.isActive && currency.code !== baseCurrencyCode)
      .map((currency) => {
        const rate = exchangeRates.find((entry) => entry.currencyId === currency.id);
        return {
          currency,
          rate,
          displayRate: Number(rate?.rateToBase || 1),
          lastUpdatedAt: parseDateInput(rate?.effectiveDate || rate?.updatedAt),
          flag: getCurrencyFlag(currency.code),
        };
      });
  }, [baseCurrencyCode, currencies, exchangeRates]);

  const latestRateUpdateLabel = useMemo(() => {
    const latest = foreignCurrencyRates
      .map((entry) => entry.lastUpdatedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!latest) return 'Last updated: —';
    return `Last updated: ${latest.toLocaleDateString('en-GB')} ${latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [foreignCurrencyRates]);

  function startEditingExchangeRate(currencyId: number, rateToBase: number) {
    setEditingRateCurrencyId(currencyId);
    setEditingRateValue(formatRateValue(rateToBase));
  }

  function cancelEditingExchangeRate() {
    setEditingRateCurrencyId(null);
    setEditingRateValue('');
  }

  async function saveExchangeRate(currencyId: number) {
    const nextRate = Number.parseFloat(editingRateValue);
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      showToastMessage('Please enter a valid exchange rate greater than zero', 'error');
      return;
    }
    const roundedRate = Number(nextRate.toFixed(2));

    setSavingRateCurrencyId(currencyId);
    try {
      const response = await exchangeRatesApi.update(currencyId, { rateToBase: roundedRate }) as ExchangeRateUpdateResponse;
      const materialsUpdated = response.recalculation?.materialsUpdated ?? 0;

      setEditingRateCurrencyId(null);
      setEditingRateValue('');
      setRecentlySavedCurrencyId(currencyId);
      setExchangeRateNotice(`Exchange rate updated. ${materialsUpdated} materials recalculated.`);
      await loadData(selectedStatus);
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      showToastMessage('Failed to update exchange rate', 'error');
    } finally {
      setSavingRateCurrencyId(null);
    }
  }

  // When filters change, update selection (deselect materials not in filtered list)
  useEffect(() => {
    const validIds = new Set(filteredMaterials.map((m) => m.id));
    setSelectedMaterials((prev) => {
      const newSelected = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      if (newSelected.size === prev.size) return prev;
      return newSelected;
    });
  }, [filteredMaterials]);

  const compactControlStyle = {
    minHeight: '32px',
    padding: '6px 8px',
    fontSize: '14px',
  } as const;

  function openMaterialsTableSettings() {
    const trigger = materialsTableSettingsAnchorRef.current?.querySelector('button');
    if (trigger instanceof HTMLButtonElement) {
      trigger.click();
    }
  }

  function isMaterialColumnVisible(key: MaterialColumnKey) {
    return visibleColumns.includes(key);
  }

  function toggleMaterialColumn(key: MaterialColumnKey) {
    const currentlyVisible = visibleColumns.includes(key);
    if (currentlyVisible && visibleColumns.length <= 2) {
      return;
    }

    const nextColumns = currentlyVisible
      ? visibleColumns.filter((columnKey) => columnKey !== key)
      : [...visibleColumns, key];

    setVisibleColumns(nextColumns);
  }

  function resetMaterialColumns() {
    setVisibleColumns(DEFAULT_MATERIAL_COLUMNS);
    try {
      window.localStorage.removeItem('priceright_columns_materials');
    } catch {
      // Ignore localStorage access errors.
    }
  }

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-content" style={{ gap: '20px' }}>
          <div className="app-card app-loading-state">
            <div className="app-loading-title">Loading materials...</div>
          </div>
        </div>
      </div>
    );
  }

  const visibleInSelected = Array.from(selectedMaterials).filter((id) => 
    filteredMaterials.some((m) => m.id === id)
  ).length;

  return (
    <div className="app-page">
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />

      {/* Search and Filters */}
      <div className="app-page-content" style={{ gap: '8px', paddingTop: '8px' }}>
        <div className="app-card app-filter-card" style={{ padding: '8px 10px' }}>
          <div style={{ minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <div className="app-filter-search" style={{ minWidth: '280px' }}>
                <input
                  className="app-control"
                  type="text"
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={compactControlStyle}
                />
              </div>
              <select
                className="app-control app-filter-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')}
                style={{ ...compactControlStyle, width: '160px' }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <ActionDropdown
                label="+ Add"
                buttonClassName="btn btn-primary btn-sm"
                items={[
                  {
                    key: 'add-single',
                    label: 'Add single material',
                    icon: <Plus size={14} strokeWidth={2} />,
                    onSelect: () => {
                      setEditingMaterial(null);
                      resetForm();
                      setShowAddModal(true);
                    },
                  },
                  ...(materialType === 'primary' ? [
                    { key: 'divider-add', type: 'divider' as const },
                    {
                      key: 'import-csv',
                      label: 'Import from CSV',
                      icon: <Upload size={14} strokeWidth={2} />,
                      onSelect: () => {
                        resetImportState();
                        setShowImportModal(true);
                      },
                    },
                  ] : []),
                ]}
              />

              <ActionDropdown
                label="More"
                buttonClassName="btn btn-ghost btn-sm"
                items={[
                  {
                    key: 'export-excel',
                    label: 'Export to Excel',
                    onSelect: handleExportFilteredMaterialsExcel,
                    icon: <FileSpreadsheet size={13} strokeWidth={2} />,
                  },
                  {
                    key: 'export-csv',
                    label: 'Export to CSV',
                    onSelect: handleExportFilteredMaterialsCsv,
                    icon: <FileText size={13} strokeWidth={2} />,
                  },
                  {
                    key: 'print',
                    label: 'Print',
                    onSelect: handlePrintFilteredMaterials,
                    icon: <Printer size={13} strokeWidth={2} />,
                  },
                  { key: 'divider-1', type: 'divider' },
                  {
                    key: 'table-settings',
                    label: 'Table settings',
                    onSelect: openMaterialsTableSettings,
                    icon: <Settings2 size={13} strokeWidth={2} />,
                  },
                ]}
              />

              <div
                ref={materialsTableSettingsAnchorRef}
                style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
                aria-hidden="true"
              >
                <TableSettingsDropdown
                  columns={MATERIAL_COLUMN_OPTIONS.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visible: isMaterialColumnVisible(column.key),
                  }))}
                  onToggleColumn={(key) => toggleMaterialColumn(key as MaterialColumnKey)}
                  onResetColumns={resetMaterialColumns}
                  density={tableDensity}
                  onToggleDensity={() => setTableDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))}
                />
              </div>
            </div>
          </div>
        </div>

        {materialType === 'primary' && foreignCurrencyRates.length > 0 && (
          <>
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e8e8e8',
                borderRadius: '8px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#475569' }}>Exchange rates</span>
                {foreignCurrencyRates.map(({ currency, displayRate, flag }) => {
                  const isEditing = editingRateCurrencyId === currency.id;
                  const isSaving = savingRateCurrencyId === currency.id;
                  const isSaved = recentlySavedCurrencyId === currency.id;
                  return (
                    <span key={currency.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0f172a' }}>
                      <strong style={{ fontWeight: 600 }}>{currency.code}</strong>
                      {flag ? <span aria-label={`${currency.code} flag`}>{flag}</span> : null}
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            value={editingRateValue}
                            onChange={(e) => setEditingRateValue(e.target.value)}
                            style={{ width: '94px', minHeight: '26px', padding: '2px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                          />
                          <span style={{ color: '#475569' }}>{baseCurrencyCode}</span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => saveExchangeRate(currency.id)}
                            disabled={isSaving}
                            style={{ minHeight: '24px', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <CheckCircle2 size={14} strokeWidth={2} />
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={cancelEditingExchangeRate}
                            disabled={isSaving}
                            style={{ minHeight: '24px', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <X size={14} strokeWidth={2} />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{formatRateValue(displayRate)} {baseCurrencyCode}</span>
                          <button
                            type="button"
                            onClick={() => startEditingExchangeRate(currency.id, displayRate)}
                            style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                            aria-label={`Edit ${currency.code} exchange rate`}
                            title={`Edit ${currency.code} exchange rate`}
                          >
                            <Pencil size={14} strokeWidth={2} />
                          </button>
                          {isSaved && <CheckCircle2 size={14} strokeWidth={2} color="#16a34a" />}
                        </>
                      )}
                    </span>
                  );
                })}
              </div>
              <span style={{ fontSize: '14px', color: '#888' }}>{latestRateUpdateLabel}</span>
            </div>

            {exchangeRateNotice && (
              <div
                style={{
                  marginTop: '-2px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: '#166534',
                }}
              >
                {exchangeRateNotice}
              </div>
            )}
          </>
        )}

        {/* Bulk Action Bar */}
        {selectedMaterials.size > 0 && (
          <div
            className="app-bulk-bar app-bulk-bar-sticky"
            style={{
              backgroundColor: '#1a1a1a',
              color: 'white',
              padding: '10px 16px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <span style={{ fontSize: '15px', color: '#cbd5e1' }}>
              {visibleInSelected} selected
            </span>

            <ActionDropdown
              label="More"
              buttonClassName="btn btn-ghost btn-sm"
              items={[
                {
                  key: 'export-excel',
                  label: 'Export selected (Excel)',
                  onSelect: handleBulkExport,
                  icon: <FileSpreadsheet size={13} strokeWidth={2} />,
                },
                {
                  key: 'export-csv',
                  label: 'Export selected (CSV)',
                  onSelect: handleExportFilteredMaterialsCsv,
                  icon: <FileText size={13} strokeWidth={2} />,
                },
                { key: 'divider-1', type: 'divider' },
                {
                  key: 'set-active',
                  label: 'Set active',
                  onSelect: () => handleBulkSetActiveState(true),
                  icon: <Eye size={13} strokeWidth={2} />,
                },
                {
                  key: 'set-inactive',
                  label: 'Set inactive',
                  onSelect: () => handleBulkSetActiveState(false),
                  icon: <EyeOff size={13} strokeWidth={2} />,
                },
                {
                  key: 'change-category',
                  label: 'Change category',
                  onSelect: () => setShowCategoryModal(true),
                  icon: <Tags size={13} strokeWidth={2} />,
                },
                { key: 'divider-2', type: 'divider' },
                {
                  key: 'delete-selected',
                  label: loadingUsageCheck ? 'Delete selected (checking...)' : 'Delete selected',
                  onSelect: handleOpenDeleteModal,
                  icon: <Trash2 size={13} strokeWidth={2} />,
                  disabled: loadingUsageCheck,
                  destructive: true,
                },
              ]}
            />

            <button
              type="button"
              onClick={() => setSelectedMaterials(new Set())}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', color: '#e2e8f0' }}
            >
              <X size={14} strokeWidth={2} />
              Clear selection
            </button>
          </div>
        )}

        {/* Materials Table */}
        <div className="app-card app-data-card" style={{ padding: 0 }}>
          <h2 style={{ padding: '10px 14px', margin: 0, borderBottom: '1px solid #e2e8f0' }}>
            Materials ({filteredMaterials.length})
          </h2>

          <div className="app-table-wrap app-table-sticky" style={{ maxHeight: 'calc(100vh - 210px)' }}>
            <table className={`app-table app-table-uniform-numbers app-table-ultra-compact ${tableDensity === 'compact' ? 'app-table-compact' : ''}`}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: '700', fontSize: '15px', color: '#475569', width: '32px', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.size === filteredMaterials.length && filteredMaterials.length > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedMaterials.size > 0 && selectedMaterials.size < filteredMaterials.length;
                      }}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', display: 'inline-block' }}
                    />
                  </th>
                  <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: '700', fontSize: '15px', width: '40px', whiteSpace: 'nowrap' }}>#</th>
                  {isMaterialColumnVisible('material') && <th onClick={() => {
                    setSortField('name');
                    setSortOrder((prev) => (sortField === 'name' && prev === 'asc' ? 'desc' : 'asc'));
                  }} style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '200px', minWidth: '200px', whiteSpace: 'nowrap', cursor: 'pointer' }}>Material</th>}
                  {isMaterialColumnVisible('category') && <th onClick={() => {
                    setSortField('category');
                    setSortOrder((prev) => (sortField === 'category' && prev === 'asc' ? 'desc' : 'asc'));
                  }} style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '88px', whiteSpace: 'nowrap', cursor: 'pointer' }}>Category</th>}
                  {isMaterialColumnVisible('unit') && <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '68px', whiteSpace: 'nowrap' }}>Unit</th>}
                  {isMaterialColumnVisible('unitCost') && <th onClick={() => {
                    setSortField('unitPrice');
                    setSortOrder((prev) => (sortField === 'unitPrice' && prev === 'asc' ? 'desc' : 'asc'));
                  }} style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '96px', whiteSpace: 'nowrap', cursor: 'pointer' }}>Unit Cost</th>}
                  {isMaterialColumnVisible('bulkPricing') && <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '104px', whiteSpace: 'nowrap' }}>Bulk</th>}
                  {isMaterialColumnVisible('supplier') && <th onClick={() => {
                    setSortField('supplier');
                    setSortOrder((prev) => (sortField === 'supplier' && prev === 'asc' ? 'desc' : 'asc'));
                  }} style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '100px', whiteSpace: 'nowrap', cursor: 'pointer' }}>Supplier</th>}
                  {isMaterialColumnVisible('status') && <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '84px', whiteSpace: 'nowrap' }}>Status</th>}
                  {isMaterialColumnVisible('actions') && <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: '700', fontSize: '15px', width: '130px', whiteSpace: 'nowrap' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material, idx) => (
                  <tr key={material.id} style={{ borderBottom: '1px solid #e2e8f0', color: material.isActive ? undefined : '#aaaaaa' }}>
                    <td style={{ padding: '6px 6px', width: '32px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedMaterials.has(material.id)}
                        onChange={() => handleSelectMaterial(material.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '6px 6px', width: '40px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                    {isMaterialColumnVisible('material') && <td style={{ padding: '6px 6px', width: '200px', minWidth: '200px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: material.isActive ? undefined : '#aaaaaa', overflow: 'hidden', textOverflow: 'ellipsis' }} title={material.sku ? `${material.name} (SKU: ${material.sku})` : material.name}>{material.name}</div>
                    </td>}
                    {isMaterialColumnVisible('category') && <td style={{ padding: '4px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ fontSize: '13px', color: '#334155' }}>{material.category}</span>
                    </td>}
                    {isMaterialColumnVisible('unit') && <td style={{ padding: '6px 6px', fontSize: '13px', whiteSpace: 'nowrap' }}>{material.unit}</td>}
                    {isMaterialColumnVisible('unitCost') && <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                      <div className="money-value" style={{ fontWeight: '600', fontSize: '14px' }}>
                        {material.baseCurrencySymbol}
                        {parseFloat(material.unitPrice).toFixed(2)}
                      </div>
                    </td>}
                    {isMaterialColumnVisible('bulkPricing') && <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                      <div className="money-value" style={{ fontSize: '14px', fontWeight: '600' }} title={`for ${parseFloat(material.bulkQuantity).toFixed(2)} ${material.unit}`}>
                        {material.purchaseCurrencySymbol}
                        {parseFloat(material.bulkPrice).toFixed(2)}
                      </div>
                    </td>}
                    {isMaterialColumnVisible('supplier') && <td style={{ padding: '6px 6px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{material.supplier}</td>}
                    {isMaterialColumnVisible('status') && <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                      <AppBadge variant={material.isActive ? 'success' : 'inactive'} size="sm">
                        {material.isActive ? 'Active' : 'Inactive'}
                      </AppBadge>
                    </td>}
                    {isMaterialColumnVisible('actions') && <td style={{ padding: '4px 3px' }}>
                      <div style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap', alignItems: 'center' }}>
                        <AppButton
                          onClick={() => handleEdit(material)}
                          variant="ghost"
                          size="sm"
                          className="app-row-action-icon"
                          title="Edit"
                          ariaLabel={`Edit ${material.name}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0px',
                            padding: '2px',
                            minWidth: '20px',
                          }}
                        >
                          <Pencil size={14} strokeWidth={2} />
                        </AppButton>
                        <OverflowMenu
                          ariaLabel={`More actions for ${material.name}`}
                          items={[
                            { label: 'View usage', icon: BarChart2, onClick: () => handleViewMaterialUsage(material) },
                            { label: 'Price history', icon: Clock3, onClick: () => handleViewPriceHistory(material) },
                            { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicate(material) },
                            { type: 'divider', key: `state-divider-${material.id}` },
                            material.isActive
                              ? { label: 'Set inactive', icon: EyeOff, onClick: () => handleToggleMaterialActive(material) }
                              : { label: 'Set active', icon: Eye, onClick: () => handleToggleMaterialActive(material) },
                            { type: 'divider', key: `delete-divider-${material.id}` },
                            { label: 'Delete', icon: Trash2, onClick: () => handleDelete(material.id), danger: true },
                          ]}
                        />
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMaterials.length === 0 && (
              <div className="app-empty-state">
                No materials found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Material Modal */}
      {showAddModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">
              {editingMaterial ? 'Edit Material' : 'Add New Material'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label className="app-settings-label">
                    Material Name *
                  </label>
                  <input
                    className="app-control"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      SKU
                    </label>
                    <input
                      className="app-control"
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Category *
                    </label>
                    <select
                      className="app-control"
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="" disabled>
                        Select category
                      </option>
                      {materialCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__custom__">+ Add new category...</option>
                    </select>
                    {formData.category === '__custom__' && (
                      <input
                        className="app-control"
                        required
                        value={materialCustomCategoryValue}
                        onChange={(e) => setMaterialCustomCategoryValue(e.target.value)}
                        placeholder="Enter new category"
                        style={{ width: '100%', marginTop: '8px' }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="app-settings-label">
                    Description
                  </label>
                  <textarea
                    className="app-control"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ width: '100%', minHeight: '60px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      Unit of Measurement *
                    </label>
                    <select
                      className="app-control"
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="" disabled>
                        Select unit
                      </option>
                      {materialUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                      <option value="__custom__">+ Add new unit...</option>
                    </select>
                    {formData.unit === '__custom__' && (
                      <input
                        className="app-control"
                        required
                        value={materialCustomUnitValue}
                        onChange={(e) => setMaterialCustomUnitValue(e.target.value)}
                        placeholder="Enter new unit"
                        style={{ width: '100%', marginTop: '8px' }}
                      />
                    )}
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Bulk Quantity *
                    </label>
                    <input
                      className="app-control"
                      type="number"
                      required
                      step="0.01"
                      value={formData.bulkQuantity}
                      onChange={(e) => setFormData({ ...formData, bulkQuantity: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      Bulk Price *
                    </label>
                    <input
                      className="app-control"
                      type="number"
                      required
                      step="0.01"
                      value={formData.bulkPrice}
                      onChange={(e) => setFormData({ ...formData, bulkPrice: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Currency *
                    </label>
                    <select
                      className="app-control"
                      required
                      value={formData.purchaseCurrencyId}
                      onChange={(e) => setFormData({ ...formData, purchaseCurrencyId: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    >
                      {currencies.map((currency) => (
                        <option key={currency.id} value={currency.id}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="app-settings-label">
                    Supplier *
                  </label>
                  <input
                    className="app-control"
                    type="text"
                    required
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="app-modal-actions" style={{ marginTop: '24px' }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingMaterial(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                >
                  {editingMaterial ? 'Update Material' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">Import Primary Materials (CSV)</h2>

            {!importFile ? (
              <div>
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a
                    href={templateUrl('PriceRight_Materials_Import_Template.xlsx')}
                    onClick={(e) => { e.preventDefault(); void downloadTemplate('PriceRight_Materials_Import_Template.xlsx'); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0f172a', fontWeight: '600', fontSize: '16px', textDecoration: 'none', cursor: 'pointer' }}
                  >
                    <ArrowDownToLine size={14} strokeWidth={2} style={{ color: '#64748b' }} />
                    Download import template
                  </a>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>Fill it in and upload below</div>
                </div>
                <label
                  htmlFor="file-upload"
                  style={{
                    display: 'block',
                    padding: '40px',
                    border: '2px dashed #cbd5e1',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><FileUp size={42} strokeWidth={1.8} /></div>
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
                    Upload materials CSV
                  </div>
                  <div style={{ fontSize: '16px', color: '#64748b' }}>
                    Use the standard template for best results.
                  </div>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                <div style={{ marginTop: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>Template requirements</div>
                  <div style={{ fontSize: '15px', color: '#475569' }}>Columns: Material Name, Category, Unit, Purchase Currency, Bulk Price, Bulk Quantity, Supplier Type.</div>
                  <div style={{ fontSize: '15px', color: '#475569' }}>Supplier Type accepts Local or Foreign. Currency can be blank to use base currency.</div>
                </div>


              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                  <strong>File:</strong> {importFile.name} ({importPreview.length} rows)
                </div>

                {importRuntimeError && (
                  <div style={{ marginBottom: '12px', backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px' }}>
                    {importRuntimeError}
                  </div>
                )}

                {(() => {
                  const errorRows = importPreview.filter((r) => r.errors.length > 0);
                  const validCount = importPreview.length - errorRows.length;
                  if (errorRows.length === 0 || importResult) return null;
                  return (
                    <div style={{ marginBottom: '12px' }}>
                      {/* Amber summary banner */}
                      <div style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠</span>
                        <div>
                          <strong>{errorRows.length} row{errorRows.length !== 1 ? 's' : ''} have errors and will be skipped.</strong>
                          <div style={{ fontSize: '14px', marginTop: '2px' }}>
                            {validCount} valid row{validCount !== 1 ? 's' : ''} will be imported. Fix the errors in your CSV and re-upload to import all rows.
                          </div>
                        </div>
                      </div>
                      {/* Error detail table */}
                      <div style={{ border: '1px solid #fcd34d', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                          <thead style={{ backgroundColor: '#fffbeb' }}>
                            <tr>
                              <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #fcd34d', whiteSpace: 'nowrap' }}>Line #</th>
                              <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>Material Name</th>
                              <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>Error</th>
                              <th style={{ padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #fcd34d' }}>How to Fix</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errorRows.map((row) =>
                              row.errors.map((err, ei) => (
                                <tr key={`${row.rowNumber}-${ei}`} style={{ borderBottom: '1px solid #fef3c7' }}>
                                  {ei === 0 && <td style={{ padding: '6px 8px', verticalAlign: 'top' }} rowSpan={row.errors.length}>{row.rowNumber}</td>}
                                  {ei === 0 && <td style={{ padding: '6px 8px', verticalAlign: 'top' }} rowSpan={row.errors.length}>{row.name || '—'}</td>}
                                  <td style={{ padding: '6px 8px', color: '#b91c1c' }}>{err}</td>
                                  <td style={{ padding: '6px 8px', color: '#374151' }}>{getHowToFix(err)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {/* Pre-import error report download */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={downloadParseErrorReport}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                        >
                          Download error report (CSV)
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {importPreview.length > 0 && (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                      <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Row</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Material Name</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Currency</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Bulk Price</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Bulk Quantity</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row) => (
                          <tr key={row.rowNumber} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: row.errors.length > 0 ? '#fdecea' : 'white' }}>
                            <td style={{ padding: '8px' }}>
                              {row.errors.length > 0 && <span style={{ color: '#dc2626', marginRight: '4px', fontWeight: 700 }}>✕</span>}
                              {row.rowNumber}
                            </td>
                            <td style={{ padding: '8px' }}>{row.name || '-'}</td>
                            <td style={{ padding: '8px' }}>{row.category || '-'}</td>
                            <td style={{ padding: '8px' }}>{row.unit || '-'}</td>
                            <td style={{ padding: '8px' }}>{row.currencyCode || '-'}</td>
                            <td style={{ padding: '8px' }}>{row.bulkPriceRaw || '-'}</td>
                            <td style={{ padding: '8px' }}>{row.bulkQuantityRaw || '-'}</td>
                            <td style={{ padding: '8px', color: row.errors.length > 0 ? '#be123c' : '#166534' }}>
                              {row.errors.length > 0 ? row.errors.join(' | ') : 'Ready'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(() => {
                  const validCount = importPreview.filter((r) => r.errors.length === 0).length;
                  const errorCount = importPreview.filter((r) => r.errors.length > 0).length;
                  const label = importing
                    ? 'Importing...'
                    : errorCount > 0
                    ? `Import ${validCount} valid row${validCount !== 1 ? 's' : ''} (${errorCount} row${errorCount !== 1 ? 's' : ''} will be skipped)`
                    : `Import ${validCount} Material${validCount !== 1 ? 's' : ''}`;
                  return (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={resetImportState}
                        style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Choose Different File
                      </button>
                      <button
                        type="button"
                        onClick={handleImport}
                        disabled={importing || validCount === 0 || importPreview.length > MAX_IMPORT_ROWS}
                        style={{
                          padding: '10px 20px',
                          borderRadius: '8px',
                          backgroundColor: importing || validCount === 0 ? '#94a3b8' : '#10b981',
                          color: 'white',
                          fontWeight: '600',
                          border: 'none',
                          cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    </div>
                  );
                })()}

                {importResult && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: '600', marginBottom: '8px' }}>
                      Added: {importResult.imported} | Updated: {importResult.updated} | Failed: {importResult.skipped}
                    </div>

                    {importResult.errors.length > 0 && (
                      <div>
                        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                            <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                              <tr>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Row</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importResult.errors.slice(0, 20).map((failure) => (
                                <tr key={`${failure.row}-${failure.name}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '8px' }}>{failure.row}</td>
                                  <td style={{ padding: '8px' }}>{failure.name || '-'}</td>
                                  <td style={{ padding: '8px' }}>{failure.error}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                          <button
                            type="button"
                            onClick={downloadMaterialFailureReport}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              fontWeight: '600',
                            }}
                          >
                            Download Failure Report
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setImportResult(null);
                              setImportRuntimeError('');
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              fontWeight: '600',
                            }}
                          >
                            Try Again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  resetImportState();
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material Usage Modal */}
      {showUsageModal && selectedMaterialForUsage && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Products Using {selectedMaterialForUsage.name}
            </h2>
            <p style={{ color: '#64748b', marginBottom: '18px' }}>
              This list shows every product BOM that currently includes this material.
            </p>

            {loadingMaterialUsage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#334155', padding: '10px 0 18px' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Loading usage data...
              </div>
            ) : selectedMaterialUsage && selectedMaterialUsage.productCount > 0 ? (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                  Used in {selectedMaterialUsage.productCount} product{selectedMaterialUsage.productCount !== 1 ? 's' : ''}
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                  {selectedMaterialUsage.products.map((productName, index) => (
                    <div
                      key={`${selectedMaterialUsage.materialId}-${productName}-${index}`}
                      style={{
                        padding: '10px 12px',
                        borderBottom: index === selectedMaterialUsage.products.length - 1 ? 'none' : '1px solid #f1f5f9',
                        fontSize: '16px',
                        color: '#1e293b',
                      }}
                    >
                      {productName}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '18px', padding: '14px', borderRadius: '8px', backgroundColor: '#f8fafc', color: '#334155' }}>
                This material is not currently used in any product BOM.
              </div>
            )}

            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedMaterialForUsage(null);
                  setSelectedMaterialUsage(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && usageData && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Delete {selectedMaterials.size} Material{selectedMaterials.size !== 1 ? 's' : ''}?
            </h2>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>
              Materials used in product BOMs cannot be deleted.
            </p>

            {usageData.inUse.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} strokeWidth={2} />
                  {usageData.inUse.length} material{usageData.inUse.length !== 1 ? 's' : ''} cannot be deleted
                </div>
                <div style={{ fontSize: '16px', color: '#78350f', maxHeight: '200px', overflowY: 'auto' }}>
                  {usageData.inUse.map((item) => (
                    <div key={item.materialId} style={{ marginBottom: '8px' }}>
                      <strong>{item.materialName}</strong>
                      <div style={{ fontSize: '14px', marginLeft: '8px', marginTop: '4px' }}>
                        Used in {item.productCount} product{item.productCount !== 1 ? 's' : ''}:
                        {item.products.slice(0, 3).map((p, idx) => (
                          <div key={idx}>• {p}</div>
                        ))}
                        {item.products.length > 3 && <div>+ {item.products.length - 3} more</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {usageData.canDelete.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
                <div style={{ fontWeight: '600', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} strokeWidth={2} />
                  {usageData.canDelete.length} material{usageData.canDelete.length !== 1 ? 's' : ''} can be deleted
                </div>
              </div>
            )}

            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={usageData.canDelete.length === 0}
                style={{
                  backgroundColor: usageData.canDelete.length === 0 ? '#94a3b8' : '#dc2626',
                  cursor: usageData.canDelete.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {usageData.canDelete.length === 0 ? 'Cannot Delete' : `Delete ${usageData.canDelete.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Category Change Modal */}
      {showCategoryModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '500px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">
              Change Category for {selectedMaterials.size} Material{selectedMaterials.size !== 1 ? 's' : ''}
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label className="app-settings-label" style={{ marginBottom: '8px' }}>
                Select New Category *
              </label>
              <select
                className="app-control"
                value={bulkCategoryValue}
                onChange={(e) => setBulkCategoryValue(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="" disabled>
                  Select category
                </option>
                {materialCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__custom__">+ Add new category...</option>
              </select>
              {bulkCategoryValue === '__custom__' && (
                <input
                  className="app-control"
                  value={bulkCustomCategoryValue}
                  onChange={(e) => setBulkCustomCategoryValue(e.target.value)}
                  placeholder="Enter new category"
                  style={{ width: '100%', marginTop: '8px' }}
                />
              )}
            </div>

            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCategoryModal(false);
                  setBulkCategoryValue('');
                  setBulkCustomCategoryValue('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBulkCategoryChange}
                disabled={!normalizeChoiceValue(bulkCategoryValue, bulkCustomCategoryValue)}
                style={{
                  backgroundColor: normalizeChoiceValue(bulkCategoryValue, bulkCustomCategoryValue) ? '#3b82f6' : '#94a3b8',
                  cursor: normalizeChoiceValue(bulkCategoryValue, bulkCustomCategoryValue) ? 'pointer' : 'not-allowed',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {showPriceHistory && selectedMaterialForHistory && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Price History: {selectedMaterialForHistory.name}
            </h2>
            <p style={{ color: '#64748b', fontSize: '16px', marginBottom: '20px' }}>
              Track all price changes for this material
            </p>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                Loading price history...
              </div>
            ) : priceHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No price history available for this material.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', fontSize: '16px' }}>Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', fontSize: '16px' }}>Purchase Price</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', fontSize: '16px' }}>Base Currency</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', fontSize: '16px' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry, index) => {
                      const previousEntry = priceHistory[index + 1];
                      const priceChange = previousEntry
                        ? ((parseFloat(entry.priceInBaseCurrency) - parseFloat(previousEntry.priceInBaseCurrency)) /
                          parseFloat(previousEntry.priceInBaseCurrency) * 100)
                        : 0;
                      const isIncrease = priceChange > 0;
                      const isDecrease = priceChange < 0;

                      return (
                        <tr key={entry.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px', fontSize: '16px' }}>
                            {new Date(entry.changedAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px', fontSize: '16px', fontWeight: '600' }}>
                            {entry.currencySymbol}{parseFloat(entry.priceInPurchaseCurrency).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontSize: '16px', fontWeight: '600' }}>
                            {selectedMaterialForHistory.baseCurrencySymbol}{parseFloat(entry.priceInBaseCurrency).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontSize: '16px' }}>
                            {index === priceHistory.length - 1 ? (
                              <span style={{ color: '#64748b', fontSize: '14px' }}>Initial</span>
                            ) : (
                              <span
                                style={{
                                  color: isIncrease ? '#dc2626' : isDecrease ? '#16a34a' : '#64748b',
                                  fontWeight: '600',
                                }}
                              >
                                {isIncrease ? '↑' : isDecrease ? '↓' : '−'} {Math.abs(priceChange).toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => {
                  setShowPriceHistory(false);
                  setSelectedMaterialForHistory(null);
                  setPriceHistory([]);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
