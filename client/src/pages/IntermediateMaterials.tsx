import * as XLSX from 'xlsx';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFormState } from '../context/FormStateContext';
import { ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff, FileUp, Layers, Plus, Printer, Table, Trash2, Upload, ArrowDownToLine, X } from 'lucide-react';
import OverflowMenu from '../components/OverflowMenu';
import IntermediateCreatePanel from '../components/IntermediateCreatePanel';
import ActionDropdown from '../components/ActionDropdown';
import { ColumnSelectorDropdown } from '../components/ColumnSelectorDropdown';
import TableDensityToggle from '../components/TableDensityToggle';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import TableZoomControl from '../components/TableZoomControl';
import { materialsApi, currenciesApi, settingsApi, templateUrl, type MaterialRecord, type IntermediateBomItemRecord } from '../api';
import useAppToast from '../hooks/useAppToast';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';
import useTableZoom from '../hooks/useTableZoom';
import { useTemplateDownload } from '../hooks/useTemplateDownload';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { printExportTable } from '../utils/exportPrint';
import { formatExportNumber } from '../utils/exportFormat';
import { readImportDataRows } from '../utils/importWorkbook';
import usePersistedColumns from '../hooks/usePersistedColumns';
import { useMaterialCostSync } from '../context/MaterialCostSyncContext';
import {
  INTERMEDIATE_LOCKED_KEYS,
  INTERMEDIATE_MATERIALS_COLUMNS,
  INTERMEDIATE_TOGGLEABLE_KEYS,
  type IntermediateColumnKey,
} from '../config/intermediateMaterialsColumns';

interface MaterialFormState {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  intermediateCostMode: 'yield' | 'completed_output';
  bulkQuantity: string;
  overheadPercentage: string;
  marginPercentage: string;
  yieldPercentage: string;
}

const emptyForm: MaterialFormState = {
  name: '',
  sku: '',
  description: '',
  category: '',
  unit: 'kg',
  intermediateCostMode: 'completed_output',
  bulkQuantity: '1',
  overheadPercentage: '0',
  marginPercentage: '0',
  yieldPercentage: '100',
};

const formSectionStyle = {
  marginBottom: '16px',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '16px',
} as const;

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '15px',
  fontWeight: '600',
} as const;

const fieldInputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
} as const;

type SortField = 'name' | 'category' | 'unitPrice';
type SortOrder = 'asc' | 'desc';

const DEFAULT_INTERMEDIATE_COLUMNS: IntermediateColumnKey[] = INTERMEDIATE_MATERIALS_COLUMNS
  .filter((column) => column.id !== 'checkbox')
  .map((column) => column.id as IntermediateColumnKey);

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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const parts = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = parts[index] ?? '';
    });
    return row;
  });
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csvText = [
    headers.map((header) => escapeCsvCell(header)).join(','),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
  ].join('\n');

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function evaluateMathExpression(rawValue: string): string | null {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return null;
  }

  const looksLikeExpression = trimmed.startsWith('=') || /[+*/()×÷]/.test(trimmed) || trimmed.slice(1).includes('-');
  if (!looksLikeExpression) {
    return null;
  }

  const normalized = trimmed
    .replace(/^=/, '')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .trim();

  if (!normalized || !/^[0-9+\-*/().\s]+$/.test(normalized)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${normalized});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null;
    }

    const rounded = Math.round((result + Number.EPSILON) * 1_000_000) / 1_000_000;
    return String(rounded);
  } catch {
    return null;
  }
}

function commitMathExpression(rawValue: string, onResolved: (value: string) => void) {
  const resolved = evaluateMathExpression(rawValue);
  if (resolved !== null && resolved !== rawValue) {
    onResolved(resolved);
    return resolved;
  }
  return rawValue;
}

function toSafePositiveNumber(rawValue: string, fallback: number) {
  const resolved = evaluateMathExpression(rawValue) ?? rawValue;
  const numericValue = Number(resolved);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }
  return numericValue;
}

interface IntermediateMaterialsProps {
  refreshKey?: number;
  isActive?: boolean;
}

const PREV_NEXT_HINT_KEY = 'priceright_prevnext_hint_dismissed';

function formatIntermediateCostingMethod(mode?: MaterialRecord['intermediateCostMode']): string {
  return mode === 'completed_output' ? 'Completed Output' : 'Yield-Based';
}

function getIntermediateExportHeaders(): string[] {
  return [
    'Name',
    'Category',
    'Unit',
    'Yield %',
    'Costing Method',
    'Calculated Cost Per Unit',
    'Currency',
    'Optimal Price',
    'Overhead %',
    'Markup %',
    'Status',
  ];
}

