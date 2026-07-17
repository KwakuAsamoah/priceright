import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useFormState } from '../context/FormStateContext';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHelpButton from '../components/PageHelpButton';
import { AlertCircle, AlertTriangle, Check, CheckCircle, Copy, Download, ExternalLink, Eye, EyeOff, FileText, Loader2, Pencil, Plus, Printer, Table, Tags, Trash2, X } from 'lucide-react';
import OverflowMenu from '../components/OverflowMenu';
import { ColumnSelectorDropdown } from '../components/ColumnSelectorDropdown';
import ActionDropdown from '../components/ActionDropdown';
import { materialsApi, productsApi, settingsApi, currenciesApi } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import MarkupHealthPopover from '../components/MarkupHealthPopover';
import useAppToast from '../hooks/useAppToast';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import useCompanyName from '../hooks/useCompanyName';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';
import { generateTablePDF, printTable } from '../utils/exportPrint';
import { formatExportNumber } from '../utils/exportFormat';
import { exportInChunks } from '../utils/reportExport';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import useUndoAction from '../hooks/useUndoAction';
import type { UndoPreviousState } from '../hooks/useUndoAction';
import ProductFormDrawer from '../components/ProductFormDrawer';
import ProductCreatePanel from '../components/ProductCreatePanel';
import { ActualGrossMarginInfoTooltip, ActualMarkupInfoTooltip, OptimalGrossMarginInfoTooltip, OptimalMarkupInfoTooltip } from '../components/ProfitTooltips';
import {
  getProductsColumnConfig,
  PRODUCT_COLUMN_KEY_TO_ID,
  PRODUCTS_COLUMNS,
  type ProductColumnKey,
} from '../config/productsColumns';
import { calculateActualMarkupPercent, getThresholdMarkupColor } from '../utils/margin';

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
  approvalStatus?: 'pending' | 'approved' | 'needs_review' | 'rejected';
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

const APPROVAL_STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Needs Review'];

type InlineEditField = 'name' | 'priceExpires' | 'sellingPrice';

type InlineEditState = {
  productId: number;
  field: InlineEditField;
  draftValue: string;
} | null;

type PendingApprovedPriceConfirm = {
  productId: number;
  productName: string;
  approvedPrice: number;
} | null;

function formatExpiryInputValue(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed.slice(0, 10);
}

const inlineEditInputStyle = {
  width: '100%',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '14px',
  boxSizing: 'border-box' as const,
};

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

const PRODUCT_PDF_COLUMNS = [
  { header: 'Product Name', dataKey: 'productName' },
  { header: 'Category', dataKey: 'category' },
  { header: 'Production Cost', dataKey: 'productionCost' },
  { header: 'Currency', dataKey: 'currency' },
  { header: 'Optimal Price', dataKey: 'optimalPrice' },
  { header: 'Approved Base Price', dataKey: 'approvedBasePrice' },
  { header: 'Actual Markup %', dataKey: 'actualMarkupPercent' },
  { header: 'Optimal Markup %', dataKey: 'optimalMarkupPercent' },
  { header: 'Approval Status', dataKey: 'approvalStatus' },
] as const;

function buildProductPdfRows(products: ProductPricing[], currencyCode: string): Record<string, unknown>[] {
  return products.map((product) => {
    const optimalMarkup = calculateOptimalProfitOnCost(product);
    const actualMarkup = calculateActualProfitOnCost(product);

    return {
      productName: product.name,
      category: product.category || '—',
      productionCost: formatExportNumber(Number(product.totalCost || 0)),
      currency: currencyCode,
      optimalPrice: formatExportNumber(Number(product.optimalPrice || 0)),
      approvedBasePrice: product.approvalStatus === 'approved' && product.approvedPrice != null
        ? formatExportNumber(Number(product.approvedPrice))
        : '—',
      actualMarkupPercent: formatProductExportPercent(actualMarkup),
      optimalMarkupPercent: formatProductExportPercent(optimalMarkup),
      approvalStatus: getApprovalBadge(product.approvalStatus).label,
    };
  });
}

function buildProductsPdfOptions(products: ProductPricing[], currencyCode: string, companyName?: string) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    title: 'Products',
    subtitle: `${products.length} products`,
    columns: [...PRODUCT_PDF_COLUMNS],
    rows: buildProductPdfRows(products, currencyCode),
    landscape: true,
    companyName,
    filename: `products-${date}.pdf`,
  };
}

function getProductExportHeaders(): string[] {
  return [
    'Product Name',
    'Category',
    'Production Cost',
    'Currency',
    'Optimal Price',
    'Approved Base Price',
    'Actual Markup %',
    'Optimal Markup %',
    'Approval Status',
    'Actual Gross Margin % (reference)',
    'Optimal Gross Margin % (reference)',
  ];
}

function formatProductExportPercent(value: number | null): string {
  if (value == null) return '—';
  return formatExportNumber(value);
}

