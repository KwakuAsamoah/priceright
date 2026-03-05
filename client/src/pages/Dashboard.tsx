import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import {
  customersApi,
  exchangeRatesApi,
  materialsApi,
  priceListsApi,
  productsApi,
  settingsApi,
} from '../api';

type ProductApprovalStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';
type SpecialStatus = 'pending' | 'approved' | 'rejected';
type BannerTone = 'success' | 'error';

interface Product {
  id: number;
  name: string;
  category?: string | null;
  approvalStatus?: ProductApprovalStatus | null;
  approvedPrice?: number | null;
  currentSellingPrice?: number | null;
  profitMargin?: number | null;
  profit_margin?: number | null;
  approvedAt?: string | number | null;
  updatedAt?: string | number | null;
}

interface Material {
  id: number;
  purchaseCurrencyId?: number | null;
  purchaseCurrencyCode?: string | null;
  purchaseCurrencySymbol?: string | null;
}

interface Customer {
  id: number;
  name: string;
  allowSpecialPricing: boolean;
}

interface PriceList {
  id: number;
  status: 'draft' | 'active' | 'expired' | 'archived';
}

interface ExchangeRate {
  id: number;
  currencyId: number;
  rateToBase: number | string;
  effectiveDate?: string | number | null;
  updatedAt?: string | number | null;
}

interface SpecialPricingRow {
  id: number;
  customerId: number;
  customerName: string;
  productId: number;
  productName: string;
  customPrice: number;
  productionCost?: number | null;
  marginImpactPercentage?: number | null;
  status: SpecialStatus;
  approvedAt?: string | number | null;
  createdAt?: string | number | null;
}

interface BannerState {
  tone: BannerTone;
  message: string;
}

