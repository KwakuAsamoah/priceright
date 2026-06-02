import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  demoModeApi,
  exchangeRatesApi,
  materialsApi,
  priceLevelItemsApi,
  priceLevelRulesApi,
  productsApi,
  settingsApi,
  type PriceLevelItemResponse,
} from '../api';

type ProductApprovalStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';
type BannerTone = 'success' | 'error';

interface Product {
  id: number;
  name: string;
  category?: string | null;
  approvalStatus?: ProductApprovalStatus | null;
  approvedPrice?: number | null;
  productionMode?: 'single' | 'batch' | null;
  batchYield?: number | null;
  currentSellingPrice?: number | null;
  profitMargin?: number | null;
  profit_margin?: number | null;
  approvedAt?: string | number | null;
  approvedPriceExpiresAt?: string | null;
  priceExpiryNotifiedAt?: string | null;
  needsReviewReason?: string | null;
  daysUntilExpiry?: number | null;
  updatedAt?: string | number | null;
  isActive?: boolean;
}

interface ProductCostSnapshot {
  totalCost: string;
}

interface Material {
  id: number;
  purchaseCurrencyId?: number | null;
  purchaseCurrencyCode?: string | null;
  purchaseCurrencySymbol?: string | null;
}

interface ExchangeRate {
  id: number;
  currencyId: number;
  rateToBase: number | string;
  effectiveDate?: string | number | null;
  updatedAt?: string | number | null;
}

interface BannerState {
  tone: BannerTone;
  message: string;
}

interface ActivityItem {
  id: string;
  type: 'approved' | 'review' | 'exchange';
  text: string;
  timestamp: Date;
}

interface PriceLevelSummary {
  exportReadyLevels: number;
  fullyApprovedLevels: number;
  levelsWithPendingItems: number;
  pendingItems: number;
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

function marginHealthColor(margin: number): string {
  if (margin >= 15) return '#059669';
  if (margin >= 10) return '#D97706';
  return '#DC2626';
}

function dashboardIconBoxStyle(backgroundColor: string): CSSProperties {
  return { backgroundColor };
}

function getProductStatus(product: Product): ProductApprovalStatus {
  const status = product.approvalStatus;
  if (status === 'approved' || status === 'rejected' || status === 'needs_review') return status;
  return 'pending';
}

function formatCurrentDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
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
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [productionCostByProductId, setProductionCostByProductId] = useState<Record<number, number>>({});
  const [priceLevelsCount, setPriceLevelsCount] = useState(0);
  const [priceLevelSummary, setPriceLevelSummary] = useState<PriceLevelSummary>({
    exportReadyLevels: 0,
    fullyApprovedLevels: 0,
    levelsWithPendingItems: 0,
    pendingItems: 0,
  });
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [currentDateLabel] = useState(() => formatCurrentDate(new Date()));
  const [baseCurrencyCode, setBaseCurrencyCode] = useState('GHS');
  const [companyName, setCompanyName] = useState('');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');

