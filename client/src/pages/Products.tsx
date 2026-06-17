import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useFormState } from '../context/FormStateContext';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowDownToLine, Check, CheckCircle, Copy, ExternalLink, Eye, EyeOff, FileSpreadsheet, FileText, FileUp, Pencil, Plus, Printer, Settings2, Tags, Trash2, Upload, X } from 'lucide-react';
import OverflowMenu from '../components/OverflowMenu';
import TableSettingsDropdown from '../components/TableSettingsDropdown';
import ActionDropdown from '../components/ActionDropdown';
import { materialsApi, productsApi, settingsApi, currenciesApi, templateUrl } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import TableZoomControl from '../components/TableZoomControl';
import useAppToast from '../hooks/useAppToast';
import useTableZoom from '../hooks/useTableZoom';
import { useTemplateDownload } from '../hooks/useTemplateDownload';
import { usePrint } from '../hooks/usePrint';
import { readImportDataRows } from '../utils/importWorkbook';
import usePersistedColumns from '../hooks/usePersistedColumns';
import useUndoAction from '../hooks/useUndoAction';
import type { UndoPreviousState } from '../hooks/useUndoAction';
import ProductFormDrawer from '../components/ProductFormDrawer';
import ProductsAnalysisTab from '../components/ProductsAnalysisTab';
import { ActualGrossMarginInfoTooltip, ActualMarkupInfoTooltip, MarkupInfoTooltip, OptimalGrossMarginInfoTooltip, OptimalMarkupInfoTooltip } from '../components/ProfitTooltips';

interface Product {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  overheadPercentage: number;
  profitMargin: number;
  otherDirectCosts?: number;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  currentSellingPrice?: number;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  approvedPrice?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvedPriceExpiresAt?: string | null;
  priceExpiryNotifiedAt?: string | null;
  needsReviewReason?: string | null;
  isPriceExpired?: boolean;
  daysUntilExpiry?: number | null;
  priceMismatch?: boolean;
  isActive: boolean;
}

interface Material {
  id: number;
  name: string;
  unit: string;
  unitPrice: string;
  baseCurrencySymbol: string;
}

interface CostCalculation {
  totalMaterialCost: string;
  overheadCost: string;
  totalCost: string;
  profitAmount: string;
  recommendedPrice: string;
}

interface ProductPricing extends Product {
  materialCost: number;
  overheadCost: number;
  totalCost: number;
  profitAmount: number;
  optimalPrice: number;
}

const APPROVAL_STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Rejected', 'Needs Review'];

type ProductColumnKey =
  | 'name'
  | 'materialCost'
  | 'optimalPrice'
  | 'priceExpires'
  | 'sellingPrice'
  | 'profitOnCost'
  | 'profitOnSales'
  | 'actualProfitOnCost'
  | 'actualProfitOnSales'
  | 'status'
  | 'actions';