function buildProductExportValues(product: ProductPricing, baseCurrency: string): Array<string | number> {
  const optimalMarkup = calculateOptimalProfitOnCost(product);
  const optimalGross = calculateOptimalProfitOnSales(product);
  const actualMarkup = calculateActualProfitOnCost(product);
  const actualGross = calculateActualProfitOnSales(product);

  return [
    product.name,
    product.category || '—',
    formatExportNumber(Number(product.totalCost || 0)),
    baseCurrency,
    formatExportNumber(Number(product.optimalPrice || 0)),
    product.approvalStatus === 'approved' && product.approvedPrice != null
      ? formatExportNumber(Number(product.approvedPrice))
      : '—',
    formatProductExportPercent(actualMarkup),
    formatProductExportPercent(optimalMarkup),
    getApprovalBadge(product.approvalStatus).label,
    formatProductExportPercent(actualGross),
    formatProductExportPercent(optimalGross),
  ];
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

export default function Products() {
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const lowMarkupThreshold = useLowMarkupThreshold();
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [defaultOverhead, setDefaultOverhead] = useState('30');
  const [defaultProfitMargin, setDefaultProfitMargin] = useState('30');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const {
    isVisible: isColumnIdVisible,
    toggleColumn,
    resetToDefaults: resetColumnDefaults,
  } = useColumnVisibility('products-table-columns', PRODUCTS_COLUMNS);

  function isProductColumnVisible(key: ProductColumnKey) {
    return isColumnIdVisible(PRODUCT_COLUMN_KEY_TO_ID[key]);
  }

  function handleToggleProductColumn(id: string) {
    const column = PRODUCTS_COLUMNS.find((entry) => entry.id === id);
    if (column?.locked) return;

    if (isColumnIdVisible(id)) {
      const visibleToggleableCount = PRODUCTS_COLUMNS.filter(
        (entry) => !entry.locked && entry.label.length > 0 && isColumnIdVisible(entry.id),
      ).length;
      if (visibleToggleableCount <= 1) return;
    }

    toggleColumn(id);
  }

  function resetProductColumns() {
    resetColumnDefaults();
  }

  const [selectedStatus] = useState('All');
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('All');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [isNeedsReviewBannerDismissed, setIsNeedsReviewBannerDismissed] = useState(false);
  const [baseCurrencyMissing, setBaseCurrencyMissing] = useState(false);

  const productsTableRef = useRef<HTMLDivElement | null>(null);

  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPricing | null>(null);
  
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [bulkApprovePriceMethod, setBulkApprovePriceMethod] = useState<'optimal' | 'selling' | 'markup'>('optimal');
  const [bulkApproveMarkup, setBulkApproveMarkup] = useState('10');
  const [bulkApproveExpiryDate, setBulkApproveExpiryDate] = useState('');
  const [showBulkResetModal, setShowBulkResetModal] = useState(false);
  const [bulkResetReason, setBulkResetReason] = useState('');
  const [inactiveTarget, setInactiveTarget] = useState<ProductPricing | null>(null);
  const [bulkCategoryValue, setBulkCategoryValue] = useState('');
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { setHasOpenForm } = useFormState();
  const { registerUndo } = useUndoAction();

  useEffect(() => {
    setHasOpenForm(showCreatePanel || showDrawer);
  }, [showCreatePanel, showDrawer, setHasOpenForm]);

  useEffect(() => {
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [showApproveAllEligibleModal, setShowApproveAllEligibleModal] = useState(false);
  const [approveAllEligibleIds, setApproveAllEligibleIds] = useState<number[]>([]);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);
  const [inlineSavingId, setInlineSavingId] = useState<number | null>(null);
  const [pendingApprovedPriceConfirm, setPendingApprovedPriceConfirm] = useState<PendingApprovedPriceConfirm>(null);
  const [isConfirmingApprovedPrice, setIsConfirmingApprovedPrice] = useState(false);

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
    if (approval === 'pending' || approval === 'approved' || approval === 'needs_review') {
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

  function cancelInlineEdit() {
    setInlineEdit(null);
  }

  function startInlineEdit(product: ProductPricing, field: InlineEditField) {
    let draftValue = '';
    if (field === 'name') {
      draftValue = product.name;
    } else if (field === 'priceExpires') {
      draftValue = formatExpiryInputValue(product.approvedPriceExpiresAt);
    } else {
      draftValue = product.approvedPrice != null && Number(product.approvedPrice) > 0
        ? Number(product.approvedPrice).toFixed(2)
        : '';
    }
    setInlineEdit({ productId: product.id, field, draftValue });
  }

  async function saveInlineProductName(product: ProductPricing) {
    if (!inlineEdit || inlineEdit.productId !== product.id || inlineEdit.field !== 'name') return;

    const nextName = inlineEdit.draftValue.trim();
    if (!nextName) {
      showToastMessage('Product name cannot be empty', 'error');
      return;
    }
    if (nextName === product.name) {
      cancelInlineEdit();
      return;
    }

    setInlineSavingId(product.id);
    try {
      await productsApi.update(product.id, { name: nextName });
      setProducts((prev) => prev.map((entry) => (
        entry.id === product.id ? { ...entry, name: nextName } : entry
      )));
      cancelInlineEdit();
      showToastMessage('Product name updated', 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to update product name', 'error');
    } finally {
      setInlineSavingId(null);
    }
  }

  async function saveInlineValidUntil(product: ProductPricing) {
    if (!inlineEdit || inlineEdit.productId !== product.id || inlineEdit.field !== 'priceExpires') return;

    const nextDate = inlineEdit.draftValue.trim();
    const currentDate = formatExpiryInputValue(product.approvedPriceExpiresAt);
    if (nextDate === currentDate) {
      cancelInlineEdit();
      return;
    }

    setInlineSavingId(product.id);
    try {
      const updated = await productsApi.update(product.id, {
        approvedPriceExpiresAt: nextDate || null,
      });
      setProducts((prev) => prev.map((entry) => (
        entry.id === product.id
          ? {
              ...entry,
              approvedPriceExpiresAt: updated.approvedPriceExpiresAt ?? (nextDate || null),
              priceExpiryNotifiedAt: updated.priceExpiryNotifiedAt ?? null,
            }
          : entry
      )));
      cancelInlineEdit();
      showToastMessage(nextDate ? 'Valid until date updated' : 'Valid until date cleared', 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to update valid until date', 'error');
    } finally {
      setInlineSavingId(null);
    }
  }

  async function commitApprovedBasePrice(product: ProductPricing, approvedPrice: number) {
    setInlineSavingId(product.id);
    try {
      await productsApi.approve(product.id, { approvedPrice });
      await loadData();
      cancelInlineEdit();
      showToastMessage(`Approved base price updated to ${baseCurrency} ${approvedPrice.toFixed(2)}`, 'success');
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to update approved base price', 'error');
    } finally {
      setInlineSavingId(null);
    }
  }

  async function attemptSaveApprovedBasePrice(product: ProductPricing) {
    if (!inlineEdit || inlineEdit.productId !== product.id || inlineEdit.field !== 'sellingPrice') return;

    const parsed = parseFloat(inlineEdit.draftValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showToastMessage('Enter a valid non-negative price', 'error');
      return;
    }

    const currentPrice = product.approvedPrice != null ? Number(product.approvedPrice) : null;
    if (currentPrice != null && Math.abs(currentPrice - parsed) < 0.005) {
      cancelInlineEdit();
      return;
    }

    setInlineSavingId(product.id);
    try {
      const { hasApprovedReference } = await productsApi.hasApprovedPriceLevel(product.id);
      if (hasApprovedReference) {
        setPendingApprovedPriceConfirm({
          productId: product.id,
          productName: product.name,
          approvedPrice: parsed,
        });
        cancelInlineEdit();
        return;
      }

      await commitApprovedBasePrice(product, parsed);
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to check price level reference', 'error');
    } finally {
      setInlineSavingId(null);
    }
  }

  async function confirmPendingApprovedBasePrice() {
    if (!pendingApprovedPriceConfirm) return;

    const target = products.find((entry) => entry.id === pendingApprovedPriceConfirm.productId);
    if (!target) {
      setPendingApprovedPriceConfirm(null);
      showToastMessage('Product not found', 'error');
      return;
    }

    setIsConfirmingApprovedPrice(true);
    try {
      await commitApprovedBasePrice(target, pendingApprovedPriceConfirm.approvedPrice);
      setPendingApprovedPriceConfirm(null);
    } finally {
      setIsConfirmingApprovedPrice(false);
    }
  }

  function handleInlineEditKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    product: ProductPricing,
    field: InlineEditField,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelInlineEdit();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (field === 'name') {
        void saveInlineProductName(product);
      } else if (field === 'priceExpires') {
        void saveInlineValidUntil(product);
      } else {
        void attemptSaveApprovedBasePrice(product);
      }
    }
  }

  function handleEdit(product: ProductPricing) {
    setEditingProduct(product);
    setShowDrawer(true);
  }

  function handleAddProduct() {
    setShowCreatePanel(true);
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
      setInactiveTarget(product);
      return;
    }

    try {
      await productsApi.update(product.id, { isActive: true });
      showToastMessage('Product marked as active', 'success');
      await loadData();
    } catch (error: any) {
      console.error('Error updating product status:', error);
      showToastMessage(error?.message || 'Failed to update product status', 'error');
    }
  }

  async function handleConfirmSetInactive() {
    if (!inactiveTarget) return;
    try {
      await productsApi.update(inactiveTarget.id, { isActive: false });
      showToastMessage('Product marked as inactive', 'success');
      setInactiveTarget(null);
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
    const exportHeaders = getProductExportHeaders();
    const exportData = selectedProdList.map((product) => {
      const values = buildProductExportValues(product, baseCurrency);
      return exportHeaders.reduce<Record<string, string | number>>((row, header, index) => {
        row[header] = values[index];
        return row;
      }, {});
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 28 }, { wch: 28 },
    ];

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
    setBulkApprovePriceMethod('optimal');
    setShowBulkApproveModal(true);
  }

  function getBulkApproveExample() {
    const sampleOptimal = 40;
    const markupValue = Number(bulkApproveMarkup);
    if (!Number.isFinite(markupValue)) {
      return `e.g. Optimal ${baseCurrency} 40.00 -> Approved ${baseCurrency} --`;
    }
    const adjusted = sampleOptimal * (1 + markupValue / 100);
    return `e.g. Optimal ${baseCurrency} 40.00 -> Approved ${baseCurrency} ${adjusted.toFixed(2)}`;
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
      const skippedProducts = Array.isArray(result?.skippedProducts)
        ? result.skippedProducts as string[]
        : [];
      let summaryText = `Approved ${approvedCount} products at ${getBulkApproveMethodLabel(methodUsed, markupUsed)}.`;
      if (methodUsed === 'selling' && skippedProducts.length > 0) {
        summaryText = `${approvedCount} product${approvedCount !== 1 ? 's' : ''} approved. ${skippedProducts.length} product${skippedProducts.length !== 1 ? 's' : ''} skipped — no current selling price.`;
      }
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

  async function handleConfirmBulkReset() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;

    try {
      const result = await productsApi.bulkResetToPending(ids, bulkResetReason.trim() || undefined);
      const resetCount = Number(result?.reset || 0);
      showToastMessage(
        `${resetCount} product${resetCount === 1 ? '' : 's'} reset to pending. Re-approve when ready.`,
        'success'
      );
      setShowBulkResetModal(false);
      setBulkResetReason('');
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Bulk reset to pending failed:', error);
      showToastMessage(error?.message || 'Failed to reset products to pending', 'error');
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

    setApproveAllEligibleIds(eligibleIds);
    setShowApproveAllEligibleModal(true);
  }

  async function handleConfirmApproveAllEligible() {
    if (approveAllEligibleIds.length === 0) return;

    setIsApprovingAll(true);
    try {
      await productsApi.bulkApprove(approveAllEligibleIds);
      showToastMessage(`${approveAllEligibleIds.length} product${approveAllEligibleIds.length !== 1 ? 's' : ''} approved`, 'success');
      setShowApproveAllEligibleModal(false);
      setApproveAllEligibleIds([]);
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Approve all eligible failed:', error);
      showToastMessage(error?.message || 'Failed to approve all eligible products', 'error');
    } finally {
      setIsApprovingAll(false);
    }
  }

  async function handleExportToExcel() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const exportHeaders = getProductExportHeaders();
      const dataRows: Array<Array<string | number>> = [];
      await exportInChunks(products, (chunk) => {
        chunk.forEach((product) => {
          dataRows.push(buildProductExportValues(product, baseCurrency));
        });
      });

      const ws = XLSX.utils.aoa_to_sheet([
        exportHeaders,
        ...dataRows,
      ]);

      ws['!cols'] = [
        { wch: 30 },
        { wch: 16 },
        { wch: 15 },
        { wch: 10 },
        { wch: 15 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 28 },
        { wch: 28 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `Products_${dateStr}.xlsx`);
    } finally {
      setIsExporting(false);
    }
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
      const normalizedApprovalStatus = approvalStatus === 'rejected' ? 'pending' : approvalStatus;
      const matchesApprovalStatus =
        selectedApprovalStatus === 'All' ||
        (selectedApprovalStatus === 'Pending' && normalizedApprovalStatus === 'pending') ||
        (selectedApprovalStatus === 'Approved' && normalizedApprovalStatus === 'approved') ||
        (selectedApprovalStatus === 'Needs Review' && normalizedApprovalStatus === 'needs_review');
      const matchesApprovalQuery = !approvalQueryFilter
        || (approvalQueryFilter === 'rejected' ? normalizedApprovalStatus === 'pending' : approvalStatus === approvalQueryFilter);

      const actualMarkupPercent = product.approvalStatus === 'approved' && product.approvedPrice != null
        ? calculateActualMarkupPercent(Number(product.approvedPrice), Number(product.totalCost))
        : null;
      const matchesLowMargin = !lowMarginOnly || (
        product.approvalStatus === 'approved'
        && actualMarkupPercent !== null
        && actualMarkupPercent < lowMarkupThreshold
      );
      const productDaysUntilExpiry = typeof product.daysUntilExpiry === 'number' ? product.daysUntilExpiry : null;
      const matchesExpiringSoon = !expiringSoonOnly || (
        approvalStatus === 'approved'
        && productDaysUntilExpiry !== null
        && productDaysUntilExpiry > 0
        && productDaysUntilExpiry <= 30
      );

      const matchesActive =
        activeFilter === 'all'
        || (activeFilter === 'active' && product.isActive !== false)
        || (activeFilter === 'inactive' && product.isActive === false);

      return matchesSearch
        && matchesStatus
        && matchesApprovalStatus
        && matchesApprovalQuery
        && matchesLowMargin
        && matchesExpiringSoon
        && matchesActive;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, debouncedSearch, selectedStatus, selectedApprovalStatus, approvalQueryFilter, lowMarginOnly, expiringSoonOnly, activeFilter, lowMarkupThreshold]);

  const hasActiveProductFilters = searchInput.trim() !== ''
    || selectedApprovalStatus !== 'All'
    || activeFilter !== 'active';

  function clearAllProductFilters() {
    setSearchInput('');
    setSelectedApprovalStatus('All');
    setActiveFilter('active');
  }

  function formatActiveFilterLabel(value: 'active' | 'inactive' | 'all') {
    if (value === 'all') return 'All';
    if (value === 'inactive') return 'Inactive';
    return 'Active';
  }

  const productOrderForDetail = useMemo(
    () => filteredProducts.map((product) => ({ id: product.id, name: product.name })),
    [filteredProducts]
  );

  const editingProductIndex = useMemo(() => {
    if (!editingProduct) return -1;
    return filteredProducts.findIndex((p) => p.id === editingProduct.id);
  }, [editingProduct, filteredProducts]);

  function handleEditPrev() {
    if (editingProductIndex <= 0) return;
    const prev = filteredProducts[editingProductIndex - 1];
    if (prev) setEditingProduct(prev);
  }

  function handleEditNext() {
    if (editingProductIndex >= filteredProducts.length - 1) return;
    const next = filteredProducts[editingProductIndex + 1];
    if (next) setEditingProduct(next);
  }

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

  const pendingCount = useMemo(
    () => products.filter((p) => (p.approvalStatus || 'pending') === 'pending').length,
    [products],
  );
  const needsReviewCount = useMemo(
    () => products.filter((p) => p.approvalStatus === 'needs_review').length,
    [products],
  );
  const attentionCount = pendingCount + needsReviewCount;

  function handleApproveNowFromBanner() {
    const ids = products
      .filter((p) => {
        const status = p.approvalStatus || 'pending';
        return status === 'pending' || status === 'needs_review';
      })
      .map((p) => p.id);
    setSelectedProducts(new Set(ids));
    handleBulkApprove();
  }

  const hasNeedsReviewProducts = statusChipCounts.needsReview > 0;
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

    const exportHeaders = getProductExportHeaders();
    const rows = filteredProducts.map((product) => buildProductExportValues(product, baseCurrency));

    downloadCsv(
      `products-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      exportHeaders,
      rows
    );

    showToastMessage(`Exported ${filteredProducts.length} filtered product${filteredProducts.length !== 1 ? 's' : ''} to CSV`, 'success');
  }

  async function handleExportProductsPdf() {
    if (filteredProducts.length === 0) {
      showToastMessage('No products to export', 'error');
      return;
    }

    try {
      await generateTablePDF(buildProductsPdfOptions(filteredProducts, baseCurrency, companyName));
    } catch (error: unknown) {
      showToastMessage(error instanceof Error ? error.message : 'Failed to export PDF', 'error');
    }
  }

  async function handlePrintProductsExport() {
    if (filteredProducts.length === 0) {
      showToastMessage('No products to print', 'error');
      return;
    }

    try {
      await printTable(buildProductsPdfOptions(filteredProducts, baseCurrency, companyName));
    } catch (error: unknown) {
      showToastMessage(error instanceof Error ? error.message : 'Allow pop-ups to print the products list.', 'error');
    }
  }

  const eligibleApproveCount = useMemo(() => {
    return filteredProducts.filter((product) => {
      const status = product.approvalStatus || 'pending';
      return (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
    }).length;
  }, [filteredProducts]);

  const isBulkApproveMarkupValid = (() => {
    if (bulkApprovePriceMethod !== 'markup') return true;
    const value = Number(bulkApproveMarkup);
    return Number.isFinite(value) && value >= -50 && value <= 200;
  })();

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
      <div className="app-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <h1 className="app-page-title">Products</h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <MarkupHealthPopover />
          <PageHelpButton context="products" />
        </div>
      </div>

      <div className="app-page-content">
      <div className="materials-tab-body">
        {attentionCount > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              backgroundColor: '#DCFCE7',
              border: '1px solid #16A34A',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#15803D', fontSize: '14px' }}>
              {needsReviewCount > 0 ? (
                <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <CheckCircle size={16} strokeWidth={2} aria-hidden="true" />
              )}
              <span>
                {needsReviewCount > 0
                  ? `${attentionCount} product${attentionCount !== 1 ? 's' : ''} need attention — costs have changed since last approval`
                  : `${attentionCount} product${attentionCount !== 1 ? 's are' : ' is'} waiting for price approval`}
              </span>
            </div>
            <button type="button" className="btn btn-success btn-sm" onClick={handleApproveNowFromBanner}>
              Approve now
            </button>
          </div>
        ) : null}

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
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as 'active' | 'inactive' | 'all')}
            style={{
              height: '32px',
              border: '0.5px solid #E2E8F0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#F8FAFC',
              padding: '0 8px',
              color: '#0F2847',
              cursor: 'pointer',
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ActionDropdown
              label={isExporting ? 'Exporting...' : 'Export'}
              buttonClassName="btn btn-outline btn-sm"
              buttonIcon={isExporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              disabled={isExporting}
              items={[
                {
                  key: 'export-csv',
                  label: 'CSV',
                  onSelect: handleExportFilteredProductsCsv,
                  icon: <Download size={14} />,
                },
                {
                  key: 'export-excel',
                  label: 'Excel',
                  onSelect: () => {
                    void handleExportToExcel();
                  },
                  icon: <Table size={14} />,
                  disabled: isExporting,
                },
                {
                  key: 'export-pdf',
                  label: 'PDF',
                  onSelect: () => {
                    void handleExportProductsPdf();
                  },
                  icon: <FileText size={14} />,
                },
              ]}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void handlePrintProductsExport()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} />
              Print
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAddProduct}
            disabled={baseCurrencyMissing}
            title={baseCurrencyMissing ? 'Set a base currency first in Settings' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} strokeWidth={2} />
            Add Product
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void handleApproveAllEligible()}
            disabled={eligibleApproveCount === 0 || isApprovingAll}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckCircle size={14} />
            {isApprovingAll ? 'Approving...' : `Approve all eligible (${eligibleApproveCount})`}
          </button>
        </div>

        {hasActiveProductFilters ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
            {searchInput.trim() !== '' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', padding: '3px 8px', borderRadius: '12px' }}>
                Search: {searchInput.trim()}
                <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search filter" style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px 4px', margin: '-2px -4px -2px 0' }}>×</button>
              </span>
            ) : null}
            {selectedApprovalStatus !== 'All' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', padding: '3px 8px', borderRadius: '12px' }}>
                Status: {selectedApprovalStatus}
                <button type="button" onClick={() => setSelectedApprovalStatus('All')} aria-label="Clear status filter" style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px 4px', margin: '-2px -4px -2px 0' }}>×</button>
              </span>
            ) : null}
            {activeFilter !== 'active' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', padding: '3px 8px', borderRadius: '12px' }}>
                Showing: {formatActiveFilterLabel(activeFilter)}
                <button type="button" onClick={() => setActiveFilter('active')} aria-label="Clear active/inactive filter" style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '2px 4px', margin: '-2px -4px -2px 0' }}>×</button>
              </span>
            ) : null}
            <button type="button" onClick={clearAllProductFilters} style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600 }}>
              Clear all filters
            </button>
          </div>
        ) : null}

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
              label="Export selected"
              buttonClassName="btn btn-outline btn-sm"
              items={[
                {
                  key: 'bulk-export',
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
                  key: 'bulk-reset-pending',
                  label: 'Reset to Pending',
                  onSelect: () => setShowBulkResetModal(true),
                },
                { key: 'divider-reset', type: 'divider' as const },
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <ColumnSelectorDropdown
                columns={PRODUCTS_COLUMNS}
                isVisible={isColumnIdVisible}
                toggleColumn={handleToggleProductColumn}
                resetToDefaults={resetProductColumns}
              />
            </div>
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
                  disabled={baseCurrencyMissing}
                  title={baseCurrencyMissing ? 'Set a base currency first in Settings' : undefined}
                >
                  + Add your first product
                </button>
              </div>
            ) : (
              <div className="app-empty-state">
                <div className="app-empty-state-title">No matching products</div>
                <div className="app-empty-state-text">Adjust filters or add a new product to get started</div>
                {hasActiveProductFilters ? (
                  <button type="button" className="btn btn-outline" style={{ marginTop: '16px' }} onClick={clearAllProductFilters}>
                    Clear all filters
                  </button>
                ) : null}
              </div>
            )
          ) : (
            <div className="app-table-wrap app-table-sticky">
              <table className="app-table app-table-uniform-numbers app-table-compact">
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
                  <th style={{ textAlign: 'center', fontWeight: '700', width: '40px', whiteSpace: 'nowrap' }}>#</th>
                  <th style={{ fontWeight: '700', width: '200px', minWidth: '200px', whiteSpace: 'nowrap' }}>Product</th>
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
                        style={{ fontWeight: '700', width: '88px', textAlign: 'right', whiteSpace: 'normal' }}
                        title={getProductsColumnConfig('optimalMarkup')?.description}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {getProductsColumnConfig('optimalMarkup')?.label ?? 'Optimal Markup %'}
                          <OptimalMarkupInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('profitOnSales') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'right', whiteSpace: 'normal' }}
                        title={getProductsColumnConfig('optimalGrossMargin')?.description}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {getProductsColumnConfig('optimalGrossMargin')?.label ?? 'Optimal Gross Margin % (reference)'}
                          <OptimalGrossMarginInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('actualProfitOnCost') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'right', whiteSpace: 'normal' }}
                        title={getProductsColumnConfig('actualMarkup')?.description}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {getProductsColumnConfig('actualMarkup')?.label ?? 'Actual Markup %'}
                          <ActualMarkupInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    {isProductColumnVisible('actualProfitOnSales') && (
                      <th
                        style={{ fontWeight: '700', width: '88px', textAlign: 'right', whiteSpace: 'normal' }}
                        title={getProductsColumnConfig('actualGrossMargin')?.description}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {getProductsColumnConfig('actualGrossMargin')?.label ?? 'Actual Gross Margin % (reference)'}
                          <ActualGrossMarginInfoTooltip position="bottom" />
                        </span>
                      </th>
                    )}
                    <th style={{ fontWeight: '700', width: '94px', textAlign: 'left', whiteSpace: 'nowrap' }}>
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
                    <th style={{ fontWeight: '700', width: '122px', textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, idx) => {
                    const approvalBadge = getApprovalBadge(product.approvalStatus);

                    const hasApprovedBasePrice = product.approvalStatus === 'approved'
                      && product.approvedPrice != null
                      && Number(product.approvedPrice) > 0;
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
                            ? `Cost changed. Approved price: ${baseCurrency} ${rowApprovedPrice}. New optimal: ${baseCurrency} ${rowOptimalPrice}. Click to review.`
                            : undefined}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            borderLeft: isNeedsReview ? '3px solid #f97316' : '3px solid transparent',
                            backgroundColor: hoveredRowId === product.id ? '#f8fafc' : (isNeedsReview ? '#fffbf5' : 'transparent'),
                            color: product.isActive ? undefined : '#aaaaaa',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setHoveredRowId(product.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          onClick={() => openProductDetail(product.id)}
                        >
                          <td style={{ padding: '8px 14px', width: '32px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={(e) => { e.stopPropagation(); handleSelectProduct(product.id); }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 14px', width: '40px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '8px 14px', width: '200px', minWidth: '200px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              {inlineEdit?.productId === product.id && inlineEdit.field === 'name' ? (
                                <input
                                  type="text"
                                  value={inlineEdit.draftValue}
                                  onChange={(e) => setInlineEdit({ ...inlineEdit, draftValue: e.target.value })}
                                  onBlur={() => { void saveInlineProductName(product); }}
                                  onKeyDown={(e) => handleInlineEditKeyDown(e, product, 'name')}
                                  autoFocus
                                  disabled={inlineSavingId === product.id}
                                  style={inlineEditInputStyle}
                                />
                              ) : (
                                <>
                                  <span
                                    title={`SKU: ${product.sku || '-'}`}
                                    onClick={() => startInlineEdit(product, 'name')}
                                    style={{
                                      fontWeight: 600,
                                      fontSize: '14px',
                                      color: hoveredRowId === product.id ? '#16A34A' : (product.isActive ? undefined : '#aaaaaa'),
                                      textDecoration: hoveredRowId === product.id ? 'underline' : 'none',
                                      cursor: 'text',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      minWidth: 0,
                                      flex: 1,
                                    }}
                                  >
                                    {product.name}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => startInlineEdit(product, 'name')}
                                    aria-label={`Edit name for ${product.name}`}
                                    style={{ padding: '2px 4px', flexShrink: 0 }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                </>
                              )}
                              {inlineSavingId === product.id && inlineEdit?.field === 'name' ? (
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
                              ) : null}
                              {product.approvalStatus === 'needs_review' && <AppBadge variant="warning" size="sm">Review</AppBadge>}
                            </div>
                          </td>
                          {isProductColumnVisible('materialCost') && <td style={{ padding: '8px 14px', fontWeight: '600', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="money-value">{product.totalCost.toFixed(2)}</span>
                          </td>}
                          {isProductColumnVisible('optimalPrice') && <td style={{ padding: '8px 14px', fontWeight: '700', color: product.isActive ? '#16a34a' : '#aaaaaa', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="money-value">{product.optimalPrice.toFixed(2)}</span>
                          </td>}
                          {isProductColumnVisible('priceExpires') && <td style={{ padding: '8px 14px', textAlign: 'left', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            {inlineEdit?.productId === product.id && inlineEdit.field === 'priceExpires' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="date"
                                  value={inlineEdit.draftValue}
                                  onChange={(e) => setInlineEdit({ ...inlineEdit, draftValue: e.target.value })}
                                  onBlur={() => { void saveInlineValidUntil(product); }}
                                  onKeyDown={(e) => handleInlineEditKeyDown(e, product, 'priceExpires')}
                                  autoFocus
                                  disabled={inlineSavingId === product.id}
                                  style={{ ...inlineEditInputStyle, minWidth: '140px' }}
                                />
                                {inlineSavingId === product.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" /> : null}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startInlineEdit(product, 'priceExpires')}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  padding: 0,
                                  cursor: 'text',
                                  textAlign: 'left',
                                  width: '100%',
                                }}
                              >
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
                              </button>
                            )}
                          </td>}
                          {isProductColumnVisible('sellingPrice') && <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            {inlineEdit?.productId === product.id && inlineEdit.field === 'sellingPrice' ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', width: '100%' }}>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={inlineEdit.draftValue}
                                  onChange={(e) => setInlineEdit({ ...inlineEdit, draftValue: e.target.value })}
                                  onBlur={() => { void attemptSaveApprovedBasePrice(product); }}
                                  onKeyDown={(e) => handleInlineEditKeyDown(e, product, 'sellingPrice')}
                                  autoFocus
                                  disabled={inlineSavingId === product.id}
                                  style={{ ...inlineEditInputStyle, width: '110px', textAlign: 'right' }}
                                />
                                {inlineSavingId === product.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" /> : null}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startInlineEdit(product, 'sellingPrice')}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  padding: 0,
                                  cursor: 'text',
                                  width: '100%',
                                  textAlign: 'right',
                                }}
                              >
                                {hasApprovedBasePrice ? (
                                  <span
                                    className="money-value"
                                    style={{ fontWeight: 700, color: sellingMismatch ? '#c62828' : undefined }}
                                    title={sellingMismatch ? 'Approved base price differs from approved value' : undefined}
                                  >
                                    {Number(product.approvedPrice).toFixed(2)}{sellingMismatch ? ' ⚠' : ''}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>—</span>
                                )}
                              </button>
                            )}
                          </td>}
                          {isProductColumnVisible('profitOnCost') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {optimalProfitOnCost == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: getThresholdMarkupColor(optimalProfitOnCost, lowMarkupThreshold),
                                  fontWeight: 500,
                                }}
                              >
                                {optimalProfitOnCost.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('profitOnSales') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {optimalProfitOnSales == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span style={{ fontWeight: 500 }}>
                                {optimalProfitOnSales.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('actualProfitOnCost') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {actualProfitOnCost == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span
                                style={{
                                  color: getThresholdMarkupColor(actualProfitOnCost, lowMarkupThreshold),
                                  fontWeight: 500,
                                }}
                              >
                                {actualProfitOnCost.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          {isProductColumnVisible('actualProfitOnSales') && <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {actualProfitOnSales == null ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : (
                              <span style={{ fontWeight: 500 }}>
                                {actualProfitOnSales.toFixed(1)}%
                              </span>
                            )}
                          </td>}
                          <td style={{ padding: '8px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>
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
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                            <div
                              style={{ display: 'flex', gap: '4px', justifyContent: 'center', whiteSpace: 'nowrap', alignItems: 'center' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isNeedsReview ? (
                                <AppButton
                                  onClick={(e) => { e.stopPropagation(); openProductDetail(product.id); }}
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
                              ) : null}
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
                          </td>
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
      </div>

      {showDrawer && editingProduct ? (
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
        onPrev={handleEditPrev}
        onNext={handleEditNext}
        currentIndex={editingProductIndex}
        totalCount={filteredProducts.length}
      />
      ) : null}

      {showCreatePanel ? (
        <ProductCreatePanel
          onClose={() => setShowCreatePanel(false)}
          onSaved={() => {
            setShowCreatePanel(false);
            void loadData();
          }}
        />
      ) : null}

      {pendingApprovedPriceConfirm && (
        <div className="app-modal-overlay" onClick={() => { if (!isConfirmingApprovedPrice) setPendingApprovedPriceConfirm(null); }}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-close-x"
              onClick={() => { if (!isConfirmingApprovedPrice) setPendingApprovedPriceConfirm(null); }}
              aria-label="Close"
            >
              &times;
            </button>
            <h2 className="app-modal-title">This product has approved prices in one or more price lists.</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              Changing the approved base price to {baseCurrency} {pendingApprovedPriceConfirm.approvedPrice.toFixed(2)} will re-approve this product at the new price. Continue?
            </p>
            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setPendingApprovedPriceConfirm(null)}
                disabled={isConfirmingApprovedPrice}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => { void confirmPendingApprovedBasePrice(); }}
                disabled={isConfirmingApprovedPrice}
              >
                {isConfirmingApprovedPrice ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {inactiveTarget && (
        <div className="app-modal-overlay" onClick={() => setInactiveTarget(null)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setInactiveTarget(null)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Set Product Inactive</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This product will be hidden from your active products list and excluded from price lists and exports.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setInactiveTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void handleConfirmSetInactive()}>Set Inactive</button>
            </div>
          </div>
        </div>
      )}

      {showApproveAllEligibleModal && (
        <div className="app-modal-overlay" onClick={() => { if (!isApprovingAll) { setShowApproveAllEligibleModal(false); setApproveAllEligibleIds([]); } }}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => { if (!isApprovingAll) { setShowApproveAllEligibleModal(false); setApproveAllEligibleIds([]); } }} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Approve All Eligible Products</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              All products with a calculated price will be approved at their optimal price. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowApproveAllEligibleModal(false); setApproveAllEligibleIds([]); }} disabled={isApprovingAll}>Cancel</button>
              <button className="btn btn-success" onClick={() => void handleConfirmApproveAllEligible()} disabled={isApprovingAll}>
                {isApprovingAll ? 'Approving...' : 'Approve All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="app-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="app-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setDeleteTarget(null)} aria-label="Close">&times;</button>
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
                  Each product is approved at its current selling price. Products with no selling price set will be skipped.
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

      {showBulkResetModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowBulkResetModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Reset Pricing Status</h2>
            <p style={{ color: '#475569', marginBottom: '10px' }}>
              Selected products will be moved back to pending. Their approved prices will be cleared and will need to be re-approved.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label className="app-settings-label">Reason (optional)</label>
              <input
                className="app-control"
                type="text"
                value={bulkResetReason}
                onChange={(e) => setBulkResetReason(e.target.value)}
                placeholder="e.g. Pricing review needed"
                style={{ width: '100%' }}
              />
            </div>

            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBulkResetModal(false)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmBulkReset}
              >
                Reset {selectedProducts.size} Products
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
