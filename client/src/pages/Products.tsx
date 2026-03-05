import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Check, CheckCheck, ChevronRight, Copy, FileSpreadsheet, Printer, Tags, Trash2, X } from 'lucide-react';
import { materialsApi, productsApi, settingsApi } from '../api';
import ProductFormDrawer from '../components/ProductFormDrawer';
import ProductTabs from '../components/ProductTabs';

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
}

interface Material {
  id: number;
  name: string;
  unit: string;
  unitPrice: string;
  baseCurrencySymbol: string;
}

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
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

const PRODUCTION_MODE_OPTIONS = ['All', 'Single', 'Batch'];
const PRICING_STATUS_OPTIONS = ['All', 'Not Set', 'Underpriced', 'Overpriced', 'Optimal'];
const APPROVAL_STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Rejected', 'Needs Review'];

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
  const currentPrice = product.currentSellingPrice || 0;

  if (currentPrice === 0) {
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

  if (variancePercent < -5) {
    return {
      variance,
      variancePercent,
      status: 'underpriced' as const,
      label: 'Underpriced',
      color: '#b91c1c',
      background: '#fee2e2',
    };
  }

  if (variancePercent > 5) {
    return {
      variance,
      variancePercent,
      status: 'overpriced' as const,
      label: 'Overpriced',
      color: '#b45309',
      background: '#fef3c7',
    };
  }

  return {
    variance,
    variancePercent,
    status: 'optimal' as const,
    label: 'Optimal',
    color: '#166534',
    background: '#dcfce7',
  };
}

function getApprovalBadge(status?: Product['approvalStatus']) {
  if (!status) {
    return {
      label: 'Pending',
      className: 'status-badge status-pending',
    };
  }

  if (status === 'approved') {
    return {
      label: 'Approved',
      className: 'status-badge status-approved',
    };
  }

  if (status === 'rejected') {
    return {
      label: 'Rejected',
      className: 'status-badge status-rejected',
    };
  }

  if (status === 'needs_review') {
    return {
      label: 'Needs Review',
      className: 'status-badge status-pending',
    };
  }

  return {
    label: 'Pending',
    className: 'status-badge status-pending',
  };
}