const PRODUCT_COLUMN_OPTIONS: Array<{ key: ProductColumnKey; label: string }> = [
  { key: 'name', label: 'Product Name' },
  { key: 'materialCost', label: 'Total Production Cost' },
  { key: 'optimalPrice', label: 'Optimal Price' },
  { key: 'priceExpires', label: 'Valid until' },
  { key: 'sellingPrice', label: 'Approved base price' },
  { key: 'profitOnCost', label: 'Optimal Markup %' },
  { key: 'profitOnSales', label: 'Optimal Gross Margin %' },
  { key: 'actualProfitOnCost', label: 'Actual Markup %' },
  { key: 'actualProfitOnSales', label: 'Actual Gross Margin %' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' },
];

const DEFAULT_PRODUCT_COLUMNS: ProductColumnKey[] = PRODUCT_COLUMN_OPTIONS.map((option) => option.key);

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toPerUnitCost(cost: CostCalculation, product: Product) {
  const batchYield = product.productionMode === 'batch' ? Math.max(1, product.batchYield || 1) : 1;
  return {
    materialCost: toNumber(cost.totalMaterialCost) / batchYield,
    overheadCost: toNumber(cost.overheadCost) / batchYield,
    totalCost: toNumber(cost.totalCost) / batchYield,
    profitAmount: toNumber(cost.profitAmount) / batchYield,
    optimalPrice: toNumber(cost.recommendedPrice) / batchYield,
  };
}

function calculatePricingAnalysis(product: ProductPricing) {
  const optimalPrice = product.optimalPrice;
  const currentPrice = product.currentSellingPrice;

  if (currentPrice == null || currentPrice === 0) {
    return {
      variance: 0,
      variancePercent: 0,
      status: 'not-set' as const,
      label: 'Not Set',
      color: '#64748b',
      background: '#f1f5f9',
    };
  }

  const variance = currentPrice - optimalPrice;
  const variancePercent = optimalPrice === 0 ? 0 : (variance / optimalPrice) * 100;

  if (currentPrice > optimalPrice + 0.01) {
    return {
      variance,
      variancePercent,
      status: 'above-optimal' as const,
      label: 'Above Optimal',
      color: '#2e7d32',
      background: '#e8f5e9',
    };
  }

  if (currentPrice < optimalPrice - 0.01) {
    return {
      variance,
      variancePercent,
      status: 'below-optimal' as const,
      label: 'Below Optimal',
      color: '#c62828',
      background: '#fdecea',
    };
  }

  return {
    variance,
    variancePercent,
    status: 'at-optimal' as const,
    label: 'At Optimal',
    color: '#888888',
    background: '#f3f3f3',
  };
}

function calculateOptimalProfitOnCost(product: ProductPricing): number | null {
  const optimalPrice = Number(product.optimalPrice || 0);
  const productionCost = Number(product.totalCost || 0);

  if (optimalPrice <= 0 || productionCost <= 0) {
    return null;
  }

  return ((optimalPrice - productionCost) / productionCost) * 100;
}

function calculateOptimalProfitOnSales(product: ProductPricing): number | null {
  const optimalPrice = Number(product.optimalPrice || 0);
  const productionCost = Number(product.totalCost || 0);

  if (optimalPrice <= 0 || productionCost <= 0) {
    return null;
  }

  return ((optimalPrice - productionCost) / optimalPrice) * 100;
}

function calculateActualProfitOnCost(product: ProductPricing): number | null {
  if (product.approvalStatus !== 'approved' || product.approvedPrice == null) {
    return null;
  }

  const approvedPrice = Number(product.approvedPrice);
  const productionCost = Number(product.totalCost || 0);

  if (approvedPrice <= 0 || productionCost <= 0) {
    return null;
  }

  return ((approvedPrice - productionCost) / productionCost) * 100;
}

function calculateActualProfitOnSales(product: ProductPricing): number | null {
  if (product.approvalStatus !== 'approved' || product.approvedPrice == null) {
    return null;
  }

  const approvedPrice = Number(product.approvedPrice);
  const productionCost = Number(product.totalCost || 0);

  if (approvedPrice <= 0 || productionCost <= 0) {
    return null;
  }

  return ((approvedPrice - productionCost) / approvedPrice) * 100;
}

function getApprovalBadge(status?: Product['approvalStatus']) {
  if (!status) {
    return {
      label: 'Pending',
      variant: 'pending' as const,
    };
  }

  if (status === 'approved') {
    return {
      label: 'Approved',
      variant: 'approved' as const,
    };
  }

  if (status === 'rejected') {
    return {
      label: 'Rejected',
      variant: 'rejected' as const,
    };
  }

  if (status === 'needs_review') {
    return {
      label: 'Needs Review',
      variant: 'needs-review' as const,
    };
  }

  return {
    label: 'Pending',
    variant: 'pending' as const,
  };
}

function buildDuplicateName(baseName: string, existingNames: Set<string>) {
  const normalizedBase = (baseName || 'Untitled Product').trim();
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
    .filter((line) => line.length > 0 && !line.startsWith('#'));

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

export default function Products() {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultOverhead, setDefaultOverhead] = useState('30');
  const [defaultProfitMargin, setDefaultProfitMargin] = useState('30');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [visibleColumns, setVisibleColumns] = usePersistedColumns<ProductColumnKey>(
    'priceright_columns_products',
    DEFAULT_PRODUCT_COLUMNS,
  );
  const { zoomPercent, increaseZoom, decreaseZoom } = useTableZoom();
  const { downloading, handleDownload } = useTemplateDownload();
  const { handlePrint } = usePrint();

  useEffect(() => {
    const marginColumns: ProductColumnKey[] = ['profitOnCost', 'profitOnSales', 'actualProfitOnCost', 'actualProfitOnSales'];
    const hasAllMarginColumns = marginColumns.every((column) => visibleColumns.includes(column));

    if (hasAllMarginColumns) {
      return;
    }

    const baseColumns: ProductColumnKey[] = visibleColumns.filter(
      (column) => !marginColumns.includes(column),
    ) as ProductColumnKey[];
    const sellingPriceIndex = baseColumns.indexOf('sellingPrice');

    if (sellingPriceIndex >= 0) {
      const nextColumns: ProductColumnKey[] = [...baseColumns];
      nextColumns.splice(sellingPriceIndex + 1, 0, ...marginColumns);
      setVisibleColumns(nextColumns);
      return;
    }

    setVisibleColumns([...baseColumns, ...marginColumns]);
  }, [setVisibleColumns, visibleColumns]);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('All');
  const [isNeedsReviewBannerDismissed, setIsNeedsReviewBannerDismissed] = useState(false);
  const [baseCurrencyMissing, setBaseCurrencyMissing] = useState(false);

  const productsTableRef = useRef<HTMLDivElement | null>(null);

  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<Array<{ rowNumber: number; name: string; reason: string; originalRow: any }>>([]);
  const [importSuccessCount, setImportSuccessCount] = useState(0);
  const [importRuntimeError, setImportRuntimeError] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPricing | null>(null);
  
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [bulkApprovePriceMethod, setBulkApprovePriceMethod] = useState<'optimal' | 'selling' | 'markup'>('optimal');
  const [bulkApproveMarkup, setBulkApproveMarkup] = useState('10');
  const [bulkApproveExpiryDate, setBulkApproveExpiryDate] = useState('');
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const productsTableSettingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [bulkCategoryValue, setBulkCategoryValue] = useState('');
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { setHasOpenForm } = useFormState();
  const { registerUndo } = useUndoAction();

  useEffect(() => {
    setHasOpenForm(showDrawer || showImportModal);
  }, [showDrawer, showImportModal, setHasOpenForm]);

  useEffect(() => {
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'analysis'>('products');

  const productCategories = useMemo(() => {
    const observed = products
      .map((product) => (product.category || '').trim())
      .filter((category) => category.length > 0);
    return Array.from(new Set(observed)).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const lowMarginOnly = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('lowMargin') === '1';
  }, [location.search]);

  const expiringSoonOnly = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('expiringSoon') === '1';
  }, [location.search]);

  const approvalQueryFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const approval = (params.get('approval') || '').toLowerCase();
    if (approval === 'pending' || approval === 'approved' || approval === 'rejected' || approval === 'needs_review') {
      return approval as Product['approvalStatus'];
    }
    return null;
  }, [location.search]);

  const focusProductId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('productId');
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }, [location.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (focusProductId == null) return;
    const target = products.find((product) => product.id === focusProductId);
    if (!target) return;

    setSearchInput(target.name);
    setDebouncedSearch(target.name);
  }, [focusProductId, products]);

  useEffect(() => {
    loadDefaultOverhead();
  }, []);

  async function loadDefaultOverhead() {
    try {
      const settings = await settingsApi.getAll();
      const overheadSetting = settings.find((s: any) => s.settingKey === 'defaultOverhead');
      if (overheadSetting) {
        setDefaultOverhead(overheadSetting.settingValue);
      }
      const profitMarginSetting = settings.find((s: any) => s.settingKey === 'defaultProfitMargin');
      if (profitMarginSetting) {
        setDefaultProfitMargin(profitMarginSetting.settingValue);
      }
    } catch (error) {
      console.error('Error loading default overhead:', error);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [productsData, materialsData, currenciesData, settingsData] = await Promise.all([
        productsApi.getAll('all'),
        materialsApi.getAll(),
        currenciesApi.getAll(),
        settingsApi.getAll(),
      ]);

      const safeProducts = Array.isArray(productsData) ? productsData : [];
      const safeMaterials = Array.isArray(materialsData) ? materialsData : [];
      const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];
      const safeSettings = Array.isArray(settingsData) ? settingsData : [];

      const baseCurrencySetting = safeSettings.find((s: any) => s.settingKey === 'baseCurrency');
      setBaseCurrencyMissing(safeCurrencies.length === 0 || !baseCurrencySetting?.settingValue);

      const costEntries = await Promise.all(
        safeProducts.map(async (product: Product) => {
          try {
            const cost = await productsApi.calculateCost(product.id);
            return { productId: product.id, cost };
          } catch (error) {
            console.error('Error calculating cost for product:', product.id, error);
            return { productId: product.id, cost: null };
          }
        })
      );

      const productsWithPricing: ProductPricing[] = safeProducts.map((product: Product) => {
        const cost = costEntries.find((entry) => entry.productId === product.id)?.cost || null;
        const perUnit = cost
          ? toPerUnitCost(cost, product)
          : {
              materialCost: 0,
              overheadCost: 0,
              totalCost: 0,
              profitAmount: 0,
              optimalPrice: 0,
            };
        return {
          ...product,
          ...perUnit,
        };
      });

      setProducts(productsWithPricing);
      setMaterials(safeMaterials);
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(product: ProductPricing) {
    setEditingProduct(product);
    setShowDrawer(true);
  }

  function handleAddProduct() {
    setEditingProduct(null);
    setShowDrawer(true);
  }

  async function handleDuplicateProduct(product: ProductPricing) {
    try {
      const existingNames = new Set(products.map((item) => (item.name || '').trim().toLowerCase()));
      const duplicatedName = buildDuplicateName(product.name, existingNames);
      const duplicatedSku = product.sku ? `${product.sku}-COPY` : '';

      const created = await productsApi.create({
        name: duplicatedName,
        sku: duplicatedSku,
        description: product.description || '',
        category: product.category || '',
        overheadPercentage: Number(product.overheadPercentage || 0),
        profitMargin: Number(product.profitMargin || 0),
        otherDirectCosts: Number(product.otherDirectCosts || 0),
        productionMode: product.productionMode || 'single',
        batchYield: Number(product.batchYield || 1),
        currentSellingPrice: Number(product.currentSellingPrice || 0),
      });

      const newProductId = Number(created?.id || 0);
      if (newProductId > 0) {
        const sourceBom = await productsApi.getBOM(product.id);
        for (const item of sourceBom || []) {
          await productsApi.addMaterialToBOM(newProductId, {
            materialId: item.materialId,
            quantity: Number(item.quantity || 0),
          });
        }
      }

      await loadData();
      showToastMessage(`Duplicated product: ${duplicatedName}`, 'success');
    } catch (error: any) {
      console.error('Error duplicating product:', error);
      showToastMessage(error?.message || 'Failed to duplicate product', 'error');
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await productsApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showToastMessage(error?.message || 'Failed to delete product', 'error');
    }
  }

  async function handleToggleProductActive(product: ProductPricing) {
    const nextActiveState = !product.isActive;
    if (!nextActiveState) {
      const confirmed = window.confirm(
        `Mark ${product.name} as inactive?\nIt will be hidden from Price Lists and Special Pricing unless specifically filtered.`
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      await productsApi.update(product.id, { isActive: nextActiveState });
      showToastMessage(`Product marked as ${nextActiveState ? 'active' : 'inactive'}`, 'success');
      await loadData();
    } catch (error: any) {
      console.error('Error updating product status:', error);
      showToastMessage(error?.message || 'Failed to update product status', 'error');
    }
  }

  async function handleBulkSetActiveState(isActive: boolean) {
    if (selectedProducts.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedProducts).map((id) => productsApi.update(id, { isActive }))
      );
      showToastMessage(
        `Set ${selectedProducts.size} product${selectedProducts.size !== 1 ? 's' : ''} ${isActive ? 'active' : 'inactive'}`,
        'success'
      );
      await loadData();
    } catch (error: any) {
      console.error('Error bulk updating product status:', error);
      showToastMessage(error?.message || 'Failed to update selected product statuses', 'error');
    }
  }

  function handleSelectAll() {
    if (selectedProducts.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    }
  }

  function handleSelectProduct(id: number) {
    const newSet = new Set(selectedProducts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProducts(newSet);
  }

  function handleOpenBulkDeleteModal() {
    if (selectedProducts.size === 0) return;
    setShowBulkDeleteModal(true);
  }

  async function handleConfirmBulkDelete() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;

    const productNameById = new Map(products.map((product) => [product.id, product.name]));

    const outcomes = await Promise.all(
      ids.map(async (id) => {
        const name = productNameById.get(id) || `Product #${id}`;
        try {
          await productsApi.delete(id);
          return { id, name, ok: true as const, error: '' };
        } catch (error: any) {
          return { id, name, ok: false as const, error: error?.message || 'Failed to delete product' };
        }
      })
    );

    const deletedIds = outcomes.filter((item) => item.ok).map((item) => item.id);
    const deletedNames = outcomes.filter((item) => item.ok).map((item) => item.name);
    const failed = outcomes.filter((item) => !item.ok);
    const failedDetails = failed.map((item) => `${item.name}: ${item.error}`);

    setSelectedProducts(new Set(failed.map((item) => item.id)));
    setShowBulkDeleteModal(false);
    await loadData();

    const deletedPreview = deletedNames.slice(0, 5).join(', ');
    const deletedSuffix = deletedNames.length > 5 ? ` +${deletedNames.length - 5} more` : '';
    const failedPreview = failedDetails.slice(0, 3).join(' | ');
    const failedSuffix = failedDetails.length > 3 ? ` +${failedDetails.length - 3} more` : '';

    if (deletedIds.length > 0 && failed.length === 0) {
      showToastMessage(
        formatListMessage(
          `Deleted ${deletedIds.length} product${deletedIds.length !== 1 ? 's' : ''}`,
          [`Products: ${deletedPreview}${deletedSuffix}`]
        ),
        'success'
      );
      return;
    }

    if (deletedIds.length > 0 && failed.length > 0) {
      showToastMessage(
        formatListMessage(
          `Bulk delete completed with partial failures`,
          [
            `Deleted: ${deletedIds.length}`,
            `Failed: ${failed.length}`,
            `Deleted products: ${deletedPreview}${deletedSuffix}`,
            `Failure reasons: ${failedPreview}${failedSuffix}`,
          ]
        ),
        'error'
      );
      return;
    }

    const fullFailureMessage = failedDetails.length > 0
      ? formatListMessage('Could not delete selected products', [`Reasons: ${failedPreview}${failedSuffix}`])
      : 'Failed to delete selected products';
    showToastMessage(fullFailureMessage, 'error');
  }

  async function handleBulkCategoryChange() {
    if (!bulkCategoryValue || selectedProducts.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedProducts).map((id) => {
          const product = products.find((p) => p.id === id);
          if (!product) return Promise.resolve();
          return productsApi.update(id, {
            ...product,
            category: bulkCategoryValue,
          });
        })
      );

      showToastMessage(
        `Updated category for ${selectedProducts.size} product${selectedProducts.size !== 1 ? 's' : ''}`,
        'success'
      );

      setShowCategoryModal(false);
      setBulkCategoryValue('');
      await loadData();
    } catch (error) {
      console.error('Error updating category:', error);
      showToastMessage('Failed to update category', 'error');
    }
  }

  function handleBulkExport() {
    if (selectedProducts.size === 0) {
      showToastMessage('No selected products to export', 'error');
      return;
    }

    const selectedProdList = filteredProducts.filter((p) => selectedProducts.has(p.id));
    if (selectedProdList.length === 0) {
      showToastMessage('Selected products are not visible in the current filter. Clear filters and retry export.', 'error');
      return;
    }

    try {
    const exportData = selectedProdList.map((product) => {
      const optimalProfitOnCost = calculateOptimalProfitOnCost(product);
      const optimalProfitOnSales = calculateOptimalProfitOnSales(product);
      const actualProfitOnCost = calculateActualProfitOnCost(product);
      const actualProfitOnSales = calculateActualProfitOnSales(product);
      const normalizedExpiryDate = product.approvedPriceExpiresAt ? product.approvedPriceExpiresAt.slice(0, 10) : null;
      return ({
      'Product Name': product.name,
      'SKU': product.sku || '',
      'Material Cost': product.materialCost.toFixed(2),
      'Overhead %': product.overheadPercentage.toFixed(2),
      'Total Cost': product.totalCost.toFixed(2),
      'Valid until': normalizedExpiryDate ? formatExpiryDate(normalizedExpiryDate) : '',
      'Optimal Markup %': optimalProfitOnCost != null ? optimalProfitOnCost.toFixed(1) : '—',
      'Optimal Gross Margin %': optimalProfitOnSales != null ? optimalProfitOnSales.toFixed(1) : '—',
      'Actual Markup %': actualProfitOnCost != null ? actualProfitOnCost.toFixed(1) : '—',
      'Actual Gross Margin %': actualProfitOnSales != null ? actualProfitOnSales.toFixed(1) : '—',
      'Optimal Price': product.optimalPrice.toFixed(2),
      'Approved base price': product.currentSellingPrice ? product.currentSellingPrice.toFixed(2) : 'Not Set',
      'Status': calculatePricingAnalysis(product).label,
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const columnWidths = [
      { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 15 }, { wch: 12 },
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Products_Selected_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    const exportedNames = selectedProdList.map((product) => product.name);
    const exportedPreview = exportedNames.slice(0, 5).join(', ');
    const exportedSuffix = exportedNames.length > 5 ? ` +${exportedNames.length - 5} more` : '';
    showToastMessage(
      formatListMessage(
        `Exported ${selectedProdList.length} product${selectedProdList.length !== 1 ? 's' : ''}`,
        [`Products: ${exportedPreview}${exportedSuffix}`]
      ),
      'success'
    );
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to export selected products', 'error');
    }
  }

  function formatApprovalDate(value?: string | number | null) {
    if (!value) return '-';
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatExpiryDate(value?: string | null) {
    if (!value) return '-';
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getTomorrowDateInputValue() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }

  function buildProductUndoSnapshot(ids: number[]) {
    const snapshots: UndoPreviousState[] = [];

    ids.forEach((id) => {
      const product = products.find((entry) => entry.id === id);
      if (!product) return;
      snapshots.push({
        id: product.id,
        approvalStatus: product.approvalStatus || 'pending',
        approvedPrice: product.approvedPrice ?? null,
        currentSellingPrice: product.currentSellingPrice ?? 0,
      });
    });

    return snapshots;
  }

  async function handleBulkApprove() {
    setBulkApproveExpiryDate('');
    setShowBulkApproveModal(true);
  }

  function getBulkApproveExample() {
    const sampleOptimal = 40;
    const markupValue = Number(bulkApproveMarkup);
    if (!Number.isFinite(markupValue)) {
      return 'e.g. Optimal GHS 40.00 -> Approved GHS --';
    }
    const adjusted = sampleOptimal * (1 + markupValue / 100);
    return `e.g. Optimal GHS 40.00 -> Approved GHS ${adjusted.toFixed(2)}`;
  }

  function getBulkApproveMethodLabel(method: 'optimal' | 'selling' | 'markup', markup?: number) {
    if (method === 'selling') return 'current price';
    if (method === 'markup') {
      const value = Number(markup || 0);
      const sign = value >= 0 ? '+' : '';
      return `optimal price + ${sign}${value}% markup`;
    }
    return 'optimal price';
  }

  async function handleConfirmBulkApprove() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;
    const previousStates = buildProductUndoSnapshot(ids);

    let options: { priceMethod: 'optimal' | 'selling' | 'markup'; markupPercentage?: number } = {
      priceMethod: bulkApprovePriceMethod,
    };

    if (bulkApprovePriceMethod === 'markup') {
      const markupValue = Number(bulkApproveMarkup);
      if (!Number.isFinite(markupValue) || markupValue < -50 || markupValue > 200) {
        showToastMessage('Markup % must be between -50 and 200', 'error');
        return;
      }
      options = {
        priceMethod: 'markup',
        markupPercentage: markupValue,
      };
    }

    try {
      const expiryDate = bulkApproveExpiryDate.trim();
      const payloadOptions = {
        ...options,
        priceExpiryDate: expiryDate ? expiryDate : null,
      };
      const result = await productsApi.bulkApprove(ids, payloadOptions);
      const approvedCount = Number(result?.approved || 0);
      const methodUsed = (result?.priceMethod || payloadOptions.priceMethod) as 'optimal' | 'selling' | 'markup';
      const markupUsed = Number(result?.markupPercentage ?? payloadOptions.markupPercentage ?? 0);
      const summaryText = `Approved ${approvedCount} products at ${getBulkApproveMethodLabel(methodUsed, markupUsed)}.`;
      showToastMessage(
        summaryText,
        'success'
      );

      registerUndo({
        actionType: 'bulk_approve',
        description: summaryText,
        affectedIds: ids,
        previousStates,
        onDataRefresh: loadData,
      });

      setShowBulkApproveModal(false);
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Bulk approve failed:', error);
      showToastMessage(error?.message || 'Failed to bulk approve products', 'error');
    }
  }

  async function handleConfirmBulkReject() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;
    const approvedIds = ids.filter((id) => {
      const product = products.find((entry) => entry.id === id);
      return product?.approvalStatus === 'approved';
    });
    const previousStates = buildProductUndoSnapshot(approvedIds);

    try {
      const result = await productsApi.bulkReject(ids, bulkRejectReason.trim() || undefined);
      const rejectedCount = Number(result?.rejected || 0);
      const summaryText = `Rejected ${rejectedCount} products.`;
      showToastMessage(
        `Rejected ${rejectedCount} products. They have been removed from active price lists.`,
        'success'
      );
      if (rejectedCount > 0) {
        registerUndo({
          actionType: 'bulk_reject',
          description: summaryText,
          affectedIds: approvedIds,
          previousStates,
          onDataRefresh: loadData,
        });
      }
      setShowBulkRejectModal(false);
      setBulkRejectReason('');
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Bulk reject failed:', error);
      showToastMessage(error?.message || 'Failed to bulk reject products', 'error');
    }
  }

  async function handleApproveAllEligible() {
    const eligibleIds = filteredProducts
      .filter((product) => {
        const status = product.approvalStatus || 'pending';
        return (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
      })
      .map((product) => product.id);

    if (eligibleIds.length === 0) {
      showToastMessage('No eligible products to approve in the current view', 'error');
      return;
    }

    const confirmText = `Approve optimal base rate for ${eligibleIds.length} product${eligibleIds.length !== 1 ? 's' : ''} in this filtered view?`;
    if (!confirm(confirmText)) return;

    setIsApprovingAll(true);
    try {
      await productsApi.bulkApprove(eligibleIds);
      showToastMessage(`${eligibleIds.length} product${eligibleIds.length !== 1 ? 's' : ''} approved`, 'success');
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Approve all eligible failed:', error);
      showToastMessage(error?.message || 'Failed to approve all eligible products', 'error');
    } finally {
      setIsApprovingAll(false);
    }
  }

  async function handleProductFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportFailures([]);
    setImportSuccessCount(0);
    setImportRuntimeError('');

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
          showToastMessage('Error reading CSV file. Please check the format.', 'error');
          setImportPreview([]);
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
        showToastMessage('Error reading file. Please check the format.', 'error');
        setImportPreview([]);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleProductImport() {
    if (importPreview.length === 0) {
      showToastMessage('No data to import', 'error');
      return;
    }
    setImportRuntimeError('');
    setImporting(true);
    try {
      const resp = await productsApi.import(importPreview);
      const failures = (resp.errors || []).map((e: any) => ({
        rowNumber: e.row,
        name: e.productName,
        reason: e.reason,
        originalRow: {},
      }));
      const successCount = resp.imported || 0;
      setImportFailures(failures);
      setImportSuccessCount(successCount);

      const failedRows = new Set<number>(failures.map((failure: any) => Number(failure.rowNumber)).filter((row: number) => !Number.isNaN(row)));
      const successNames = importPreview
        .map((row, index) => ({
          rowNumber: index + 1,
          name: (row['Product Name'] || row['name'] || '').toString().trim(),
        }))
        .filter((entry) => !failedRows.has(entry.rowNumber) && entry.name.length > 0)
        .map((entry) => entry.name);

      const failedDetails = failures
        .map((failure: any) => {
          const failedName = (failure?.name || '').toString().trim();
          const rowLabel = failure?.rowNumber ? `Row ${failure.rowNumber}` : 'Row ?';
          const reason = (failure?.reason || 'Unknown reason').toString();
          return `${failedName || rowLabel}: ${reason}`;
        });

      if (successCount > 0) {
        setSearchInput('');
        setDebouncedSearch('');
        setSelectedStatus('All');
        setSelectedApprovalStatus('All');
        await loadData();
      }

      const successPreview = successNames.slice(0, 5).join(', ');
      const successSuffix = successNames.length > 5 ? ` +${successNames.length - 5} more` : '';
      const failedPreview = failedDetails.slice(0, 3).join(' | ');
      const failedSuffix = failedDetails.length > 3 ? ` +${failedDetails.length - 3} more` : '';

      if (successCount > 0 && failures.length === 0) {
        showToastMessage(
          formatListMessage(
            `Imported ${successCount} product${successCount !== 1 ? 's' : ''}`,
            [`Products: ${successPreview}${successSuffix}`]
          ),
          'success'
        );
        return;
      }

      if (successCount > 0 && failures.length > 0) {
        showToastMessage(
          formatListMessage(
            'Import completed with partial failures',
            [
              `Imported: ${successCount}`,
              `Failed: ${failures.length}`,
              `Imported products: ${successPreview}${successSuffix}`,
              `Failure reasons: ${failedPreview}${failedSuffix}`,
            ]
          ),
          'error'
        );
        return;
      }

      if (failures.length > 0) {
        showToastMessage(
          formatListMessage('Import failed for all rows', [`Reasons: ${failedPreview}${failedSuffix}`]),
          'error'
        );
        return;
      }

      showToastMessage('No products were imported', 'error');
    } catch (err: any) {
      console.error('Import failed:', err);
      const errorMessage = err?.message || String(err) || 'Unknown error';
      setImportRuntimeError(errorMessage);
      showToastMessage('Import failed: ' + errorMessage, 'error');
    } finally {
      setImporting(false);
    }
  }

  function downloadProductFailureReport() {
    if (!importFailures || importFailures.length === 0) return;
    const headers = [
      'Row Number',
      'Product Name',
      'SKU',
      'Category',
      'Production Mode',
      'Batch Yield',
      'Overhead %',
      'Markup %',
      'Approved base price',
      'Material Name',
      'Quantity',
      'Unit',
      'Failure Reason',
    ];

    const rows = importFailures.map((failure) => {
      const source = failure.originalRow || {};
      return [
        failure.rowNumber,
        source['Product Name'] || source['name'] || '',
        source['SKU'] || source['sku'] || '',
        source['Category'] || source['category'] || '',
        source['Production Mode'] || source['productionMode'] || '',
        source['Batch Yield'] || source['batchYield'] || '',
        source['Overhead %'] || source['Overhead'] || source['overhead'] || source['overheadPercentage'] || '',
        source['Markup %'] || source['Profit on cost %'] || source['Profit Margin %'] || source['Profit'] || source['profitMargin'] || '',
        source['Approved base price'] || source['currentSellingPrice'] || '',
        source['Material Name'] || source['materialName'] || '',
        source['Quantity'] || source['quantity'] || '',
        source['Unit'] || source['unit'] || '',
        failure.reason,
      ];
    });

    const date = new Date().toISOString().split('T')[0];
    downloadCsv(`products-import-failures-${date}.csv`, headers, rows);
  }

  function handleDownloadProductTemplate() {
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Production Mode',
      'Batch Yield',
      'Overhead %',
      'Markup %',
      'Approved base price',
      'Material Name',
      'Quantity',
      'Unit',
      'Description',
    ];

    const rows = [
      ['BROWN SUGAR BOTTLE 1.8kg', 'BSB-001', 'Sugar', 'Batch', '6', '25', '20', '45.00', 'Sugar', '10.8', 'Kg', 'Brown sugar bottle 1.8kg'],
      ['BROWN SUGAR BOTTLE 1.8kg', 'BSB-001', 'Sugar', 'Batch', '6', '25', '20', '45.00', 'Bottle & Cover Brown Sugar', '6', 'Pcs', 'Brown sugar bottle 1.8kg'],
      ['PALM OIL 500ML', 'PO-001', 'Oils', 'Single', '1', '30', '35', '9.50', 'Raw Palm Oil', '0.52', 'L', 'Palm oil bottle 500ml'],
      ['PALM OIL 500ML', 'PO-001', 'Oils', 'Single', '1', '30', '35', '9.50', 'PET Bottles 500ml', '1', 'piece', 'Palm oil bottle 500ml'],
    ];

    const date = new Date().toISOString().split('T')[0];
    downloadCsv(`products-import-template-${date}.csv`, headers, rows);
  }

  function handleExportToExcel() {
    const headers = [
      'Product Name',
      'SKU',
      'Material Cost',
      'Optimal Price',
      'Valid until',
      'Approved base price',
      'Optimal Markup %',
      'Optimal Gross Margin %',
      'Actual Markup %',
      'Actual Gross Margin %',
      'Variance (GHS)',
      'Variance (%)',
      'Pricing Status',
    ];

    const exportRows = products.map((product) => {
      const analysis = calculatePricingAnalysis(product);
      const currentPrice = Number(product.currentSellingPrice || 0);
      const optimalProfitOnCost = calculateOptimalProfitOnCost(product);
      const optimalProfitOnSales = calculateOptimalProfitOnSales(product);
      const actualProfitOnCost = calculateActualProfitOnCost(product);
      const actualProfitOnSales = calculateActualProfitOnSales(product);
      const normalizedExpiryDate = product.approvedPriceExpiresAt ? product.approvedPriceExpiresAt.slice(0, 10) : null;
      return {
        values: [
          product.name,
          product.sku || '-',
          Number(product.materialCost || 0),
          Number(product.optimalPrice || 0),
          normalizedExpiryDate ? formatExpiryDate(normalizedExpiryDate) : '',
          currentPrice > 0 ? currentPrice : null,
          optimalProfitOnCost != null ? Number(optimalProfitOnCost.toFixed(1)) : null,
          optimalProfitOnSales != null ? Number(optimalProfitOnSales.toFixed(1)) : null,
          actualProfitOnCost != null ? Number(actualProfitOnCost.toFixed(1)) : null,
          actualProfitOnSales != null ? Number(actualProfitOnSales.toFixed(1)) : null,
          currentPrice > 0 ? Number(analysis.variance || 0) : null,
          currentPrice > 0 ? Number(analysis.variancePercent || 0) : null,
          analysis.label,
        ],
        status: analysis.status,
      };
    });

    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ...exportRows.map((entry) => entry.values),
    ]);

    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 15 },
      { wch: 14 },
      { wch: 14 },
    ];

    for (let rowIndex = 0; rowIndex < exportRows.length; rowIndex += 1) {
      const excelRow = rowIndex + 2;
      const currentPriceCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 5 });
      const optimalProfitOnCostCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 6 });
      const optimalProfitOnSalesCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 7 });
      const actualProfitOnCostCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 8 });
      const actualProfitOnSalesCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 9 });
      const varianceAmountCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 10 });
      const variancePercentCell = XLSX.utils.encode_cell({ r: excelRow - 1, c: 11 });

      if (ws[currentPriceCell]) ws[currentPriceCell].z = '#,##0.00';
      if (ws[optimalProfitOnCostCell]) ws[optimalProfitOnCostCell].z = '0.0';
      if (ws[optimalProfitOnSalesCell]) ws[optimalProfitOnSalesCell].z = '0.0';
      if (ws[actualProfitOnCostCell]) ws[actualProfitOnCostCell].z = '0.0';
      if (ws[actualProfitOnSalesCell]) ws[actualProfitOnSalesCell].z = '0.0';
      if (ws[varianceAmountCell]) ws[varianceAmountCell].z = '#,##0.00';
      if (ws[variancePercentCell]) ws[variancePercentCell].z = '0.0';

      const status = exportRows[rowIndex].status;
      const fillStyle =
        status === 'below-optimal'
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'FDECEC' } }, font: { color: { rgb: 'B91C1C' }, bold: true } }
          : status === 'above-optimal'
            ? { fill: { patternType: 'solid', fgColor: { rgb: 'E8F5E9' } }, font: { color: { rgb: '166534' }, bold: true } }
            : null;

      if (fillStyle) {
        if (ws[currentPriceCell]) ws[currentPriceCell].s = fillStyle as any;
        if (ws[optimalProfitOnCostCell]) ws[optimalProfitOnCostCell].s = fillStyle as any;
        if (ws[optimalProfitOnSalesCell]) ws[optimalProfitOnSalesCell].s = fillStyle as any;
        if (ws[actualProfitOnCostCell]) ws[actualProfitOnCostCell].s = fillStyle as any;
        if (ws[actualProfitOnSalesCell]) ws[actualProfitOnSalesCell].s = fillStyle as any;
        if (ws[varianceAmountCell]) ws[varianceAmountCell].s = fillStyle as any;
        if (ws[variancePercentCell]) ws[variancePercentCell].s = fillStyle as any;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `Products_${dateStr}.xlsx`);
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        debouncedSearch === '' ||
        product.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        product.sku?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const status = calculatePricingAnalysis(product).status;
      const matchesStatus =
        selectedStatus === 'All' ||
        (selectedStatus === 'Below Optimal' && status === 'below-optimal');

      const approvalStatus = product.approvalStatus || 'pending';
      const matchesApprovalStatus =
        selectedApprovalStatus === 'All' ||
        (selectedApprovalStatus === 'Pending' && approvalStatus === 'pending') ||
        (selectedApprovalStatus === 'Approved' && approvalStatus === 'approved') ||
        (selectedApprovalStatus === 'Rejected' && approvalStatus === 'rejected') ||
        (selectedApprovalStatus === 'Needs Review' && approvalStatus === 'needs_review');
      const matchesApprovalQuery = !approvalQueryFilter || approvalStatus === approvalQueryFilter;

      const actualProfitOnCost = calculateActualProfitOnCost(product);
      const matchesLowMargin = !lowMarginOnly || (actualProfitOnCost !== null && actualProfitOnCost < 12);
      const productDaysUntilExpiry = typeof product.daysUntilExpiry === 'number' ? product.daysUntilExpiry : null;
      const matchesExpiringSoon = !expiringSoonOnly || (
        approvalStatus === 'approved'
        && productDaysUntilExpiry !== null
        && productDaysUntilExpiry > 0
        && productDaysUntilExpiry <= 30
      );

      return matchesSearch
        && matchesStatus
        && matchesApprovalStatus
        && matchesApprovalQuery
        && matchesLowMargin
        && matchesExpiringSoon;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, debouncedSearch, selectedStatus, selectedApprovalStatus, approvalQueryFilter, lowMarginOnly, expiringSoonOnly]);

  const productOrderForDetail = useMemo(
    () => filteredProducts.map((product) => ({ id: product.id, name: product.name })),
    [filteredProducts]
  );

  function openProductDetail(productId: number) {
    navigate(`/products/${productId}`, {
      state: {
        from: `${location.pathname}${location.search}`,
        productOrder: productOrderForDetail,
      },
    });
  }

  // When filters change, update selection (deselect products not in filtered list)
  useEffect(() => {
    const validIds = new Set(filteredProducts.map((p) => p.id));
    setSelectedProducts((prev) => {
      const newSelected = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      // Return the same reference if nothing changed to avoid a re-render
      if (newSelected.size === prev.size) return prev;
      return newSelected;
    });
  }, [filteredProducts]);

  const statusChipCounts = useMemo(() => {
    let needsReview = 0;
    let pending = 0;
    let belowOptimal = 0;

    products.forEach((product) => {
      const approvalStatus = product.approvalStatus || 'pending';
      const currentSellingPrice = Number(product.currentSellingPrice || 0);
      const optimalPrice = Number(product.optimalPrice || 0);

      if (approvalStatus === 'needs_review') needsReview += 1;
      if (approvalStatus === 'pending') pending += 1;
      if (currentSellingPrice > 0 && currentSellingPrice < optimalPrice) belowOptimal += 1;
    });

    return { needsReview, pending, belowOptimal };
  }, [products]);

  const hasNeedsReviewProducts = statusChipCounts.needsReview > 0;
  const needsReviewCount = products.filter((p) => p.approvalStatus === 'needs_review').length;
  const shouldShowNeedsReviewBanner = hasNeedsReviewProducts && !isNeedsReviewBannerDismissed;

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

  function handleExportFilteredProductsCsv() {
    if (filteredProducts.length === 0) {
      showToastMessage('No products to export', 'error');
      return;
    }

    const rows = filteredProducts.map((product) => {
      const analysis = calculatePricingAnalysis(product);
      const currentPrice = Number(product.currentSellingPrice || 0);
      const optimalProfitOnCost = calculateOptimalProfitOnCost(product);
      const optimalProfitOnSales = calculateOptimalProfitOnSales(product);
      const actualProfitOnCost = calculateActualProfitOnCost(product);
      const actualProfitOnSales = calculateActualProfitOnSales(product);
      const normalizedExpiryDate = product.approvedPriceExpiresAt ? product.approvedPriceExpiresAt.slice(0, 10) : null;
      return [
        product.name,
        product.sku || '-',
        product.totalCost.toFixed(2),
        product.optimalPrice.toFixed(2),
        formatApprovalDate(product.approvedAt),
        normalizedExpiryDate ? formatExpiryDate(normalizedExpiryDate) : '',
        currentPrice > 0 ? currentPrice.toFixed(2) : 'Not Set',
        optimalProfitOnCost != null ? `${optimalProfitOnCost.toFixed(1)}%` : '-',
        optimalProfitOnSales != null ? `${optimalProfitOnSales.toFixed(1)}%` : '-',
        actualProfitOnCost != null ? `${actualProfitOnCost.toFixed(1)}%` : '-',
        actualProfitOnSales != null ? `${actualProfitOnSales.toFixed(1)}%` : '-',
        currentPrice > 0 ? analysis.variance.toFixed(2) : '-',
        currentPrice > 0 ? `${analysis.variancePercent.toFixed(1)}%` : '-',
        analysis.label,
        getApprovalBadge(product.approvalStatus).label,
      ];
    });

    downloadCsv(
      `products-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Product Name', 'SKU', 'Total Cost', 'Optimal Price', 'Valid until', 'Approved base price', 'Optimal Markup %', 'Optimal Gross Margin %', 'Actual Markup %', 'Actual Gross Margin %', 'Variance Amount', 'Variance %', 'Pricing Status', 'Approval Status'],
      rows
    );

    showToastMessage(`Exported ${filteredProducts.length} filtered product${filteredProducts.length !== 1 ? 's' : ''} to CSV`, 'success');
  }

  const eligibleApproveCount = useMemo(() => {
    return filteredProducts.filter((product) => {
      const status = product.approvalStatus || 'pending';
      return (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
    }).length;
  }, [filteredProducts]);

  const selectedApprovedCount = useMemo(() => {
    return filteredProducts.filter((product) => selectedProducts.has(product.id) && product.approvalStatus === 'approved').length;
  }, [filteredProducts, selectedProducts]);

  const selectedNonApprovedCount = Math.max(0, selectedProducts.size - selectedApprovedCount);

  const isBulkApproveMarkupValid = (() => {
    if (bulkApprovePriceMethod !== 'markup') return true;
    const value = Number(bulkApproveMarkup);
    return Number.isFinite(value) && value >= -50 && value <= 200;
  })();

  function openProductsTableSettings() {
    const trigger = productsTableSettingsAnchorRef.current?.querySelector('button');
    if (trigger instanceof HTMLButtonElement) {
      trigger.click();
    }
  }

  function isProductColumnVisible(key: ProductColumnKey) {
    return visibleColumns.includes(key);
  }

  function toggleProductColumn(key: ProductColumnKey) {
    const currentlyVisible = visibleColumns.includes(key);
    if (currentlyVisible && visibleColumns.length <= 2) {
      return;
    }

    const nextColumns = currentlyVisible
      ? visibleColumns.filter((columnKey) => columnKey !== key)
      : [...visibleColumns, key];

    setVisibleColumns(nextColumns);
  }

  function resetProductColumns() {
    setVisibleColumns(DEFAULT_PRODUCT_COLUMNS);
    try {
      window.localStorage.removeItem('priceright_columns_products');
    } catch {
      // Ignore localStorage access errors.
    }
  }

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <div className="app-header-row">
            <div>
              <h1 className="app-page-title">Products</h1>
            </div>
          </div>
        </div>
        <div className="app-page-content" style={{ gap: '20px', paddingTop: '20px' }}>
          <div className="app-card app-loading-state">
            <div className="app-loading-title">Loading products...</div>
            <div className="app-loading-subtitle">Preparing pricing data and BOMs</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page products-shell">
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      <div className="app-page-header">
        <h1 className="app-page-title">Products</h1>
        <div className="app-section-tabs" role="tablist" aria-label="Product workflows">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`app-section-tab ${activeTab === 'products' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'products'}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className={`app-section-tab ${activeTab === 'analysis' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'analysis'}
          >
            Analysis
          </button>
        </div>
      </div>

      <div className="app-page-content">
      {activeTab === 'products' && (
      <div className="materials-tab-body">
        <div className="app-card app-filter-card">
          <input
            className="app-toolbar-input"
            type="search"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="app-toolbar-select"
            style={{ width: '110px' }}
            value={selectedApprovalStatus}
            onChange={(e) => setSelectedApprovalStatus(e.target.value)}
          >
            {APPROVAL_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <ActionDropdown
            label="+ Add"
            buttonClassName="btn btn-primary btn-sm"
            disabled={baseCurrencyMissing}
            disabledTitle="Set a base currency first in Settings"
            items={[
              {
                key: 'add-single',
                label: 'Add single product',
                icon: <Plus size={14} strokeWidth={2} />,
                onSelect: handleAddProduct,
              },
              { key: 'divider-add', type: 'divider' as const },
              {
                key: 'import-csv',
                label: 'Import from CSV',
                icon: <Upload size={14} strokeWidth={2} />,
                onSelect: () => setShowImportModal(true),
              },
            ]}
          />
          <ActionDropdown
            label="More"
            buttonClassName="btn btn-ghost btn-sm"
            items={[
              {
                key: 'export-excel',
                label: 'Export to Excel',
                onSelect: handleExportToExcel,
                icon: <FileSpreadsheet size={13} strokeWidth={2} />,
              },
              {
                key: 'export-csv',
                label: 'Export to CSV',
                onSelect: handleExportFilteredProductsCsv,
                icon: <FileText size={13} strokeWidth={2} />,
              },
              {
                key: 'print',
                label: 'Print / Export PDF',
                onSelect: () => {
                  if (filteredProducts.length === 0) {
                    showToastMessage('No products to print', 'error');
                    return;
                  }
                  void handlePrint({
                    title: 'Products List',
                    subtitle: `${filteredProducts.length} products`,
                  });
                },
                icon: <Printer size={15} strokeWidth={2} />,
              },
              { key: 'divider-1', type: 'divider' },
              {
                key: 'table-settings',
                label: 'Table settings',
                onSelect: openProductsTableSettings,
                icon: <Settings2 size={13} strokeWidth={2} />,
              },
            ]}
          />
          <div
            ref={productsTableSettingsAnchorRef}
            style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
            aria-hidden="true"
          >
            <TableSettingsDropdown
              columns={PRODUCT_COLUMN_OPTIONS.map((column) => ({
                key: column.key,
                label: column.label,
                visible: isProductColumnVisible(column.key),
              }))}
              onToggleColumn={(key) => toggleProductColumn(key as ProductColumnKey)}
              onResetColumns={resetProductColumns}
              density={tableDensity}
              onToggleDensity={() => setTableDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))}
              onApproveAllEligible={handleApproveAllEligible}
              approveAllEligibleLabel={isApprovingAll ? 'Approving...' : `Approve all eligible (${eligibleApproveCount})`}
              disableApproveAllEligible={eligibleApproveCount === 0 || isApprovingAll}
            />
          </div>
        </div>

        {shouldShowNeedsReviewBanner && (
          <div
            style={{
              position: 'relative',
              backgroundColor: '#fff3e0',
              border: '1px solid #ffcc80',
              borderRadius: '8px',
              padding: '12px 44px 12px 16px',
              marginBottom: '16px',
            }}
          >
            <button className="btn-close-x" onClick={() => setIsNeedsReviewBannerDismissed(true)} aria-label="Dismiss">
              &times;
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#e65100', fontSize: '15px', fontWeight: 400 }}>
              <AlertTriangle size={16} color="#e65100" />
              <span>{statusChipCounts.needsReview} products need price review. Material costs have changed and optimal prices have been updated.</span>
            </div>

          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedProducts.size > 0 && (
          <div
            className="app-bulk-bar app-bulk-bar-sticky"
            style={{
              backgroundColor: '#0F2847',
              color: 'white',
              padding: '10px 16px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '15px', color: '#cbd5e1' }}>
              {selectedProducts.size} selected
            </span>

            <ActionDropdown
              label="Approve"
              buttonClassName="btn btn-primary btn-sm"
              buttonIcon={<Check size={13} strokeWidth={2} />}
              items={[
                {
                  key: 'approve-optimal',
                  label: 'Approve at optimal price',
                  onSelect: () => {
                    setBulkApprovePriceMethod('optimal');
                    handleBulkApprove();
                  },
                },
                {
                  key: 'approve-current',
                  label: 'Keep current price',
                  onSelect: () => {
                    setBulkApprovePriceMethod('selling');
                    handleBulkApprove();
                  },
                },
                {
                  key: 'approve-markup',
                  label: 'Approve at custom markup...',
                  onSelect: () => {
                    setBulkApprovePriceMethod('markup');
                    handleBulkApprove();
                  },
                },
              ]}
            />

            <ActionDropdown
              label="Reject"
              buttonClassName="btn btn-secondary btn-sm"
              items={[
                {
                  key: 'reject-selected',
                  label: 'Reject selected (add reason if needed)',
                  onSelect: () => setShowBulkRejectModal(true),
                },
              ]}
            />

            <ActionDropdown
              label="More"
              buttonClassName="btn btn-ghost btn-sm"
              items={[
                {
                  key: 'bulk-set-active',
                  label: 'Set active',
                  onSelect: () => handleBulkSetActiveState(true),
                  icon: <Eye size={13} strokeWidth={2} />,
                },
                {
                  key: 'bulk-set-inactive',
                  label: 'Set inactive',
                  onSelect: () => handleBulkSetActiveState(false),
                  icon: <EyeOff size={13} strokeWidth={2} />,
                },
                {
                  key: 'bulk-change-category',
                  label: 'Change category',
                  onSelect: () => setShowCategoryModal(true),
                  icon: <Tags size={13} strokeWidth={2} />,
                },
                {
                  key: 'bulk-export',
                  label: 'Export selected',
                  onSelect: handleBulkExport,
                  icon: <FileSpreadsheet size={13} strokeWidth={2} />,
                },
                { key: 'divider-1', type: 'divider' },
                {
                  key: 'bulk-delete',
                  label: 'Delete selected',
                  onSelect: handleOpenBulkDeleteModal,
                  icon: <Trash2 size={13} strokeWidth={2} />,
                  destructive: true,
                },
              ]}
            />

            <button
              type="button"
              onClick={() => setSelectedProducts(new Set())}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', color: '#e2e8f0' }}
            >
              <X size={14} strokeWidth={2} />
              Clear selection
            </button>
          </div>
        )}

        <div className="app-card app-data-card" style={{ padding: 0 }} ref={productsTableRef}>
          <div className="app-data-card-header">
            <span className="app-data-card-title">Products ({filteredProducts.length})</span>
            <TableZoomControl zoomPercent={zoomPercent} decreaseZoom={decreaseZoom} increaseZoom={increaseZoom} />
          </div>
          {filteredProducts.length === 0 ? (
            products.length === 0 ? (
              <div className="app-empty-state">
                <div className="app-empty-state-icon" aria-hidden="true">📦</div>
                <div className="app-empty-state-title">No products yet</div>
                <div className="app-empty-state-text">
                  Build your products by adding a bill of materials.
                  PriceRight will calculate the production cost automatically.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={handleAddProduct}
                >
                  + Add your first product
                </button>
              </div>
            ) : (
              <div className="app-empty-state">
                <div className="app-empty-state-title">No matching products</div>
                <div className="app-empty-state-text">Adjust filters or add a new product to get started</div>
              </div>
            )
          ) : (
            <div className="app-table-wrap app-table-sticky" style={{ zoom: `${zoomPercent}%` }}>
              <table className={`app-table app-table-uniform-numbers ${tableDensity === 'compact' ? 'app-table-compact' : ''}`}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ fontWeight: '700', width: '32px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedProducts.size > 0 && selectedProducts.size < filteredProducts.length;
                        }}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', display: 'inline-block' }}
                      />
                    </th>
                    {isProductColumnVisible('name') && <th style={{ fontWeight: '700', width: '200px', minWidth: '200px', whiteSpace: 'nowrap' }}>Product</th>}
                    {isProductColumnVisible('materialCost') && <th style={{ fontWeight: '700', width: '82px', textAlign: 'right', whiteSpace: 'normal' }}>Production Cost</th>}
                    {isProductColumnVisible('optimalPrice') && (
                      <th style={{ fontWeight: '700', width: '88px', textAlign: 'right', whiteSpace: 'nowrap' }} title="The approved base price PriceRight recommends based on your material costs, overhead, and target margin. Updates automatically when costs change.">Optimal</th>
                    )}
                    {isProductColumnVisible('priceExpires') && <th style={{ fontWeight: '700', width: '104px', textAlign: 'left', whiteSpace: 'nowrap' }}>Valid until</th>}
                    {isProductColumnVisible('sellingPrice') && (
                      <th style={{ fontWeight: '700', width: '92px', textAlign: 'right', whiteSpace: 'normal' }} title="The approved base price you are currently charging before customer-level adjustments. PriceRight shows whether this is above or below your optimal price.">Approved base price</th>
                    )}
                    {isProductColumnVisible('profitOnCost') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'left', whiteSpace: 'normal' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Optimal Markup %
                          <OptimalMarkupInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('profitOnSales') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'left', whiteSpace: 'normal' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Optimal Gross Margin %
                          <OptimalGrossMarginInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('actualProfitOnCost') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'left', whiteSpace: 'normal' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Actual Markup %
                          <ActualMarkupInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('actualProfitOnSales') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'left', whiteSpace: 'normal' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Actual Gross Margin %
                          <ActualGrossMarginInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('status') && (
                      <th style={{ fontWeight: '700', width: '94px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          Status
                          {needsReviewCount > 0 && (
                            <span
                              title={`${needsReviewCount} product${needsReviewCount === 1 ? '' : 's'} need review`}
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '999px',
                                backgroundColor: '#f97316',
                                display: 'inline-block',
                              }}
                            />
                          )}
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('actions') && <th style={{ fontWeight: '700', width: '122px', textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const approvalBadge = getApprovalBadge(product.approvalStatus);

                    const hasSellingPrice = product.currentSellingPrice != null && product.currentSellingPrice > 0;
                    const optimalProfitOnCost = calculateOptimalProfitOnCost(product);
                    const optimalProfitOnSales = calculateOptimalProfitOnSales(product);
                    const actualProfitOnCost = calculateActualProfitOnCost(product);
                    const actualProfitOnSales = calculateActualProfitOnSales(product);
                    const sellingMismatch = !!product.priceMismatch;

                    const isNeedsReview = product.approvalStatus === 'needs_review';
                    const rowApprovedPrice = Number(product.approvedPrice ?? 0).toFixed(2);
                    const rowOptimalPrice = Number(product.optimalPrice || 0).toFixed(2);

                    return (
                      <Fragment key={product.id}>
                        <tr
                          title={isNeedsReview
                            ? `Cost changed. Approved price: GHS ${rowApprovedPrice}. New optimal: GHS ${rowOptimalPrice}. Click to review.`
                            : undefined}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            borderLeft: isNeedsReview ? '3px solid #f97316' : '3px solid transparent',
                            backgroundColor: isNeedsReview ? '#fffbf5' : 'transparent',
                            color: product.isActive ? undefined : '#aaaaaa',
                          }}
                        >
                          <td style={{ padding: '8px 14px', width: '32px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={() => handleSelectProduct(product.id)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          {isProductColumnVisible('name') && <td style={{ padding: '8px 14px', width: '200px', minWidth: '200px', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => openProductDetail(product.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span
                                title={`SKU: ${product.sku || '-'}`}
                                style={{
                                  fontWeight: 600,
                                  fontSize: '14px',
                                  color: product.isActive ? undefined : '#aaaaaa',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  minWidth: 0,
                                }}
                              >
                                {product.name}
                              </span>
                              {product.approvalStatus === 'needs_review' && <AppBadge variant="warning" size="sm">Review</AppBadge>}
                            </div>
                          </td>}
                          {isProductColumnVisible('materialCost') && <td style={{ padding: '8px 14px', fontWeight: '600', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="money-value">{product.totalCost.toFixed(2)}</span>
                          </td>}
                          {isProductColumnVisible('optimalPrice') && <td style={{ padding: '8px 14px', fontWeight: '700', color: product.isActive ? '#16a34a' : '#aaaaaa', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="money-value">{product.optimalPrice.toFixed(2)}</span>
                          </td>}
                          {isProductColumnVisible('priceExpires') && <td style={{ padding: '8px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {product.approvedPriceExpiresAt ? (
                              (() => {
                                const expiryDate = new Date(product.approvedPriceExpiresAt);
                                const today = new Date();
                                const daysUntilExpiryLocal = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                const isExpired = daysUntilExpiryLocal < 0;
                                const isExpiringSoon = daysUntilExpiryLocal >= 0 && daysUntilExpiryLocal <= 30;
                                const cellColor = isExpired ? '#dc2626' : isExpiringSoon ? '#d97706' : '#374151';
                                return (
                                  <span style={{ color: cellColor, fontWeight: isExpired || isExpiringSoon ? 700 : 500 }}>
                                    {expiryDate.toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                );
                              })()
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>}
                          {isProductColumnVisible('sellingPrice') && <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {hasSellingPrice ? (
                              <span
                                className="money-value"
                                style={{ fontWeight: 700, color: sellingMismatch ? '#c62828' : undefined }}
                                title={sellingMismatch ? 'Approved base price differs from approved value' : undefined}
                              >
                                {Number(product.currentSellingPrice).toFixed(2)}{sellingMismatch ? ' ⚠' : ''}
                              </span>
                            ) : (
                              <span style={{ fontSize: '14px', color: '#94a3b8' }}>Not set</span>
                            )}
                          </td>}
                          {isProductColumnVisible('profitOnCost') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            {optimalProfitOnCost == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: optimalProfitOnCost < 0 ? '#dc2626' : '#16a34a',
                                  fontWeight: 500,
                                }}
                              >
                                {optimalProfitOnCost.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('profitOnSales') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            {optimalProfitOnSales == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: optimalProfitOnSales >= 15 ? '#16a34a' : optimalProfitOnSales >= 10 ? '#d97706' : '#dc2626',
                                  fontWeight: 500,
                                }}
                              >
                                {optimalProfitOnSales.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('actualProfitOnCost') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            {actualProfitOnCost == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: actualProfitOnCost < 0 ? '#dc2626' : '#16a34a',
                                  fontWeight: 500,
                                }}
                              >
                                {actualProfitOnCost.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('actualProfitOnSales') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            {actualProfitOnSales == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: actualProfitOnSales >= 15 ? '#16a34a' : actualProfitOnSales >= 10 ? '#d97706' : '#dc2626',
                                  fontWeight: 500,
                                }}
                              >
                                {actualProfitOnSales.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('status') && <td style={{ padding: '8px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {isNeedsReview ? (
                                <span
                                  title="Material costs have changed since this product was last approved. Review the new optimal price and re-approve to update price lists."
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#fff3e0',
                                    color: '#e65100',
                                    border: '1px solid #ffcc80',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                  }}
                                >
                                  <AlertCircle size={11} strokeWidth={2} />
                                  Needs review
                                </span>
                              ) : (
                                <AppBadge variant={approvalBadge.variant} size="sm">
                                  {approvalBadge.label}
                                </AppBadge>
                              )}
                              {!product.isActive && (
                                <AppBadge variant="inactive" size="sm">Inactive</AppBadge>
                              )}
                            </div>
                          </td>}
                          {isProductColumnVisible('actions') && <td style={{ padding: '8px 14px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', whiteSpace: 'nowrap', alignItems: 'center' }}>
                              {isNeedsReview ? (
                                <AppButton
                                  onClick={() => openProductDetail(product.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="app-row-action-icon"
                                  title="Review price"
                                  ariaLabel={`Review price for ${product.name}`}
                                  style={{
                                    padding: '2px',
                                    minWidth: '20px',
                                  }}
                                >
                                  <CheckCircle size={14} strokeWidth={2} color="#e65100" />
                                </AppButton>
                              ) : (
                                <AppButton
                                  onClick={() => handleEdit(product)}
                                  variant="ghost"
                                  size="sm"
                                  className="app-row-action-icon"
                                  title="Edit product"
                                  ariaLabel={`Edit ${product.name}`}
                                  style={{
                                    padding: '2px',
                                    minWidth: '20px',
                                  }}
                                >
                                  <Pencil size={14} strokeWidth={2} />
                                </AppButton>
                              )}
                              <OverflowMenu
                                ariaLabel={`More actions for ${product.name}`}
                                items={[
                                  { label: 'View details', icon: ExternalLink, onClick: () => openProductDetail(product.id) },
                                  { label: 'Edit product', icon: Pencil, onClick: () => handleEdit(product) },
                                  { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicateProduct(product) },
                                  { type: 'divider', key: `state-divider-${product.id}` },
                                  product.isActive
                                    ? { label: 'Set inactive', icon: EyeOff, onClick: () => handleToggleProductActive(product) }
                                    : { label: 'Set active', icon: Eye, onClick: () => handleToggleProductActive(product) },
                                  { type: 'divider', key: `delete-divider-${product.id}` },
                                  { label: 'Delete', icon: Trash2, onClick: () => setDeleteTarget(product), danger: true },
                                ]}
                              />
                            </div>
                          </td>}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'analysis' && (
        <ProductsAnalysisTab products={products} />
      )}
      </div>

      <ProductFormDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        product={editingProduct}
        materials={materials}
        categoryOptions={productCategories}
        defaultOverhead={defaultOverhead}
        defaultProfitMargin={defaultProfitMargin}
        onSaved={async () => {
          setShowDrawer(false);
          await loadData();
        }}
      />

      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '10px',
              padding: '24px',
              maxWidth: '420px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: '#0F2847' }}>Delete {deleteTarget.name}?</div>
            <div style={{ fontSize: '16px', color: '#64748b', marginBottom: '20px' }}>
              This will also delete its BOM. This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="btn-close-x" onClick={() => setShowBulkDeleteModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Delete {selectedProducts.size} Product{selectedProducts.size !== 1 ? 's' : ''}?
            </h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This will also delete their BOMs. This cannot be undone.
            </p>

            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
              <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} strokeWidth={2} />
                {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} will be deleted
              </div>
              <div style={{ fontSize: '16px', color: '#78350f', maxHeight: '200px', overflowY: 'auto' }}>
                {Array.from(selectedProducts).slice(0, 5).map((id) => {
                  const product = filteredProducts.find((p) => p.id === id);
                  return (
                    <div key={id} style={{ marginBottom: '4px' }}>
                      • {product?.name || 'Unknown'}
                    </div>
                  );
                })}
                {selectedProducts.size > 5 && (
                  <div style={{ marginTop: '8px', fontWeight: '600' }}>+ {selectedProducts.size - 5} more</div>
                )}
              </div>
            </div>

            <div className="app-modal-actions">
              <button
                className="btn btn-danger-solid"
                onClick={() => setShowBulkDeleteModal(false)}
              >
                Close
              </button>
              <button
                className="btn btn-danger-solid"
                onClick={handleConfirmBulkDelete}
              >
                Delete {selectedProducts.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkApproveModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowBulkApproveModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Bulk Approve Products</h2>
            <p style={{ color: '#475569', marginBottom: '16px' }}>
              You are about to approve {selectedProducts.size} selected products.
            </p>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '18px' }}>
              <label style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'grid', gap: '4px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="bulk-approve-method"
                    value="optimal"
                    checked={bulkApprovePriceMethod === 'optimal'}
                    onChange={() => setBulkApprovePriceMethod('optimal')}
                  />
                  <span style={{ fontWeight: 700 }}>Approve at Optimal Price</span>
                </div>
                <div style={{ color: '#64748b', fontSize: '15px', marginLeft: '24px' }}>
                  Each product is approved at its system-calculated optimal price based on current material costs, overhead, and target margin.
                </div>
              </label>

              <label style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'grid', gap: '4px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="bulk-approve-method"
                    value="selling"
                    checked={bulkApprovePriceMethod === 'selling'}
                    onChange={() => setBulkApprovePriceMethod('selling')}
                  />
                  <span style={{ fontWeight: 700 }}>Keep current price</span>
                </div>
                <div style={{ color: '#64748b', fontSize: '15px', marginLeft: '24px' }}>
                  Each product is approved at its approved base price. Products with no approved base price set will be approved at their optimal price instead.
                </div>
              </label>

              <label style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'grid', gap: '4px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="bulk-approve-method"
                    value="markup"
                    checked={bulkApprovePriceMethod === 'markup'}
                    onChange={() => setBulkApprovePriceMethod('markup')}
                  />
                  <span style={{ fontWeight: 700 }}>Approve at Optimal Price + Markup %</span>
                </div>
                <div style={{ color: '#64748b', fontSize: '15px', marginLeft: '24px' }}>
                  Each product is approved at its optimal price adjusted by the markup percentage you enter below.
                </div>
                {bulkApprovePriceMethod === 'markup' && (
                  <div style={{ marginLeft: '24px', marginTop: '6px' }}>
                    <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Markup %</label>
                    <input
                      className="app-control"
                      type="number"
                      min={-50}
                      max={200}
                      step="0.1"
                      placeholder="e.g. 10 for 10% above optimal"
                      value={bulkApproveMarkup}
                      onChange={(e) => setBulkApproveMarkup(e.target.value)}
                      style={{ width: '260px' }}
                    />
                    <div style={{ marginTop: '6px', fontSize: '14px', color: '#64748b' }}>{getBulkApproveExample()}</div>
                  </div>
                )}
              </label>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'grid', gap: '6px' }}>
                <label style={{ display: 'block', fontSize: '15px', fontWeight: 700 }}>
                  Set expiry date for all Approved base prices (optional)
                </label>
                <input
                  className="app-control"
                  type="date"
                  min={getTomorrowDateInputValue()}
                  placeholder="No expiry"
                  value={bulkApproveExpiryDate}
                  onChange={(e) => setBulkApproveExpiryDate(e.target.value)}
                  style={{ width: '260px' }}
                />
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  All selected products will be flagged for review on this date.
                </div>
              </div>
            </div>

            <div className="app-modal-actions">
              <button className="btn btn-danger-solid" onClick={() => setShowBulkApproveModal(false)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmBulkApprove}
                disabled={!isBulkApproveMarkupValid}
              >
                Approve {selectedProducts.size} Products {'->'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkRejectModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowBulkRejectModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Reject Selected Prices</h2>
            <p style={{ color: '#475569', marginBottom: '10px' }}>
              Reject Approved base prices for {selectedProducts.size} selected products? Products will be moved to Rejected status and removed from price lists until re-approved.
            </p>
            {selectedNonApprovedCount > 0 && (
              <div style={{ marginBottom: '10px', fontSize: '15px', color: '#92400e', backgroundColor: '#fef3c7', borderRadius: '8px', padding: '8px 10px' }}>
                {selectedNonApprovedCount} of your selected products are not currently approved and will be skipped.
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <label className="app-settings-label">Reason for rejection (optional)</label>
              <input
                className="app-control"
                type="text"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                placeholder="e.g. Cost update required, pricing review needed"
                style={{ width: '100%' }}
              />
            </div>

            <div className="app-modal-actions">
              <button className="btn btn-danger-solid" onClick={() => setShowBulkRejectModal(false)}>Close</button>
              <button
                className="btn btn-danger-solid"
                onClick={handleConfirmBulkReject}
                disabled={selectedApprovedCount === 0}
              >
                Reject {selectedApprovedCount} Products
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
            <button className="btn-close-x" onClick={() => { setShowCategoryModal(false); setBulkCategoryValue(''); }} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">
              Change Category for {selectedProducts.size} Product{selectedProducts.size !== 1 ? 's' : ''}
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label className="app-settings-label" style={{ marginBottom: '8px' }}>
                Select New Category *
              </label>
              <input
                className="app-control"
                list="product-bulk-category-options"
                value={bulkCategoryValue}
                onChange={(e) => setBulkCategoryValue(e.target.value)}
                placeholder="Type or select category"
                style={{ width: '100%' }}
              />
              <datalist id="product-bulk-category-options">
                {productCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="app-modal-actions">
              <button
                className="btn btn-danger-solid"
                onClick={() => {
                  setShowCategoryModal(false);
                  setBulkCategoryValue('');
                }}
              >
                Close
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleBulkCategoryChange}
                disabled={!bulkCategoryValue}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-close-x"
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportPreview([]);
                setImportFailures([]);
                setImportSuccessCount(0);
                setImportRuntimeError('');
              }}
              aria-label="Close"
            >
              &times;
            </button>
            <h2 className="app-modal-title">Import Products</h2>

            {!importFile ? (
              <div>
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a
                    href={templateUrl('PriceRight_Products_Import_Template.xlsx')}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleDownload('PriceRight_Products_Import_Template.xlsx');
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
                    {downloading === 'PriceRight_Products_Import_Template.xlsx' ? 'Downloading...' : 'Download import template'}
                  </a>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>Fill it in and upload below</div>
                </div>
                <div style={{ marginBottom: '12px', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={18} strokeWidth={2} style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '15px', color: '#78350f' }}>
                    <strong>Import materials first.</strong> Product import matches material names to your existing materials. Any product whose material is not found will be skipped.
                  </div>
                </div>

                <label
                  htmlFor="product-file-upload"
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
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Upload using the standard template</div>
                  <div style={{ fontSize: '16px', color: '#64748b' }}>Best experience: use the CSV template. Excel files are also accepted.</div>
                  <input id="product-file-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleProductFileUpload} style={{ display: 'none' }} />
                </label>

                <div style={{ marginTop: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>Template requirements</div>
                  <div style={{ fontSize: '15px', color: '#475569' }}>One row per BOM material. Keep product-level fields identical for repeated product rows.</div>
                  <div style={{ fontSize: '15px', color: '#475569' }}>Include Approved base price when available; leave blank to default to 0.</div>
                </div>

              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <strong>File:</strong> {importFile.name} ({new Set(importPreview.map((r: any) => (r['Product Name'] || r['name'] || '').trim())).size} product{new Set(importPreview.map((r: any) => (r['Product Name'] || r['name'] || '').trim())).size !== 1 ? 's' : ''})
                </div>

                {importing && (
                  <div style={{ marginBottom: '12px', backgroundColor: 'rgba(22, 163, 74, 0.08)', color: '#0F2847', padding: '10px 12px', borderRadius: '8px', fontWeight: 600 }}>
                    Importing {new Set(importPreview.map((r: any) => (r['Product Name'] || r['name'] || '').trim())).size} product{new Set(importPreview.map((r: any) => (r['Product Name'] || r['name'] || '').trim())).size !== 1 ? 's' : ''}. Please wait...
                  </div>
                )}

                {importRuntimeError && (
                  <div style={{ marginBottom: '12px', backgroundColor: '#fef2f2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', fontWeight: 600 }}>
                    Import failed: {importRuntimeError}
                  </div>
                )}
                {importPreview.length > 0 && (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                      <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Product Name</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Overhead %</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              Markup %
                              <MarkupInfoTooltip position="bottom" />
                            </span>
                          </th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Approved base price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 10).map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px' }}>{row['Product Name'] || row['name'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Category'] || row['category'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Overhead %'] || row['Overhead'] || row['overhead'] || row['overheadPercentage'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Markup %'] || row['Profit on cost %'] || row['Profit Margin %'] || row['Profit'] || row['profit'] || row['profitMargin'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Approved base price'] || row['currentSellingPrice'] || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    onClick={handleDownloadProductTemplate}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Download Template
                  </button>
                  <button
                    onClick={() => {
                      setImportFile(null);
                      setImportPreview([]);
                      setImportFailures([]);
                      setImportSuccessCount(0);
                      setImportRuntimeError('');
                    }}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Choose Different File
                  </button>
                  <button
                    onClick={handleProductImport}
                    disabled={importing || importPreview.length === 0}
                    style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: importing ? '#94a3b8' : '#10b981', color: 'white', fontWeight: '600', border: 'none', cursor: importing ? 'not-allowed' : 'pointer' }}
                  >
                    {importing ? 'Importing...' : `Import ${new Set(importPreview.map((r: any) => (r['Product Name'] || r['name'] || '').trim())).size} Products`}
                  </button>
                </div>

                {(importSuccessCount > 0 || importFailures.length > 0) && (
                  <div style={{ marginTop: '16px' }}>
                    {importSuccessCount > 0 && (
                      <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: '600', marginBottom: '8px' }}>
                        {importSuccessCount} item{importSuccessCount !== 1 ? 's' : ''} imported successfully
                      </div>
                    )}

                    {importFailures.length > 0 && (
                      <div>
                        <div style={{ backgroundColor: '#fff7ed', color: '#92400e', padding: '12px', borderRadius: '8px', fontWeight: '600', marginBottom: '8px' }}>
                          {importFailures.length} item{importFailures.length !== 1 ? 's' : ''} failed to import
                        </div>

                        <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                            <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                              <tr>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Row #</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Reason</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importFailures.map((f) => (
                                <tr key={f.rowNumber} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '8px' }}>{f.rowNumber}</td>
                                  <td style={{ padding: '8px' }}>{f.name || '-'}</td>
                                  <td style={{ padding: '8px' }}>{f.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                          <button
                            onClick={downloadProductFailureReport}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '600' }}
                          >
                            Download Failure Report
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