export default function IntermediateMaterials({ refreshKey = 0, isActive = true }: IntermediateMaterialsProps) {
  const { version: materialCostVersion } = useMaterialCostSync();
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [components, setComponents] = useState<MaterialRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [baseCurrencyMissing, setBaseCurrencyMissing] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bomItems, setBomItems] = useState<IntermediateBomItemRecord[]>([]);
  const [form, setForm] = useState<MaterialFormState>(emptyForm);
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [sortField] = useState<SortField>('name');
  const [sortOrder] = useState<SortOrder>('asc');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [visibleColumns, setVisibleColumns] = usePersistedColumns<IntermediateColumnKey>(
    'priceright_columns_intermediate_materials',
    DEFAULT_INTERMEDIATE_COLUMNS,
  );
  const { zoomPercent, increaseZoom, decreaseZoom } = useTableZoom();
  const { downloading, handleDownload } = useTemplateDownload();
  const { baseCurrency } = useBaseCurrency();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [showPrevNextHint, setShowPrevNextHint] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialRecord | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [componentMaterialId, setComponentMaterialId] = useState<number>(0);
  const [componentQuantity, setComponentQuantity] = useState<string>('1');
  const [editingBomId, setEditingBomId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState('');
  const [statusText, setStatusText] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<Array<{ rowNumber: number; name: string; reason: string; originalRow: any }>>([]);
  const [importSuccessCount, setImportSuccessCount] = useState(0);
  const [configuredMaterialCategories, setConfiguredMaterialCategories] = useState<string[]>([]);
  const [materialCustomCategoryValue, setMaterialCustomCategoryValue] = useState('');
  const [showIntermediateImportModal, setShowIntermediateImportModal] = useState(false);
  const [intermediateImportFile, setIntermediateImportFile] = useState<File | null>(null);
  const [intermediateImportResult, setIntermediateImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; name: string; reason: string }>;
  } | null>(null);
  const { setHasOpenForm } = useFormState();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setHasOpenForm(isFormOpen || showImportModal || showIntermediateImportModal || showCreatePanel);
  }, [isFormOpen, showImportModal, showIntermediateImportModal, showCreatePanel, setHasOpenForm]);

  useEffect(() => {
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(filteredMaterials.map((material) => material.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function toggleSelectOne(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  useEffect(() => {
    setSelectedIds(new Set());
  }, [materialSearch, selectedStatus]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedId) ?? null,
    [materials, selectedId],
  );

  const materialCategories = useMemo(() => {
    const observed = materials
      .map((material) => String(material.category || '').trim())
      .filter((category) => category.length > 0);

    return Array.from(new Set([...configuredMaterialCategories, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredMaterialCategories, materials]);

  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    const filtered = materials.filter((material) => {
      const haystack = [
        material.name,
        material.sku,
        material.category,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      const matchesSearch = !query || haystack.includes(query);
      const matchesStatus = selectedStatus === 'all'
        || (selectedStatus === 'active' ? material.isActive : !material.isActive);

      return matchesSearch && matchesStatus;
    });

    return filtered.sort((left, right) => {
      let leftValue = '';
      let rightValue = '';

      if (sortField === 'unitPrice') {
        const delta = Number(left.unitPrice || 0) - Number(right.unitPrice || 0);
        return sortOrder === 'asc' ? delta : -delta;
      }

      if (sortField === 'category') {
        leftValue = String(left.category || '');
        rightValue = String(right.category || '');
      } else {
        leftValue = String(left.name || '');
        rightValue = String(right.name || '');
      }

      const comparison = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [materials, materialSearch, selectedStatus, sortField, sortOrder]);

  const hasActiveIntermediateFilters = materialSearch.trim() !== '' || selectedStatus !== 'active';

  function clearAllIntermediateFilters() {
    setMaterialSearch('');
    setSelectedStatus('active');
  }

  function formatIntermediateStatusLabel(value: 'all' | 'active' | 'inactive') {
    if (value === 'all') return 'All';
    if (value === 'inactive') return 'Inactive';
    return 'Active';
  }

  const editingIntermediateIndex = useMemo(() => {
    if (!selectedMaterial) return -1;
    return filteredMaterials.findIndex((m) => m.id === selectedMaterial.id);
  }, [selectedMaterial, filteredMaterials]);

  const prevNextNavVisible = isFormOpen && Boolean(selectedMaterial) && filteredMaterials.length > 1;

  function dismissPrevNextHint() {
    setShowPrevNextHint(false);
    try {
      localStorage.setItem(PREV_NEXT_HINT_KEY, 'true');
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    if (!prevNextNavVisible) {
      return;
    }
    try {
      if (localStorage.getItem(PREV_NEXT_HINT_KEY) === 'true') {
        return;
      }
    } catch {
      // ignore storage errors
    }
    setShowPrevNextHint(true);
    const timeoutId = window.setTimeout(() => {
      dismissPrevNextHint();
    }, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [prevNextNavVisible]);

  function isIntermediateColumnVisible(key: IntermediateColumnKey) {
    if (INTERMEDIATE_LOCKED_KEYS.has(key)) return true;
    return visibleColumns.includes(key);
  }

  function toggleIntermediateColumn(key: IntermediateColumnKey) {
    if (INTERMEDIATE_LOCKED_KEYS.has(key)) return;

    const currentlyVisible = visibleColumns.includes(key);
    if (currentlyVisible) {
      const visibleToggleableCount = INTERMEDIATE_TOGGLEABLE_KEYS.filter((columnKey) => visibleColumns.includes(columnKey)).length;
      if (visibleToggleableCount <= 1) return;
    }

    const nextColumns = currentlyVisible
      ? visibleColumns.filter((columnKey) => columnKey !== key)
      : [...visibleColumns, key];

    setVisibleColumns(nextColumns);
  }

  function handleToggleIntermediateColumn(id: string) {
    toggleIntermediateColumn(id as IntermediateColumnKey);
  }

  function isIntermediateColumnIdVisible(id: string) {
    if (id === 'checkbox') return true;
    return isIntermediateColumnVisible(id as IntermediateColumnKey);
  }

  function resetIntermediateColumns() {
    setVisibleColumns(DEFAULT_INTERMEDIATE_COLUMNS);
    try {
      window.localStorage.removeItem('priceright_columns_intermediate_materials');
    } catch {
      // Ignore localStorage access errors.
    }
  }

  useEffect(() => {
    void loadData();
  }, [refreshKey, materialCostVersion]);

  useEffect(() => {
    if (isActive) {
      void loadData();
    }
  }, [isActive]);

  useEffect(() => {
    const locationState = location.state as { editMaterialId?: number } | null;
    if (!locationState?.editMaterialId) return;

    const targetMaterial = materials.find((m) => m.id === locationState.editMaterialId);
    if (targetMaterial) {
      openEditMaterialForm(targetMaterial);
      window.history.replaceState({}, '', window.location.href);
    }
  }, [location.state, materials]);

  useEffect(() => {
    if (!selectedId) {
      setBomItems([]);
      setEditingBomId(null);
      setEditingQuantity('');
      return;
    }
    void loadBom(selectedId);
  }, [selectedId]);

  async function loadData() {
    const [intermediateData, componentData, settingsData, currenciesData] = await Promise.all([
      materialsApi.getAll('all', 'intermediate'),
      materialsApi.getAll('active', 'all'),
      settingsApi.getAll(),
      currenciesApi.getAll(),
    ]);

    const safeIntermediate = Array.isArray(intermediateData) ? intermediateData : [];
    const safeComponents = Array.isArray(componentData) ? componentData : [];
    const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];
    const materialCategoriesSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'materialCategories');
    const baseCurrencySetting = (settingsData || []).find((entry: any) => entry.settingKey === 'baseCurrency');

    setMaterials(safeIntermediate);
    setComponents(safeComponents);
    setConfiguredMaterialCategories(parseConfiguredList(materialCategoriesSetting?.settingValue));
    setBaseCurrencyMissing(safeCurrencies.length === 0 || !baseCurrencySetting?.settingValue);
  }

  async function loadBom(materialId: number) {
    const rows = await materialsApi.getIntermediateBom(materialId);
    setBomItems(Array.isArray(rows) ? rows : []);
  }

  function selectMaterial(material: MaterialRecord) {
    const knownCategory = materialCategories.includes(String(material.category || ''));
    setMaterialCustomCategoryValue(knownCategory ? '' : String(material.category || ''));
    setSelectedId(material.id);
    setForm({
      name: String(material.name || ''),
      sku: String(material.sku || ''),
      description: String(material.description || ''),
      category: knownCategory ? String(material.category || '') : '__custom__',
      unit: String(material.unit || 'kg'),
      intermediateCostMode: material.intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield',
      bulkQuantity: String(material.bulkQuantity || '1'),
      overheadPercentage: String(material.overheadPercentage || '0'),
      marginPercentage: String(material.marginPercentage || '0'),
      yieldPercentage: String(material.yieldPercentage || '100'),
    });
    setStatusText('');
  }

  function resolveCategoryForSave() {
    const resolved = normalizeChoiceValue(form.category, materialCustomCategoryValue);
    if (resolved) return resolved;
    if (materialCategories.includes('General')) return 'General';
    if (materialCategories.length > 0) return materialCategories[0];
    return 'Intermediate';
  }

  function handleAddIntermediate() {
    setShowCreatePanel(true);
  }

  function openEditMaterialForm(material: MaterialRecord) {
    selectMaterial(material);
    setComponentMaterialId(0);
    setComponentQuantity('1');
    setComponentSearch('');
    setShowAdvanced(false);
    setIsFormOpen(true);
  }

  function handleIntermediateMaterialPrev() {
    if (!selectedMaterial || editingIntermediateIndex <= 0) return;
    const prev = filteredMaterials[editingIntermediateIndex - 1];
    if (prev) {
      selectMaterial(prev);
      void loadBom(prev.id);
    }
  }

  function handleIntermediateMaterialNext() {
    if (!selectedMaterial) return;
    const last = filteredMaterials.length - 1;
    if (editingIntermediateIndex >= last) return;
    const next = filteredMaterials[editingIntermediateIndex + 1];
    if (next) {
      selectMaterial(next);
      void loadBom(next.id);
    }
  }

  function closeMaterialForm() {
    setIsFormOpen(false);
    setComponentSearch('');
    setComponentMaterialId(0);
    setComponentQuantity('1');
    setStatusText('');
  }

  function buildMaterialUpdatePayload(material: MaterialRecord, overrides?: Partial<MaterialRecord>) {
    return {
      name: String(overrides?.name ?? material.name ?? ''),
      sku: String(overrides?.sku ?? material.sku ?? ''),
      description: String(overrides?.description ?? material.description ?? ''),
      category: String(overrides?.category ?? material.category ?? ''),
      unit: String(overrides?.unit ?? material.unit ?? 'kg'),
      intermediateCostMode: String(overrides?.intermediateCostMode ?? material.intermediateCostMode ?? 'yield'),
      bulkQuantity: Number(overrides?.bulkQuantity ?? material.bulkQuantity ?? 1),
      bulkPrice: Number(overrides?.bulkPrice ?? material.bulkPrice ?? 0),
      purchaseCurrencyId: Number(overrides?.purchaseCurrencyId ?? material.purchaseCurrencyId ?? 1),
      overheadPercentage: Number(overrides?.overheadPercentage ?? material.overheadPercentage ?? 0),
      marginPercentage: Number(overrides?.marginPercentage ?? material.marginPercentage ?? 0),
      yieldPercentage: Number(overrides?.yieldPercentage ?? material.yieldPercentage ?? 100),
      calculatedCostPerUnit: Number(overrides?.calculatedCostPerUnit ?? material.unitPrice ?? material.calculatedCostPerUnit ?? 0),
      supplier: '',
      isActive: Boolean(overrides?.isActive ?? material.isActive),
      materialType: 'intermediate' as const,
    };
  }

  async function saveMaterial() {
    if (!selectedMaterial) return;

    setSaving(true);
    try {
      const resolvedCategory = resolveCategoryForSave();
      const costSnapshot = calculateIntermediateLiveCost();
      const resolvedBulkQuantity = toSafePositiveNumber(form.bulkQuantity, 1);
      if (String(resolvedBulkQuantity) !== form.bulkQuantity) {
        setForm((prev) => ({ ...prev, bulkQuantity: String(resolvedBulkQuantity) }));
      }

      const payload = {
        ...form,
        category: resolvedCategory,
        materialType: 'intermediate' as const,
        intermediateCostMode: form.intermediateCostMode,
        bulkQuantity: resolvedBulkQuantity,
        bulkPrice: Number(selectedMaterial.bulkPrice || 0),
        purchaseCurrencyId: Number(selectedMaterial.purchaseCurrencyId || 1),
        overheadPercentage: Number(form.overheadPercentage || 0),
        marginPercentage: Number(form.marginPercentage || 0),
        yieldPercentage: form.intermediateCostMode === 'completed_output' ? 100 : Number(form.yieldPercentage || 100),
        calculatedCostPerUnit: costSnapshot.costPerUnit,
        supplier: '',
      };

      await materialsApi.update(selectedMaterial.id, payload);
      await materialsApi.recalculateIntermediateCost(selectedMaterial.id);

      await loadData();
      setSelectedId(selectedMaterial.id);
      await loadBom(selectedMaterial.id);
      setStatusText('Saved intermediate material.');
      showToastMessage('Intermediate material updated', 'success');
    } catch (error: any) {
      const message = error?.message || 'Failed to save intermediate material';
      setStatusText(message);
      showToastMessage(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function addBomItem() {
    if (!selectedMaterial || !selectedId) return;
    if (componentMaterialId <= 0) return;

    const resolvedQuantityText = commitMathExpression(componentQuantity, setComponentQuantity);
    const quantity = Number(resolvedQuantityText || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToastMessage('Please enter a valid quantity', 'error');
      return;
    }

    await materialsApi.addIntermediateBomItem(selectedId, {
      componentMaterialId,
      quantity,
    });
    await materialsApi.recalculateIntermediateCost(selectedId);
    await loadData();
    await loadBom(selectedId);
    setComponentMaterialId(0);
    setComponentQuantity('1');
    setComponentSearch('');
    setStatusText('Added BOM component and recalculated cost.');
  }

  async function updateBomQuantity(item: IntermediateBomItemRecord, quantity: number) {
    if (!selectedId) return;
    await materialsApi.updateIntermediateBomItem(selectedId, item.id, { quantity });
    await loadBom(selectedId);
    await materialsApi.recalculateIntermediateCost(selectedId);
    await loadData();
    setStatusText('Updated BOM quantity and recalculated cost.');
  }

  function startBomEdit(item: IntermediateBomItemRecord) {
    setEditingBomId(item.id);
    setEditingQuantity(String(item.quantity || ''));
  }

  async function saveBomEdit(item: IntermediateBomItemRecord) {
    const resolvedQuantityText = commitMathExpression(editingQuantity, setEditingQuantity);
    const quantity = Number(resolvedQuantityText || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToastMessage('Please enter a valid quantity', 'error');
      return;
    }
    await updateBomQuantity(item, quantity);
    setEditingBomId(null);
    setEditingQuantity('');
  }

  function cancelBomEdit() {
    setEditingBomId(null);
    setEditingQuantity('');
  }

  async function deleteBomItem(item: IntermediateBomItemRecord) {
    if (!selectedId) return;
    await materialsApi.deleteIntermediateBomItem(selectedId, item.id);
    await materialsApi.recalculateIntermediateCost(selectedId);
    await loadData();
    await loadBom(selectedId);
    if (editingBomId === item.id) {
      setEditingBomId(null);
      setEditingQuantity('');
    }
    setStatusText('Removed BOM component and recalculated cost.');
  }

  async function recalculateSelected() {
    if (!selectedId) return;
    await materialsApi.recalculateIntermediateCost(selectedId);
    await loadData();
    await loadBom(selectedId);
    setStatusText('Cost recalculated from latest component prices.');
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

  async function handleDuplicateMaterial(material: MaterialRecord) {
    try {
      const existingNames = new Set(materials.map((item) => (item.name || '').trim().toLowerCase()));
      const duplicatedName = buildDuplicateName(material.name, existingNames);
      const duplicatedSku = material.sku ? `${String(material.sku).trim()}-COPY` : '';

      const created = await materialsApi.create({
        name: duplicatedName,
        sku: duplicatedSku,
        description: String(material.description || ''),
        category: String(material.category || ''),
        unit: String(material.unit || 'kg'),
        bulkQuantity: Number(material.bulkQuantity || 1),
        bulkPrice: Number(material.bulkPrice || 0),
        purchaseCurrencyId: Number(material.purchaseCurrencyId || 0),
        supplier: '',
        materialType: 'intermediate',
        overheadPercentage: Number(material.overheadPercentage || 0),
        marginPercentage: Number(material.marginPercentage || 0),
        intermediateCostMode: material.intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield',
        yieldPercentage: Number(material.yieldPercentage || 100),
        calculatedCostPerUnit: Number(material.unitPrice || 0),
      });

      const sourceBom = await materialsApi.getIntermediateBom(material.id);
      const sourceBomItems = Array.isArray(sourceBom) ? sourceBom : [];

      for (const bomItem of sourceBomItems) {
        await materialsApi.addIntermediateBomItem(created.id, {
          componentMaterialId: bomItem.componentMaterialId,
          quantity: Number(bomItem.quantity || 0),
        });
      }

      await loadData();
      showToastMessage('Intermediate material duplicated successfully', 'success');
    } catch (error: any) {
      console.error('Error duplicating intermediate material:', error);
      showToastMessage(error?.message || 'Failed to duplicate intermediate material', 'error');
    }
  }

  function handleDeleteMaterial(material: MaterialRecord) {
    setDeleteTarget(material);
  }

  async function handleConfirmDeleteMaterial() {
    if (!deleteTarget) return;
    const materialName = deleteTarget.name;

    try {
      await materialsApi.delete(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setForm(emptyForm);
        setBomItems([]);
        setIsFormOpen(false);
      }
      setDeleteTarget(null);
      await loadData();
      setStatusText(`Deleted ${materialName}.`);
      showToastMessage(`Deleted ${materialName}`, 'success');
    } catch (error: any) {
      const message = error?.message || 'Failed to delete intermediate material';
      setStatusText(message);
      showToastMessage(message, 'error');
    }
  }

  function handleOpenBulkDeleteModal() {
    if (selectedIds.size === 0) return;
    setShowBulkDeleteModal(true);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      return;
    }

    setBulkDeleting(true);
    const count = selectedIds.size;
    try {
      await materialsApi.bulkDeleteIntermediates(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      await loadData();
      showToastMessage(`Deleted ${count} intermediate material${count !== 1 ? 's' : ''}`, 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to delete selected materials', 'error');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleToggleMaterialActive(material: MaterialRecord) {
    try {
      await materialsApi.update(material.id, buildMaterialUpdatePayload(material, { isActive: !material.isActive }));
      await loadData();
      showToastMessage(`${material.name} marked as ${material.isActive ? 'inactive' : 'active'}`, 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to update material status', 'error');
    }
  }

  function buildExportRows(source: MaterialRecord[]) {
    return source.map((material) => {
      const calculatedCost = Number(material.unitPrice || material.calculatedCostPerUnit || 0);
      return [
        material.name,
        material.category,
        material.unit,
        formatExportNumber(Number(material.yieldPercentage || 0)),
        formatIntermediateCostingMethod(material.intermediateCostMode),
        formatExportNumber(calculatedCost),
        baseCurrency,
        formatExportNumber(calculatedCost * (1 + Number(material.marginPercentage || 0) / 100)),
        formatExportNumber(Number(material.overheadPercentage || 0)),
        formatExportNumber(Number(material.marginPercentage || 0)),
        material.isActive ? 'Active' : 'Inactive',
      ];
    });
  }

  async function handlePrintIntermediateExport() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to print', 'error');
      return;
    }

    const printed = await printExportTable({
      title: 'Intermediate Materials',
      subtitle: `${filteredMaterials.length} intermediates`,
      headers: getIntermediateExportHeaders(),
      rows: buildExportRows(filteredMaterials),
      rightAlignFromColumn: 3,
      landscape: true,
      fontSize: '11px',
    });

    if (!printed) {
      showToastMessage('Allow pop-ups to print the intermediate materials list.', 'error');
    }
  }

  function handleExportFilteredMaterialsCsv() {
    const date = new Date().toISOString().split('T')[0];
    const exportHeaders = getIntermediateExportHeaders();
    downloadCsv(
      `intermediate-materials-${date}.csv`,
      exportHeaders,
      buildExportRows(filteredMaterials),
    );
    showToastMessage(`Exported ${filteredMaterials.length} intermediate materials to CSV`, 'success');
  }

  function handleExportFilteredMaterialsExcel() {
    const exportHeaders = getIntermediateExportHeaders();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      exportHeaders,
      ...buildExportRows(filteredMaterials),
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Intermediate Materials');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `intermediate-materials-${date}.xlsx`);
    showToastMessage(`Exported ${filteredMaterials.length} intermediate materials to Excel`, 'success');
  }

  async function handleBulkSetActiveState(nextIsActive: boolean) {
    const targets = materials.filter((material) => selectedIds.has(material.id));
    if (targets.length === 0) {
      return;
    }

    try {
      await Promise.all(targets.map((material) => materialsApi.update(material.id, buildMaterialUpdatePayload(material, { isActive: nextIsActive }))));
      await loadData();
      showToastMessage(`Updated ${targets.length} intermediate material${targets.length !== 1 ? 's' : ''}`, 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to update selected materials', 'error');
    }
  }

  function handleBulkExport() {
    const targets = filteredMaterials.filter((material) => selectedIds.has(material.id));
    if (targets.length === 0) {
      return;
    }

    const exportHeaders = getIntermediateExportHeaders();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      exportHeaders,
      ...buildExportRows(targets),
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Selected Intermediate');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `intermediate-materials-selected-${date}.xlsx`);
    showToastMessage(`Exported ${targets.length} selected intermediate materials`, 'success');
  }

  function resetImportState() {
    setImportFile(null);
    setImportPreview([]);
    setImportFailures([]);
    setImportSuccessCount(0);
  }

  async function handleMaterialSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await saveMaterial();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportFailures([]);
    setImportSuccessCount(0);

    const extension = (file.name.split('.').pop() || '').toLowerCase();

    if (extension === 'csv') {
      const textReader = new FileReader();
      textReader.onload = (event) => {
        try {
          const text = String(event.target?.result || '');
          const rows = parseCsvText(text);
          setImportPreview(rows);
        } catch (error) {
          console.error('Error reading CSV file:', error);
          setImportPreview([]);
          setStatusText('Failed to parse CSV file.');
        }
      };
      textReader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const jsonData = readImportDataRows(workbook);
        setImportPreview(jsonData as any[]);
      } catch (error) {
        console.error('Error reading file:', error);
        setImportPreview([]);
        setStatusText('Failed to parse import file.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleImportIntermediateMaterials() {
    if (importPreview.length === 0) {
      setStatusText('No rows available for import.');
      return;
    }

    setImporting(true);
    const failures: Array<{ rowNumber: number; name: string; reason: string; originalRow: any }> = [];
    let successCount = 0;

    for (let i = 0; i < importPreview.length; i += 1) {
      const row = importPreview[i];
      const rowNumber = i + 1;
      const name = String(row['Material Name'] || row['name'] || '').trim();
      const sku = String(row['SKU'] || row['sku'] || '').trim();
      const category = String(row['Category'] || row['category'] || '').trim() || 'Intermediate';
      const unit = String(row['Unit'] || row['unit'] || '').trim() || 'kg';
      const bulkQuantity = Number(row['Bulk Quantity'] || row['bulkQuantity'] || 1);
      const overheadPercentage = Number(row['Overhead %'] || row['overheadPercentage'] || 0);
      const marginPercentage = Number(row['Margin %'] || row['marginPercentage'] || 0);
      const yieldPercentage = Number(row['Yield %'] || row['yieldPercentage'] || 100);
      const description = String(row['Description'] || row['description'] || '').trim();

      if (!name) {
        failures.push({ rowNumber, name: '', reason: 'Material Name is required', originalRow: row });
        continue;
      }
      if (!Number.isFinite(bulkQuantity) || bulkQuantity <= 0) {
        failures.push({ rowNumber, name, reason: 'Bulk Quantity must be a positive number', originalRow: row });
        continue;
      }
      if (!Number.isFinite(overheadPercentage) || !Number.isFinite(marginPercentage) || !Number.isFinite(yieldPercentage)) {
        failures.push({ rowNumber, name, reason: 'Overhead, Margin and Yield must be numeric', originalRow: row });
        continue;
      }

      try {
        await materialsApi.create({
          name,
          sku,
          description,
          category,
          unit,
          bulkQuantity,
          bulkPrice: 0,
          purchaseCurrencyId: 0,
          supplier: '',
          materialType: 'intermediate',
          overheadPercentage,
          marginPercentage,
          yieldPercentage,
          calculatedCostPerUnit: 0,
        });

        successCount += 1;
      } catch (error: any) {
        failures.push({
          rowNumber,
          name,
          reason: error?.message || 'Import failed for this row',
          originalRow: row,
        });
      }
    }

    setImportFailures(failures);
    setImportSuccessCount(successCount);
    setImporting(false);

    await loadData();
    setStatusText(`Imported ${successCount} item${successCount !== 1 ? 's' : ''}${failures.length > 0 ? `, ${failures.length} failed` : ''}.`);
  }

  function downloadFailureReport() {
    if (!importFailures || importFailures.length === 0) return;

    const rows = importFailures.map((failure) => {
      const source = failure.originalRow || {};
      return [
        failure.rowNumber,
        source['Material Name'] || source['name'] || '',
        source['SKU'] || source['sku'] || '',
        source['Category'] || source['category'] || '',
        source['Unit'] || source['unit'] || '',
        source['Bulk Quantity'] || source['bulkQuantity'] || '',
        source['Overhead %'] || source['overheadPercentage'] || '',
        source['Margin %'] || source['marginPercentage'] || '',
        source['Yield %'] || source['yieldPercentage'] || '',
        source['Description'] || source['description'] || '',
        failure.reason,
      ];
    });

    const date = new Date().toISOString().split('T')[0];
    downloadCsv(
      `intermediate-materials-import-failures-${date}.csv`,
      ['Row Number', 'Material Name', 'SKU', 'Category', 'Unit', 'Bulk Quantity', 'Overhead %', 'Margin %', 'Yield %', 'Description', 'Failure Reason'],
      rows
    );
  }

  async function handleIntermediateImport() {
    if (!intermediateImportFile) return;

    setImporting(true);
    try {
      const result = await materialsApi.importIntermediateMaterials(intermediateImportFile);
      setIntermediateImportResult(result);
      await loadData();

      if (result.skipped === 0) {
        setShowIntermediateImportModal(false);
        setIntermediateImportFile(null);
        showToastMessage(`Imported ${result.imported} intermediate material${result.imported !== 1 ? 's' : ''} successfully`, 'success');
      } else {
        showToastMessage(`Import complete: ${result.imported} imported, ${result.skipped} failed.`, 'error');
      }
    } catch (error: any) {
      console.error('Error importing intermediate materials:', error);
      showToastMessage(error?.message || 'Failed to import intermediate materials', 'error');
    } finally {
      setImporting(false);
    }
  }

  function handleIntermediateFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIntermediateImportFile(file);
    setIntermediateImportResult(null);
  }

  const availableComponents = components.filter((m) => m.id !== selectedId && m.isActive);

  const filteredAvailableComponents = useMemo(() => {
    const query = componentSearch.trim().toLowerCase();
    if (!query) {
      return availableComponents;
    }

    return availableComponents.filter((material) => {
      const haystack = [material.name, material.sku, material.category]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [availableComponents, componentSearch]);

  function calculateIntermediateLiveCost() {
    const totalMaterialCost = bomItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);

    const overheadPercentage = Number(form.overheadPercentage || 0) / 100;
    const overheadCost = totalMaterialCost * overheadPercentage;
    const batchTotalCost = totalMaterialCost + overheadCost;

    const batchQuantity = Math.max(0.0001, Number(form.bulkQuantity || 1));
    const yieldPercent = Math.max(0.0001, Number(form.yieldPercentage || 100));
    const effectiveOutputQuantity = form.intermediateCostMode === 'completed_output'
      ? batchQuantity
      : batchQuantity * (yieldPercent / 100);
    const costPerUnit = batchTotalCost / effectiveOutputQuantity;

    const marginPercentage = Number(form.marginPercentage || 0) / 100;
    const profitAmount = costPerUnit * marginPercentage;
    const optimalPrice = costPerUnit + profitAmount;

    return {
      batchMaterialCost: totalMaterialCost,
      batchOverheadCost: overheadCost,
      batchTotalCost,
      batchQuantity,
      effectiveOutputQuantity,
      costPerUnit,
      profitAmount,
      optimalPrice,
    };
  }

  const liveCost = calculateIntermediateLiveCost();
  const currencySymbol = selectedMaterial?.baseCurrencySymbol || components[0]?.baseCurrencySymbol || '';
  const formatMoney = (amount: number) => `${currencySymbol}${currencySymbol ? ' ' : ''}${amount.toFixed(2)}`;

  return (
    <>
      <div className="materials-tab-body">
        <div className="app-card app-filter-card">
          <input
            className="app-toolbar-input"
            type="search"
            placeholder="Search intermediate materials..."
            value={materialSearch}
            onChange={(e) => setMaterialSearch(e.target.value)}
          />
          <select
            className="app-toolbar-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportFilteredMaterialsCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportFilteredMaterialsExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Table size={14} />
              Export Excel
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void handlePrintIntermediateExport()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} />
              Print
            </button>
          </div>
          <ActionDropdown
            label="+ Add"
            buttonClassName="btn btn-primary btn-sm"
            disabled={baseCurrencyMissing}
            disabledTitle="Set a base currency first in Settings"
            items={[
              {
                key: 'add-single',
                label: 'Add single intermediate',
                icon: <Plus size={14} strokeWidth={2} />,
                onSelect: handleAddIntermediate,
              },
              { key: 'divider-add', type: 'divider' as const },
              {
                key: 'import-csv',
                label: 'Import from CSV',
                icon: <Upload size={14} strokeWidth={2} />,
                onSelect: () => setShowIntermediateImportModal(true),
              },
            ]}
          />
        </div>

        {hasActiveIntermediateFilters ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
            {materialSearch.trim() !== '' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', padding: '3px 8px', borderRadius: '12px' }}>
                Search: {materialSearch.trim()}
                <button type="button" onClick={() => setMaterialSearch('')} aria-label="Clear search filter" style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px 4px', margin: '-2px -4px -2px 0' }}>×</button>
              </span>
            ) : null}
            {selectedStatus !== 'active' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', padding: '3px 8px', borderRadius: '12px' }}>
                Showing: {formatIntermediateStatusLabel(selectedStatus)}
                <button type="button" onClick={() => setSelectedStatus('active')} aria-label="Clear status filter" style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px 4px', margin: '-2px -4px -2px 0' }}>×</button>
              </span>
            ) : null}
            <button type="button" onClick={clearAllIntermediateFilters} style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600 }}>
              Clear all filters
            </button>
          </div>
        ) : null}

        {selectedIds.size > 0 ? (
          <div
            className="app-bulk-bar app-bulk-bar-sticky"
            style={{
              backgroundColor: '#0F2847',
              color: '#ffffff',
              padding: '10px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '15px', color: '#cbd5e1' }}>
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => void handleBulkSetActiveState(true)}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Eye size={14} strokeWidth={2} />
              Set active
            </button>
            <button
              type="button"
              onClick={() => void handleBulkSetActiveState(false)}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <EyeOff size={14} strokeWidth={2} />
              Set inactive
            </button>
            <ActionDropdown
              label="Export selected"
              buttonClassName="btn btn-outline btn-sm"
              items={[
                {
                  key: 'export-excel',
                  label: 'Export Excel',
                  onSelect: handleBulkExport,
                  icon: <Table size={14} />,
                },
              ]}
            />
            <ActionDropdown
              label="More"
              buttonClassName="btn btn-ghost btn-sm"
              items={[
                {
                  key: 'delete-selected',
                  label: bulkDeleting ? 'Delete selected (deleting...)' : 'Delete selected',
                  onSelect: handleOpenBulkDeleteModal,
                  icon: <Trash2 size={13} strokeWidth={2} />,
                  disabled: bulkDeleting,
                  destructive: true,
                },
              ]}
            />
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', color: '#e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <X size={14} strokeWidth={2} />
              Clear selection
            </button>
          </div>
        ) : null}

        <div className="app-card app-data-card" style={{ padding: 0 }}>
          <div className="app-data-card-header">
            <span className="app-data-card-title">Intermediate Materials ({filteredMaterials.length})</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <ColumnSelectorDropdown
                columns={INTERMEDIATE_MATERIALS_COLUMNS}
                isVisible={isIntermediateColumnIdVisible}
                toggleColumn={handleToggleIntermediateColumn}
                resetToDefaults={resetIntermediateColumns}
              />
              <TableDensityToggle
                density={tableDensity}
                onToggleDensity={() => setTableDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))}
              />
              <TableZoomControl zoomPercent={zoomPercent} decreaseZoom={decreaseZoom} increaseZoom={increaseZoom} />
            </div>
          </div>
          <div className="app-table-wrap app-table-sticky" style={{ zoom: `${zoomPercent}%` }}>
            <table className={`app-table app-table-uniform-numbers ${tableDensity === 'compact' ? 'app-table-compact' : ''}`}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ width: '32px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredMaterials.length > 0 && filteredMaterials.every((material) => selectedIds.has(material.id))}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredMaterials.length;
                        }
                      }}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', display: 'inline-block' }}
                    />
                  </th>
                  <th style={{ textAlign: 'left', fontWeight: '700', width: '220px', minWidth: '220px', whiteSpace: 'nowrap' }}>Material</th>
                  {isIntermediateColumnVisible('unit') && <th style={{ textAlign: 'left', fontWeight: '700', width: '68px', whiteSpace: 'nowrap' }}>Unit</th>}
                  {isIntermediateColumnVisible('yield') && <th style={{ textAlign: 'right', fontWeight: '700', width: '88px', whiteSpace: 'nowrap' }}>Yield %</th>}
                  {isIntermediateColumnVisible('overhead') && <th style={{ textAlign: 'right', fontWeight: '700', width: '92px', whiteSpace: 'nowrap' }}>Overhead</th>}
                  {isIntermediateColumnVisible('unitCost') && <th style={{ textAlign: 'right', fontWeight: '700', width: '92px', whiteSpace: 'nowrap' }}>Unit Cost</th>}
                  <th style={{ textAlign: 'left', fontWeight: '700', width: '84px', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ textAlign: 'center', fontWeight: '700', width: '150px', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material) => (
                  <tr
                    key={material.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      color: material.isActive ? undefined : '#aaaaaa',
                      cursor: 'pointer',
                      backgroundColor: hoveredRowId === material.id ? '#f8fafc' : 'transparent',
                    }}
                    onMouseEnter={() => setHoveredRowId(material.id)}
                    onMouseLeave={() => setHoveredRowId(null)}
                    onClick={() => navigate(`/intermediate-materials/${material.id}`, { state: { from: '/materials?tab=intermediate' } })}
                  >
                    <td style={{ padding: '8px 14px', width: '32px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(material.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelectOne(material.id, e.target.checked); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '8px 14px', minWidth: '220px' }}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/intermediate-materials/${material.id}`, { state: { from: '/materials?tab=intermediate' } });
                        }}
                        style={{
                          fontWeight: '600',
                          fontSize: '14px',
                          color: hoveredRowId === material.id ? '#16A34A' : undefined,
                          textDecoration: hoveredRowId === material.id ? 'underline' : 'none',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={material.sku ? `${material.name} (SKU: ${material.sku})` : material.name}
                      >
                        {material.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{material.sku || 'No SKU'}</div>
                    </td>
                    {isIntermediateColumnVisible('unit') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{material.unit}</td>}
                    {isIntermediateColumnVisible('yield') && <td style={{ padding: '8px 14px', textAlign: 'right' }}>{Number(material.yieldPercentage || 0).toFixed(1)}</td>}
                    {isIntermediateColumnVisible('overhead') && <td style={{ padding: '8px 14px', textAlign: 'right' }}>{Number(material.overheadPercentage || 0).toFixed(1)}%</td>}
                    {isIntermediateColumnVisible('unitCost') && <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {material.baseCurrencySymbol}{Number(material.unitPrice || material.calculatedCostPerUnit || 0).toFixed(2)}
                    </td>}
                    <td style={{ padding: '8px 14px' }}><AppBadge variant={material.isActive ? 'success' : 'inactive'} size="sm">{material.isActive ? 'Active' : 'Inactive'}</AppBadge></td>
                    <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                      <div
                        style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap', alignItems: 'center', justifyContent: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AppButton onClick={(e) => { e.stopPropagation(); void handleToggleMaterialActive(material); }} variant="ghost" size="sm" className="app-row-action-icon" title={material.isActive ? 'Set Inactive' : 'Set Active'} ariaLabel={`${material.isActive ? 'Set inactive' : 'Set active'} ${material.name}`} style={{ backgroundColor: 'transparent', display: 'inline-flex', alignItems: 'center', padding: '2px', minWidth: '20px' }}>
                          {material.isActive ? <EyeOff size={11} strokeWidth={2} /> : <Eye size={11} strokeWidth={2} />}
                        </AppButton>
                        <OverflowMenu
                          ariaLabel={`More actions for ${material.name}`}
                          items={[
                            { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicateMaterial(material) },
                            { label: 'Delete', icon: Trash2, onClick: () => handleDeleteMaterial(material), danger: true },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMaterials.length === 0 ? (
              materials.length === 0 ? (
                <div className="app-empty-state">
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <Layers size={24} color="#94a3b8" />
                  </div>
                  <div className="app-empty-state-title">
                    No intermediate materials yet
                  </div>
                  <div className="app-empty-state-text">
                    Intermediate materials are recipes built from your primary materials. Add one to get started.
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: '16px' }}
                    type="button"
                    onClick={handleAddIntermediate}
                  >
                    + Add intermediate material
                  </button>
                </div>
              ) : (
                <div className="app-empty-state">
                  <div className="app-empty-state-title">No matching intermediate materials</div>
                  <div className="app-empty-state-text">Adjust filters or add a new intermediate material to get started</div>
                  {hasActiveIntermediateFilters ? (
                    <button type="button" className="btn btn-outline" style={{ marginTop: '16px' }} onClick={clearAllIntermediateFilters}>
                      Clear all filters
                    </button>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </div>

        {isFormOpen && selectedMaterial ? (
          <div className="app-drawer-overlay">
            <div
              className="app-drawer-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="btn-close-x" type="button" onClick={closeMaterialForm} aria-label="Close">
                &times;
              </button>
              <div className="app-drawer-panel__scroll">
              <div className="app-drawer-header" style={{ paddingRight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                  <div>
                    <h3>Edit Intermediate Material</h3>
                    <div className="app-drawer-header__subtitle">Update material details and cost settings inline</div>
                  </div>
                  {selectedMaterial && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '6px',
                      marginLeft: '12px',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        <button
                          type="button"
                          onClick={handleIntermediateMaterialPrev}
                          disabled={editingIntermediateIndex === 0}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="Previous intermediate material"
                        >
                          ← Prev
                        </button>
                        <span style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                        }}>
                          {editingIntermediateIndex + 1} of {filteredMaterials.length}
                        </span>
                        <button
                          type="button"
                          onClick={handleIntermediateMaterialNext}
                          disabled={editingIntermediateIndex === filteredMaterials.length - 1}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="Next intermediate material"
                        >
                          Next →
                        </button>
                      </div>
                      {showPrevNextHint && prevNextNavVisible && filteredMaterials.length > 1 ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            backgroundColor: '#DCFCE7',
                            border: '1px solid #16A34A',
                            color: '#15803D',
                            fontSize: '12px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            maxWidth: '320px',
                          }}
                        >
                          <span>Tip: Use Previous and Next to move between items without going back to the list</span>
                          <button
                            type="button"
                            onClick={dismissPrevNextHint}
                            aria-label="Dismiss tip"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#15803D',
                              cursor: 'pointer',
                              fontSize: '14px',
                              lineHeight: 1,
                              padding: '0 2px',
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <button className="btn btn-danger-solid btn-sm" type="button" onClick={closeMaterialForm}>Close</button>
              </div>

              <div className="app-card" style={{ display: 'grid', gap: 10 }}>
            <div>
              <h3 className="app-form-section-title">Material Details</h3>
            </div>
            <form id="intermediate-material-form" onSubmit={handleMaterialSubmit}>
              <div style={formSectionStyle}>
                <h3 className="app-form-section-title">Basic Info</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={fieldLabelStyle}>Material Name *</label>
                    <input
                      className="app-input"
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      style={fieldInputStyle}
                    />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>Unit *</label>
                    <input
                      className="app-input"
                      type="text"
                      required
                      value={form.unit}
                      onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                      style={fieldInputStyle}
                    />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>Yield % *</label>
                    <input
                      className="app-input"
                      type="number"
                      step="0.1"
                      required
                      value={form.yieldPercentage}
                      onChange={(e) => setForm((prev) => ({ ...prev, yieldPercentage: e.target.value }))}
                      style={fieldInputStyle}
                    />
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                      Enter the usable output as a percentage. For example if 100g of ingredients yields 80g of finished material enter 80.
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '13px',
                      color: '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Advanced settings
                    {showAdvanced ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  </button>
                </div>

                {showAdvanced ? (
                  <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={fieldLabelStyle}>SKU</label>
                        <input
                          className="app-input"
                          type="text"
                          value={form.sku}
                          onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                          style={fieldInputStyle}
                        />
                      </div>
                      <div>
                        <label style={fieldLabelStyle}>Category *</label>
                        <select
                          className="app-input"
                          required
                          value={form.category}
                          onChange={(e) => {
                            const value = e.target.value;
                            setForm((prev) => ({ ...prev, category: value }));
                            if (value !== '__custom__') {
                              setMaterialCustomCategoryValue('');
                            }
                          }}
                          style={fieldInputStyle}
                        >
                          <option value="" disabled>
                            Select category
                          </option>
                          {materialCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                          <option value="__custom__">+ Add new category...</option>
                        </select>
                        {form.category === '__custom__' ? (
                          <input
                            className="app-input"
                            type="text"
                            required
                            value={materialCustomCategoryValue}
                            onChange={(e) => setMaterialCustomCategoryValue(e.target.value)}
                            placeholder="Enter new category"
                            style={{ ...fieldInputStyle, marginTop: '8px' }}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>Description</label>
                      <textarea
                        className="app-input"
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        style={{ ...fieldInputStyle, minHeight: '60px', resize: 'vertical' }}
                      />
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>Costing Method</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <div className="app-choice-tabs" role="tablist" aria-label="Costing method">
                          <button
                            className={`app-choice-tab ${form.intermediateCostMode === 'completed_output' ? 'is-active' : ''}`}
                            type="button"
                            role="tab"
                            aria-selected={form.intermediateCostMode === 'completed_output'}
                            onClick={() => setForm((prev) => ({ ...prev, intermediateCostMode: 'completed_output', yieldPercentage: '100' }))}
                          >
                            Completed output
                          </button>
                          <button
                            className={`app-choice-tab ${form.intermediateCostMode === 'yield' ? 'is-active' : ''}`}
                            type="button"
                            role="tab"
                            aria-selected={form.intermediateCostMode === 'yield'}
                            onClick={() => setForm((prev) => ({ ...prev, intermediateCostMode: 'yield' }))}
                          >
                            Yield-based
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '14px', color: '#64748b' }}>
                        {form.intermediateCostMode === 'completed_output'
                          ? 'Enter final completed quantity directly. Unit cost = total batch cost / completed output quantity.'
                          : 'Enter batch quantity and process yield %. Unit cost is adjusted by expected loss.'}
                      </div>
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>{form.intermediateCostMode === 'completed_output' ? 'Completed Output Quantity *' : 'Batch Quantity *'}</label>
                      <input
                        className="app-input"
                        type="text"
                        inputMode="decimal"
                        required
                        value={form.bulkQuantity}
                        onChange={(e) => setForm((prev) => ({ ...prev, bulkQuantity: e.target.value }))}
                        onBlur={() => {
                          commitMathExpression(form.bulkQuantity, (value) => {
                            setForm((prev) => ({ ...prev, bulkQuantity: value }));
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const resolved = commitMathExpression(form.bulkQuantity, (value) => {
                              setForm((prev) => ({ ...prev, bulkQuantity: value }));
                            });
                            if (resolved !== form.bulkQuantity) {
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }
                        }}
                        style={fieldInputStyle}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={fieldLabelStyle}>Overhead % *</label>
                        <input
                          className="app-input"
                          type="number"
                          step="0.1"
                          required
                          value={form.overheadPercentage}
                          onChange={(e) => setForm((prev) => ({ ...prev, overheadPercentage: e.target.value }))}
                          style={fieldInputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ ...fieldLabelStyle, display: 'inline-flex', alignItems: 'center' }}>
                          Markup % *
                          <MarkupInfoTooltip />
                        </label>
                        <input
                          className="app-input"
                          type="number"
                          step="0.1"
                          required
                          value={form.marginPercentage}
                          onChange={(e) => setForm((prev) => ({ ...prev, marginPercentage: e.target.value }))}
                          style={fieldInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="app-card" style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0 }}>Bill of Materials</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>Select Material</label>
                  <input
                    className="app-input"
                    type="search"
                    placeholder="Search and select material..."
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                  <select className="app-input" value={componentMaterialId} onChange={(e) => setComponentMaterialId(Number(e.target.value))}>
                    <option value={0}>Select component material...</option>
                    {filteredAvailableComponents.map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                  <input
                    className="app-input"
                    type="text"
                    inputMode="decimal"
                    value={componentQuantity}
                    onChange={(e) => setComponentQuantity(e.target.value)}
                    onBlur={() => {
                      commitMathExpression(componentQuantity, setComponentQuantity);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const resolved = commitMathExpression(componentQuantity, setComponentQuantity);
                        if (resolved !== componentQuantity) {
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }
                    }}
                    placeholder="Qty or =2+2"
                  />
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => void addBomItem()}>Add</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Showing {filteredAvailableComponents.length} of {availableComponents.length} active component materials
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="app-table app-table-compact" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '36%', textAlign: 'left' }}>Material</th>
                        <th style={{ textAlign: 'right' }}>Quantity</th>
                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomItems.map((item) => {
                        const rowTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                        const isEditing = editingBomId === item.id;

                        return (
                          <tr key={item.id}>
                            <td style={{ textAlign: 'left' }}>{item.componentMaterialName}</td>
                            <td style={{ textAlign: 'right' }}>
                              {isEditing ? (
                                <input
                                  className="app-input"
                                  type="text"
                                  inputMode="decimal"
                                  value={editingQuantity}
                                  onChange={(e) => setEditingQuantity(e.target.value)}
                                  onBlur={() => {
                                    commitMathExpression(editingQuantity, setEditingQuantity);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void saveBomEdit(item);
                                    }
                                  }}
                                  style={{ maxWidth: 120 }}
                                />
                              ) : (
                                <span>{Number(item.quantity || 0).toFixed(3)} {item.unit}</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(Number(item.unitPrice || 0))}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(rowTotal)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {isEditing ? (
                                  <>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => void saveBomEdit(item)}>Save</button>
                                    <button className="btn btn-outline btn-sm" type="button" onClick={cancelBomEdit}>Cancel</button>
                                  </>
                                ) : (
                                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => startBomEdit(item)}>Edit</button>
                                )}
                                <button className="btn btn-danger btn-sm" type="button" onClick={() => void deleteBomItem(item)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {bomItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ color: '#64748b' }}>No BOM components yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ ...formSectionStyle, marginBottom: 0, backgroundColor: '#f8fbff', borderColor: '#dbeafe' }}>
                <h3 className="app-form-section-title">Cost Summary (per unit)</h3>
                <div style={{ fontSize: '15px', color: '#475569', marginBottom: '12px' }}>
                  Calculated unit cost updates from the intermediate BOM and current component prices.
                </div>
                <div style={{ display: 'grid', gap: '6px', fontSize: '15px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Material Cost (batch)</span>
                    <span style={{ fontWeight: '600' }}>{formatMoney(liveCost.batchMaterialCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Overhead ({Number(form.overheadPercentage || 0).toFixed(0)}%)</span>
                    <span style={{ fontWeight: '600' }}>{formatMoney(liveCost.batchOverheadCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Total Production Cost (batch)</span>
                    <span style={{ fontWeight: '700' }}>{formatMoney(liveCost.batchTotalCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>{form.intermediateCostMode === 'completed_output' ? 'Completed Output Qty' : 'Effective Output Qty'}</span>
                    <span style={{ fontWeight: '600' }}>{liveCost.effectiveOutputQuantity.toFixed(3)} {form.unit || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Cost Per Unit</span>
                    <span style={{ fontWeight: '700' }}>{formatMoney(liveCost.costPerUnit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Profit ({Number(form.marginPercentage || 0).toFixed(0)}%)</span>
                    <span style={{ fontWeight: '600' }}>{formatMoney(liveCost.profitAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontWeight: '700' }}>Optimal Price</span>
                    <span style={{ fontWeight: '700', color: '#16a34a', fontSize: '18px' }}>{formatMoney(liveCost.optimalPrice)}</span>
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#475569' }}>
                  Current stored unit cost: {formatMoney(Number(selectedMaterial?.unitPrice || 0))}
                </div>
              </div>
            </form>
            {statusText ? <div style={{ fontSize: 12, color: '#0f766e', marginTop: 8 }}>{statusText}</div> : null}
              </div>
              </div>
              <div className="app-drawer-footer">
                <button
                  className="btn btn-primary btn-sm"
                  type="submit"
                  form="intermediate-material-form"
                  disabled={saving || !form.name.trim() || !form.unit.trim()}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn btn-info btn-sm" type="button" onClick={() => void recalculateSelected()}>
                  Recalculate Cost
                </button>
                <button className="btn btn-danger-solid btn-sm" type="button" onClick={closeMaterialForm}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showImportModal ? (
          <div className="app-modal-overlay">
            <div className="app-modal app-modal-wide" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <button className="btn-close-x" onClick={() => { setShowImportModal(false); resetImportState(); }} aria-label="Close">
                &times;
              </button>
              <h2 className="app-modal-title">Import Intermediate Materials</h2>

              {!importFile ? (
                <div>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <a
                      href={templateUrl('PriceRight_Intermediates_Import_Template.xlsx')}
                      onClick={(e) => {
                        e.preventDefault();
                        void handleDownload('PriceRight_Intermediates_Import_Template.xlsx');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#0f172a',
                        fontWeight: '600',
                        fontSize: '16px',
                        textDecoration: 'none',
                        cursor: downloading ? 'wait' : 'pointer',
                        opacity: downloading ? 0.6 : 1,
                        pointerEvents: downloading ? 'none' : 'auto',
                      }}
                    >
                      <ArrowDownToLine size={14} strokeWidth={2} style={{ color: '#64748b' }} />
                      {downloading === 'PriceRight_Intermediates_Import_Template.xlsx' ? 'Downloading...' : 'Download import template'}
                    </a>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>Fill it in and upload below</div>
                  </div>
                  <label htmlFor="intermediate-file-upload" style={{ display: 'block', padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#f8fafc' }}>
                    <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><FileUp size={42} strokeWidth={1.8} /></div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Upload using the standard template</div>
                    <div style={{ fontSize: '16px', color: '#64748b' }}>Best experience: use the CSV template. Excel files are also accepted.</div>
                    <input id="intermediate-file-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>

                  <div style={{ marginTop: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>Template requirements</div>
                    <div style={{ fontSize: '15px', color: '#475569' }}>Required fields: Material Name, Category, Unit, Bulk Quantity, Yield %, Overhead %, Margin %.</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}><strong>File:</strong> {importFile.name} ({importPreview.length} rows)</div>
                  {importPreview.length > 0 ? (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Material Name</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Yield %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 10).map((row, idx) => (
                            <tr key={`import-preview-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px' }}>{row['Material Name'] || row['name'] || '-'}</td>
                              <td style={{ padding: '8px' }}>{row['Category'] || row['category'] || '-'}</td>
                              <td style={{ padding: '8px' }}>{row['Unit'] || row['unit'] || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{row['Yield %'] || row['yieldPercentage'] || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={resetImportState} className="btn btn-secondary">Choose Different File</button>
                    <button onClick={() => void handleImportIntermediateMaterials()} disabled={importing || importPreview.length === 0} className="btn btn-success">
                      {importing ? 'Importing...' : `Import ${importPreview.length} Materials`}
                    </button>
                  </div>

                  {importSuccessCount > 0 || importFailures.length > 0 ? (
                    <div style={{ marginTop: '16px' }}>
                      {importSuccessCount > 0 ? (
                        <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: '600', marginBottom: '8px' }}>
                          {importSuccessCount} item{importSuccessCount !== 1 ? 's' : ''} imported successfully
                        </div>
                      ) : null}
                      {importFailures.length > 0 ? (
                        <div>
                          <div style={{ backgroundColor: '#fff7ed', color: '#92400e', padding: '12px', borderRadius: '8px', fontWeight: '600', marginBottom: '8px' }}>
                            {importFailures.length} item{importFailures.length !== 1 ? 's' : ''} failed to import
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button type="button" onClick={downloadFailureReport} className="btn btn-secondary">Download Failure Report</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" onClick={() => { setShowImportModal(false); resetImportState(); }} className="btn btn-secondary">Close</button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Intermediate Materials Import Modal */}
        {showIntermediateImportModal && (
          <div className="app-modal-overlay">
            <div
              className="app-modal"
              style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="btn-close-x" onClick={() => { setShowIntermediateImportModal(false); setIntermediateImportFile(null); setIntermediateImportResult(null); }} aria-label="Close">
                &times;
              </button>
              <h2 className="app-modal-title">Import Intermediate Materials</h2>

              {!intermediateImportFile ? (
                <div>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <a
                      href={templateUrl('PriceRight_Intermediates_Import_Template.xlsx')}
                      onClick={(e) => {
                        e.preventDefault();
                        void handleDownload('PriceRight_Intermediates_Import_Template.xlsx');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#0f172a',
                        fontWeight: '600',
                        fontSize: '16px',
                        textDecoration: 'none',
                        cursor: downloading ? 'wait' : 'pointer',
                        opacity: downloading ? 0.6 : 1,
                        pointerEvents: downloading ? 'none' : 'auto',
                      }}
                    >
                      <ArrowDownToLine size={14} strokeWidth={2} style={{ color: '#64748b' }} />
                      {downloading === 'PriceRight_Intermediates_Import_Template.xlsx' ? 'Downloading...' : 'Download import template'}
                    </a>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>Fill it in and upload below</div>
                  </div>
                  <p style={{ fontSize: '16px', color: '#475569', marginBottom: '16px' }}>
                    Upload a CSV or Excel file to add multiple intermediate materials at once.
                  </p>

                  <label
                    htmlFor="intermediate-server-import-upload"
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
                    <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                      <Upload size={40} strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>
                      Select import file
                    </div>
                    <div style={{ fontSize: '15px', color: '#64748b' }}>
                      Use the import template. CSV and Excel files are accepted.
                    </div>
                    <input
                      id="intermediate-server-import-upload"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleIntermediateFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                    <strong>File:</strong> {intermediateImportFile.name}
                  </div>

                  {intermediateImportResult && (
                    <div>
                      <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontWeight: '600' }}>
                        ✓ Imported: {intermediateImportResult.imported}
                        {intermediateImportResult.skipped > 0 && ` | Skipped: ${intermediateImportResult.skipped}`}
                      </div>

                      {intermediateImportResult.errors.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', fontWeight: '600' }}>
                            {intermediateImportResult.errors.length} error{intermediateImportResult.errors.length !== 1 ? 's' : ''}
                          </div>
                          <div style={{ border: '1px solid #fecaca', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead style={{ backgroundColor: '#fef2f2' }}>
                                <tr>
                                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fecaca', whiteSpace: 'nowrap' }}>Row</th>
                                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fecaca' }}>Name</th>
                                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #fecaca' }}>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {intermediateImportResult.errors.map((err, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #fecaca' }}>
                                    <td style={{ padding: '8px' }}>{err.row}</td>
                                    <td style={{ padding: '8px' }}>{err.name || '—'}</td>
                                    <td style={{ padding: '8px', color: '#b91c1c' }}>{err.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIntermediateImportFile(null);
                        setIntermediateImportResult(null);
                      }}
                      className="btn btn-secondary"
                    >
                      Choose Different File
                    </button>
                    <button
                      type="button"
                      onClick={handleIntermediateImport}
                      disabled={importing}
                      style={{
                        backgroundColor: importing ? '#94a3b8' : '#10b981',
                        color: 'white',
                      }}
                      className="btn"
                    >
                      {importing ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowIntermediateImportModal(false);
                    setIntermediateImportFile(null);
                    setIntermediateImportResult(null);
                  }}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="app-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setDeleteTarget(null)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Intermediate Material</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This intermediate material will be permanently deleted. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleConfirmDeleteMaterial()}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="app-modal-overlay" onClick={() => setShowBulkDeleteModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowBulkDeleteModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Selected</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              {selectedIds.size} intermediate material{selectedIds.size !== 1 ? 's' : ''} will be permanently deleted. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBulkDeleteModal(false)} disabled={bulkDeleting}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleBulkDelete()} disabled={bulkDeleting}>
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreatePanel ? (
        <IntermediateCreatePanel
          onClose={() => setShowCreatePanel(false)}
          onSaved={() => {
            setShowCreatePanel(false);
            void loadData();
          }}
        />
      ) : null}

      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
    </>
  );
}
