import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Pencil, Eye, EyeOff, X } from 'lucide-react';
import { productsApi, materialsApi, activityLogApi, type ActivityEntry } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import ProductTabs from '../components/ProductTabs';
import ProductFormDrawer from '../components/ProductFormDrawer';
import useAppToast from '../hooks/useAppToast';
import AppToast from '../components/AppToast';

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
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
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
  if (status === 'rejected') return { label: 'Rejected', variant: 'rejected' as const };
  if (status === 'needs_review') return { label: 'Needs Review', variant: 'needs-review' as const };
  return { label: 'Pending', variant: 'pending' as const };
}

function getApprovalPanelColors(status?: Product['approvalStatus']) {
  if (status === 'approved') return { background: '#f0fdf4', border: '#bbf7d0' };
  if (status === 'rejected') return { background: '#fef2f2', border: '#fecaca' };
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
    if (!product || product.approvedPrice == null) return;
    const keepPrice = toNum(product.approvedPrice);
    setApprovalLoading(true);
    try {
      const result = await productsApi.approve(productId, { approvedPrice: keepPrice });
      showToastMessage(`Kept current price: GHS ${keepPrice.toFixed(2)}`, 'success');
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
      showToastMessage(`Price approved: GHS ${toNum(product.optimalPrice).toFixed(2)}`, 'success');
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
    const confirmText = `Approve custom price GHS ${customPrice.toFixed(2)}? This differs from optimal price GHS ${optimalPrice.toFixed(2)}.`;
    if (!confirm(confirmText)) return;

    const expiryDate = approvalExpiryDate.trim() || null;
    setApprovalLoading(true);
    try {
      const result = await productsApi.approve(productId, {
        approvedPrice: customPrice,
        reason: approvalReason || undefined,
        priceExpiryDate: expiryDate,
      });
      showToastMessage(`Custom price approved: GHS ${customPrice.toFixed(2)}`, 'success');
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

  async function handleReject() {
    if (!product) return;
    const confirmText = `Reject price for ${product.name}? Product will be excluded from price lists.`;
    if (!confirm(confirmText)) return;

    setApprovalLoading(true);
    try {
      await productsApi.reject(productId, { reason: approvalReason || undefined });
      showToastMessage('Price rejected. Product excluded from price lists.', 'success');
      await loadData();
    } catch (err: any) {
      showToastMessage(err?.message || 'Failed to reject price', 'error');
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
  const displayBom = getDisplayBOM(bom, product);

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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
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
              fontSize: '12px',
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

          <div style={{ fontSize: '12px', color: '#888', fontWeight: 400 }}>
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
              fontSize: '12px',
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
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '20px', alignItems: 'start', padding: '0 24px 24px' }}>

        {/* ─── Left column ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* Product summary card */}
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>Product summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
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
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>Cost parameters</div>
            <div style={{ display: 'grid', gap: '6px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Production cost (calc):</span>
                <span className="money-value" style={{ fontWeight: 700 }}>GHS {productionCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Overhead:</span>
                <span style={{ fontWeight: 600 }}>{product.overheadPercentage}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Target profit margin:</span>
                <span style={{ fontWeight: 600 }}>{product.profitMargin}%</span>
              </div>
              {(product.otherDirectCosts ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Other direct costs:</span>
                  <span className="money-value" style={{ fontWeight: 600 }}>GHS {toNum(product.otherDirectCosts).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '4px' }}>
                <span style={{ color: '#475569', fontWeight: 700 }}>Optimal price:</span>
                <span className="money-value" style={{ fontWeight: 700, color: '#16a34a' }}>GHS {optimalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right column ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* Pricing card */}
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>Pricing</div>
            <div style={{ display: 'grid', gap: '6px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Optimal Price:</span>
                <span className="money-value" style={{ fontWeight: 700 }}>GHS {optimalPrice.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Approved base price:</span>
                <span className="money-value" style={{ fontWeight: 700, color: product.priceMismatch ? '#c62828' : undefined }}>
                  {product.currentSellingPrice ? `GHS ${Number(product.currentSellingPrice).toFixed(2)}${product.priceMismatch ? ' ⚠' : ''}` : '—'}
                </span>
              </div>
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
              {shouldShowExpiry && normalizedExpiryDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Price expires:</span>
                  <span style={{ fontWeight: 600, color: expiryColor }}>
                    {formatDate(normalizedExpiryDate)} ({daysUntilExpiry}d)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Needs review context */}
          {product.approvalStatus === 'needs_review' && (
            <div className="app-card" style={{ border: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', marginBottom: '4px' }}>Costs have changed for this product</div>
              <div style={{ fontSize: '11px', color: '#9a3412', marginBottom: '8px' }}>Review below and choose how to update the approved price.</div>
              <div style={{ display: 'grid', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>Current production cost:</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>GHS {productionCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>New optimal price:</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>GHS {optimalPrice.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7c2d12' }}>Approved price (unchanged):</span>
                  <span className="money-value" style={{ fontWeight: 700, color: '#7c2d12' }}>
                    {product.approvedPrice != null ? `GHS ${Number(product.approvedPrice).toFixed(2)}` : '—'}
                  </span>
                </div>
                {product.approvedPrice != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7c2d12' }}>Optimal price change:</span>
                    <span className="money-value" style={{ fontWeight: 700, color: optimalPrice - Number(product.approvedPrice) < 0 ? '#b91c1c' : '#166534' }}>
                      {optimalPrice - Number(product.approvedPrice) >= 0 ? '+' : '-'}GHS {Math.abs(optimalPrice - Number(product.approvedPrice)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Price approval card */}
          <div className="app-card" style={{ border: `1px solid ${panelColors.border}`, backgroundColor: panelColors.background }}>
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>Price approval</div>
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '12px' }}>
              Approve a price to include this product in official price lists.
            </div>

            {product.approvalStatus === 'needs_review' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9a3412', fontWeight: 600, marginBottom: '12px' }}>
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
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  fontWeight: 700,
                  cursor: approvalLoading ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: approvalLoading ? 0.7 : 1,
                }}
              >
                <Check size={13} strokeWidth={2.2} />
                Approve Optimal Price (GHS {optimalPrice.toFixed(2)})
              </button>

              {/* Keep current price — shown only for needs_review when there is an existing approved price */}
              {product.approvalStatus === 'needs_review' && product.approvedPrice != null && (() => {
                const keepPrice = toNum(product.approvedPrice);
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
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (approvalLoading || belowCost) ? 0.6 : 1,
                      }}
                    >
                      <Check size={13} strokeWidth={2.2} />
                      Keep current price (GHS {keepPrice.toFixed(2)})
                    </button>
                    {belowCost ? (
                      <div style={{ fontSize: '11px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={11} />
                        Cannot keep: price is now below production cost
                      </div>
                    ) : keepMargin !== null ? (
                      <div style={{ fontSize: '11px', color: marginColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {keepMargin < 15 && <AlertTriangle size={11} />}
                        New margin at this price: {keepMargin.toFixed(1)}%
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Custom price */}
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Custom Price (GHS)</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    value={approvalCustomPrice}
                    onChange={(e) => setApprovalCustomPrice(e.target.value)}
                    placeholder={optimalPrice.toFixed(2)}
                    style={{ width: '120px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    onClick={handleApproveCustom}
                    disabled={approvalLoading}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: approvalLoading ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      opacity: approvalLoading ? 0.7 : 1,
                    }}
                  >
                    <Check size={12} strokeWidth={2.2} />
                    Approve Custom
                  </button>
                </div>
              </div>

              {/* Reason */}
              <div style={{ display: 'grid', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Reason (optional)</label>
                <input
                  type="text"
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Price valid until */}
              <div style={{ display: 'grid', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Price valid until (optional)</label>
                <input
                  type="date"
                  min={getTomorrowDateInputValue()}
                  value={approvalExpiryDate}
                  onChange={(e) => setApprovalExpiryDate(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  If set, this product will be flagged for review on this date.
                </div>
              </div>

              {/* Reject */}
              <button
                type="button"
                onClick={handleReject}
                disabled={approvalLoading}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  fontWeight: 700,
                  cursor: approvalLoading ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  alignSelf: 'flex-start',
                  opacity: approvalLoading ? 0.7 : 1,
                }}
              >
                <X size={12} strokeWidth={2.2} />
                Reject
              </button>
            </div>
          </div>

          {staleCustomPrices.length > 0 && !staleAlertDismissed && (
            <div className="app-card" style={{ border: '1px solid #ffcc80', backgroundColor: '#fff3e0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#bf360c' }}>Custom prices may need review</span>
                </div>
                <button type="button" onClick={() => setStaleAlertDismissed(true)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#e65100', padding: 0 }} title="Dismiss"><X size={13} /></button>
              </div>
              <div style={{ fontSize: '12px', color: '#78350f', marginBottom: '10px' }}>
                {staleCustomPrices.length} price level{staleCustomPrices.length === 1 ? '' : 's'} have custom prices for this product that were set before this approval. Review them to make sure they are still appropriate.
              </div>
              <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
                {staleCustomPrices.map((sc) => (
                  <div key={sc.priceLevelId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#7c2d12', padding: '4px 0', borderBottom: '1px solid #ffcc80' }}>
                    <span style={{ fontWeight: 600 }}>{sc.priceLevelName}</span>
                    <span>Custom: GHS {sc.customPrice.toFixed(2)} → New base: GHS {sc.newApprovedBasePrice.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setStaleAlertDismissed(true); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #ffcc80', backgroundColor: 'transparent', color: '#bf360c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
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
        onSaved={async () => {
          setShowDrawer(false);
          await loadData();
        }}
      />
    </div>
  );
}
