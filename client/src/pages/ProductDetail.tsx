import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCircle, ChevronLeft, ChevronRight, Pencil, Eye, EyeOff } from 'lucide-react';
import { productsApi, materialsApi, activityLogApi, type ActivityEntry } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import ProductTabs from '../components/ProductTabs';
import ProductFormDrawer from '../components/ProductFormDrawer';
import useAppToast from '../hooks/useAppToast';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import AppToast from '../components/AppToast';
import { ActualGrossMarginInfoTooltip, ActualMarkupInfoTooltip, OptimalGrossMarginInfoTooltip, OptimalMarkupInfoTooltip } from '../components/ProfitTooltips';

// ─── local types ────────────────────────────────────────────────────────────

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
  currentSellingPrice?: number | null;
  approvalStatus?: 'pending' | 'approved' | 'needs_review' | 'rejected';
  approvedPrice?: number | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedPriceExpiresAt?: string | null;
  isActive: boolean;
  priceMismatch?: boolean;
  daysUntilExpiry?: number | null;
  isPriceExpired?: boolean;
  // computed by server
  productionCost?: number;
  optimalPrice?: number;
  totalCost?: number;
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

interface ProductNavItem {
  id: number;
  name: string;
}

interface ProductDetailLocationState {
  from?: string;
  productOrder?: ProductNavItem[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getApprovalBadge(status?: Product['approvalStatus']) {
  if (status === 'approved') return { label: 'Approved', variant: 'approved' as const };
  if (status === 'needs_review') return { label: 'Needs Review', variant: 'needs-review' as const };
  return { label: 'Pending', variant: 'pending' as const };
}

function getApprovalPanelColors(status?: Product['approvalStatus']) {
  if (status === 'approved') return { background: '#f0fdf4', border: '#bbf7d0' };
  if (status === 'needs_review') return { background: '#fff7ed', border: '#fed7aa' };
  return { background: '#f0f9ff', border: '#bae6fd' };
}

function formatDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTomorrowDateInputValue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDisplayBOM(bomItems: BOMMaterial[], product: Product): BOMMaterial[] {
  if (product.productionMode !== 'batch' || !product.batchYield || product.batchYield <= 1) {
    return bomItems;
  }
  return bomItems.map((item) => ({
    ...item,
    quantity: item.quantity / product.batchYield!,
  }));
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { baseCurrency } = useBaseCurrency();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const productId = Number(id);
  const locationState = (location.state as ProductDetailLocationState | null) || null;
  const backTo = locationState?.from || '/products';
  const incomingProductOrder = useMemo(() => {
    const rows = Array.isArray(locationState?.productOrder) ? locationState.productOrder : [];
    return rows
      .map((item) => ({ id: Number(item.id), name: String(item.name || '') }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0);
  }, [locationState]);

  const [product, setProduct] = useState<Product | null>(null);
  const [bom, setBom] = useState<BOMMaterial[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeTab, setActiveTab] = useState<'bom' | 'history' | 'activity'>('bom');
  const [productActivity, setProductActivity] = useState<ActivityEntry[]>([]);
  const [productActivityLoading, setProductActivityLoading] = useState(false);

  // approval form state
  const [approvalCustomPrice, setApprovalCustomPrice] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalExpiryDate, setApprovalExpiryDate] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [staleCustomPrices, setStaleCustomPrices] = useState<Array<{ priceLevelId: number; priceLevelName: string; customPrice: number; newApprovedBasePrice: number }>>([]);
  const [staleAlertDismissed, setStaleAlertDismissed] = useState(false);

  // materials list for the form drawer
  const [materials, setMaterials] = useState<any[]>([]);
  const [productOrder, setProductOrder] = useState<ProductNavItem[]>([]);

  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();

  async function loadData() {
    if (!Number.isFinite(productId) || productId <= 0) {
      setError('Invalid product ID');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [productData, bomData] = await Promise.all([
        productsApi.getById(productId),
        (() => {
          setBomLoading(true);
          return productsApi.getBOM(productId).finally(() => setBomLoading(false));
        })(),
      ]);

      if (productData?.error) {
        setError(productData.error);
        return;
      }

      setProduct(productData);
      setBom(bomData || []);
    } catch {
      setError('Failed to load product data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials() {
    try {
      const data = await materialsApi.getAll();
      setMaterials(data || []);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    loadData();
    loadMaterials();
  }, [productId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProductActivity() {
      if (!Number.isFinite(productId) || productId <= 0) {
        setProductActivity([]);
        return;
      }

      setProductActivityLoading(true);
      try {
        const response = await activityLogApi.getAll({
          entityType: 'product',
          limit: 20,
          offset: 0,
        });

        if (cancelled) return;

        const rows = (response.entries || [])
          .filter((entry) => Number(entry.entityId) === productId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 10);
        setProductActivity(rows);
      } catch {
        if (!cancelled) {
          setProductActivity([]);
        }
      } finally {
        if (!cancelled) {
          setProductActivityLoading(false);
        }
      }
    }

    loadProductActivity();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    let cancelled = false;

    if (incomingProductOrder.length > 0) {
      setProductOrder(incomingProductOrder);
      return () => {
        cancelled = true;
      };
    }

    async function loadProductOrder() {
      try {
        const rows = await productsApi.getAll('all');
        if (cancelled) return;
        const mapped = (Array.isArray(rows) ? rows : [])
          .map((item) => ({ id: Number((item as Product).id), name: String((item as Product).name || '') }))
          .filter((item) => Number.isFinite(item.id) && item.id > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        setProductOrder(mapped);
      } catch {
        if (!cancelled) {
          setProductOrder([]);
        }
      }
    }

    loadProductOrder();

    return () => {
      cancelled = true;
    };
  }, [incomingProductOrder]);

  const currentProductIndex = useMemo(
    () => productOrder.findIndex((item) => item.id === productId),
    [productOrder, productId]
  );
  const previousProduct = currentProductIndex > 0 ? productOrder[currentProductIndex - 1] : null;
  const nextProduct = currentProductIndex >= 0 && currentProductIndex < productOrder.length - 1
    ? productOrder[currentProductIndex + 1]
    : null;
  const productCounterCurrent = currentProductIndex >= 0 ? currentProductIndex + 1 : 1;
  const productCounterTotal = productOrder.length > 0 ? productOrder.length : 1;

  function navigateToProduct(target: ProductNavItem | null) {
    if (!target) return;
    navigate(`/products/${target.id}`, {
      state: {
        from: backTo,
        productOrder,
      },
    });
  }

  useEffect(() => {
    function handleArrowNavigation(event: KeyboardEvent) {
      const activeElement = document.activeElement as HTMLElement | null;
      const tagName = activeElement?.tagName?.toLowerCase();
      const isTypingField =
        tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || Boolean(activeElement?.isContentEditable);

      if (isTypingField) return;

      if (event.key === 'ArrowLeft' && previousProduct) {
        event.preventDefault();
        navigateToProduct(previousProduct);
      }
      if (event.key === 'ArrowRight' && nextProduct) {
        event.preventDefault();
        navigateToProduct(nextProduct);
      }
    }

    window.addEventListener('keydown', handleArrowNavigation);
    return () => window.removeEventListener('keydown', handleArrowNavigation);
  }, [previousProduct, nextProduct, productOrder, backTo]);

  async function handleToggleActive() {
    if (!product) return;
    if (!product.isActive) {
      // activating — no confirmation needed
    } else {
      const confirmed = window.confirm(
        `Mark ${product.name} as inactive?\nIt will be hidden from Price Lists and Special Pricing unless specifically filtered.`
      );
      if (!confirmed) return;
    }
    try {
      await productsApi.update(productId, { isActive: !product.isActive });
      showToastMessage(`Product marked as ${product.isActive ? 'inactive' : 'active'}`, 'success');
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to update product status', 'error');
    }
  }

  async function handleKeepCurrentPrice() {
    if (!product) return;
    const priceToKeep =
      product.approvedPrice != null && toNum(product.approvedPrice) > 0
        ? toNum(product.approvedPrice)
        : toNum(product.currentSellingPrice);
    if (priceToKeep <= 0) return;

    const keptApprovedPrice = product.approvedPrice != null && toNum(product.approvedPrice) > 0;
    setApprovalLoading(true);
    try {
      const result = await productsApi.approve(productId, { approvedPrice: priceToKeep });
      showToastMessage(
        keptApprovedPrice
          ? `Kept approved price: ${baseCurrency} ${priceToKeep.toFixed(2)}`
          : `Kept selling price: ${baseCurrency} ${priceToKeep.toFixed(2)}`,
        'success',
      );
      setShowPriceForm(false);
      setStaleAlertDismissed(false);
      setStaleCustomPrices(result?.staleCustomPrices ?? []);
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to keep current price', 'error');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleApproveOptimal() {
    if (!product) return;
    const expiryDate = approvalExpiryDate.trim() || null;
    setApprovalLoading(true);
    try {
      const result = await productsApi.approve(productId, {
        approvedPrice: toNum(product.optimalPrice),
        priceExpiryDate: expiryDate,
      });
      showToastMessage(`Price approved: ${baseCurrency} ${toNum(product.optimalPrice).toFixed(2)}`, 'success');
      setShowPriceForm(false);
      setApprovalExpiryDate('');
      setStaleAlertDismissed(false);
      setStaleCustomPrices(result?.staleCustomPrices ?? []);
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to approve price', 'error');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleApproveCustom() {
    if (!product) return;
    const customPrice = parseFloat(approvalCustomPrice);
    if (Number.isNaN(customPrice) || customPrice <= 0) {
      showToastMessage('Enter a valid custom price', 'error');
      return;
    }
    const optimalPrice = toNum(product.optimalPrice);
    const confirmText = `Approve custom price ${baseCurrency} ${customPrice.toFixed(2)}? This differs from optimal price ${baseCurrency} ${optimalPrice.toFixed(2)}.`;
    if (!confirm(confirmText)) return;

    const expiryDate = approvalExpiryDate.trim() || null;
    setApprovalLoading(true);
    try {
      const result = await productsApi.approve(productId, {
        approvedPrice: customPrice,
        reason: approvalReason || undefined,
        priceExpiryDate: expiryDate,
      });
      showToastMessage(`Custom price approved: ${baseCurrency} ${customPrice.toFixed(2)}`, 'success');
      setShowPriceForm(false);
      setApprovalCustomPrice('');
      setApprovalReason('');
      setApprovalExpiryDate('');
      setStaleAlertDismissed(false);
      setStaleCustomPrices(result?.staleCustomPrices ?? []);
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to approve custom price', 'error');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleResetToPending() {
    if (!product) return;
    const confirmText = `Reset pricing for ${product.name} to pending? The approved price will be cleared.`;
    if (!confirm(confirmText)) return;

    setApprovalLoading(true);
    try {
      await productsApi.resetToPending(productId, { reason: approvalReason || undefined });
      showToastMessage('Price reset to pending. Re-approve when ready.', 'success');
      setShowPriceForm(false);
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to reset price to pending', 'error');
    } finally {
      setApprovalLoading(false);
    }
  }

  // ─── render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <button
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Products
          </button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <button
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Products
          </button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
          {error || 'Product not found'}
        </div>
      </div>
    );
  }

  const approvalBadge = getApprovalBadge(product.approvalStatus);
  const panelColors = getApprovalPanelColors(product.approvalStatus);
  const optimalPrice = toNum(product.optimalPrice);
  const productionCost = toNum(product.productionCost || product.totalCost);
  const needsPriceAction = product.approvalStatus === 'pending' || product.approvalStatus === 'needs_review';
  const showApprovalForm = needsPriceAction || showPriceForm;
  const showReadOnlyApprovedSummary = product.approvalStatus === 'approved' && !showPriceForm;
  const profitOnCostAmount = productionCost * (toNum(product.profitMargin) / 100);
  const grossMarginAtOptimal = optimalPrice > 0 && productionCost > 0
    ? ((optimalPrice - productionCost) / optimalPrice) * 100
    : null;
  const approvedPrice = product.approvalStatus === 'approved' && product.approvedPrice != null
    ? toNum(product.approvedPrice)
    : null;
  const actualMarkupPercent = approvedPrice != null && productionCost > 0
    ? ((approvedPrice - productionCost) / productionCost) * 100
    : null;
  const actualGrossMarginPercent = approvedPrice != null && approvedPrice > 0 && productionCost > 0
    ? ((approvedPrice - productionCost) / approvedPrice) * 100
    : null;
  const approvedMatchesOptimal = approvedPrice != null && Math.abs(approvedPrice - optimalPrice) < 0.01;
  const displayBom = getDisplayBOM(bom, product);
  const totalMaterialCost = displayBom.reduce((sum, item) => sum + toNum(item.unitPrice) * item.quantity, 0);
  const overheadCost = totalMaterialCost * (toNum(product.overheadPercentage) / 100);
  const otherDirectCosts = toNum(product.otherDirectCosts);

  const normalizedExpiryDate = product.approvedPriceExpiresAt
    ? product.approvedPriceExpiresAt.slice(0, 10)
    : null;
  const daysUntilExpiry = typeof product.daysUntilExpiry === 'number' ? product.daysUntilExpiry : null;
  const shouldShowExpiry = !!normalizedExpiryDate && daysUntilExpiry !== null && daysUntilExpiry > 0;

  let expiryColor = '#94a3b8';
  if (shouldShowExpiry && daysUntilExpiry <= 7) expiryColor = '#b91c1c';
  else if (shouldShowExpiry && daysUntilExpiry <= 30) expiryColor = '#b45309';

  // ─── main render ─────────────────────────────────────────────────────────

  return (
    <div className="app-page">
      {showToast && <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />}

      {/* Top bar */}
      <div className="app-page-header" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Products
          </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <AppButton
              variant="secondary"
              size="sm"
              onClick={() => setShowDrawer(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Pencil size={13} strokeWidth={2} />
              Edit
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              onClick={handleToggleActive}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {product.isActive ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
              {product.isActive ? 'Set Inactive' : 'Set Active'}
            </AppButton>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '12px', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigateToProduct(previousProduct)}
            disabled={!previousProduct}
            title={previousProduct?.name || ''}
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: previousProduct ? '#334155' : '#94a3b8',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: previousProduct ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ChevronLeft size={14} strokeWidth={2} />
            Previous
          </button>

          <div style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}>
            {productCounterCurrent} of {productCounterTotal} products
          </div>

          <button
            type="button"
            onClick={() => navigateToProduct(nextProduct)}
            disabled={!nextProduct}
            title={nextProduct?.name || ''}
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: nextProduct ? '#334155' : '#94a3b8',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: nextProduct ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Next
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <h1
            className="app-page-title"
            style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {product.name}
          </h1>
          {!product.isActive && (
            <AppBadge variant="inactive" size="sm">Inactive</AppBadge>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: '20px', minHeight: 0, overflow: 'hidden', padding: '0 24px 24px' }}>

        {/* ─── Left column ─────────────────────────────── */}
        <div style={{ flex: 3, minWidth: 0, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Product summary card */}
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Product summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
              <div>
                <span style={{ color: '#64748b' }}>SKU: </span>
                <span style={{ fontWeight: 600 }}>{product.sku || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Category: </span>
                <span style={{ fontWeight: 600 }}>{product.category || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Production Mode: </span>
                <span style={{ fontWeight: 600 }}>
                  {product.productionMode === 'batch' ? `Batch × ${product.batchYield || 1}` : 'Single unit'}
                </span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Status: </span>
                <AppBadge variant={product.isActive ? 'success' : 'inactive'} size="sm">
                  {product.isActive ? 'Active' : 'Inactive'}
                </AppBadge>
              </div>
              {product.description && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: '#64748b' }}>Description: </span>
                  <span>{product.description}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bill of Materials + Cost Breakdown */}
          <div className="app-card" style={{ padding: 0 }}>
            <ProductTabs
              product={product as any}
              productId={product.id}
              displayBom={displayBom}
              bomLoading={bomLoading}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              activityEntries={productActivity}
              activityLoading={productActivityLoading}
              activityViewAllHref="/activity?entityType=product"
            />
          </div>

          {/* Cost breakdown card */}
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Cost breakdown (per unit)</div>
            <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Material Cost</span>
                <span className="money-value" style={{ fontWeight: 600 }}>{baseCurrency} {totalMaterialCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Overhead ({product.overheadPercentage}%)</span>
                <span className="money-value" style={{ fontWeight: 600 }}>{baseCurrency} {overheadCost.toFixed(2)}</span>
              </div>
              {otherDirectCosts > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Other direct costs</span>
                  <span className="money-value" style={{ fontWeight: 600 }}>{baseCurrency} {otherDirectCosts.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ color: '#0F2847', fontWeight: 700 }}>Total Production Cost</span>
                <span className="money-value" style={{ fontWeight: 700, color: '#0F2847' }}>{baseCurrency} {productionCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center' }}>
                  Optimal Markup ({product.profitMargin}%)
                  <OptimalMarkupInfoTooltip />
                </span>
                <span className="money-value" style={{ fontWeight: 600, color: '#16A34A' }}>{baseCurrency} {profitOnCostAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                <span style={{ color: '#16A34A', fontWeight: 700 }}>Optimal Price</span>
                <span className="money-value" style={{ fontWeight: 700, color: '#16A34A', fontSize: '18px' }}>{baseCurrency} {optimalPrice.toFixed(2)}</span>
              </div>
              {grossMarginAtOptimal !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Optimal Gross Margin %
                    <OptimalGrossMarginInfoTooltip />
                  </span>
                  <span style={{ fontWeight: 600 }}>{grossMarginAtOptimal.toFixed(1)}%</span>
                </div>
              )}
              {approvedPrice != null && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ color: '#0F2847', fontWeight: 700 }}>Approved Price</span>
                    <span className="money-value" style={{ fontWeight: 700, color: '#0F2847' }}>{baseCurrency} {approvedPrice.toFixed(2)}</span>
                  </div>
                  {approvedMatchesOptimal ? (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>Matches optimal price</div>
                  ) : (
                    <>
                      {actualMarkupPercent !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                          <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center' }}>
                            Actual Markup %
                            <ActualMarkupInfoTooltip />
                          </span>
                          <span style={{ fontWeight: 600, color: '#16A34A' }}>{actualMarkupPercent.toFixed(1)}%</span>
                        </div>
                      )}
                      {actualGrossMarginPercent !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                          <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center' }}>
                            Actual Gross Margin %
                            <ActualGrossMarginInfoTooltip />
                          </span>
                          <span style={{ fontWeight: 600, color: '#16A34A' }}>{actualGrossMarginPercent.toFixed(1)}%</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right column ─────────────────────────────── */}
        <div style={{ flex: 2, minWidth: 0, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ─── Unified Pricing & Approval card ─── */}
          <div className="app-card" style={{ border: `1px solid ${panelColors.border}`, backgroundColor: panelColors.background }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                fontWeight: 700, fontSize: '15px',
                color: product.approvalStatus === 'approved' ? '#166534'
                     : product.approvalStatus === 'needs_review' ? '#9a3412'
                     : '#0f172a',
              }}>
                {product.approvalStatus === 'approved' && <CheckCircle size={14} strokeWidth={2.2} />}
                {product.approvalStatus === 'needs_review' && <AlertTriangle size={14} strokeWidth={2} />}
                {product.approvalStatus === 'approved'
                  ? 'Price approved'
                  : product.approvalStatus === 'needs_review'
                  ? 'Needs review'
                  : 'Pricing'}
              </div>
              {showReadOnlyApprovedSummary && (
                <AppButton variant="secondary" size="sm" onClick={() => setShowPriceForm(true)}>
                  Update price
                </AppButton>
              )}
            </div>

            {/* Price rows */}
            <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Optimal Price:</span>
                <span className="money-value" style={{ fontWeight: 700 }}>{baseCurrency} {optimalPrice.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Approved base price:</span>
                <span className="money-value" style={{ fontWeight: 700, color: product.priceMismatch ? '#c62828' : undefined }}>
                  {product.currentSellingPrice
                    ? `${baseCurrency} ${Number(product.currentSellingPrice).toFixed(2)}${product.priceMismatch ? ' ⚠' : ''}`
                    : '—'}
                </span>
              </div>
              {showReadOnlyApprovedSummary && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Production cost:</span>
                  <span className="money-value" style={{ fontWeight: 700 }}>{baseCurrency} {productionCost.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Margin section — only when approved and not editing */}
            {showReadOnlyApprovedSummary && (
              <>
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', margin: '10px 0' }} />
                <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
                      Actual Markup %:
                      <ActualMarkupInfoTooltip />
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {product.approvedPrice && productionCost
                        ? (((Number(product.approvedPrice) - productionCost) / productionCost) * 100).toFixed(1)
                        : '—'}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
                      Actual Gross Margin %:
                      <ActualGrossMarginInfoTooltip />
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {product.approvedPrice && productionCost
                        ? (((Number(product.approvedPrice) - productionCost) / Number(product.approvedPrice)) * 100).toFixed(1)
                        : '—'}%
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Approval details */}
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', margin: '10px 0' }} />
            <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Approval Status:</span>
                <AppBadge variant={approvalBadge.variant} size="sm">{approvalBadge.label}</AppBadge>
              </div>
              {product.approvedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Approved on:</span>
                  <span style={{ fontWeight: 600 }}>{formatDate(product.approvedAt)}</span>
                </div>
              )}
              {product.approvedBy && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Approved by:</span>
                  <span style={{ fontWeight: 600 }}>{product.approvedBy}</span>
                </div>
              )}
              {product.approvedPriceExpiresAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Valid until:</span>
                  <span style={{ fontWeight: 600, color: shouldShowExpiry ? expiryColor : '#94a3b8' }}>
                    {formatDate(normalizedExpiryDate || product.approvedPriceExpiresAt)}
                    {shouldShowExpiry && daysUntilExpiry !== null ? ` (${daysUntilExpiry}d)` : ''}
                  </span>
                </div>
              )}
            </div>

            {(product.approvalStatus === 'approved' || product.approvalStatus === 'needs_review') && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleResetToPending}
                  disabled={approvalLoading}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: approvalLoading ? 'not-allowed' : 'pointer',
                    opacity: approvalLoading ? 0.7 : 1,
                  }}
                >
                  Reset to Pending
                </button>
              </div>
            )}
          </div>

          {/* Needs review context */}
          {product.approvalStatus === 'needs_review' && (
            <div className="app-card" style={{ border: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#9a3412', marginBottom: '4px' }}>Costs have changed for this product</div>
              <div style={{ fontSize: '13px', color: '#9a3412', marginBottom: '8px' }}>Review below and choose how to update the approved price.</div>
              <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>Current production cost:</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>{baseCurrency} {productionCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>New optimal price:</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>{baseCurrency} {optimalPrice.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>Approved price (unchanged):</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>
                    {product.approvedPrice != null ? `${baseCurrency} ${Number(product.approvedPrice).toFixed(2)}` : '—'}
                  </span>
                </div>
                {product.approvedPrice != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7c2d12' }}>Optimal price change:</span>
                    <span className="money-value" style={{ fontWeight: 700, color: optimalPrice - Number(product.approvedPrice) < 0 ? '#b91c1c' : '#166534' }}>
                      {optimalPrice - Number(product.approvedPrice) >= 0 ? '+' : '-'}{baseCurrency} {Math.abs(optimalPrice - Number(product.approvedPrice)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {showApprovalForm && product.approvalStatus === 'needs_review' && (
            <div className="app-card" style={{ border: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#9a3412', fontWeight: 600 }}>
                <AlertTriangle size={12} strokeWidth={2} />
                This product's cost has changed since the last approval. Review and approve a new price below.
              </div>
            </div>
          )}

          {showApprovalForm && product.approvalStatus === 'pending' && (
            <div className="app-card" style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '14px', color: '#475569', fontWeight: 600 }}>
                This product has not been priced yet. Set and approve a base price below.
              </div>
            </div>
          )}

          {showApprovalForm && (
            <div className="app-card" style={{ border: `1px solid ${panelColors.border}`, backgroundColor: panelColors.background }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Price approval</div>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                Approve a price to include this product in official price lists.
              </div>

              {product.approvalStatus === 'needs_review' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#9a3412', fontWeight: 600, marginBottom: '12px' }}>
                  <AlertTriangle size={12} strokeWidth={2} />
                  Costs changed. Approved base price may be outdated.
                </div>
              )}

              <div style={{ display: 'grid', gap: '10px' }}>
                {/* Approve optimal */}
                <button
                  type="button"
                  onClick={handleApproveOptimal}
                  disabled={approvalLoading}
                  className="btn btn-success"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: approvalLoading ? 0.7 : 1,
                    cursor: approvalLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <CheckCircle size={14} strokeWidth={2.2} />
                  Approve Optimal Price ({baseCurrency} {optimalPrice.toFixed(2)})
                </button>

                {/* Keep current price — needs_review with approved price, or any product with a selling price */}
                {((product.approvalStatus === 'needs_review' && product.approvedPrice != null)
                  || (product.currentSellingPrice != null && toNum(product.currentSellingPrice) > 0)) && (() => {
                  const hasApprovedPrice = product.approvedPrice != null && toNum(product.approvedPrice) > 0;
                  const keepPrice = hasApprovedPrice
                    ? toNum(product.approvedPrice)
                    : toNum(product.currentSellingPrice);
                  const keepLabel = hasApprovedPrice
                    ? `Keep approved price (${baseCurrency} ${keepPrice.toFixed(2)})`
                    : `Keep selling price (${baseCurrency} ${keepPrice.toFixed(2)})`;
                  const keepMargin = keepPrice > 0 && productionCost > 0 ? ((keepPrice - productionCost) / keepPrice) * 100 : null;
                  const belowCost = keepPrice > 0 && productionCost > 0 && keepPrice < productionCost;
                  const marginColor = keepMargin === null ? '#64748b' : keepMargin < 0 ? '#dc2626' : keepMargin < 15 ? '#e65100' : '#16a34a';
                  return (
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={handleKeepCurrentPrice}
                        disabled={approvalLoading || belowCost}
                        title={belowCost ? 'Cannot keep: price is now below production cost' : undefined}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: 'white',
                          color: belowCost ? '#94a3b8' : '#334155',
                          fontWeight: 600,
                          cursor: (approvalLoading || belowCost) ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: (approvalLoading || belowCost) ? 0.6 : 1,
                        }}
                      >
                        <Check size={13} strokeWidth={2.2} />
                        {keepLabel}
                      </button>
                      {belowCost ? (
                        <div style={{ fontSize: '13px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={11} />
                          Cannot keep: price is now below production cost
                        </div>
                      ) : keepMargin !== null ? (
                        <div style={{ fontSize: '13px', color: marginColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {keepMargin < 15 && <AlertTriangle size={11} />}
                          New margin at this price: {keepMargin.toFixed(1)}%
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Custom price */}
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Custom Price ({baseCurrency})</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      value={approvalCustomPrice}
                      onChange={(e) => setApprovalCustomPrice(e.target.value)}
                      placeholder={optimalPrice.toFixed(2)}
                      style={{ width: '120px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                    />
                    <button
                      type="button"
                      onClick={handleApproveCustom}
                      disabled={approvalLoading}
                      className="btn btn-success btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        opacity: approvalLoading ? 0.7 : 1,
                        cursor: approvalLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <CheckCircle size={12} strokeWidth={2.2} />
                      Approve Custom
                    </button>
                  </div>
                </div>

                {/* Reason */}
                <div style={{ display: 'grid', gap: '4px' }}>
                  <label style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Reason (optional)</label>
                  <input
                    type="text"
                    value={approvalReason}
                    onChange={(e) => setApprovalReason(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Price valid until */}
                <div style={{ display: 'grid', gap: '4px' }}>
                  <label style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Price valid until (optional)</label>
                  <input
                    type="date"
                    min={getTomorrowDateInputValue()}
                    value={approvalExpiryDate}
                    onChange={(e) => setApprovalExpiryDate(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    If set, this product will be flagged for review on this date.
                  </div>
                </div>

                {showPriceForm && !needsPriceAction && (
                  <button
                    type="button"
                    onClick={() => setShowPriceForm(false)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '14px',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {staleCustomPrices.length > 0 && !staleAlertDismissed && (
            <div className="app-card" style={{ position: 'relative', border: '1px solid #ffcc80', backgroundColor: '#fff3e0', padding: '14px 44px 14px 16px' }}>
              <button className="btn-close-x" type="button" onClick={() => setStaleAlertDismissed(true)} aria-label="Dismiss">
                &times;
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0 }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#bf360c' }}>Custom prices may need review</span>
              </div>
              <div style={{ fontSize: '14px', color: '#78350f', marginBottom: '10px' }}>
                {staleCustomPrices.length} price level{staleCustomPrices.length === 1 ? '' : 's'} have custom prices for this product that were set before this approval. Review them to make sure they are still appropriate.
              </div>
              <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
                {staleCustomPrices.map((sc) => (
                  <div key={sc.priceLevelId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#7c2d12', padding: '4px 0', borderBottom: '1px solid #ffcc80' }}>
                    <span style={{ fontWeight: 600 }}>{sc.priceLevelName}</span>
                    <span>Custom: {baseCurrency} {sc.customPrice.toFixed(2)} → New base: {baseCurrency} {sc.newApprovedBasePrice.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setStaleAlertDismissed(true); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #ffcc80', backgroundColor: 'transparent', color: '#bf360c', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
              </div>
            </div>
          )}


        </div>
      </div>

      {/* Edit Drawer */}
      <ProductFormDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        product={product as any}
        materials={materials}
        categoryOptions={product.category ? [product.category] : []}
        defaultOverhead={String(product.overheadPercentage)}
        defaultProfitMargin={String(product.profitMargin ?? 0)}
        onSaved={async () => {
          setShowDrawer(false);
          await loadData();
        }}
      />
    </div>
  );
}