  const isNewInstallation = products.length === 0 && materials.length === 0;
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('priceright_banner_dismissed') === 'true'
  );

  function dismissBanner() {
    localStorage.setItem('priceright_banner_dismissed', 'true');
    setBannerDismissed(true);
  }

  useEffect(() => {
    let isMounted = true;
    loadDashboardData(isMounted);
    return () => { isMounted = false; };
  }, []);

  async function loadDashboardData(isMounted = true) {
    try {
      setLoading(true);
      setError('');

      try {
        await productsApi.processPriceExpiry();
      } catch {
        // Ignore this background call and continue with dashboard load.
      }

      const [productsData, materialsData, exchangeRatesData, settingsData, priceLevelsData] = await Promise.all([
        productsApi.getAll() as Promise<Product[]>,
        materialsApi.getAll() as Promise<Material[]>,
        exchangeRatesApi.getAll() as Promise<ExchangeRate[]>,
        settingsApi.getAll() as Promise<Array<{ settingKey: string; settingValue: string }>>,
        priceLevelRulesApi.getAll() as Promise<Array<{ id: number; isActive?: boolean }>>,
      ]);

      if (!isMounted) return;

      const baseSetting = (settingsData || []).find((entry) => entry.settingKey === 'baseCurrency');
      setBaseCurrencyCode(baseSetting?.settingValue || 'GHS');
      const companyNameSetting = (settingsData || []).find((entry) => entry.settingKey === 'companyName');
      const companyLogoSetting = (settingsData || []).find((entry) => entry.settingKey === 'companyLogoDataUrl');
      setCompanyName(companyNameSetting?.settingValue || '');
      setCompanyLogoDataUrl(companyLogoSetting?.settingValue || '');

      const approvedActiveProducts = (productsData || []).filter(
        (product) => product.isActive === true && getProductStatus(product) === 'approved' && toNumber(product.approvedPrice) > 0,
      );

      const costEntries = await Promise.all(
        approvedActiveProducts.map(async (product) => {
          try {
            const cost = await productsApi.calculateCost(product.id) as ProductCostSnapshot;
            const rawTotalCost = toNumber(cost.totalCost);
            const batchYield = product.productionMode === 'batch' ? Math.max(1, toNumber(product.batchYield)) : 1;
            const productionCostPerUnit = rawTotalCost > 0 ? rawTotalCost / batchYield : 0;
            return { productId: product.id, productionCost: productionCostPerUnit };
          } catch {
            return { productId: product.id, productionCost: 0 };
          }
        }),
      );

      if (!isMounted) return;

      const productionCostMap: Record<number, number> = {};
      costEntries.forEach((entry) => {
        productionCostMap[entry.productId] = entry.productionCost;
      });

      const levelItemsByLevel = await Promise.all(
        (priceLevelsData || []).map(async (level) => {
          try {
            const items = await priceLevelItemsApi.getAll(level.id) as PriceLevelItemResponse[];
            return { levelId: level.id, items };
          } catch {
            return { levelId: level.id, items: [] as PriceLevelItemResponse[] };
          }
        }),
      );

      if (!isMounted) return;

      const nextPriceLevelSummary = levelItemsByLevel.reduce<PriceLevelSummary>((summary, entry) => {
        const approvedItems = entry.items.filter((item) => item.status === 'approved');
        const pendingItems = entry.items.filter((item) => item.status === 'pending');

        if (approvedItems.length > 0) {
          summary.exportReadyLevels += 1;
        }
        if (entry.items.length > 0 && approvedItems.length === entry.items.length) {
          summary.fullyApprovedLevels += 1;
        }
        if (pendingItems.length > 0) {
          summary.levelsWithPendingItems += 1;
          summary.pendingItems += pendingItems.length;
        }

        return summary;
      }, {
        exportReadyLevels: 0,
        fullyApprovedLevels: 0,
        levelsWithPendingItems: 0,
        pendingItems: 0,
      });

      setProducts(productsData || []);
      setMaterials(materialsData || []);
      setExchangeRates(exchangeRatesData || []);
      setProductionCostByProductId(productionCostMap);
      setPriceLevelsCount(Array.isArray(priceLevelsData) ? priceLevelsData.length : 0);
      setPriceLevelSummary(nextPriceLevelSummary);
    } catch (fetchError) {
      if (!isMounted) return;
      setError('Could not load dashboard data. Please refresh the page.');
      console.error(fetchError);
    } finally {
      if (isMounted) setLoading(false);
    }
  }

  function openPrintableGuide() {
    const GUIDE_POINTS = [
      'Add your raw materials and costs.',
      'Build products with bills of materials.',
      'Approve base prices for your products.',
      'Create price levels for customer groups.',
      'Export a price list to Excel or PDF.',
      'To explore with sample data, go to Settings → Data Mode and enable Demo Mode.',
    ];
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) {
      return;
    }

    const pointsHtml = GUIDE_POINTS.map((point) => `<li>${point}</li>`).join('');
    printWindow.document.write(`
      <html>
        <head>
          <title>PriceRight Welcome Guide</title>
          <style>
            @page { size: A4; margin: 18mm; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
            .page { max-width: 720px; margin: 0 auto; }
            .header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
            .icon { width: 52px; height: 52px; border-radius: 16px; background: #111111; color: #ffffff; display: flex; align-items: center; justify-content: center; }
            h1 { margin: 0; font-size: 29px; }
            .subtitle { margin: 4px 0 0; color: #475569; font-size: 15px; }
            p { line-height: 1.7; font-size: 15px; color: #334155; }
            ol { margin: 18px 0 0 20px; padding: 0; }
            li { margin: 0 0 10px; line-height: 1.6; font-size: 15px; }
            .note { margin-top: 18px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="icon">PR</div>
              <div>
                <h1>PriceRight Welcome Guide</h1>
                <div class="subtitle">Simple setup instructions for first-time users</div>
              </div>
            </div>
            <p>PriceRight helps you cost products accurately, approve base prices, and manage customer pricing in one place.</p>
            <ol>${pointsHtml}</ol>
            <div class="note">
              Downloading sample data is optional. If you want to explore first, go to Settings and download the bundled sample files.
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  async function handleSwitchToDemo() {
    try {
      await demoModeApi.set(true);
      await new Promise(resolve => setTimeout(resolve, 200));
      window.location.hash = '#/materials';
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch to demo mode', err);
    }
  }

  const productCounts = useMemo(() => {
    const activeProducts = products.filter((product) => product.isActive !== false);
    const inactiveCount = Math.max(0, products.length - activeProducts.length);
    let approved = 0;
    let pending = 0;
    let needsReview = 0;
    let rejected = 0;

    activeProducts.forEach((product) => {
      const status = getProductStatus(product);
      if (status === 'approved') approved += 1;
      else if (status === 'needs_review') needsReview += 1;
      else if (status === 'rejected') rejected += 1;
      else pending += 1;
    });

    return {
      total: activeProducts.length,
      active: activeProducts.length,
      inactive: inactiveCount,
      approved,
      pending,
      needsReview,
      rejected,
    };
  }, [products]);

  const needsReviewBreakdown = useMemo(() => {
    let costChanges = 0;
    let priceExpired = 0;
    let other = 0;

    products.forEach((product) => {
      if (product.isActive === false || getProductStatus(product) !== 'needs_review') {
        return;
      }

      const reason = (product.needsReviewReason || '').toLowerCase();
      if (reason === 'cost_changed') {
        costChanges += 1;
      } else if (reason === 'price_expired') {
        priceExpired += 1;
      } else {
        other += 1;
      }
    });

    return { costChanges, priceExpired, other };
  }, [products]);

  const upcomingPriceExpiries = useMemo(() => {
    return products
      .filter((product) => {
        if (product.isActive === false) return false;
        if (getProductStatus(product) !== 'approved') return false;
        const daysLeft = typeof product.daysUntilExpiry === 'number' ? product.daysUntilExpiry : null;
        return daysLeft !== null && daysLeft > 0 && daysLeft <= 30;
      })
      .sort((a, b) => {
        const aDays = typeof a.daysUntilExpiry === 'number' ? a.daysUntilExpiry : 999;
        const bDays = typeof b.daysUntilExpiry === 'number' ? b.daysUntilExpiry : 999;
        return aDays - bDays;
      })
      .slice(0, 5);
  }, [products]);

  const lowMarginProducts = useMemo(() => {
    return products
      .filter((product) => product.isActive === true && getProductStatus(product) === 'approved')
      .map((product) => {
        const currentSellingPrice = toNumber(product.currentSellingPrice);
        const productionCost = toNumber(productionCostByProductId[product.id]);
        const realisedMargin = currentSellingPrice > 0 && productionCost > 0
          ? ((currentSellingPrice - productionCost) / currentSellingPrice) * 100
          : null;

        return {
          product,
          referencePrice: currentSellingPrice,
          referencePriceLabel: 'Approved base price',
          approvedPrice: toNumber(product.approvedPrice),
          productionCost,
          realisedMargin,
        };
      })
      .filter((entry) => entry.realisedMargin !== null && (entry.realisedMargin as number) < 15)
      .sort((a, b) => (a.realisedMargin as number) - (b.realisedMargin as number));
  }, [products, productionCostByProductId]);

  const averageApprovedMargin = useMemo(() => {
    const realisedMargins = products
      .filter((product) => product.isActive === true && getProductStatus(product) === 'approved')
      .map((product) => {
        const currentSellingPrice = toNumber(product.currentSellingPrice);
        const productionCost = toNumber(productionCostByProductId[product.id]);
        if (currentSellingPrice <= 0 || productionCost <= 0) return null;
        return ((currentSellingPrice - productionCost) / currentSellingPrice) * 100;
      })
      .filter((margin): margin is number => margin !== null);

    if (realisedMargins.length === 0) return 0;
    const sum = realisedMargins.reduce((acc, margin) => acc + margin, 0);
    return sum / realisedMargins.length;
  }, [products, productionCostByProductId]);

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
    return lowMarginProducts
      .slice(0, 10)
      .map((entry) => ({
        product: entry.product,
        realisedMargin: entry.realisedMargin as number,
        referencePrice: entry.referencePrice,
        referencePriceLabel: entry.referencePriceLabel,
        approvedPrice: entry.approvedPrice,
        productionCost: entry.productionCost,
      }));
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

  const priceLevelChartData = useMemo(() => {
    return [
      { key: 'export-ready', label: 'Export-ready', value: priceLevelSummary.exportReadyLevels, color: '#16a34a' },
      { key: 'fully-approved', label: 'Fully approved', value: priceLevelSummary.fullyApprovedLevels, color: '#2563eb' },
      { key: 'pending-levels', label: 'Needs approval', value: priceLevelSummary.levelsWithPendingItems, color: '#f59e0b' },
    ];
  }, [priceLevelSummary]);

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
  }, [products, exchangeRates, currencyLookup]);

  const rejectedIconBg = productCounts.rejected > 0 ? '#DC2626' : '#059669';
  const rejectedValueColor = rejectedIconBg;
  const marginIconBg = marginHealthColor(averageApprovedMargin);
  const marginValueColor = marginHealthColor(averageApprovedMargin);
  const exportReadyIconBg = priceLevelSummary.exportReadyLevels > 0 ? '#059669' : '#64748b';

  const skeletonCards = (
    <div className="dashboard-stat-grid">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`skeleton-card-${index}`} className="app-card dashboard-skeleton-block" style={{ minHeight: '120px' }} />
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
      <div className="app-page app-uniform-numbers">
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
                {companyName && <div className="app-page-subtitle" style={{ fontSize: '14px' }}>{companyName}</div>}
                <h1 className="app-page-title">Dashboard</h1>
              </div>
            </div>
            <div className="app-page-subtitle" style={{ fontSize: '15px' }}>{currentDateLabel}</div>
          </div>
        </div>

        <div className="app-page-content">
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
            gap: 12px;
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
      <div className="app-page app-uniform-numbers">
        <div className="app-page-content" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="app-card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center', padding: '24px' }}>
            <AlertTriangle size={24} color="#dc2626" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{error}</div>
            <button className="btn btn-secondary" onClick={() => { void loadDashboardData(); }}>
              <RefreshCw size={14} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page app-uniform-numbers">
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
              {companyName && <div className="app-page-subtitle" style={{ fontSize: '14px' }}>{companyName}</div>}
              <h1 className="app-page-title">Dashboard</h1>
            </div>
          </div>
          <div className="app-page-subtitle" style={{ fontSize: '15px' }}>{currentDateLabel}</div>
        </div>
      </div>

      <div className="app-page-content">
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
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{banner.message}</span>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: '14px' }}
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {isNewInstallation && !bannerDismissed && (
          <div
            className="app-card"
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #162037',
              borderRadius: '12px',
              padding: '20px',
              display: 'grid',
              gap: '12px',
              position: 'relative',
            }}
          >
            <button className="btn-close-x" onClick={dismissBanner} aria-label="Close">
              &times;
            </button>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#f8fafc' }}>Welcome to PriceRight</h2>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '16px', lineHeight: 1.6 }}>
              Build accurate costs, set profitable prices, and manage customer pricing in one place. Start by adding your
              materials and products.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate('/materials')}>
                Start setup
              </button>
              <button className="btn btn-secondary" onClick={() => { void handleSwitchToDemo(); }}>
                Try with sample data →
              </button>
              <button className="btn btn-secondary" onClick={openPrintableGuide}>
                Download setup guide
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-stat-grid">
          <div className="app-card dashboard-stat-card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle('#0F2847')}><Package size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Total Raw Materials</div>
            <div className="dashboard-stat-value">{materialCounts.total}</div>
            <div className="dashboard-stat-hint">Inventory currency mix overview</div>
            <div className="dashboard-stat-sub">{materialCounts.foreignSummary}</div>
            <div className="dashboard-stat-sub" style={{ marginTop: '4px' }}>{materialCounts.baseCount} purchased at {baseCurrencyCode} base rate</div>
          </div>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/products')} title="Open Products">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle('#4338CA')}><Package size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Total Products</div>
            <div className="dashboard-stat-value">{productCounts.total}</div>
            <div className="dashboard-stat-hint">Click to open all products</div>
            <div className="dashboard-stat-sub">{productCounts.active} active · {productCounts.inactive} inactive</div>
          </button>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/products?approval=rejected')} title="Open rejected products">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle(rejectedIconBg)}><XCircle size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Rejected Products</div>
            <div className="dashboard-stat-value" style={{ color: rejectedValueColor }}>{productCounts.rejected}</div>
            <div className="dashboard-stat-hint">Click to reprice and re-approve</div>
            <div className="dashboard-stat-sub">Require repricing and re-approval</div>
          </button>

          <div className="app-card dashboard-stat-card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle(marginIconBg)}><TrendingUp size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Average Margin</div>
            <div
              className="dashboard-stat-value"
              style={{ color: marginValueColor }}
            >
              {averageApprovedMargin.toFixed(1)}%
            </div>
            <div className="dashboard-stat-hint">Target healthy margin ≥ 15%</div>
            <div className="dashboard-stat-sub">Across approved products</div>
          </div>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/price-levels')} title="Open price levels">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle('#0D9488')}><Tag size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Price levels</div>
            <div className="dashboard-stat-value">{priceLevelsCount}</div>
            <div className="dashboard-stat-hint">Click to manage level pricing rules</div>
            <div className="dashboard-stat-sub">{priceLevelsCount} price levels configured</div>
          </button>

          <button className="app-card dashboard-stat-card" onClick={() => navigate('/price-levels')} title="Open price levels">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="dashboard-icon-box" style={dashboardIconBoxStyle(exportReadyIconBg)}><FileText size={20} color="#ffffff" /></div>
            </div>
            <div className="dashboard-stat-title">Export-ready Levels</div>
            <div className="dashboard-stat-value">{priceLevelSummary.exportReadyLevels}</div>
            <div className="dashboard-stat-hint">Open price levels to export approved pricing</div>
            <div className="dashboard-stat-sub">{priceLevelSummary.fullyApprovedLevels} fully approved · {priceLevelSummary.pendingItems} pending items</div>
          </button>


        </div>

        <div className="dashboard-chart-grid">
          <div className="app-card dashboard-chart-card" style={{ padding: '18px' }}>
            <div className="dashboard-widget-head">
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Low-Margin Top 10</h3>
            </div>
            <p className="dashboard-help-text">Products with the weakest margins first. Click a row to open low-margin product view.</p>
            {lowMarginTopTen.length === 0 ? (
              <div className="dashboard-empty">No low-margin products</div>
            ) : (
              <div style={{ display: 'grid', gap: '7px' }}>
                {lowMarginTopTen.map(({ product, realisedMargin, referencePrice, referencePriceLabel, productionCost }) => {
                  const widthPercent = Math.max(8, Math.min(100, (realisedMargin / 15) * 100));
                  return (
                    <button
                      key={`low-margin-chart-${product.id}`}
                      onClick={() => navigate(`/products?lowMargin=1&productId=${product.id}`)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px', gap: '8px' }}>
                        <span className="dashboard-chart-label" style={{ color: '#475569' }}>{product.name}</span>
                        <span className="dashboard-number-sm" style={{ color: '#e65100' }}>{realisedMargin.toFixed(1)}%</span>
                      </div>
                      <div
                        style={{
                          fontWeight: 400,
                          fontSize: '13px',
                          color: '#888',
                          marginBottom: '4px',
                        }}
                      >
                        {referencePriceLabel}: GHS {referencePrice.toFixed(2)} · Cost: GHS {productionCost.toFixed(2)}
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
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Currency Exposure</h3>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: segment.color }} />
                        {segment.label}
                      </span>
                      <span className="dashboard-number-xs">{segment.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="app-card dashboard-chart-card" style={{ padding: '18px' }}>
            <div className="dashboard-widget-head">
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Price Level Approval Status</h3>
            </div>
            <p className="dashboard-help-text">Shows which levels are ready to export and which still need approval work.</p>
            {(priceLevelSummary.exportReadyLevels + priceLevelSummary.fullyApprovedLevels + priceLevelSummary.levelsWithPendingItems) === 0 ? (
              <div className="dashboard-empty">No price level activity yet</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {priceLevelChartData.map((item) => {
                  const total = priceLevelChartData.reduce((sum, entry) => sum + entry.value, 0);
                  const width = total > 0 ? Math.max(8, (item.value / total) * 100) : 0;
                  return (
                    <button
                      key={`price-level-chart-${item.key}`}
                      onClick={() => navigate('/price-levels')}
                      style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>{item.label}</span>
                        <span className="dashboard-number-xs" style={{ color: '#0f172a' }}>{item.value}</span>
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
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Approval Workload</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <button className="btn btn-secondary btn-sem-approvals" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=pending')}>
                  <span>Pending</span>
                  <strong className="dashboard-number-xs">{productCounts.pending}</strong>
                </button>
                {productCounts.needsReview > 0 ? (
                  <div
                    style={{
                      backgroundColor: '#fff3e0',
                      borderLeft: '3px solid #e65100',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'grid',
                      gap: '6px',
                    }}
                  >
                    <div style={{ color: '#9a3412', fontSize: '14px', fontWeight: 700 }}>Prices need review</div>
                    <div style={{ fontSize: '26px', fontWeight: 700, color: '#e65100', lineHeight: 1 }}>{productCounts.needsReview}</div>
                    <div style={{ fontSize: '14px', color: '#9a3412' }}>products affected by cost changes</div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}
                      onClick={() => navigate('/products?approval=needs_review')}
                    >
                      <span>Review now</span>
                      <strong className="dashboard-number-xs">{productCounts.needsReview}</strong>
                    </button>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', color: '#166534', fontSize: '14px', fontWeight: 600 }}>
                    All prices current
                  </div>
                )}
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {needsReviewBreakdown.costChanges} cost changes · {needsReviewBreakdown.priceExpired} price expired · {needsReviewBreakdown.other} other
                </div>
                <button className="btn btn-secondary btn-sem-approvals" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=rejected')}>
                  <span>Rejected</span>
                  <strong className="dashboard-number-xs">{productCounts.rejected}</strong>
                </button>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Rate Health</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '15px', color: '#334155' }}>
                <div>{staleRateSummary.latestLabel}</div>
                <div><span className="dashboard-number-xs">{staleRateSummary.staleCount}</span> rate{staleRateSummary.staleCount === 1 ? '' : 's'} older than 7 days</div>
                <div>Oldest update age: <span className="dashboard-number-xs">{staleRateSummary.oldestAgeDays}</span> day{staleRateSummary.oldestAgeDays === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Price Level Focus</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ fontSize: '15px', color: '#334155' }}><span className="dashboard-number-xs">{priceLevelSummary.exportReadyLevels}</span> levels have approved pricing ready to export</div>
                <button className="btn btn-secondary btn-sem-pricelist" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/price-levels')}>
                  <span>Levels Needing Approval</span>
                  <strong className="dashboard-number-xs">{priceLevelSummary.levelsWithPendingItems}</strong>
                </button>
                <button className="btn btn-secondary btn-sem-pricelist" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }} onClick={() => navigate('/products?approval=pending')}>
                  <span>Pending Product Approvals</span>
                  <strong className="dashboard-number-xs">{priceLevelSummary.pendingItems}</strong>
                </button>
              </div>
            </div>

            <div className="app-card" style={{ padding: '20px' }}>
              <div className="dashboard-widget-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} strokeWidth={2} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Recent Activity</h3>
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
                          : <RefreshCw size={14} strokeWidth={2} />;

                    return (
                      <div key={item.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ color: '#475569', marginTop: '1px' }}>{icon}</span>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: 400, color: '#0f172a' }}>{item.text}</div>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>{relativeTime(item.timestamp)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </div>

        {upcomingPriceExpiries.length > 0 && (
          <div className="app-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Upcoming Price Expiries</h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 700 }}
                onClick={() => navigate('/products?expiringSoon=1')}
              >
                View all →
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Product Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Approved base price</th>
                    <th style={{ padding: '8px 10px' }}>Expires On</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingPriceExpiries.map((product) => {
                    const expiryDate = product.approvedPriceExpiresAt
                      ? parseDate(`${product.approvedPriceExpiresAt.slice(0, 10)}T00:00:00`)
                      : null;

                    return (
                      <tr key={`expiry-${product.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{product.name}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{currency(toNumber(product.approvedPrice))}</td>
                        <td style={{ padding: '8px 10px' }}>{expiryDate ? expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{product.daysUntilExpiry ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .dashboard-stat-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
        }
        .dashboard-stat-card {
          padding: 12px 14px;
          text-align: left;
          cursor: pointer;
          border: 1px solid #dbe2ea;
          transition: border-color 0.15s ease;
          min-height: auto;
          height: auto;
          overflow: visible;
          white-space: normal;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          min-width: 0;
        }
        .app-page button.dashboard-stat-card {
          white-space: normal !important;
          height: auto;
          overflow: visible;
          text-align: left;
          padding: 12px 14px !important;
          background: #ffffff !important;
          border: 1px solid #dbe2ea !important;
        }
        .dashboard-stat-card:hover {
          border-color: #cbd5e1;
        }
        .dashboard-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
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
          font-size: 24px;
          font-weight: 700;
          margin: 2px 0;
          color: #0F2847;
          font-variant-numeric: tabular-nums;
        }
        .dashboard-number-sm,
        .dashboard-number-xs {
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
        }
        .dashboard-number-sm {
          font-size: 14px;
          font-weight: 700;
        }
        .dashboard-number-xs {
          font-size: 13px;
          font-weight: 700;
        }
        .dashboard-stat-title {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          letter-spacing: 0.3px;
          white-space: normal;
          overflow: visible;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .dashboard-stat-sub {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
          white-space: normal;
          overflow: visible;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .dashboard-stat-hint {
          margin-top: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          line-height: 1.4;
          white-space: normal;
          overflow: visible;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .dashboard-help-text {
          margin: 0 0 10px;
          font-size: 13px;
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
          font-size: 14px;
          font-weight: 700;
          color: #1d4ed8;
          letter-spacing: 0.2px;
        }
        .dashboard-quick-actions-title::before {
          content: '⚡';
          font-size: 13px;
          line-height: 1;
        }
        .dashboard-quick-actions-sub {
          font-size: 13px;
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
          font-size: 14px;
          padding: 12px 0;
        }
        @media (max-width: 1200px) {
          .dashboard-stat-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
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