function getApprovalPanelColors(status?: Product['approvalStatus']) {
  if (status === 'approved') {
    return { background: '#f0fdf4', border: '#bbf7d0' };
  }
  if (status === 'rejected') {
    return { background: '#fef2f2', border: '#fecaca' };
  }
  if (status === 'needs_review') {
    return { background: '#fff7ed', border: '#fed7aa' };
  }
  return { background: '#f0f9ff', border: '#bae6fd' };
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

export default function Products() {
  const location = useLocation();
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [configuredProductCategories, setConfiguredProductCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultOverhead, setDefaultOverhead] = useState('30');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedProductionMode, setSelectedProductionMode] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('All');
  const [approvalInputs, setApprovalInputs] = useState<Record<number, { customPrice: string; reason: string }>>({});

  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [bomCache, setBomCache] = useState<Record<number, BOMMaterial[]>>({});
  const [bomLoading, setBomLoading] = useState<Record<number, boolean>>({});
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [expandedProductTabs, setExpandedProductTabs] = useState<Record<number, 'bom' | 'history'>>({});

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<Array<{ rowNumber: number; name: string; reason: string; originalRow: any }>>([]);
  const [importSuccessCount, setImportSuccessCount] = useState(0);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPricing | null>(null);
  
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const productCategories = useMemo(() => {
    const observed = products
      .map((product) => (product.category || '').trim())
      .filter((category) => category.length > 0);
    return Array.from(new Set([...configuredProductCategories, ...observed]))
      .sort((a, b) => a.localeCompare(b));
  }, [configuredProductCategories, products]);

  const lowMarginOnly = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('lowMargin') === '1';
  }, [location.search]);

  const approvalQueryFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const approval = (params.get('approval') || '').toLowerCase();
    if (approval === 'pending' || approval === 'approved' || approval === 'rejected' || approval === 'needs_review') {
      return approval as Product['approvalStatus'];
    }
    return null;
  }, [location.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    loadData();
    loadDefaultOverhead();
  }, []);

  // When filters change, update selection (deselect products not in filtered list)
  useEffect(() => {
    const validIds = new Set(filteredProducts.map((p) => p.id));
    const newSelected = new Set(
      Array.from(selectedProducts).filter((id) => validIds.has(id))
    );
    setSelectedProducts(newSelected);
  }, [debouncedSearch, selectedCategory, selectedProductionMode, selectedStatus, selectedApprovalStatus]);

  async function loadDefaultOverhead() {
    try {
      const settings = await settingsApi.getAll();
      const overheadSetting = settings.find((s: any) => s.settingKey === 'defaultOverhead');
      if (overheadSetting) {
        setDefaultOverhead(overheadSetting.settingValue);
      }
    } catch (error) {
      console.error('Error loading default overhead:', error);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [productsData, materialsData, settingsData] = await Promise.all([
        productsApi.getAll(),
        materialsApi.getAll(),
        settingsApi.getAll(),
      ]);

      const safeProducts = Array.isArray(productsData) ? productsData : [];
      const safeMaterials = Array.isArray(materialsData) ? materialsData : [];

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

      const productCategoriesSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'productCategories');
      setConfiguredProductCategories(parseConfiguredList(productCategoriesSetting?.settingValue));
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadBOM(productId: number) {
    setBomLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      const bom = await productsApi.getBOM(productId);
      setBomCache((prev) => ({ ...prev, [productId]: bom }));
    } catch (error) {
      console.error('Error loading BOM for product:', productId, error);
    } finally {
      setBomLoading((prev) => ({ ...prev, [productId]: false }));
    }
  }

  function handleToggleExpand(productId: number) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });

    if (!bomCache[productId]) {
      loadBOM(productId);
    }
  }

  function getDisplayBOM(bomItems: BOMMaterial[], product: ProductPricing) {
    if (product.productionMode !== 'batch' || !product.batchYield || product.batchYield <= 1) {
      return bomItems;
    }

    return bomItems.map((item) => ({
      ...item,
      quantity: item.quantity / product.batchYield!,
    }));
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

      setExpandedProducts(new Set());
      setBomCache({});
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
      setExpandedProducts(new Set());
      setBomCache({});
      await loadData();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      alert(error?.message || 'Failed to delete product');
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

    const outcomes = await Promise.all(
      ids.map(async (id) => {
        try {
          await productsApi.delete(id);
          return { id, ok: true as const, error: '' };
        } catch (error: any) {
          return { id, ok: false as const, error: error?.message || 'Failed to delete product' };
        }
      })
    );

    const deletedIds = outcomes.filter((item) => item.ok).map((item) => item.id);
    const failed = outcomes.filter((item) => !item.ok);

    setSelectedProducts(new Set(failed.map((item) => item.id)));
    setExpandedProducts(new Set());
    setBomCache({});
    setShowBulkDeleteModal(false);
    await loadData();

    if (deletedIds.length > 0 && failed.length === 0) {
      showToastMessage(
        `Successfully deleted ${deletedIds.length} product${deletedIds.length !== 1 ? 's' : ''}`,
        'success'
      );
      return;
    }

    if (deletedIds.length > 0 && failed.length > 0) {
      showToastMessage(
        `Deleted ${deletedIds.length}. Could not delete ${failed.length} product${failed.length !== 1 ? 's' : ''}.`,
        'error'
      );
      return;
    }

    const firstError = failed[0]?.error || 'Failed to delete selected products';
    showToastMessage(firstError, 'error');
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
    if (selectedProducts.size === 0) return;

    const selectedProdList = filteredProducts.filter((p) => selectedProducts.has(p.id));
    const exportData = selectedProdList.map((product) => ({
      'Product Name': product.name,
      'SKU': product.sku || '',
      'Category': product.category || '',
      'Production Mode': product.productionMode === 'batch' ? `Batch ${product.batchYield || 1}` : 'Single',
      'Batch Yield': product.batchYield || 1,
      'Material Cost': product.materialCost.toFixed(2),
      'Overhead %': product.overheadPercentage.toFixed(2),
      'Total Cost': product.totalCost.toFixed(2),
      'Profit Margin %': product.profitMargin.toFixed(2),
      'Optimal Price': product.optimalPrice.toFixed(2),
      'Current Price': product.currentSellingPrice ? product.currentSellingPrice.toFixed(2) : 'Not Set',
      'Status': calculatePricingAnalysis(product).label,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const columnWidths = [
      { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Products_Selected_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    showToastMessage(`Exported ${selectedProducts.size} product${selectedProducts.size !== 1 ? 's' : ''} to Excel`, 'success');
  }

  function showToastMessage(message: string, type: 'success' | 'error') {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }

  function formatApprovalDate(value?: string | number | null) {
    if (!value) return '-';
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getApprovalInput(productId: number) {
    return approvalInputs[productId] || { customPrice: '', reason: '' };
  }

  function updateApprovalInput(productId: number, key: 'customPrice' | 'reason', value: string) {
    setApprovalInputs((prev) => ({
      ...prev,
      [productId]: {
        ...getApprovalInput(productId),
        [key]: value,
      },
    }));
  }

  async function handleApproveOptimal(product: ProductPricing) {
    try {
      await productsApi.approve(product.id, { approvedPrice: product.optimalPrice });
      showToastMessage(`Price approved: GHS ${product.optimalPrice.toFixed(2)}`, 'success');
      await loadData();
    } catch (error: any) {
      console.error('Approve failed:', error);
      showToastMessage(error?.message || 'Failed to approve price', 'error');
    }
  }

  async function handleApproveCustom(product: ProductPricing) {
    const input = getApprovalInput(product.id);
    const customPrice = parseFloat(input.customPrice);
    if (Number.isNaN(customPrice) || customPrice <= 0) {
      showToastMessage('Enter a valid custom price', 'error');
      return;
    }
    const confirmText = `Approve custom price GHS ${customPrice.toFixed(2)}? This differs from optimal price GHS ${product.optimalPrice.toFixed(2)}.`;
    if (!confirm(confirmText)) return;

    try {
      await productsApi.approve(product.id, { approvedPrice: customPrice, reason: input.reason || undefined });
      showToastMessage(`Custom price approved: GHS ${customPrice.toFixed(2)}`, 'success');
      setApprovalInputs((prev) => ({ ...prev, [product.id]: { customPrice: '', reason: '' } }));
      await loadData();
    } catch (error: any) {
      console.error('Approve custom failed:', error);
      showToastMessage(error?.message || 'Failed to approve custom price', 'error');
    }
  }

  async function handleReject(product: ProductPricing) {
    const confirmText = `Reject price for ${product.name}? Product will be excluded from price lists.`;
    if (!confirm(confirmText)) return;

    try {
      await productsApi.reject(product.id, { reason: getApprovalInput(product.id).reason || undefined });
      showToastMessage('Price rejected. Product excluded from price lists.', 'success');
      await loadData();
    } catch (error: any) {
      console.error('Reject failed:', error);
      showToastMessage(error?.message || 'Failed to reject price', 'error');
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;

    try {
      await productsApi.bulkApprove(ids);
      showToastMessage(`${ids.length} product${ids.length !== 1 ? 's' : ''} approved`, 'success');
      setSelectedProducts(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Bulk approve failed:', error);
      showToastMessage(error?.message || 'Failed to bulk approve products', 'error');
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

  async function handleApproveAllExceptSelected() {
    const eligibleIds = filteredProducts
      .filter((product) => {
        const status = product.approvalStatus || 'pending';
        const isEligible = (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
        return isEligible && !selectedProducts.has(product.id);
      })
      .map((product) => product.id);

    if (eligibleIds.length === 0) {
      showToastMessage('No eligible products to approve after exclusions', 'error');
      return;
    }

    const confirmText = `Approve ${eligibleIds.length} eligible product${eligibleIds.length !== 1 ? 's' : ''} and skip ${selectedProducts.size} selected product${selectedProducts.size !== 1 ? 's' : ''}?`;
    if (!confirm(confirmText)) return;

    setIsApprovingAll(true);
    try {
      await productsApi.bulkApprove(eligibleIds);
      showToastMessage(`${eligibleIds.length} products approved. ${selectedProducts.size} kept for custom pricing.`, 'success');
      await loadData();
    } catch (error: any) {
      console.error('Approve all except selected failed:', error);
      showToastMessage(error?.message || 'Failed to approve products', 'error');
    } finally {
      setIsApprovingAll(false);
    }
  }

  async function handleProductFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setImportPreview(jsonData as any[]);
      } catch (error) {
        try {
          const text = event.target?.result as string;
          const lines = text.split(/\r?\n/).filter(Boolean);
          const headers = lines[0].split(',').map((h) => h.trim());
          const rows = lines.slice(1).map((line) => {
            const parts = line.split(',');
            const obj: any = {};
            headers.forEach((h, i) => {
              obj[h] = parts[i];
            });
            return obj;
          });
          setImportPreview(rows);
        } catch (err) {
          console.error('Error reading file:', error, err);
          alert('Error reading file. Please check the format.');
        }
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleProductImport() {
    if (importPreview.length === 0) {
      alert('No data to import');
      return;
    }
    setImporting(true);
    try {
      const resp = await productsApi.import(importPreview);
      setImportFailures(resp.failures || []);
      setImportSuccessCount(resp.successCount || 0);
      if ((resp.successCount || 0) > 0) await loadData();
    } catch (err: any) {
      console.error('Import failed:', err);
      alert('Import failed: ' + (err?.message || String(err)));
    } finally {
      setImporting(false);
    }
  }

  function downloadProductFailureReport() {
    if (!importFailures || importFailures.length === 0) return;
    const rows = importFailures.map((f) => ({ ...f.originalRow, 'Failure Reason': f.reason }));
    const ws = (window as any).XLSX ? (window as any).XLSX.utils.json_to_sheet(rows) : null;
    if (ws && (window as any).XLSX) {
      const wb = (window as any).XLSX.utils.book_new();
      (window as any).XLSX.utils.book_append_sheet(wb, ws, 'Failures');
      const date = new Date().toISOString().split('T')[0];
      (window as any).XLSX.writeFile(wb, `Products_Import_Failures_${date}.csv`);
    } else {
      alert('XLSX library is required to download failure report');
    }
  }

  function handleDownloadProductTemplate() {
    const rows = [
      {
        'Product Name': 'BROWN SUGAR BOTTLE 1.8kg',
        SKU: 'BSB-001',
        Category: 'Sugar',
        'Production Mode': 'Batch',
        'Batch Yield': '6',
        'Overhead %': '25',
        'Profit Margin %': '20',
        'Material Name': 'Sugar',
        Quantity: '10.8',
        Unit: 'Kg',
      },
      {
        'Product Name': 'BROWN SUGAR BOTTLE 1.8kg',
        SKU: 'BSB-001',
        Category: 'Sugar',
        'Production Mode': 'Batch',
        'Batch Yield': '6',
        'Overhead %': '25',
        'Profit Margin %': '20',
        'Material Name': 'Bottle & Cover Brown Sugar',
        Quantity: '6',
        Unit: 'Pcs',
      },
      {
        'Product Name': 'PALM OIL 500ML',
        SKU: 'PO-001',
        Category: 'Oils',
        'Production Mode': 'Single',
        'Batch Yield': '1',
        'Overhead %': '30',
        'Profit Margin %': '35',
        'Material Name': 'Raw Palm Oil',
        Quantity: '0.52',
        Unit: 'L',
      },
      {
        'Product Name': 'PALM OIL 500ML',
        SKU: 'PO-001',
        Category: 'Oils',
        'Production Mode': 'Single',
        'Batch Yield': '1',
        'Overhead %': '30',
        'Profit Margin %': '35',
        'Material Name': 'PET Bottles 500ml',
        Quantity: '1',
        Unit: 'piece',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products Template');

    const instr = [
      { A: 'Instructions:' },
      { A: 'One row per material. Rows with same Product Name are grouped into one product.' },
      { A: 'Production Mode must be Single or Batch (case-insensitive).' },
      { A: 'Batch Yield required when Production Mode is Batch.' },
      { A: 'Material Name must match an existing material in PriceRight.' },
      { A: 'Category can be any value that fits your business.' },
    ];
    const wsInstr = XLSX.utils.json_to_sheet(instr, { header: ['A'] });
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Products_Import_Template_${date}.xlsx`);
  }

  function handleExportToExcel() {
    const exportData = products.map((product) => {
      const analysis = calculatePricingAnalysis(product);
      const currentPrice = product.currentSellingPrice || 0;
      return {
        'Product Name': product.name,
        SKU: product.sku || '-',
        Category: product.category || '-',
        'Production Mode': product.productionMode === 'batch' ? `Batch (${product.batchYield} units)` : 'Single Unit',
        'Material Cost': `GHS ${product.materialCost.toFixed(2)}`,
        'Overhead Cost': `GHS ${product.overheadCost.toFixed(2)}`,
        'Total Cost': `GHS ${product.totalCost.toFixed(2)}`,
        'Optimal Price': `GHS ${product.optimalPrice.toFixed(2)}`,
        'Current Selling Price': currentPrice > 0 ? `GHS ${currentPrice.toFixed(2)}` : 'Not Set',
        'Variance (GHS)': currentPrice > 0 ? `GHS ${analysis.variance.toFixed(2)}` : '-',
        'Variance (%)': currentPrice > 0 ? `${analysis.variancePercent.toFixed(1)}%` : '-',
        Status: analysis.label,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

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

      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;

      const matchesProductionMode =
        selectedProductionMode === 'All' ||
        (selectedProductionMode === 'Batch' ? product.productionMode === 'batch' : product.productionMode !== 'batch');

      const status = calculatePricingAnalysis(product).status;
      const matchesStatus =
        selectedStatus === 'All' ||
        (selectedStatus === 'Not Set' && status === 'not-set') ||
        (selectedStatus === 'Underpriced' && status === 'underpriced') ||
        (selectedStatus === 'Overpriced' && status === 'overpriced') ||
        (selectedStatus === 'Optimal' && status === 'optimal');

      const approvalStatus = product.approvalStatus || 'pending';
      const matchesApprovalStatus =
        selectedApprovalStatus === 'All' ||
        (selectedApprovalStatus === 'Pending' && approvalStatus === 'pending') ||
        (selectedApprovalStatus === 'Approved' && approvalStatus === 'approved') ||
        (selectedApprovalStatus === 'Rejected' && approvalStatus === 'rejected') ||
        (selectedApprovalStatus === 'Needs Review' && approvalStatus === 'needs_review');
      const matchesApprovalQuery = !approvalQueryFilter || approvalStatus === approvalQueryFilter;

      const productMargin = toNumber(product.profitMargin);
      const matchesLowMargin = !lowMarginOnly || productMargin < 15;

      return matchesSearch && matchesCategory && matchesProductionMode && matchesStatus && matchesApprovalStatus && matchesApprovalQuery && matchesLowMargin;
    });
  }, [products, debouncedSearch, selectedCategory, selectedProductionMode, selectedStatus, selectedApprovalStatus, approvalQueryFilter, lowMarginOnly]);

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
      return [
        product.name,
        product.sku || '-',
        product.category || '-',
        product.productionMode === 'batch' ? `Batch (${product.batchYield || 1})` : 'Single',
        product.totalCost.toFixed(2),
        product.optimalPrice.toFixed(2),
        (product.currentSellingPrice || 0).toFixed(2),
        analysis.label,
        getApprovalBadge(product.approvalStatus).label,
      ];
    });

    downloadCsv(
      `products-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Product Name', 'SKU', 'Category', 'Production Mode', 'Total Cost', 'Optimal Price', 'Current Selling Price', 'Pricing Status', 'Approval Status'],
      rows
    );

    showToastMessage(`Exported ${filteredProducts.length} filtered product${filteredProducts.length !== 1 ? 's' : ''} to CSV`, 'success');
  }

  function handlePrintFilteredProducts() {
    if (filteredProducts.length === 0) {
      showToastMessage('No products to print', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredProducts
      .map((product) => {
        const analysis = calculatePricingAnalysis(product);
        return `
          <tr>
            <td>${product.name}</td>
            <td>${product.sku || '-'}</td>
            <td>${product.category || '-'}</td>
            <td>${product.productionMode === 'batch' ? `Batch (${product.batchYield || 1})` : 'Single'}</td>
            <td style="text-align:right;">${product.totalCost.toFixed(2)}</td>
            <td style="text-align:right;">${product.optimalPrice.toFixed(2)}</td>
            <td style="text-align:right;">${Number(product.currentSellingPrice || 0).toFixed(2)}</td>
            <td>${analysis.label}</td>
          </tr>
        `;
      })
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Products Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .meta { margin-bottom: 12px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Products Report</h1>
          <div class="meta">Generated ${new Date().toLocaleString()} • ${filteredProducts.length} record(s)</div>
          <table>
            <thead>
              <tr>
                <th>Product</th><th>SKU</th><th>Category</th><th>Mode</th><th>Total Cost</th><th>Optimal Price</th><th>Current Price</th><th>Status</th>
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

  const eligibleApproveCount = useMemo(() => {
    return filteredProducts.filter((product) => {
      const status = product.approvalStatus || 'pending';
      return (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
    }).length;
  }, [filteredProducts]);

  const eligibleExcludingSelectedCount = useMemo(() => {
    return filteredProducts.filter((product) => {
      const status = product.approvalStatus || 'pending';
      const isEligible = (status === 'pending' || status === 'needs_review') && product.optimalPrice > 0;
      return isEligible && !selectedProducts.has(product.id);
    }).length;
  }, [filteredProducts, selectedProducts]);

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <div className="app-header-row">
            <div>
              <h1 className="app-page-title">Products</h1>
              <p className="app-page-subtitle">View, edit, and price products with inline BOM details</p>
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
    <div className="app-page">
      {/* Toast Notification */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: toastType === 'success' ? '#d1fae5' : '#fee2e2',
            color: toastType === 'success' ? '#065f46' : '#991b1b',
            padding: '16px 24px',
            borderRadius: '8px',
            fontWeight: '600',
            zIndex: 2000,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {toastMessage}
        </div>
      )}
      <div className="app-page-header">
        <div className="app-header-row">
          <div>
            <h1 className="app-page-title">Products</h1>
            <p className="app-page-subtitle">View, edit, and price products with inline BOM details</p>
          </div>
          <div className="app-header-actions">
            <button
              className="btn btn-primary"
              onClick={handleAddProduct}
            >
              + Add Product
            </button>
            <button
              className="btn btn-success"
              onClick={() => setShowImportModal(true)}
            >
              Import CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportFilteredProductsCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={handlePrintFilteredProducts}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} strokeWidth={2} />
              Print
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportToExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      <div className="app-page-content" style={{ gap: '20px', paddingTop: '20px' }}>
        <div className="app-card app-filter-card">
          <div className="app-filter-row">
            <div className="app-filter-search">
              <input
                className="app-control"
                type="text"
                placeholder="Search by product name or SKU"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="app-control app-filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="All">All</option>
              {productCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="app-control app-filter-select"
              value={selectedProductionMode}
              onChange={(e) => setSelectedProductionMode(e.target.value)}
            >
              {PRODUCTION_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <select
              className="app-control app-filter-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              {PRICING_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="app-control app-filter-select"
              value={selectedApprovalStatus}
              onChange={(e) => setSelectedApprovalStatus(e.target.value)}
            >
              {APPROVAL_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="app-filter-summary">
              <span className="app-page-subtitle" style={{ margin: 0 }}>
                Showing {filteredProducts.length} of {products.length} products
              </span>
              {lowMarginOnly && (
                <span className="status-badge status-pending" title="Low margin filter from dashboard">
                  Low Margin (&lt; 15%)
                </span>
              )}
              {approvalQueryFilter && (
                <span className="status-badge status-rejected" title="Approval filter from dashboard" style={{ textTransform: 'capitalize' }}>
                  Approval: {approvalQueryFilter.replace('_', ' ')}
                </span>
              )}
              <span
                className="app-chip-info"
                title="Eligible means pending or needs review with a valid optimal price"
              >
                {eligibleApproveCount} eligible
              </span>
              <span
                style={{ fontSize: '12px', color: '#0369a1', cursor: 'help', fontWeight: 600 }}
                title="Eligible means pending or needs review with a valid optimal price"
              >
                What is eligible?
              </span>
              <button
                onClick={handleApproveAllEligible}
                disabled={eligibleApproveCount === 0 || isApprovingAll}
                style={{
                  backgroundColor: eligibleApproveCount > 0 && !isApprovingAll ? '#16a34a' : '#94a3b8',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: eligibleApproveCount > 0 && !isApprovingAll ? 'pointer' : 'not-allowed',
                }}
                title="Approve optimal price for all eligible products in the current filtered view"
              >
                {isApprovingAll ? 'Approving...' : 'Approve All Eligible'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="app-page-content" style={{ paddingTop: 0 }}>
        {/* Bulk Action Bar */}
        {selectedProducts.size > 0 && (
          <div className="app-bulk-bar">
            <div className="app-bulk-count-wrap">
              <span className="app-bulk-count">
                {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
              </span>
              <div className="app-bulk-hint">
                Selected rows are treated as custom-price exceptions.
              </div>
            </div>
            <button
              onClick={handleApproveAllExceptSelected}
              disabled={eligibleExcludingSelectedCount === 0 || isApprovingAll}
              className="btn btn-success"
              style={{
                backgroundColor: eligibleExcludingSelectedCount > 0 && !isApprovingAll ? '#16a34a' : '#94a3b8',
                cursor: eligibleExcludingSelectedCount > 0 && !isApprovingAll ? 'pointer' : 'not-allowed',
              }}
              title="Approves all eligible products in this filtered view and skips selected rows for custom pricing"
            >
              <CheckCheck size={14} strokeWidth={2} />
              Approve All Except Selected
            </button>
            <button
              onClick={handleBulkApprove}
              className="btn btn-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={14} strokeWidth={2} />
              Approve Selected
            </button>
            <button
              onClick={handleOpenBulkDeleteModal}
              className="btn btn-danger"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={14} strokeWidth={2} />
              Delete
            </button>
            <button
              onClick={() => setShowCategoryModal(true)}
              style={{
                backgroundColor: '#fef3c7',
                color: '#92400e',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Tags size={14} strokeWidth={2} />
              Change Category
            </button>
            <button
              onClick={handleBulkExport}
              className="btn btn-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export
            </button>
            <button
              onClick={() => setSelectedProducts(new Set())}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <X size={14} strokeWidth={2} />
              Clear
            </button>
          </div>
        )}
        
        <div className="app-card app-data-card">
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700' }}>Products ({filteredProducts.length})</h2>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="app-empty-state">
              <div className="app-loading-title">No matching products</div>
              <div className="app-loading-subtitle">Adjust filters or add a new product to get started</div>
            </div>
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', width: '40px', textAlign: 'center' }}>
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
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', width: '48px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700' }}>Product Name</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700' }}>Category</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700' }}>Production Mode</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'right' }}>Material Cost (GHS)</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'right' }}>Optimal Price (GHS)</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'right' }}>Current Price (GHS)</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>Pricing</th>
                    <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, idx) => {
                    const isExpanded = expandedProducts.has(product.id);
                    const analysis = calculatePricingAnalysis(product);
                    const approvalBadge = getApprovalBadge(product.approvalStatus);
                    const bomItems = bomCache[product.id] || [];
                    const displayBom = getDisplayBOM(bomItems, product);
                    const batchLabel =
                      product.productionMode === 'batch'
                        ? `Batch ${product.batchYield || 1} units`
                        : 'Single';

                    return (
                      <Fragment key={product.id}>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={() => handleSelectProduct(product.id)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td style={{ padding: '12px', width: '48px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '12px' }}>
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '14px' }}>{product.name}</div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>SKU: {product.sku || '-'}</div>
                              {product.description && (
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{product.description}</div>
                              )}
                              <button
                                onClick={() => handleToggleExpand(product.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginTop: '8px',
                                  backgroundColor: isExpanded ? '#eff6ff' : '#f8fafc',
                                  border: `1px solid ${isExpanded ? '#bfdbfe' : '#e2e8f0'}`,
                                  borderRadius: '999px',
                                  padding: '4px 10px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#1d4ed8',
                                  lineHeight: 1,
                                }}
                                aria-label={isExpanded ? `Collapse ${product.name} details` : `Expand ${product.name} details`}
                                title={isExpanded ? 'Hide details' : 'Show details'}
                              >
                                <span
                                  style={{
                                    display: 'inline-block',
                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 140ms ease',
                                  }}
                                >
                                  <ChevronRight size={14} strokeWidth={2.2} />
                                </span>
                                <span>{isExpanded ? 'Hide' : 'Details'}</span>
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px' }}>{product.category || '-'}</td>
                          <td style={{ padding: '12px', fontSize: '13px' }}>
                            <span className="status-badge status-active">
                              {batchLabel}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', textAlign: 'right' }}>
                            <span className="money-value">{product.materialCost.toFixed(2)}</span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', fontWeight: '700', color: '#16a34a', textAlign: 'right' }}>
                            <span className="money-value">{product.optimalPrice.toFixed(2)}</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span className={approvalBadge.className}>
                              {approvalBadge.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', textAlign: 'right' }}>
                            {product.currentSellingPrice && product.currentSellingPrice > 0 ? (
                              <span className="money-value" style={{ fontWeight: '700' }}>{product.currentSellingPrice.toFixed(2)}</span>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Not set</span>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span
                              style={{
                                borderRadius: '999px',
                                padding: '4px 8px',
                                backgroundColor: analysis.background,
                                color: analysis.color,
                                fontWeight: '700',
                                fontSize: '11px',
                              }}
                            >
                              {analysis.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleEdit(product)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#eff6ff',
                                  color: '#1e40af',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDuplicateProduct(product)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#ecfeff',
                                  color: '#0f766e',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <Copy size={12} strokeWidth={2} />
                                Duplicate
                              </button>
                              <button
                                onClick={() => setDeleteTarget(product)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={11} style={{ padding: '0 12px 16px 36px', backgroundColor: '#f8fafc' }}>
                              <div style={{ padding: '16px 0' }}>
                                <ProductTabs
                                  product={product}
                                  displayBom={displayBom}
                                  bomLoading={bomLoading[product.id] || false}
                                  activeTab={expandedProductTabs[product.id] || 'bom'}
                                  onTabChange={(tab) => {
                                    setExpandedProductTabs((prev) => ({
                                      ...prev,
                                      [product.id]: tab,
                                    }));
                                  }}
                                />
                                <div
                                  style={{
                                    marginTop: '16px',
                                    padding: '16px',
                                    borderRadius: '10px',
                                    border: `1px solid ${getApprovalPanelColors(product.approvalStatus).border}`,
                                    backgroundColor: getApprovalPanelColors(product.approvalStatus).background,
                                  }}
                                >
                                  <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>
                                    PRICE APPROVAL
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
                                    Tip: Approve a price here to include this product in official price lists.
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span className={getApprovalBadge(product.approvalStatus).className}>
                                      {getApprovalBadge(product.approvalStatus).label}
                                    </span>
                                    {product.approvalStatus === 'needs_review' && (
                                      <span style={{ fontSize: '12px', color: '#9a3412', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <AlertTriangle size={13} strokeWidth={2} />
                                        Costs changed. Approved price may be outdated.
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'grid', gap: '6px', fontSize: '13px', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: '#475569' }}>Optimal Price:</span>
                                      <span className="money-value" style={{ fontWeight: '700' }}>GHS {product.optimalPrice.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: '#475569' }}>Approved Price:</span>
                                      <span className="money-value" style={{ fontWeight: '700' }}>
                                        {product.approvedPrice != null ? `GHS ${product.approvedPrice.toFixed(2)}` : '-'}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: '#475569' }}>Approved By:</span>
                                      <span style={{ fontWeight: '600' }}>{product.approvedBy || '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: '#475569' }}>Approved On:</span>
                                      <span style={{ fontWeight: '600' }}>{formatApprovalDate(product.approvedAt as any)}</span>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                                    <button
                                      onClick={() => handleApproveOptimal(product)}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#16a34a',
                                        color: 'white',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <Check size={14} strokeWidth={2.2} />
                                      Approve Optimal Price
                                    </button>

                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                                          Custom Price (GHS)
                                        </label>
                                        <input
                                          type="number"
                                          value={getApprovalInput(product.id).customPrice}
                                          onChange={(e) => updateApprovalInput(product.id, 'customPrice', e.target.value)}
                                          style={{
                                            width: '140px',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            fontSize: '12px',
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                                          Reason (optional)
                                        </label>
                                        <input
                                          type="text"
                                          value={getApprovalInput(product.id).reason}
                                          onChange={(e) => updateApprovalInput(product.id, 'reason', e.target.value)}
                                          style={{
                                            width: '220px',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            fontSize: '12px',
                                          }}
                                        />
                                      </div>
                                      <button
                                        onClick={() => handleApproveCustom(product)}
                                        style={{
                                          padding: '8px 12px',
                                          borderRadius: '8px',
                                          border: 'none',
                                          backgroundColor: '#0ea5e9',
                                          color: 'white',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          fontSize: '12px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                        }}
                                      >
                                        <Check size={14} strokeWidth={2.2} />
                                        Approve Custom Price
                                      </button>
                                    </div>

                                    <button
                                      onClick={() => handleReject(product)}
                                      style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <X size={14} strokeWidth={2.2} />
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ProductFormDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        product={editingProduct}
        materials={materials}
        categoryOptions={productCategories}
        defaultOverhead={defaultOverhead}
        onSaved={async () => {
          setShowDrawer(false);
          setExpandedProducts(new Set());
          setBomCache({});
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
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Delete {deleteTarget.name}?</div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
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
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Delete {selectedProducts.size} Product{selectedProducts.size !== 1 ? 's' : ''}?
            </h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
              This will also delete their BOMs. This cannot be undone.
            </p>

            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
              <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} strokeWidth={2} />
                {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} will be deleted
              </div>
              <div style={{ fontSize: '14px', color: '#78350f', maxHeight: '200px', overflowY: 'auto' }}>
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
                className="btn btn-secondary"
                onClick={() => setShowBulkDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmBulkDelete}
              >
                Delete {selectedProducts.size}
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
                className="btn btn-secondary"
                onClick={() => {
                  setShowCategoryModal(false);
                  setBulkCategoryValue('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBulkCategoryChange}
                disabled={!bulkCategoryValue}
                style={{
                  backgroundColor: bulkCategoryValue ? '#3b82f6' : '#94a3b8',
                  cursor: bulkCategoryValue ? 'pointer' : 'not-allowed',
                }}
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
            <h2 style={{ marginBottom: '12px', fontSize: '20px', fontWeight: '700' }}>Import Products from CSV/Excel</h2>

            {!importFile ? (
              <div>
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
                  <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Click to upload CSV or Excel file</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>Supports .csv, .xlsx, .xls files</div>
                  <input id="product-file-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleProductFileUpload} style={{ display: 'none' }} />
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    onClick={handleDownloadProductTemplate}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Download Template
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <strong>File:</strong> {importFile.name} ({importPreview.length} rows)
                </div>
                {importPreview.length > 0 && (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Product Name</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Overhead %</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Profit %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 10).map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px' }}>{row['Product Name'] || row['name'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Category'] || row['category'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Overhead'] || row['overhead'] || row['overheadPercentage'] || '-'}</td>
                            <td style={{ padding: '8px' }}>{row['Profit'] || row['profit'] || row['profitMargin'] || '-'}</td>
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
                    onClick={() => { setImportFile(null); setImportPreview([]); }}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Choose Different File
                  </button>
                  <button
                    onClick={handleProductImport}
                    disabled={importing || importPreview.length === 0}
                    style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: importing ? '#94a3b8' : '#10b981', color: 'white', fontWeight: '600', border: 'none', cursor: importing ? 'not-allowed' : 'pointer' }}
                  >
                    {importing ? 'Importing...' : `Import ${importPreview.length} Products`}
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
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
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