interface ActivityItem {
  id: string;
  type: 'approved' | 'review' | 'special' | 'exchange';
  text: string;
  timestamp: Date;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function currency(value: number): string {
  return `GHS ${value.toFixed(2)}`;
}

function getProductStatus(product: Product): ProductApprovalStatus {
  const status = product.approvalStatus;
  if (status === 'approved' || status === 'rejected' || status === 'needs_review') return status;
  return 'pending';
}

function formatNow(date: Date): string {
  const dayPart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${dayPart} · ${timePart}`;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [specialPricingRows, setSpecialPricingRows] = useState<SpecialPricingRow[]>([]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [now, setNow] = useState(new Date());
  const [baseCurrencyCode, setBaseCurrencyCode] = useState('GHS');
  const [companyName, setCompanyName] = useState('');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      setError('');

      const [productsData, materialsData, customersData, priceListsData, exchangeRatesData, settingsData] = await Promise.all([
        productsApi.getAll() as Promise<Product[]>,
        materialsApi.getAll() as Promise<Material[]>,
        customersApi.getAll() as Promise<Customer[]>,
        priceListsApi.getAll() as Promise<PriceList[]>,
        exchangeRatesApi.getAll() as Promise<ExchangeRate[]>,
        settingsApi.getAll() as Promise<Array<{ settingKey: string; settingValue: string }>>,
      ]);

      const baseSetting = (settingsData || []).find((entry) => entry.settingKey === 'baseCurrency');
      setBaseCurrencyCode(baseSetting?.settingValue || 'GHS');
      const companyNameSetting = (settingsData || []).find((entry) => entry.settingKey === 'companyName');
      const companyLogoSetting = (settingsData || []).find((entry) => entry.settingKey === 'companyLogoDataUrl');
      setCompanyName(companyNameSetting?.settingValue || '');
      setCompanyLogoDataUrl(companyLogoSetting?.settingValue || '');

      const specialPricingNested = await Promise.all(
        (customersData || []).map(async (customer) => {
          try {
            const rows = await customersApi.getCustomPrices(customer.id);
            const typedRows = Array.isArray(rows) ? rows : [];
            return typedRows.map((row) => ({
              ...row,
              customerId: customer.id,
              customerName: customer.name,
            })) as SpecialPricingRow[];
          } catch {
            return [] as SpecialPricingRow[];
          }
        }),
      );

      const allSpecialRows = specialPricingNested.flat();

      setProducts(productsData || []);
      setMaterials(materialsData || []);
      setCustomers(customersData || []);
      setPriceLists(priceListsData || []);
      setExchangeRates(exchangeRatesData || []);
      setSpecialPricingRows(allSpecialRows);
    } catch (fetchError) {
      setError('Could not load dashboard data. Please refresh the page.');
      console.error(fetchError);
    } finally {
      setLoading(false);
    }
  }

  const productCounts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let needsReview = 0;
    let rejected = 0;

    products.forEach((product) => {
      const status = getProductStatus(product);
      if (status === 'approved') approved += 1;
      else if (status === 'needs_review') needsReview += 1;
      else if (status === 'rejected') rejected += 1;
      else pending += 1;
    });

    return {
      total: products.length,
      approved,
      pending,
      needsReview,
      rejected,
    };
  }, [products]);

  const specialPending = useMemo(
    () => specialPricingRows.filter((row) => row.status === 'pending'),
    [specialPricingRows],
  );

  const lowMarginProducts = useMemo(() => {
    return products.filter((product) => {
      if (getProductStatus(product) !== 'approved') return false;
      const margin = toNumber(product.profitMargin ?? product.profit_margin);
      return margin < 15;
    });
  }, [products]);

  const averageApprovedMargin = useMemo(() => {
    const approved = products.filter((product) => getProductStatus(product) === 'approved');
    if (approved.length === 0) return 0;
    const sum = approved.reduce((acc, product) => acc + toNumber(product.profitMargin ?? product.profit_margin), 0);
    return sum / approved.length;
  }, [products]);

  const customerSpecialEnabledCount = useMemo(
    () => customers.filter((customer) => customer.allowSpecialPricing).length,
    [customers],
  );

  const materialCounts = useMemo(() => {
    const byCode: Record<string, number> = {};
    let baseCount = 0;

    materials.forEach((material) => {
      const code = (material.purchaseCurrencyCode || '').trim().toUpperCase();
      if (!code || code === baseCurrencyCode.toUpperCase()) {
        baseCount += 1;
        return;
      }

      byCode[code] = (byCode[code] || 0) + 1;
    });

    const foreignSummary = Object.entries(byCode)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => `${code}: ${count}`)
      .join(' · ');

    return {
      total: materials.length,
      baseCount,
      foreignSummary: foreignSummary || 'No foreign currency purchases',
      foreignByCode: byCode,
    };
  }, [materials, baseCurrencyCode]);

  const lowMarginTopTen = useMemo(() => {
    return [...lowMarginProducts]
      .map((product) => ({
        product,
        margin: toNumber(product.profitMargin ?? product.profit_margin),
      }))
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 10);
  }, [lowMarginProducts]);

  const currencyExposureData = useMemo(() => {
    const colors = ['#2563eb', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6'];
    const segments = [
      { label: `${baseCurrencyCode} (Base)`, value: materialCounts.baseCount, color: '#16a34a' },
      ...Object.entries(materialCounts.foreignByCode)
        .sort((a, b) => b[1] - a[1])
        .map(([code, value], index) => ({ label: code, value, color: colors[index % colors.length] })),
    ].filter((entry) => entry.value > 0);

    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return { segments, total };
  }, [materialCounts, baseCurrencyCode]);

  const priceListCounts = useMemo(() => {
    let active = 0;
    let draft = 0;
    let expired = 0;

    priceLists.forEach((list) => {
      if (list.status === 'active') active += 1;
      if (list.status === 'draft') draft += 1;
      if (list.status === 'expired') expired += 1;
    });

    return { active, draft, expired };
  }, [priceLists]);

  const priceListChartData = useMemo(() => {
    return [
      { key: 'active', label: 'Active', value: priceListCounts.active, color: '#16a34a' },
      { key: 'draft', label: 'Draft', value: priceListCounts.draft, color: '#2563eb' },
      { key: 'expired', label: 'Expired', value: priceListCounts.expired, color: '#f59e0b' },
    ];
  }, [priceListCounts]);

  const currencyLookup = useMemo(() => {
    const map: Record<number, { code: string; symbol: string }> = {};
    materials.forEach((material) => {
      const currencyId = toNumber(material.purchaseCurrencyId);
      if (!currencyId) return;
      if (!map[currencyId]) {
        map[currencyId] = {
          code: material.purchaseCurrencyCode || `CUR-${currencyId}`,
          symbol: material.purchaseCurrencySymbol || '',
        };
      }
    });
    return map;
  }, [materials]);

  const sortedRates = useMemo(() => {
    return [...exchangeRates].sort((a, b) => {
      const firstDate = parseDate(a.effectiveDate ?? a.updatedAt);
      const secondDate = parseDate(b.effectiveDate ?? b.updatedAt);
      return (secondDate?.getTime() || 0) - (firstDate?.getTime() || 0);
    });
  }, [exchangeRates]);

  const staleRateSummary = useMemo(() => {
    if (sortedRates.length === 0) {
      return {
        staleCount: 0,
        oldestAgeDays: 0,
        latestLabel: 'No exchange rates configured',
      };
    }

    const nowMs = Date.now();
    let staleCount = 0;
    let oldestAgeDays = 0;

    sortedRates.forEach((rate) => {
      const updatedAt = parseDate(rate.effectiveDate ?? rate.updatedAt);
      if (!updatedAt) return;
      const ageDays = Math.floor((nowMs - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays >= 7) staleCount += 1;
      if (ageDays > oldestAgeDays) oldestAgeDays = ageDays;
    });

    const latestUpdatedAt = parseDate(sortedRates[0]?.effectiveDate ?? sortedRates[0]?.updatedAt);
    const latestLabel = latestUpdatedAt
      ? `Latest update: ${latestUpdatedAt.toLocaleDateString()}`
      : 'Latest update unavailable';

    return { staleCount, oldestAgeDays, latestLabel };
  }, [sortedRates]);

  const activityItems = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events: ActivityItem[] = [];

    products.forEach((product) => {
      const approvedAt = parseDate(product.approvedAt ?? null);
      if (approvedAt && approvedAt.getTime() >= sevenDaysAgo && getProductStatus(product) === 'approved') {
        events.push({
          id: `product-approved-${product.id}-${approvedAt.getTime()}`,
          type: 'approved',
          text: `Product ${product.name} approved at ${currency(product.approvedPrice ?? 0)}`,
          timestamp: approvedAt,
        });
      }

      const updatedAt = parseDate(product.updatedAt ?? null);
      if (updatedAt && updatedAt.getTime() >= sevenDaysAgo && getProductStatus(product) === 'needs_review') {
        events.push({
          id: `product-review-${product.id}-${updatedAt.getTime()}`,
          type: 'review',
          text: `Product ${product.name} flagged for review`,
          timestamp: updatedAt,
        });
      }
    });

    specialPricingRows.forEach((entry) => {
      const approvedAt = parseDate(entry.approvedAt ?? null);
      if (approvedAt && approvedAt.getTime() >= sevenDaysAgo && entry.status === 'approved') {
        events.push({
          id: `special-approved-${entry.id}-${approvedAt.getTime()}`,
          type: 'special',
          text: `Special price approved for ${entry.customerName} on ${entry.productName}`,
          timestamp: approvedAt,
        });
      }

      const createdAt = parseDate(entry.createdAt ?? null);
      if (createdAt && createdAt.getTime() >= sevenDaysAgo && entry.status === 'pending') {
        events.push({
          id: `special-pending-${entry.id}-${createdAt.getTime()}`,
          type: 'special',
          text: `New special pricing request for ${entry.customerName}`,
          timestamp: createdAt,
        });
      }
    });

    exchangeRates.forEach((rate) => {
      const changedAt = parseDate(rate.effectiveDate ?? rate.updatedAt ?? null);
      if (!changedAt || changedAt.getTime() < sevenDaysAgo) return;
      const currencyMeta = currencyLookup[rate.currencyId];
      const code = currencyMeta?.code || `CUR-${rate.currencyId}`;
      events.push({
        id: `exchange-${rate.id}-${changedAt.getTime()}`,
        type: 'exchange',
        text: `Exchange rate updated: ${code} → ${toNumber(rate.rateToBase).toFixed(2)} GHS`,
        timestamp: changedAt,
      });
    });

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }, [products, specialPricingRows, exchangeRates, currencyLookup]);

  const isNewInstallation =
    products.length === 0
    && materials.length === 0
    && customers.length === 0
    && priceLists.length === 0
    && exchangeRates.length === 0
    && specialPricingRows.length === 0;

  const skeletonCards = (
    <div className="dashboard-stat-grid">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={`skeleton-card-${index}`} className="app-card dashboard-skeleton-block" style={{ height: '120px' }} />
      ))}
    </div>
  );

  const skeletonWidgets = (
    <div className="dashboard-widget-grid" style={{ marginTop: '20px' }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`widget-skeleton-${idx}`} className="app-card" style={{ padding: '20px' }}>
          {Array.from({ length: idx % 2 === 0 ? 8 : 4 }).map((__, lineIdx) => (
            <div key={`widget-skeleton-line-${idx}-${lineIdx}`} className="dashboard-skeleton-line" />
          ))}
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <div className="app-header-row" style={{ alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {companyLogoDataUrl ? (
                <img
                  src={companyLogoDataUrl}
                  alt="Company logo"
                  style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(226, 232, 240, 0.8)' }}
                />
              ) : (
                <LayoutDashboard size={20} color="#f8fafc" />
              )}
              <div>
                {companyName && <div className="app-page-subtitle" style={{ fontSize: '12px' }}>{companyName}</div>}
                <h1 className="app-page-title" style={{ fontSize: '22px', fontWeight: 700 }}>Dashboard</h1>
                <p className="app-page-subtitle" style={{ fontSize: '13px' }}>Pricing health overview</p>
              </div>
            </div>
            <div className="app-page-subtitle" style={{ fontSize: '13px' }}>{formatNow(now)}</div>
          </div>
        </div>

        <div className="app-page-content" style={{ gap: '20px' }}>
          {skeletonCards}
          {skeletonWidgets}
        </div>

        <style>{`
          .dashboard-skeleton-block {
            border-radius: 10px;
            background: #e2e8f0;
            animation: dashboardPulse 1.2s ease-in-out infinite;
          }
          .dashboard-skeleton-line {
            height: 12px;
            border-radius: 6px;
            background: #e2e8f0;
            margin-bottom: 10px;
            animation: dashboardPulse 1.2s ease-in-out infinite;
          }
          @keyframes dashboardPulse {
            0% { opacity: 0.55; }
            50% { opacity: 1; }
            100% { opacity: 0.55; }
          }
          .dashboard-stat-grid {
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 16px;
          }
          .dashboard-widget-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 20px;
          }
          @media (max-width: 1200px) {
            .dashboard-widget-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          }
          @media (max-width: 1200px) {
            .dashboard-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          }
          @media (max-width: 860px) {
            .dashboard-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .dashboard-widget-grid { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-page">
        <div className="app-page-content" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="app-card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center', padding: '24px' }}>
            <AlertTriangle size={24} color="#dc2626" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{error}</div>
            <button className="btn btn-secondary" onClick={loadDashboardData}>
              <RefreshCw size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div className="app-header-row" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            {companyLogoDataUrl ? (
              <img
                src={companyLogoDataUrl}
                alt="Company logo"
                style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(226, 232, 240, 0.8)' }}
              />
            ) : (
              <LayoutDashboard size={20} color="#f8fafc" />
            )}
            <div>
              {companyName && <div className="app-page-subtitle" style={{ fontSize: '12px' }}>{companyName}</div>}
              <h1 className="app-page-title" style={{ fontSize: '22px', fontWeight: 700 }}>Dashboard</h1>
              <p className="app-page-subtitle" style={{ fontSize: '13px' }}>Pricing health overview</p>
            </div>
          </div>
          <div className="app-page-subtitle" style={{ fontSize: '13px' }}>{formatNow(now)}</div>
        </div>
      </div>

      <div className="app-page-content" style={{ gap: '20px' }}>
        {banner && (
          <div
            className="app-card"
            style={{
              padding: '12px 14px',
              borderColor: banner.tone === 'success' ? '#bbf7d0' : '#fecaca',
              backgroundColor: banner.tone === 'success' ? '#f0fdf4' : '#fef2f2',
              color: banner.tone === 'success' ? '#166534' : '#991b1b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{banner.message}</span>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {isNewInstallation && (
          <div
            className="app-card"
            style={{
              padding: '16px 20px',
              borderColor: '#dbeafe',
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '14px', color: '#1e3a8a' }}>
              <strong>Welcome to PriceRight.</strong> Start by adding your materials and products.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sem-rates" onClick={() => navigate('/materials')}>
                <Plus size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Add Material
              </button>
              <button className="btn btn-secondary btn-sem-products" onClick={() => navigate('/products')}>
                <Plus size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Add Product
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-stat-grid">
          <div className="app-card dashboard-stat-card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><Package size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Total Raw Materials</div>
            <div className="dashboard-stat-value">{materialCounts.total}</div>
            <div className="dashboard-stat-hint">Inventory currency mix overview</div>
            <div className="dashboard-stat-sub">{materialCounts.foreignSummary}</div>
            <div className="dashboard-stat-sub" style={{ marginTop: '4px' }}>{materialCounts.baseCount} purchased at {baseCurrencyCode} base rate</div>
          </div>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/products')} title="Open Products">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><Package size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Total Products</div>
            <div className="dashboard-stat-value">{productCounts.total}</div>
            <div className="dashboard-stat-hint">Click to open all products</div>
            <div className="dashboard-stat-sub">{productCounts.approved} approved · {productCounts.pending} pending · {productCounts.needsReview} needs review</div>
          </button>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/products?approval=rejected')} title="Open rejected products">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><XCircle size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Rejected Products</div>
            <div className="dashboard-stat-value">{productCounts.rejected}</div>
            <div className="dashboard-stat-hint">Click to reprice and re-approve</div>
            <div className="dashboard-stat-sub">Require repricing and re-approval</div>
          </button>

          <div className="app-card dashboard-stat-card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><TrendingUp size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Average Margin</div>
            <div
              className="dashboard-stat-value"
              style={{ color: averageApprovedMargin < 15 ? '#e65100' : '#2e7d32' }}
            >
              {averageApprovedMargin.toFixed(1)}%
            </div>
            <div className="dashboard-stat-hint">Target healthy margin ≥ 15%</div>
            <div className="dashboard-stat-sub">Across approved products</div>
          </div>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/customers')} title="Open customers">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><Users size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Active Customers</div>
            <div className="dashboard-stat-value">{customers.length}</div>
            <div className="dashboard-stat-hint">Click to manage customer pricing access</div>
            <div className="dashboard-stat-sub">{customerSpecialEnabledCount} with special pricing enabled</div>
          </button>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/price-lists')} title="Open price lists">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box"><FileText size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Active Price Lists</div>
            <div className="dashboard-stat-value">{priceListCounts.active}</div>
            <div className="dashboard-stat-hint">Click to create or update lists</div>
            <div className="dashboard-stat-sub">{priceListCounts.draft} draft · {priceListCounts.expired} expired</div>
          </button>

          <div className="app-card dashboard-quick-card">
            <div className="dashboard-quick-actions">
              <div className="dashboard-quick-actions-head">
                <div className="dashboard-quick-actions-title">Quick Actions</div>
                <div className="dashboard-quick-actions-sub">Most-used shortcuts for daily pricing operations</div>
              </div>
              <div className="dashboard-quick-actions-buttons">
                <button className="btn btn-secondary quick-action-products btn-sem-products" onClick={() => navigate('/products')}>
                  <Plus size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Add Product
                </button>
                <button className="btn btn-secondary quick-action-pricelist btn-sem-pricelist" onClick={() => navigate('/price-lists')}>
                  <FileText size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Generate Price List
                </button>
                <button className="btn btn-secondary quick-action-approvals btn-sem-approvals" onClick={() => navigate('/products?approval=pending')}>
                  <ShieldCheck size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Review Approvals
                </button>
                <button className="btn btn-secondary quick-action-rates btn-sem-rates" onClick={() => navigate('/settings')}>
                  <RefreshCw size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Update Exchange Rates
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-chart-grid">
          <div className="app-card dashboard-chart-card" style={{ padding: '18px' }}>
            <div className="dashboard-widget-head">
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Low-Margin Top 10</h3>
            </div>
            <p className="dashboard-help-text">Products with the weakest margins first. Click a row to open low-margin product view.</p>
            {lowMarginTopTen.length === 0 ? (
              <div className="dashboard-empty">No low-margin products</div>
            ) : (
              <div style={{ display: 'grid', gap: '7px' }}>
                {lowMarginTopTen.map(({ product, margin }) => {
                  const widthPercent = Math.max(8, Math.min(100, (margin / 15) * 100));
                  return (
                    <button
                      key={`low-margin-chart-${product.id}`}
                      onClick={() => navigate('/products?lowMargin=1')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px', gap: '8px' }}>
                        <span className="dashboard-chart-label" style={{ color: '#475569' }}>{product.name}</span>
                        <span style={{ color: '#e65100', fontWeight: 700 }}>{margin.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#fee2e2' }}>
                        <div style={{ width: `${widthPercent}%`, height: '8px', borderRadius: '999px', backgroundColor: '#f59e0b' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="app-card dashboard-chart-card" style={{ padding: '18px' }}>
            <div className="dashboard-widget-head">
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Currency Exposure</h3>
            </div>
            <p className="dashboard-help-text">Shows how many materials are purchased in each currency. Click legend items to open Materials.</p>
            {currencyExposureData.total === 0 ? (
              <div className="dashboard-empty">No material currency exposure yet</div>
            ) : (
              <div className="dashboard-donut-wrap" style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px', alignItems: 'center' }}>
                <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Currency exposure donut">
                  {(() => {
                    const radius = 42;
                    const circumference = 2 * Math.PI * radius;
                    let offset = 0;

                    return currencyExposureData.segments.map((segment) => {
                      const fraction = segment.value / currencyExposureData.total;
                      const segmentLength = circumference * fraction;
                      const dashOffset = circumference - offset;
                      offset += segmentLength;
                      return (
                        <circle
                          key={`donut-${segment.label}`}
                          cx="60"
                          cy="60"
                          r={radius}
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="14"
                          strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                          strokeDashoffset={dashOffset}
                          transform="rotate(-90 60 60)"
                        />
                      );
                    });
                  })()}
                  <circle cx="60" cy="60" r="27" fill="#ffffff" />
                  <text x="60" y="57" textAnchor="middle" fontSize="11" fill="#64748b">Total</text>
                  <text x="60" y="72" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">{currencyExposureData.total}</text>
                </svg>
                <div className="dashboard-donut-legend" style={{ display: 'grid', gap: '6px' }}>
                  {currencyExposureData.segments.map((segment) => (
                    <button
                      key={`currency-legend-${segment.label}`}
                      onClick={() => navigate('/materials')}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: segment.color }} />
                        {segment.label}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>{segment.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="app-card dashboard-chart-card" style={{ padding: '18px' }}>
            <div className="dashboard-widget-head">
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Price List Status</h3>
            </div>
            <p className="dashboard-help-text">Distribution of current price list lifecycle states.</p>
            {(priceListCounts.active + priceListCounts.draft + priceListCounts.expired) === 0 ? (
              <div className="dashboard-empty">No price lists yet</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {priceListChartData.map((item) => {
                  const total = priceListCounts.active + priceListCounts.draft + priceListCounts.expired;
                  const width = total > 0 ? Math.max(8, (item.value / total) * 100) : 0;
                  return (
                    <button
                      key={`price-list-chart-${item.key}`}
                      onClick={() => navigate('/price-lists')}
                      style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '12px' }}>
                        <span style={{ color: '#475569' }}>{item.label}</span>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>{item.value}</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0' }}>
                        <div style={{ height: '8px', width: `${width}%`, borderRadius: '999px', backgroundColor: item.color }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-widget-grid">
            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Approval Workload</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <button className="btn btn-secondary btn-sem-approvals" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=pending')}>
                  <span>Pending</span>
                  <strong>{productCounts.pending + specialPending.length}</strong>
                </button>
                <button className="btn btn-secondary btn-sem-approvals" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=needs_review')}>
                  <span>Needs Review</span>
                  <strong>{productCounts.needsReview}</strong>
                </button>
                <button className="btn btn-secondary btn-sem-approvals" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=rejected')}>
                  <span>Rejected</span>
                  <strong>{productCounts.rejected}</strong>
                </button>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Rate Health</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '13px', color: '#334155' }}>
                <div>{staleRateSummary.latestLabel}</div>
                <div>{staleRateSummary.staleCount} rate{staleRateSummary.staleCount === 1 ? '' : 's'} older than 7 days</div>
                <div>Oldest update age: {staleRateSummary.oldestAgeDays} day{staleRateSummary.oldestAgeDays === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Price List Focus</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ fontSize: '13px', color: '#334155' }}>{priceListCounts.active} active lists currently published</div>
                <button className="btn btn-secondary btn-sem-pricelist" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/price-lists')}>
                  <span>Draft Lists</span>
                  <strong>{priceListCounts.draft}</strong>
                </button>
                <button className="btn btn-secondary btn-sem-pricelist" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/price-lists')}>
                  <span>Expired Lists</span>
                  <strong>{priceListCounts.expired}</strong>
                </button>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Recent Activity</h3>
                </div>
              </div>

              {activityItems.length < 3 ? (
                <div className="dashboard-empty">
                  <span>Activity will appear here as you use PriceRight</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {activityItems.map((item) => {
                    const icon =
                      item.type === 'approved' ? <CheckCircle size={14} strokeWidth={2} />
                        : item.type === 'review' ? <AlertTriangle size={14} strokeWidth={2} />
                          : item.type === 'special' ? <Tag size={14} strokeWidth={2} />
                            : <RefreshCw size={14} strokeWidth={2} />;

                    return (
                      <div key={item.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ color: '#475569', marginTop: '1px' }}>{icon}</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 400, color: '#0f172a' }}>{item.text}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{relativeTime(item.timestamp)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </div>
      </div>

      <style>{`
        .dashboard-stat-grid {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 16px;
        }
        .dashboard-stat-card {
          padding: 16px;
          text-align: left;
          cursor: pointer;
          border: 1px solid #dbe2ea;
          transition: border-color 0.15s ease;
        }
        .dashboard-stat-card:hover {
          border-color: #cbd5e1;
        }
        .dashboard-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #0f172a;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .dashboard-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #f59e0b;
          position: absolute;
          top: -2px;
          right: -2px;
        }
        .dashboard-stat-value {
          font-size: 28px;
          font-weight: 700;
          margin-top: 6px;
          color: #0f172a;
        }
        .dashboard-stat-title {
          margin-top: 10px;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }
        .dashboard-stat-sub {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.35;
        }
        .dashboard-stat-hint {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 600;
          color: #475569;
          line-height: 1.3;
        }
        .dashboard-help-text {
          margin: 0 0 10px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.35;
        }
        .dashboard-quick-actions {
          display: grid;
          gap: 10px;
        }
        .dashboard-quick-actions-head {
          display: grid;
          gap: 2px;
        }
        .dashboard-quick-actions-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 700;
          color: #1d4ed8;
          letter-spacing: 0.2px;
          text-transform: uppercase;
        }
        .dashboard-quick-actions-title::before {
          content: '⚡';
          font-size: 12px;
          line-height: 1;
        }
        .dashboard-quick-actions-sub {
          font-size: 12px;
          color: #334155;
        }
        .dashboard-quick-card {
          padding: 16px;
          grid-column: span 2;
          border: 1px solid #bfdbfe;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-left: 4px solid #2563eb;
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 0 1px #93c5fd inset, 0 8px 22px rgba(37, 99, 235, 0.14);
        }
        .dashboard-quick-card::after {
          content: '';
          position: absolute;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          right: -70px;
          top: -70px;
          background: rgba(59, 130, 246, 0.18);
          pointer-events: none;
        }
        .dashboard-quick-actions-buttons {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .dashboard-quick-actions-buttons .btn {
          justify-content: flex-start;
          font-weight: 600;
          background: #ffffff;
          border-color: #93c5fd;
          color: #1e3a8a;
          box-shadow: inset 0 0 0 1px #dbeafe;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .dashboard-quick-actions-buttons .btn:hover {
          background: #dbeafe;
          border-color: #60a5fa;
        }
        .dashboard-quick-actions-buttons .quick-action-products {
          background: #dcfce7;
          border-color: #86efac;
          color: #166534;
        }
        .dashboard-quick-actions-buttons .quick-action-products:hover {
          background: #bbf7d0;
          border-color: #4ade80;
        }
        .dashboard-quick-actions-buttons .quick-action-pricelist {
          background: #ede9fe;
          border-color: #c4b5fd;
          color: #5b21b6;
        }
        .dashboard-quick-actions-buttons .quick-action-pricelist:hover {
          background: #ddd6fe;
          border-color: #a78bfa;
        }
        .dashboard-quick-actions-buttons .quick-action-approvals {
          background: #fef3c7;
          border-color: #fcd34d;
          color: #92400e;
        }
        .dashboard-quick-actions-buttons .quick-action-approvals:hover {
          background: #fde68a;
          border-color: #fbbf24;
        }
        .dashboard-quick-actions-buttons .quick-action-rates {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #0c4a6e;
        }
        .dashboard-quick-actions-buttons .quick-action-rates:hover {
          background: #bae6fd;
          border-color: #38bdf8;
        }
        .btn-sem-products {
          background: #dcfce7;
          border-color: #86efac;
          color: #166534;
        }
        .btn-sem-products:hover {
          background: #bbf7d0;
          border-color: #4ade80;
        }
        .btn-sem-pricelist {
          background: #ede9fe;
          border-color: #c4b5fd;
          color: #5b21b6;
        }
        .btn-sem-pricelist:hover {
          background: #ddd6fe;
          border-color: #a78bfa;
        }
        .btn-sem-approvals {
          background: #fef3c7;
          border-color: #fcd34d;
          color: #92400e;
        }
        .btn-sem-approvals:hover {
          background: #fde68a;
          border-color: #fbbf24;
        }
        .btn-sem-rates {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #0c4a6e;
        }
        .btn-sem-rates:hover {
          background: #bae6fd;
          border-color: #38bdf8;
        }
        .dashboard-widget-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }
        .dashboard-chart-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .dashboard-chart-card {
          min-height: 220px;
        }
        .dashboard-chart-label {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dashboard-widget-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .dashboard-empty {
          display: flex;
          gap: 8px;
          align-items: center;
          color: #475569;
          font-size: 13px;
          padding: 12px 0;
        }
        @media (max-width: 1200px) {
          .dashboard-stat-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 1200px) {
          .dashboard-widget-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 1200px) {
          .dashboard-chart-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }
        }
        @media (max-width: 860px) {
          .dashboard-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .dashboard-quick-actions-buttons {
            grid-template-columns: 1fr;
          }
          .dashboard-chart-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .dashboard-chart-card {
            min-height: auto;
          }
          .dashboard-donut-wrap {
            grid-template-columns: 1fr !important;
            justify-items: center;
          }
          .dashboard-donut-legend {
            width: 100%;
          }
          .dashboard-widget-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
