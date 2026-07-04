import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Download,
  FileText,
  LineChart,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import AppBadge from '../components/AppBadge';
import ProductsAnalysisTab from '../components/ProductsAnalysisTab';
import TableZoomControl from '../components/TableZoomControl';
import { currenciesApi, exchangeRatesApi, materialsApi, priceListsApi, productsApi } from '../api';
import { exportToExcel, exportToExcelWorkbook, exportToPDF } from '../utils/reportExport';
import { usePrint } from '../hooks/usePrint';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import useTableZoom from '../hooks/useTableZoom';
import { formatCurrency as formatCurrencyAmount } from '../utils/currency';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';
import {
  calculateActualMarkupPercent,
  getMarkupHealthBand,
  getThresholdMarkupColor,
} from '../utils/margin';
import MarginLegendCard from '../components/MarginLegendCard';
import type { ColumnDef, ReportRow } from '../utils/reportExport';

type ReportKey =
  | 'pricing-status'
  | 'markup-analysis'
  | 'price-list-summary'
  | 'approval-history'
  | 'currency-exposure'
  | 'materials-cost-analysis'
  | 'top-cost-drivers'
  | 'price-volatility'
  | 'material-price-history'
  | 'inactive-in-boms'
  | 'product-pricing-overview'
  | 'margin-health'
  | 'profitability-ranking'
  | 'price-vs-cost-drift'
  | 'optimal-vs-actual-gap';

type ProductRow = {
  id: number;
  name: string;
  category?: string | null;
  productionCost?: number;
  optimalPrice?: number;
  currentSellingPrice?: number;
  approvedPrice?: number | null;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  approvedAt?: string | number | null;
  approvedBy?: string | null;
  isActive?: boolean;
  profitMargin?: number;
  productionMode?: 'single' | 'batch' | null;
  batchYield?: number | null;
};

type MarginHealthProduct = {
  id: number;
  name: string;
  category?: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  approvalStatus?: 'pending' | 'approved' | 'needs_review';
  approvedPrice?: number | null;
  totalCost: number;
  optimalPrice: number;
  isActive: boolean;
};

type ProfitabilityRankingRow = {
  productName: string;
  category: string;
  productionCost: number;
  approvedPrice: number;
  actualMarkupPercent: number;
};

type PriceVsCostDriftRow = {
  productName: string;
  category: string;
  approvedPrice: number;
  currentCost: number;
  currentMarkupPercent: number;
  targetMarkupPercent: number;
  markupDrift: number;
};

type OptimalVsActualGapRow = {
  productName: string;
  category: string;
  optimalPrice: number;
  approvedPrice: number;
  gap: number;
  gapPercent: number;
};

type PriceListRow = {
  id: number;
  name: string;
  customerId?: number | null;
  customerName?: string | null;
  priceLevelName?: string | null;
  validFrom: string | number;
  validUntil: string | number | null;
  status: string;
  updatedAt?: string | number;
  itemsCount?: number;
};

type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit?: string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode?: string;
  unitPrice: number | string;
  bulkPrice: number | string;
  bulkQuantity: number | string;
  isActive: boolean;
};

type ProductWithBomRow = {
  id: number;
  name: string;
  isActive?: boolean;
  bom: Array<{ materialId?: number; quantity?: number | string }>;
};

type MaterialPriceHistoryApiEntry = {
  id: number;
  priceInBaseCurrency: number | string;
  changedAt: string | number;
};

type MaterialsCostAnalysisRow = {
  materialName: string;
  category: string;
  unit: string;
  unitCost: number;
  productsUsedCount: number;
};

type TopCostDriverRow = {
  materialName: string;
  category: string;
  unitCost: number;
  bomUsageCount: number;
  totalContribution: number;
  percentOfTotal: number;
};

type PriceVolatilityRow = {
  materialName: string;
  category: string;
  unit: string;
  costAtStart: number;
  currentCost: number;
  changeAmount: number;
  changePercent: number;
};

type MaterialPriceHistoryTableRow = {
  date: string;
  oldCost: number | null;
  newCost: number;
  changeAmount: number | null;
  changePercent: number | null;
  changedBy: string;
};

type InactiveInBomRow = {
  materialName: string;
  category: string;
  status: string;
  productNames: string[];
  productsAffectedCount: number;
};

type ProductPricingOverviewRow = {
  productId: number;
  productName: string;
  category: string;
  productionCost: number;
  approvedPrice: number | null;
  optimalPrice: number;
  actualMarkupPercent: number | null;
  approvalStatus: 'pending' | 'approved' | 'needs_review';
  pricingHealth: 'Healthy' | 'Low' | 'Critical' | 'Not Priced';
};

type CurrencyRow = {
  id: number;
  code: string;
  name: string;
  symbol: string;
};

type ExchangeRateRow = {
  currencyId: number;
  rateToBase: number | string;
  effectiveDate?: string | number;
};

type PricingStatusComputedRow = {
  productName: string;
  approvalStatus: 'approved' | 'pending' | 'needs_review' | 'rejected';
  category: string;
  productionCost: number;
  optimalPrice: number;
  sellingPrice: number;
  hasSellingPrice: boolean;
  variance: number;
  variancePct: number;
  profit: number;
  markupPct: number;
  pricingStatus: 'Above Optimal' | 'Below Optimal' | 'At Optimal';
};

type MarkupAnalysisComputedRow = {
  productName: string;
  category: string;
  productionCost: number;
  approvedPrice: number;
  actualMarkupPercent: number;
  targetGap: number;
};
type PriceListSummaryComputedRow = {
  priceListName: string;
  listType: 'By Level' | 'By Customer';
  customerOrLevel: string;
  productsCovered: number;
  validFrom: string;
  validUntil: string;
  daysUntilExpiry: number | null;
  lastUpdated: string;
  status: string;
};

type ApprovalHistoryComputedRow = {
  productName: string;
  category: string;
  currentStatus: string;
  approvedPrice: number | null;
  optimalPrice: number;
  productionCost: number;
  actualMarkupPercent: number | null;
  approvedOn: string | number | null;
  approvedBy: string;
  isActive: boolean;
};

type CurrencyExposureComputedRow = {
  currencyName: string;
  currencyCode: string;
  materialsCount: number;
  currentRateToGhs: number;
  isBaseCurrency: boolean;
  materials: Array<{
    materialName: string;
    category: string;
    purchaseCurrency: string;
    unitPriceGhs: number;
    originalPrice: number;
    exchangeRateUsed: number;
  }>;
};

type ReportResultMap = {
  'pricing-status': {
    rows: PricingStatusComputedRow[];
  };
  'markup-analysis': {
    rows: MarkupAnalysisComputedRow[];
    totalAnalysed: number;
    aboveTargetCount: number;
    belowTargetCount: number;
    averageMarkup: number;
    threshold: number;
  };
  'price-list-summary': {
    rows: PriceListSummaryComputedRow[];
    activeCount: number;
    expiringSoonCount: number;
    expiredCount: number;
  };
  'approval-history': {
    rows: ApprovalHistoryComputedRow[];
  };
  'currency-exposure': {
    rows: CurrencyExposureComputedRow[];
    totalMaterials: number;
  };
  'materials-cost-analysis': {
    rows: MaterialsCostAnalysisRow[];
    totalActiveMaterials: number;
    averageUnitCost: number;
    mostExpensiveName: string;
    mostExpensiveCost: number;
    categoryCount: number;
  };
  'top-cost-drivers': {
    rows: TopCostDriverRow[];
    totalMaterialsInBoms: number;
    totalWeightedCost: number;
    mostImpactfulMaterial: string;
  };
  'price-volatility': {
    rows: PriceVolatilityRow[];
    materialsWithChanges: number;
    averageChangePercent: number;
    biggestIncreaseName: string;
    biggestIncreasePercent: number;
    biggestDecreaseName: string;
    biggestDecreasePercent: number;
    endpointAvailable: boolean;
  };
  'material-price-history': {
    materialId: number | null;
    materialName: string;
    materialOptions: Array<{ id: number; name: string }>;
    rows: MaterialPriceHistoryTableRow[];
    currentCost: number;
    firstRecordedCost: number | null;
    priceChangeCount: number;
    costTrend: 'up' | 'down' | 'stable';
  };
  'inactive-in-boms': {
    rows: InactiveInBomRow[];
    totalInactiveMaterials: number;
    inactiveAffectingProducts: number;
    productsAffected: number;
  };
  'product-pricing-overview': {
    rows: ProductPricingOverviewRow[];
    totalActiveProducts: number;
    approvedCount: number;
    pendingCount: number;
    needsReviewCount: number;
    healthyMarkupCount: number;
    lowMarkupCount: number;
    criticalMarkupCount: number;
    notPricedCount: number;
  };
  'margin-health': {
    products: MarginHealthProduct[];
  };
  'profitability-ranking': {
    rows: ProfitabilityRankingRow[];
    rankedCount: number;
  };
  'price-vs-cost-drift': {
    rows: PriceVsCostDriftRow[];
    affectedCount: number;
  };
  'optimal-vs-actual-gap': {
    rows: OptimalVsActualGapRow[];
    aboveCount: number;
    belowCount: number;
    atOptimalCount: number;
  };
};

const REPORT_METADATA: Array<{
  key: ReportKey;
  name: string;
  pillLabel: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: 'pricing-status',
    name: 'Pricing Status Report',
    pillLabel: 'Pricing Status',
    description: 'Approved base price vs optimal across all products',
    icon: TrendingUp,
  },
  {
    key: 'markup-analysis',
    name: 'Markup Analysis',
    pillLabel: 'Markup Analysis',
    description: 'Markup on cost vs target threshold with distribution and gap analysis',
    icon: AlertTriangle,
  },
  {
    key: 'price-list-summary',
    name: 'Price List Summary',
    pillLabel: 'Price List Summary',
    description: 'All price lists and their coverage',
    icon: FileText,
  },
  {
    key: 'approval-history',
    name: 'Approval History',
    pillLabel: 'Approval History',
    description: 'Product price approvals with dates',
    icon: ShieldCheck,
  },
  {
    key: 'currency-exposure',
    name: 'Currency Exposure Report',
    pillLabel: 'Currency Exposure',
    description: 'Material cost exposure by currency',
    icon: RefreshCw,
  },
  {
    key: 'materials-cost-analysis',
    name: 'Materials Cost Analysis',
    pillLabel: 'Materials Cost Analysis',
    description: 'Unit costs, categories, and product usage across active materials',
    icon: LineChart,
  },
  {
    key: 'top-cost-drivers',
    name: 'Top Cost Drivers',
    pillLabel: 'Top Cost Drivers',
    description: 'Materials with the highest total BOM cost contribution',
    icon: TrendingUp,
  },
  {
    key: 'price-volatility',
    name: 'Price Volatility',
    pillLabel: 'Price Volatility',
    description: 'Materials with unit cost changes over a selected period',
    icon: AlertTriangle,
  },
  {
    key: 'material-price-history',
    name: 'Material Price History',
    pillLabel: 'Material Price History',
    description: 'Full price change history for a selected material',
    icon: FileText,
  },
  {
    key: 'inactive-in-boms',
    name: 'Inactive in Active BOMs',
    pillLabel: 'Inactive in Active BOMs',
    description: 'Inactive materials still referenced in active product BOMs',
    icon: ShieldCheck,
  },
  {
    key: 'product-pricing-overview',
    name: 'Product Pricing Overview',
    pillLabel: 'Pricing Overview',
    description: 'Combined pricing status, approval state, and margin health for all active products',
    icon: LineChart,
  },
  {
    key: 'margin-health',
    name: 'Margin Health',
    pillLabel: 'Margin Health',
    description: 'Product margin health bands and distribution',
    icon: LineChart,
  },
  {
    key: 'profitability-ranking',
    name: 'Profitability Ranking',
    pillLabel: 'Profitability Ranking',
    description: 'Products ranked by Actual Markup %',
    icon: TrendingUp,
  },
  {
    key: 'price-vs-cost-drift',
    name: 'Price vs Cost Drift',
    pillLabel: 'Price vs Cost Drift',
    description: 'Markup drift since price approval as costs change',
    icon: AlertTriangle,
  },
  {
    key: 'optimal-vs-actual-gap',
    name: 'Optimal vs Actual Gap',
    pillLabel: 'Optimal vs Actual Gap',
    description: 'Approved base price compared to current optimal price',
    icon: ArrowUpDown,
  },
];

const REPORT_METADATA_BY_KEY = Object.fromEntries(
  REPORT_METADATA.map((report) => [report.key, report]),
) as Record<ReportKey, (typeof REPORT_METADATA)[number]>;

type ReportGroupId = 'pricing' | 'products' | 'materials';

const GROUP_REPORT_KEYS: Record<ReportGroupId, ReportKey[]> = {
  pricing: ['pricing-status', 'markup-analysis', 'approval-history', 'price-list-summary'],
  products: ['product-pricing-overview', 'margin-health', 'profitability-ranking', 'price-vs-cost-drift', 'optimal-vs-actual-gap'],
  materials: [
    'currency-exposure',
    'materials-cost-analysis',
    'top-cost-drivers',
    'price-volatility',
    'material-price-history',
    'inactive-in-boms',
  ],
};

const MATERIALS_DROPDOWN_OPTIONS: Array<{ value: ReportKey; label: string }> = [
  { value: 'currency-exposure', label: 'Currency Exposure' },
  { value: 'materials-cost-analysis', label: 'Materials Cost Analysis' },
  { value: 'top-cost-drivers', label: 'Top Cost Drivers' },
  { value: 'price-volatility', label: 'Price Volatility' },
  { value: 'material-price-history', label: 'Material Price History' },
  { value: 'inactive-in-boms', label: 'Inactive in Active BOMs' },
];

const REPORTS_WITH_CUSTOM_EMPTY_BODY = new Set<ReportKey>([
  'markup-analysis',
  'material-price-history',
  'inactive-in-boms',
  'price-volatility',
]);

const ROWS_PER_PAGE = 15;

const REPORT_PILL_STYLE: CSSProperties = {
  borderRadius: '999px',
  padding: '8px 14px',
  fontSize: '14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const REPORT_PILL_ACTIVE_STYLE: CSSProperties = {
  backgroundColor: '#16A34A',
  color: '#ffffff',
  border: '1.5px solid #16A34A',
  fontWeight: 600,
};

const REPORT_PILL_INACTIVE_STYLE: CSSProperties = {
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: '1.5px solid #E2E8F0',
  fontWeight: 400,
};

const REPORT_SELECTOR_STICKY_STYLE: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  backgroundColor: 'var(--color-bg)',
  paddingTop: '8px',
  paddingBottom: '8px',
};

const INLINE_FILTER_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  backgroundColor: '#F8FAFC',
  padding: '10px 16px',
  borderRadius: '8px',
  marginBottom: '12px',
};

const INLINE_FILTER_FIELD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: '130px',
};

function getDefaultApprovalFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function getDefaultApprovalToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type ActiveFilterChip = {
  key: string;
  label: string;
  onClear: () => void;
};

const FILTER_CHIP_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: '#F1F5F9',
  border: '1px solid #CBD5E1',
  color: '#475569',
  fontSize: '12px',
  padding: '3px 8px',
  borderRadius: '12px',
};

const FILTER_CHIP_CLEAR_STYLE: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#94A3B8',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '2px 4px',
  margin: '-2px -4px -2px 0',
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSignedNumber(value: number): string {
  const absValue = Math.abs(value).toFixed(2);
  return value < 0 ? `(${absValue})` : absValue;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function mapProductForAnalysisTab(product: ProductRow): MarginHealthProduct {
  return {
    id: product.id,
    name: product.name,
    category: product.category || undefined,
    productionMode: product.productionMode ?? undefined,
    batchYield: product.batchYield ?? undefined,
    approvalStatus: product.approvalStatus === 'rejected' ? 'pending' : product.approvalStatus,
    approvedPrice: product.approvedPrice,
    totalCost: toNumber(product.productionCost),
    optimalPrice: toNumber(product.optimalPrice),
    isActive: product.isActive !== false,
  };
}

function paginateRows<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * ROWS_PER_PAGE;
  return rows.slice(start, start + ROWS_PER_PAGE);
}

function getTotalPages(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / ROWS_PER_PAGE));
}

function parseDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const maybeMs = value > 1_000_000_000_000 ? value : value * 1000;
    const fromNumber = new Date(maybeMs);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && String(value).trim() !== '') {
    const maybeMs = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
    const fromNumericString = new Date(maybeMs);
    return Number.isNaN(fromNumericString.getTime()) ? null : fromNumericString;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function statusBadgeVariant(status: string): 'approved' | 'pending' | 'needs-review' | 'inactive' {
  if (status === 'approved') return 'approved';
  if (status === 'pending' || status === 'rejected') return 'pending';
  if (status === 'needs_review') return 'needs-review';
  return 'inactive';
}

function approvalStatusLabel(status: PricingStatusComputedRow['approvalStatus']): string {
  if (status === 'needs_review') return 'Needs Review';
  if (status === 'approved') return 'Approved';
  if (status === 'pending' || status === 'rejected') return 'Pending';
  return 'Pending';
}

async function loadActiveProductsWithBom(): Promise<ProductWithBomRow[]> {
  const allProducts = (await productsApi.getAll('all')) as ProductWithBomRow[];
  const activeProducts = allProducts.filter((product) => product.isActive !== false);

  return Promise.all(
    activeProducts.map(async (product) => {
      try {
        const bom = await productsApi.getBOM(product.id);
        return {
          ...product,
          bom: Array.isArray(bom) ? bom : [],
        };
      } catch {
        return { ...product, bom: [] };
      }
    }),
  );
}

function buildMaterialProductUsageMap(products: ProductWithBomRow[]): Map<number, number> {
  const usage = new Map<number, Set<number>>();

  for (const product of products) {
    const seenInProduct = new Set<number>();
    for (const entry of product.bom) {
      if (!entry.materialId || seenInProduct.has(entry.materialId)) continue;
      seenInProduct.add(entry.materialId);
      const existing = usage.get(entry.materialId) || new Set<number>();
      existing.add(product.id);
      usage.set(entry.materialId, existing);
    }
  }

  return new Map(Array.from(usage.entries()).map(([materialId, productIds]) => [materialId, productIds.size]));
}

function getCostAtPeriodStart(historyAsc: MaterialPriceHistoryApiEntry[], periodStart: Date): number | null {
  if (historyAsc.length === 0) return null;

  let costAtStart: number | null = null;
  for (const entry of historyAsc) {
    const changedAt = parseDate(entry.changedAt);
    if (changedAt && changedAt <= periodStart) {
      costAtStart = toNumber(entry.priceInBaseCurrency);
    }
  }

  if (costAtStart === null) {
    costAtStart = toNumber(historyAsc[0].priceInBaseCurrency);
  }

  return costAtStart;
}

function getVolatilityPeriodDays(period: '30' | '90' | '180' | '365'): number {
  return Number(period);
}

function getOverviewApprovedPrice(product: ProductRow): number | null {
  const approved = toNumber(product.approvedPrice);
  return approved > 0 ? approved : null;
}

function getOverviewMarkup(product: ProductRow): number | null {
  const approved = getOverviewApprovedPrice(product);
  const cost = toNumber(product.productionCost);
  if (approved == null || cost <= 0) return null;
  return calculateActualMarkupPercent(approved, cost);
}

function getOverviewPricingHealth(markup: number | null, threshold: number): ProductPricingOverviewRow['pricingHealth'] {
  const band = getMarkupHealthBand(markup, threshold);
  if (band === 'healthy') return 'Healthy';
  if (band === 'low') return 'Low';
  if (band === 'critical') return 'Critical';
  return 'Not Priced';
}

function getOverviewApprovalSortOrder(status: ProductPricingOverviewRow['approvalStatus']): number {
  if (status === 'needs_review') return 0;
  if (status === 'pending') return 1;
  if (status === 'approved') return 2;
  return 3;
}

function normalizeOverviewApprovalStatus(status: ProductRow['approvalStatus']): ProductPricingOverviewRow['approvalStatus'] {
  if (status === 'approved') return 'approved';
  if (status === 'needs_review') return 'needs_review';
  return 'pending';
}

function pricingHealthBadgeVariant(health: ProductPricingOverviewRow['pricingHealth']): 'success' | 'warning' | 'danger' | 'inactive' {
  if (health === 'Healthy') return 'success';
  if (health === 'Low') return 'warning';
  if (health === 'Critical') return 'danger';
  return 'inactive';
}

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { baseCurrency } = useBaseCurrency();
  const lowMarkupThreshold = useLowMarkupThreshold();
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const text = formatCurrencyAmount(absValue, baseCurrency);
    return value < 0 ? `(${text})` : text;
  };
  const [selectedReport, setSelectedReport] = useState<ReportKey>('pricing-status');
  const [activeGroup, setActiveGroup] = useState<ReportGroupId>('pricing');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [reportData, setReportData] = useState<ReportResultMap[ReportKey] | null>(null);
  const [expandedCurrencyCodes, setExpandedCurrencyCodes] = useState<Set<string>>(new Set());
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const { zoomPercent, increaseZoom, decreaseZoom } = useTableZoom('reportsZoomPercent');

  const [pricingCategoryFilter, setPricingCategoryFilter] = useState('All');
  const [pricingStatusFilter, setPricingStatusFilter] = useState<'All' | 'Above Optimal' | 'Below Optimal' | 'At Optimal'>('All');
  const [pricingSort, setPricingSort] = useState<'Product Name' | 'Markup % desc' | 'Markup % asc' | 'Variance desc' | 'Variance asc'>('Product Name');

  const [markupAnalysisThreshold, setMarkupAnalysisThreshold] = useState(lowMarkupThreshold);
  const [markupAnalysisFilter, setMarkupAnalysisFilter] = useState<'all' | 'above' | 'below' | 'custom'>('all');
  const [markupAnalysisCategory, setMarkupAnalysisCategory] = useState('All');
  const [markupAnalysisMinRange, setMarkupAnalysisMinRange] = useState('');
  const [markupAnalysisMaxRange, setMarkupAnalysisMaxRange] = useState('');

  const [approvalFromDate, setApprovalFromDate] = useState(getDefaultApprovalFromDate);
  const [approvalToDate, setApprovalToDate] = useState(getDefaultApprovalToDate);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | 'approved' | 'needs_review' | 'pending'>('All');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState('All');

  const [profitabilityCategoryFilter, setProfitabilityCategoryFilter] = useState('All');
  const [profitabilitySort, setProfitabilitySort] = useState<'Markup desc' | 'Markup asc' | 'Product Name'>('Markup desc');

  const [driftFilter, setDriftFilter] = useState<'Negative only' | 'All'>('Negative only');

  const [optimalGapFilter, setOptimalGapFilter] = useState<'All' | 'Above Optimal' | 'Below Optimal'>('All');

  const [materialsCostCategoryFilter, setMaterialsCostCategoryFilter] = useState('All');
  const [priceVolatilityPeriod, setPriceVolatilityPeriod] = useState<'30' | '90' | '180' | '365'>('90');
  const [materialPriceHistoryMaterialId, setMaterialPriceHistoryMaterialId] = useState<number | null>(null);
  const [availableMaterialCategories, setAvailableMaterialCategories] = useState<string[]>([]);

  const [overviewCategoryFilter, setOverviewCategoryFilter] = useState('All');
  const [overviewApprovalFilter, setOverviewApprovalFilter] = useState<'All' | 'pending' | 'approved' | 'needs_review'>('All');
  const [overviewPricingHealthFilter, setOverviewPricingHealthFilter] = useState<'All' | 'Healthy' | 'Low Markup' | 'Critical'>('All');

  const selectedMeta = REPORT_METADATA_BY_KEY[selectedReport];
  const { handlePrint } = usePrint();
  const pageContentRef = useRef<HTMLDivElement>(null);

  function scrollReportsToTop() {
    pageContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectReport(reportKey: ReportKey) {
    resetFiltersForReport(reportKey);
    setSelectedReport(reportKey);
    setReportData(null);
    setGeneratedAt(null);
    setError(null);
    setCurrentPage(1);
    setExpandedCurrencyCodes(new Set());
    scrollReportsToTop();
  }

  function handleGroupTabChange(group: ReportGroupId) {
    setActiveGroup(group);
    const firstReport = GROUP_REPORT_KEYS[group][0];
    resetFiltersForReport(firstReport);
    setSelectedReport(firstReport);
    setReportData(null);
    setGeneratedAt(null);
    setError(null);
    setCurrentPage(1);
    setExpandedCurrencyCodes(new Set());
    scrollReportsToTop();
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedReport,
    pricingCategoryFilter,
    pricingStatusFilter,
    pricingSort,
    markupAnalysisThreshold,
    markupAnalysisFilter,
    markupAnalysisCategory,
    markupAnalysisMinRange,
    markupAnalysisMaxRange,
    approvalFromDate,
    approvalToDate,
    approvalStatusFilter,
    approvalCategoryFilter,
    profitabilityCategoryFilter,
    profitabilitySort,
    driftFilter,
    optimalGapFilter,
    materialsCostCategoryFilter,
    priceVolatilityPeriod,
    materialPriceHistoryMaterialId,
    overviewCategoryFilter,
    overviewApprovalFilter,
    overviewPricingHealthFilter,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const products = (await productsApi.getAll('all')) as ProductRow[];
        if (cancelled) return;
        const categories = Array.from(
          new Set(
            products
              .map((product) => String(product.category || '').trim())
              .filter((category) => category.length > 0)
          )
        ).sort((a, b) => a.localeCompare(b));
        setAvailableCategories(categories);
      } catch {
        if (!cancelled) {
          setAvailableCategories([]);
        }
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMarkupAnalysisThreshold(lowMarkupThreshold);
  }, [lowMarkupThreshold]);

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');
    if (group === 'pricing' || group === 'products' || group === 'materials') {
      const groupReports = GROUP_REPORT_KEYS[group as ReportGroupId];
      if (report && groupReports.includes(report as ReportKey)) {
        setActiveGroup(group as ReportGroupId);
        setSelectedReport(report as ReportKey);
        setReportData(null);
        setGeneratedAt(null);
        setError(null);
        setCurrentPage(1);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    void generateReport();
  }, [
    selectedReport,
    pricingCategoryFilter,
    pricingStatusFilter,
    pricingSort,
    markupAnalysisThreshold,
    markupAnalysisFilter,
    markupAnalysisCategory,
    markupAnalysisMinRange,
    markupAnalysisMaxRange,
    approvalFromDate,
    approvalToDate,
    approvalStatusFilter,
    approvalCategoryFilter,
    profitabilityCategoryFilter,
    profitabilitySort,
    driftFilter,
    optimalGapFilter,
    materialsCostCategoryFilter,
    priceVolatilityPeriod,
    materialPriceHistoryMaterialId,
    overviewCategoryFilter,
    overviewApprovalFilter,
    overviewPricingHealthFilter,
    baseCurrency,
  ]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData || !selectedReport) return 0;
    if (selectedReport === 'margin-health') {
      return (reportData as ReportResultMap['margin-health']).products.length;
    }
    if (selectedReport === 'material-price-history') {
      const data = reportData as ReportResultMap['material-price-history'];
      return data.materialId ? data.rows.length : 0;
    }
    if (selectedReport === 'inactive-in-boms') {
      return (reportData as ReportResultMap['inactive-in-boms']).rows.length;
    }
    if (selectedReport === 'profitability-ranking') {
      return (reportData as ReportResultMap['profitability-ranking']).rows.length;
    }
    if (selectedReport === 'price-vs-cost-drift') {
      return (reportData as ReportResultMap['price-vs-cost-drift']).rows.length;
    }
    if (selectedReport === 'optimal-vs-actual-gap') {
      return (reportData as ReportResultMap['optimal-vs-actual-gap']).rows.length;
    }
    return Array.isArray((reportData as any).rows) ? (reportData as any).rows.length : 0;
  }, [reportData, selectedReport]);

  const shouldShowReportBody = useMemo(() => {
    if (!reportData) return false;
    if (REPORTS_WITH_CUSTOM_EMPTY_BODY.has(selectedReport)) return true;
    return generatedRowsCount > 0;
  }, [generatedRowsCount, reportData, selectedReport]);

  const canExportReport = useMemo(() => {
    if (!reportData || !generatedAt) return false;
    if (selectedReport === 'material-price-history') {
      const data = reportData as ReportResultMap['material-price-history'];
      return data.materialId != null && data.rows.length > 0;
    }
    if (selectedReport === 'inactive-in-boms') return true;
    if (REPORTS_WITH_CUSTOM_EMPTY_BODY.has(selectedReport)) {
      return generatedRowsCount > 0;
    }
    return generatedRowsCount > 0;
  }, [generatedAt, generatedRowsCount, reportData, selectedReport]);

  async function generateReport() {
    if (!selectedReport) return;

    setIsLoading(true);
    setError(null);

    try {
      if (selectedReport === 'pricing-status') {
        const products = (await productsApi.getAll('all')) as ProductRow[];
        const activeProducts = products.filter((p) => p.isActive !== false);

        const rows = activeProducts.map((product) => {
          const productionCost = toNumber(product.productionCost);
          const optimalPrice = toNumber(product.optimalPrice);
          const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : null;
          const hasApprovedPrice = approvedPrice != null && approvedPrice > 0;
          const sellingPrice = hasApprovedPrice ? approvedPrice : 0;
          const variance = hasApprovedPrice ? sellingPrice - optimalPrice : 0;
          const variancePct = hasApprovedPrice && optimalPrice > 0 ? (variance / optimalPrice) * 100 : 0;
          const profit = hasApprovedPrice ? sellingPrice - productionCost : 0;
          const markupPct = hasApprovedPrice && productionCost > 0
            ? (calculateActualMarkupPercent(sellingPrice, productionCost) ?? 0)
            : 0;
          const pricingStatus: 'Above Optimal' | 'Below Optimal' | 'At Optimal' =
            !hasApprovedPrice ? 'At Optimal' :
            sellingPrice > optimalPrice + 0.01 ? 'Above Optimal' :
            sellingPrice < optimalPrice - 0.01 ? 'Below Optimal' :
            'At Optimal';

          return {
            productName: product.name,
            approvalStatus: product.approvalStatus || 'pending',
            category: product.category || 'Uncategorised',
            productionCost,
            optimalPrice,
            sellingPrice,
            hasSellingPrice: hasApprovedPrice,
            variance,
            variancePct,
            profit,
            markupPct,
            pricingStatus,
          };
        });

        const filtered = rows
          .filter((row) => (pricingCategoryFilter === 'All' ? true : row.category === pricingCategoryFilter))
          .filter((row) => (pricingStatusFilter === 'All' ? true : row.pricingStatus === pricingStatusFilter));

        filtered.sort((a, b) => {
          if (pricingSort === 'Product Name') return a.productName.localeCompare(b.productName);
          if (pricingSort === 'Markup % desc') return b.markupPct - a.markupPct;
          if (pricingSort === 'Markup % asc') return a.markupPct - b.markupPct;
          if (pricingSort === 'Variance desc') return b.variance - a.variance;
          return a.variance - b.variance;
        });

        setReportData({ rows: filtered });
      }

      if (selectedReport === 'markup-analysis') {
        const products = (await productsApi.getAll('all')) as ProductRow[];
        const approvedRows = products
          .filter((product) => {
            const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
            return product.approvalStatus === 'approved' && product.isActive !== false && approvedPrice > 0 && toNumber(product.productionCost) > 0;
          })
          .map((product) => {
            const approvedPrice = toNumber(product.approvedPrice);
            const productionCost = toNumber(product.productionCost);
            const actualMarkupPercent = calculateActualMarkupPercent(approvedPrice, productionCost) ?? 0;
            const targetGap = actualMarkupPercent - markupAnalysisThreshold;

            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              productionCost,
              approvedPrice,
              actualMarkupPercent,
              targetGap,
            };
          });

        const afterCategory = approvedRows.filter((row) =>
          markupAnalysisCategory === 'All' ? true : row.category === markupAnalysisCategory,
        );

        const threshold = markupAnalysisThreshold;
        const totalAnalysed = afterCategory.length;
        const aboveTargetCount = afterCategory.filter((row) => row.actualMarkupPercent >= threshold).length;
        const belowTargetCount = afterCategory.filter((row) => row.actualMarkupPercent < threshold).length;
        const averageMarkup = totalAnalysed > 0
          ? afterCategory.reduce((sum, row) => sum + row.actualMarkupPercent, 0) / totalAnalysed
          : 0;

        let filtered = afterCategory;
        if (markupAnalysisFilter === 'above') {
          filtered = filtered.filter((row) => row.actualMarkupPercent >= threshold);
        } else if (markupAnalysisFilter === 'below') {
          filtered = filtered.filter((row) => row.actualMarkupPercent < threshold);
        } else if (markupAnalysisFilter === 'custom') {
          const min = markupAnalysisMinRange === '' ? null : Number(markupAnalysisMinRange);
          const max = markupAnalysisMaxRange === '' ? null : Number(markupAnalysisMaxRange);
          filtered = filtered.filter((row) => {
            if (min != null && Number.isFinite(min) && row.actualMarkupPercent < min) return false;
            if (max != null && Number.isFinite(max) && row.actualMarkupPercent > max) return false;
            return true;
          });
        }

        filtered.sort((a, b) => {
          const aBelow = a.actualMarkupPercent < threshold;
          const bBelow = b.actualMarkupPercent < threshold;
          if (aBelow && !bBelow) return -1;
          if (!aBelow && bBelow) return 1;
          if (aBelow && bBelow) return a.actualMarkupPercent - b.actualMarkupPercent;
          return b.actualMarkupPercent - a.actualMarkupPercent;
        });

        setReportData({
          rows: filtered,
          totalAnalysed,
          aboveTargetCount,
          belowTargetCount,
          averageMarkup,
          threshold,
        });
      }

      if (selectedReport === 'price-list-summary') {
        const lists = (await priceListsApi.getAll()) as PriceListRow[];

        const rows = lists.map((list) => {
          const validFromDate = parseDate(list.validFrom);
          const validUntilDate = parseDate(list.validUntil);
          const updatedAtDate = parseDate(list.updatedAt || list.validFrom);
          const daysLeft = daysUntil(validUntilDate);

          return {
            priceListName: list.name,
            listType: list.customerId ? 'By Customer' as const : 'By Level' as const,
            customerOrLevel: list.customerId ? (list.customerName || 'Customer') : (list.priceLevelName || '-'),
            productsCovered: toNumber(list.itemsCount),
            validFrom: validFromDate ? validFromDate.toLocaleDateString() : '—',
            validUntil: validUntilDate ? validUntilDate.toLocaleDateString() : '—',
            daysUntilExpiry: daysLeft,
            lastUpdated: updatedAtDate ? updatedAtDate.toLocaleDateString() : '—',
            status: list.status,
          };
        }).sort((a, b) => {
          if (a.daysUntilExpiry === null && b.daysUntilExpiry === null) return 0;
          if (a.daysUntilExpiry === null) return 1;
          if (b.daysUntilExpiry === null) return -1;
          return a.daysUntilExpiry - b.daysUntilExpiry;
        });

        const expiringSoonCount = rows.filter((row) => row.daysUntilExpiry !== null && row.daysUntilExpiry <= 30 && row.daysUntilExpiry >= 0).length;
        const activeCount = rows.filter((row) => row.status === 'active').length;
        const expiredCount = rows.filter((row) => row.daysUntilExpiry !== null && row.daysUntilExpiry < 0).length;

        setReportData({ rows, activeCount, expiringSoonCount, expiredCount });
      }

      if (selectedReport === 'approval-history') {
        const products = (await productsApi.getAll('all')) as ProductRow[];
        const fromDate = parseDate(approvalFromDate);
        const toDate = parseDate(approvalToDate);

        if (toDate) {
          toDate.setHours(23, 59, 59, 999);
        }

        const rows = products
          .map((product) => {
            const approvedPrice = product.approvedPrice ?? null;
            const productionCost = toNumber(product.productionCost);
            const actualMarkupPercent = approvedPrice != null && productionCost > 0
              ? calculateActualMarkupPercent(toNumber(approvedPrice), productionCost)
              : null;

            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              currentStatus: product.approvalStatus || 'pending',
              approvedPrice,
              optimalPrice: toNumber(product.optimalPrice),
              productionCost,
              actualMarkupPercent,
              approvedOn: product.approvedAt || null,
              approvedBy: product.approvedBy || '—',
              isActive: Boolean(product.isActive),
            };
          })
          .filter((row) => (approvalStatusFilter === 'All' ? true : row.currentStatus === approvalStatusFilter))
          .filter((row) => (approvalCategoryFilter === 'All' ? true : row.category === approvalCategoryFilter))
          .filter((row) => {
            if (!fromDate && !toDate) return true;
            const approvedDate = parseDate(row.approvedOn);
            if (!approvedDate) return true;
            const afterFrom = fromDate ? approvedDate >= fromDate : true;
            const beforeTo = toDate ? approvedDate <= toDate : true;
            return afterFrom && beforeTo;
          })
          .sort((a, b) => {
            const aTime = parseDate(a.approvedOn)?.getTime() ?? -1;
            const bTime = parseDate(b.approvedOn)?.getTime() ?? -1;
            return bTime - aTime;
          });

        setReportData({ rows });
      }

      if (selectedReport === 'currency-exposure') {
        const [materials, currencies, exchangeRates] = await Promise.all([
          materialsApi.getAll('active') as Promise<MaterialRow[]>,
          currenciesApi.getAll() as Promise<CurrencyRow[]>,
          exchangeRatesApi.getAll() as Promise<ExchangeRateRow[]>,
        ]);

        const ratesByCurrencyId = new Map<number, number>();
        exchangeRates.forEach((rate) => {
          ratesByCurrencyId.set(rate.currencyId, toNumber(rate.rateToBase));
        });

        const byCurrency = new Map<number, CurrencyExposureComputedRow>();

        materials.forEach((material) => {
          const unitPriceGhs = toNumber(material.unitPrice);
          const originalPrice = toNumber(material.bulkPrice) / Math.max(1, toNumber(material.bulkQuantity));
          const rateToGhs = ratesByCurrencyId.get(material.purchaseCurrencyId) || 1;

          const currency = currencies.find((c) => c.id === material.purchaseCurrencyId);
          const code = material.purchaseCurrencyCode || currency?.code || 'N/A';
          const name = currency?.name || code;

          const existing = byCurrency.get(material.purchaseCurrencyId);
          if (existing) {
            existing.materialsCount += 1;
            existing.materials.push({
              materialName: material.name,
              category: material.category,
              purchaseCurrency: code,
              unitPriceGhs,
              originalPrice,
              exchangeRateUsed: rateToGhs,
            });
          } else {
            byCurrency.set(material.purchaseCurrencyId, {
              currencyName: name,
              currencyCode: code,
              materialsCount: 1,
              currentRateToGhs: rateToGhs,
              isBaseCurrency: code === baseCurrency,
              materials: [
                {
                  materialName: material.name,
                  category: material.category,
                  purchaseCurrency: code,
                  unitPriceGhs,
                  originalPrice,
                  exchangeRateUsed: rateToGhs,
                },
              ],
            });
          }
        });

        const rows = Array.from(byCurrency.values())
          .sort((a, b) => b.materialsCount - a.materialsCount);

        setReportData({ rows, totalMaterials: materials.length });
      }

      if (selectedReport === 'materials-cost-analysis') {
        const [materials, productsWithBom] = await Promise.all([
          materialsApi.getAll('active') as Promise<MaterialRow[]>,
          loadActiveProductsWithBom(),
        ]);

        const usageMap = buildMaterialProductUsageMap(productsWithBom);
        const categories = Array.from(
          new Set(materials.map((material) => (material.category || 'Uncategorised').trim() || 'Uncategorised')),
        ).sort((a, b) => a.localeCompare(b));
        setAvailableMaterialCategories(categories);

        const rows = materials
          .map((material) => ({
            materialName: material.name,
            category: material.category || 'Uncategorised',
            unit: material.unit || '—',
            unitCost: toNumber(material.unitPrice),
            productsUsedCount: usageMap.get(material.id) || 0,
          }))
          .filter((row) => (materialsCostCategoryFilter === 'All' ? true : row.category === materialsCostCategoryFilter))
          .sort((a, b) => b.unitCost - a.unitCost);

        const totalUnitCost = materials.reduce((sum, material) => sum + toNumber(material.unitPrice), 0);
        const mostExpensive = materials.reduce<MaterialRow | null>((best, material) => {
          if (!best) return material;
          return toNumber(material.unitPrice) > toNumber(best.unitPrice) ? material : best;
        }, null);

        setReportData({
          rows,
          totalActiveMaterials: materials.length,
          averageUnitCost: materials.length > 0 ? totalUnitCost / materials.length : 0,
          mostExpensiveName: mostExpensive?.name || '—',
          mostExpensiveCost: mostExpensive ? toNumber(mostExpensive.unitPrice) : 0,
          categoryCount: categories.length,
        });
      }

      if (selectedReport === 'top-cost-drivers') {
        const [materials, productsWithBom] = await Promise.all([
          materialsApi.getAll('active') as Promise<MaterialRow[]>,
          loadActiveProductsWithBom(),
        ]);

        const materialsById = new Map(materials.map((material) => [material.id, material]));
        const contributionMap = new Map<number, {
          materialName: string;
          category: string;
          unitCost: number;
          bomUsageCount: number;
          totalContribution: number;
        }>();

        for (const product of productsWithBom) {
          for (const entry of product.bom) {
            if (!entry.materialId) continue;
            const material = materialsById.get(entry.materialId);
            if (!material) continue;

            const lineContribution = toNumber(entry.quantity) * toNumber(material.unitPrice);
            const existing = contributionMap.get(entry.materialId) || {
              materialName: material.name,
              category: material.category || 'Uncategorised',
              unitCost: toNumber(material.unitPrice),
              bomUsageCount: 0,
              totalContribution: 0,
            };
            existing.bomUsageCount += 1;
            existing.totalContribution += lineContribution;
            contributionMap.set(entry.materialId, existing);
          }
        }

        const contributions = Array.from(contributionMap.values());
        const totalWeightedCost = contributions.reduce((sum, row) => sum + row.totalContribution, 0);
        const sortedRows = contributions
          .map((row) => ({
            ...row,
            percentOfTotal: totalWeightedCost > 0 ? (row.totalContribution / totalWeightedCost) * 100 : 0,
          }))
          .sort((a, b) => b.totalContribution - a.totalContribution);

        setReportData({
          rows: sortedRows,
          totalMaterialsInBoms: sortedRows.length,
          totalWeightedCost,
          mostImpactfulMaterial: sortedRows[0]?.materialName || '—',
        });
      }

      if (selectedReport === 'price-volatility') {
        const materials = (await materialsApi.getAll('active')) as MaterialRow[];
        const periodDays = getVolatilityPeriodDays(priceVolatilityPeriod);
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - periodDays);

        let endpointAvailable = true;
        const volatilityRows: PriceVolatilityRow[] = [];

        await Promise.all(
          materials.map(async (material) => {
            try {
              const history = (await materialsApi.getPriceHistory(material.id)) as MaterialPriceHistoryApiEntry[];
              if (!Array.isArray(history)) return;

              const historyAsc = history
                .slice()
                .sort((a, b) => (parseDate(a.changedAt)?.getTime() ?? 0) - (parseDate(b.changedAt)?.getTime() ?? 0));

              const changesInPeriod = historyAsc.filter((entry) => {
                const changedAt = parseDate(entry.changedAt);
                return changedAt != null && changedAt >= periodStart;
              });

              if (changesInPeriod.length === 0) return;

              const costAtStart = getCostAtPeriodStart(historyAsc, periodStart);
              if (costAtStart == null) return;

              const currentCost = toNumber(material.unitPrice);
              const changeAmount = currentCost - costAtStart;
              const changePercent = costAtStart > 0 ? (changeAmount / costAtStart) * 100 : 0;

              volatilityRows.push({
                materialName: material.name,
                category: material.category || 'Uncategorised',
                unit: material.unit || '—',
                costAtStart,
                currentCost,
                changeAmount,
                changePercent,
              });
            } catch {
              // Skip materials that fail to load individually.
            }
          }),
        );

        volatilityRows.sort((a, b) => b.changePercent - a.changePercent);

        const averageChangePercent = volatilityRows.length > 0
          ? volatilityRows.reduce((sum, row) => sum + row.changePercent, 0) / volatilityRows.length
          : 0;

        const biggestIncrease = volatilityRows.reduce<PriceVolatilityRow | null>((best, row) => {
          if (!best || row.changePercent > best.changePercent) return row;
          return best;
        }, null);

        const biggestDecrease = volatilityRows.reduce<PriceVolatilityRow | null>((best, row) => {
          if (!best || row.changePercent < best.changePercent) return row;
          return best;
        }, null);

        setReportData({
          rows: volatilityRows,
          materialsWithChanges: volatilityRows.length,
          averageChangePercent,
          biggestIncreaseName: biggestIncrease?.materialName || '—',
          biggestIncreasePercent: biggestIncrease?.changePercent ?? 0,
          biggestDecreaseName: biggestDecrease?.materialName || '—',
          biggestDecreasePercent: biggestDecrease?.changePercent ?? 0,
          endpointAvailable,
        });
      }

      if (selectedReport === 'material-price-history') {
        const materials = (await materialsApi.getAll('active')) as MaterialRow[];
        const materialOptions = materials
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((material) => ({ id: material.id, name: material.name }));

        const selectedMaterial = materialPriceHistoryMaterialId
          ? materials.find((material) => material.id === materialPriceHistoryMaterialId) || null
          : null;

        if (!selectedMaterial) {
          setReportData({
            materialId: null,
            materialName: '',
            materialOptions,
            rows: [],
            currentCost: 0,
            firstRecordedCost: null,
            priceChangeCount: 0,
            costTrend: 'stable',
          });
        } else {
          const history = (await materialsApi.getPriceHistory(selectedMaterial.id)) as MaterialPriceHistoryApiEntry[];
          const historyDesc = Array.isArray(history)
            ? history.slice().sort((a, b) => (parseDate(b.changedAt)?.getTime() ?? 0) - (parseDate(a.changedAt)?.getTime() ?? 0))
            : [];

          const rows: MaterialPriceHistoryTableRow[] = historyDesc.map((entry, index) => {
            const newCost = toNumber(entry.priceInBaseCurrency);
            const olderEntry = historyDesc[index + 1];
            const oldCost = olderEntry ? toNumber(olderEntry.priceInBaseCurrency) : null;
            const changeAmount = oldCost == null ? null : newCost - oldCost;
            const changePercent = oldCost != null && oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : null;

            return {
              date: parseDate(entry.changedAt)?.toLocaleString() || '—',
              oldCost,
              newCost,
              changeAmount,
              changePercent,
              changedBy: '—',
            };
          });

          const firstRecordedCost = historyDesc.length > 0
            ? toNumber(historyDesc[historyDesc.length - 1].priceInBaseCurrency)
            : null;
          const currentCost = toNumber(selectedMaterial.unitPrice);
          const priceChangeCount = Math.max(0, historyDesc.length - 1);

          let costTrend: 'up' | 'down' | 'stable' = 'stable';
          if (firstRecordedCost != null && currentCost > firstRecordedCost + 0.01) costTrend = 'up';
          else if (firstRecordedCost != null && currentCost < firstRecordedCost - 0.01) costTrend = 'down';

          setReportData({
            materialId: selectedMaterial.id,
            materialName: selectedMaterial.name,
            materialOptions,
            rows,
            currentCost,
            firstRecordedCost,
            priceChangeCount,
            costTrend,
          });
        }
      }

      if (selectedReport === 'inactive-in-boms') {
        const [materials, productsWithBom] = await Promise.all([
          materialsApi.getAll('all') as Promise<MaterialRow[]>,
          loadActiveProductsWithBom(),
        ]);

        const inactiveMaterials = materials.filter((material) => material.isActive === false);
        const inactiveById = new Map(inactiveMaterials.map((material) => [material.id, material]));
        const grouped = new Map<number, { materialName: string; category: string; productNames: Set<string> }>();

        for (const product of productsWithBom) {
          for (const entry of product.bom) {
            if (!entry.materialId || !inactiveById.has(entry.materialId)) continue;
            const material = inactiveById.get(entry.materialId)!;
            const existing = grouped.get(entry.materialId) || {
              materialName: material.name,
              category: material.category || 'Uncategorised',
              productNames: new Set<string>(),
            };
            existing.productNames.add(product.name || 'Unknown product');
            grouped.set(entry.materialId, existing);
          }
        }

        const rows: InactiveInBomRow[] = Array.from(grouped.values())
          .map((entry) => ({
            materialName: entry.materialName,
            category: entry.category,
            status: 'Inactive',
            productNames: Array.from(entry.productNames).sort((a, b) => a.localeCompare(b)),
            productsAffectedCount: entry.productNames.size,
          }))
          .sort((a, b) => b.productsAffectedCount - a.productsAffectedCount);

        const affectedProductIds = new Set<number>();
        for (const product of productsWithBom) {
          const usesInactive = product.bom.some((entry) => entry.materialId && inactiveById.has(entry.materialId));
          if (usesInactive) affectedProductIds.add(product.id);
        }

        setReportData({
          rows,
          totalInactiveMaterials: inactiveMaterials.length,
          inactiveAffectingProducts: rows.length,
          productsAffected: affectedProductIds.size,
        });
      }

      if (selectedReport === 'margin-health') {
        const products = (await productsApi.getAll('active')) as ProductRow[];
        const mappedProducts = products
          .filter((product) => product.isActive !== false)
          .map(mapProductForAnalysisTab);

        setReportData({ products: mappedProducts });
      }

      if (selectedReport === 'product-pricing-overview') {
        const products = (await productsApi.getAll('active')) as ProductRow[];
        const activeProducts = products.filter((product) => product.isActive !== false);

        let approvedCount = 0;
        let pendingCount = 0;
        let needsReviewCount = 0;
        let healthyMarkupCount = 0;
        let lowMarkupCount = 0;
        let criticalMarkupCount = 0;
        let notPricedCount = 0;

        const allRows = activeProducts.map((product) => {
          const approvedPrice = getOverviewApprovedPrice(product);
          const actualMarkupPercent = getOverviewMarkup(product);
          const pricingHealth = getOverviewPricingHealth(actualMarkupPercent, lowMarkupThreshold);
          const approvalStatus = normalizeOverviewApprovalStatus(product.approvalStatus);

          if (approvalStatus === 'approved') approvedCount += 1;
          else if (approvalStatus === 'needs_review') needsReviewCount += 1;
          else pendingCount += 1;

          if (pricingHealth === 'Healthy') healthyMarkupCount += 1;
          else if (pricingHealth === 'Low') lowMarkupCount += 1;
          else if (pricingHealth === 'Critical') criticalMarkupCount += 1;
          else notPricedCount += 1;

          return {
            productId: product.id,
            productName: product.name,
            category: product.category || 'Uncategorised',
            productionCost: toNumber(product.productionCost),
            approvedPrice,
            optimalPrice: toNumber(product.optimalPrice),
            actualMarkupPercent,
            approvalStatus,
            pricingHealth,
          };
        });

        const filteredRows = allRows
          .filter((row) => (overviewCategoryFilter === 'All' ? true : row.category === overviewCategoryFilter))
          .filter((row) => (overviewApprovalFilter === 'All' ? true : row.approvalStatus === overviewApprovalFilter))
          .filter((row) => {
            if (overviewPricingHealthFilter === 'All') return true;
            if (overviewPricingHealthFilter === 'Healthy') return row.pricingHealth === 'Healthy';
            if (overviewPricingHealthFilter === 'Low Markup') return row.pricingHealth === 'Low';
            return row.pricingHealth === 'Critical';
          })
          .sort((a, b) => {
            const statusDiff = getOverviewApprovalSortOrder(a.approvalStatus) - getOverviewApprovalSortOrder(b.approvalStatus);
            if (statusDiff !== 0) return statusDiff;
            const aMarkup = a.actualMarkupPercent ?? Number.POSITIVE_INFINITY;
            const bMarkup = b.actualMarkupPercent ?? Number.POSITIVE_INFINITY;
            return aMarkup - bMarkup;
          });

        setReportData({
          rows: filteredRows,
          totalActiveProducts: activeProducts.length,
          approvedCount,
          pendingCount,
          needsReviewCount,
          healthyMarkupCount,
          lowMarkupCount,
          criticalMarkupCount,
          notPricedCount,
        });
      }

      if (selectedReport === 'profitability-ranking') {
        const products = (await productsApi.getAll('active')) as ProductRow[];
        const rows = products
          .filter((product) => {
            const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
            return product.approvalStatus === 'approved' && approvedPrice > 0 && toNumber(product.productionCost) > 0;
          })
          .map((product) => {
            const approvedPrice = toNumber(product.approvedPrice);
            const productionCost = toNumber(product.productionCost);
            const actualMarkupPercent = calculateActualMarkupPercent(approvedPrice, productionCost) ?? 0;
            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              productionCost,
              approvedPrice,
              actualMarkupPercent,
            };
          })
          .filter((row) => (profitabilityCategoryFilter === 'All' ? true : row.category === profitabilityCategoryFilter));

        rows.sort((a, b) => {
          if (profitabilitySort === 'Product Name') return a.productName.localeCompare(b.productName);
          if (profitabilitySort === 'Markup asc') return a.actualMarkupPercent - b.actualMarkupPercent;
          return b.actualMarkupPercent - a.actualMarkupPercent;
        });

        setReportData({ rows, rankedCount: rows.length });
      }

      if (selectedReport === 'price-vs-cost-drift') {
        const products = (await productsApi.getAll('active')) as ProductRow[];
        const allRows = products
          .filter((product) => product.approvalStatus === 'approved')
          .map((product) => {
            const approvedPrice = toNumber(product.approvedPrice);
            const currentCost = toNumber(product.productionCost);
            const targetMarkupPercent = toNumber(product.profitMargin);
            const currentMarkupPercent = calculateActualMarkupPercent(approvedPrice, currentCost) ?? 0;
            const markupDrift = currentMarkupPercent - targetMarkupPercent;

            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              approvedPrice,
              currentCost,
              currentMarkupPercent,
              targetMarkupPercent,
              markupDrift,
            };
          })
          .filter((row) => row.approvedPrice > 0 && row.currentCost > 0);

        const filteredRows = allRows
          .filter((row) => (driftFilter === 'Negative only' ? row.markupDrift < 0 : true))
          .sort((a, b) => a.markupDrift - b.markupDrift);

        setReportData({
          rows: filteredRows,
          affectedCount: allRows.filter((row) => row.markupDrift < 0).length,
        });
      }

      if (selectedReport === 'optimal-vs-actual-gap') {
        const products = (await productsApi.getAll('active')) as ProductRow[];
        const allRows = products
          .filter((product) => {
            const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
            const optimalPrice = toNumber(product.optimalPrice);
            return product.approvalStatus === 'approved' && approvedPrice > 0 && optimalPrice > 0;
          })
          .map((product) => {
            const optimalPrice = toNumber(product.optimalPrice);
            const approvedPrice = toNumber(product.approvedPrice);
            const gap = approvedPrice - optimalPrice;
            const gapPercent = (gap / optimalPrice) * 100;

            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              optimalPrice,
              approvedPrice,
              gap,
              gapPercent,
            };
          });

        const aboveCount = allRows.filter((row) => row.gap > 0.01).length;
        const belowCount = allRows.filter((row) => row.gap < -0.01).length;
        const atOptimalCount = allRows.filter((row) => Math.abs(row.gap) <= 0.01).length;

        const filteredRows = allRows
          .filter((row) => {
            if (optimalGapFilter === 'Above Optimal') return row.gap > 0.01;
            if (optimalGapFilter === 'Below Optimal') return row.gap < -0.01;
            return true;
          })
          .sort((a, b) => a.gapPercent - b.gapPercent);

        setReportData({
          rows: filteredRows,
          aboveCount,
          belowCount,
          atOptimalCount,
        });
      }

      setGeneratedAt(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to generate report');
      setReportData(null);
      setGeneratedAt(null);
    } finally {
      setIsLoading(false);
    }
  }

  function getExcelPayload(): { rows: ReportRow[]; columns: ColumnDef[]; filename: string } | null {
    if (!selectedReport || !reportData) return null;

    if (selectedReport === 'pricing-status') {
      const rows = (reportData as ReportResultMap['pricing-status']).rows.map((row) => ({
        productName: row.productName,
        approvalStatus: approvalStatusLabel(row.approvalStatus),
        category: row.category,
        productionCost: Number(row.productionCost.toFixed(2)),
        optimalPrice: Number(row.optimalPrice.toFixed(2)),
        sellingPrice: row.hasSellingPrice ? Number(row.sellingPrice.toFixed(2)) : null,
        variance: row.hasSellingPrice ? Number(row.variance.toFixed(2)) : null,
        variancePct: row.hasSellingPrice ? Number(row.variancePct.toFixed(1)) : null,
        profit: row.hasSellingPrice ? Number(row.profit.toFixed(2)) : null,
        markupPct: row.hasSellingPrice ? Number(row.markupPct.toFixed(1)) : null,
        pricingStatus: row.pricingStatus,
      }));

      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'approvalStatus', label: 'Approval Status' },
          { key: 'category', label: 'Category' },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'optimalPrice', label: `Optimal Price (${baseCurrency})` },
          { key: 'sellingPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'variance', label: `Variance (${baseCurrency})` },
          { key: 'variancePct', label: 'Variance %' },
          { key: 'profit', label: `Profit (${baseCurrency})` },
          { key: 'markupPct', label: 'Actual Markup %' },
          { key: 'pricingStatus', label: 'Pricing Status' },
        ],
        filename: 'pricing-status-report.csv',
      };
    }

    if (selectedReport === 'markup-analysis') {
      const data = reportData as ReportResultMap['markup-analysis'];
      const rows = data.rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        productionCost: Number(row.productionCost.toFixed(2)),
        approvedPrice: Number(row.approvedPrice.toFixed(2)),
        actualMarkupPercent: Number(row.actualMarkupPercent.toFixed(1)),
        targetGap: Number(row.targetGap.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'approvedPrice', label: `Approved Price (${baseCurrency})` },
          { key: 'actualMarkupPercent', label: 'Actual Markup %' },
          { key: 'targetGap', label: 'Target Gap %' },
        ],
        filename: 'markup-analysis-report.csv',
      };
    }

    if (selectedReport === 'price-list-summary') {
      const rows = (reportData as ReportResultMap['price-list-summary']).rows.map((row) => ({
        priceListName: row.priceListName,
        listType: row.listType,
        customerOrLevel: row.customerOrLevel,
        productsCovered: row.productsCovered,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        daysUntilExpiry: row.daysUntilExpiry === null ? '' : row.daysUntilExpiry,
        lastUpdated: row.lastUpdated,
        status: row.status,
      }));
      return {
        rows,
        columns: [
          { key: 'priceListName', label: 'Price List Name' },
          { key: 'listType', label: 'Type' },
          { key: 'customerOrLevel', label: 'Customer/Level' },
          { key: 'productsCovered', label: 'Products Covered' },
          { key: 'validFrom', label: 'Valid From' },
          { key: 'validUntil', label: 'Valid Until' },
          { key: 'daysUntilExpiry', label: 'Days Until Expiry' },
          { key: 'lastUpdated', label: 'Last Updated' },
          { key: 'status', label: 'Status' },
        ],
        filename: 'price-list-summary-report.csv',
      };
    }

    if (selectedReport === 'approval-history') {
      const rows = (reportData as ReportResultMap['approval-history']).rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        currentStatus: row.currentStatus,
        approvedPrice: row.approvedPrice === null ? '' : row.approvedPrice.toFixed(2),
        currentOptimalPrice: row.optimalPrice.toFixed(2),
        actualMarkupPercent: row.actualMarkupPercent == null ? '' : row.actualMarkupPercent.toFixed(1),
        approvedOn: parseDate(row.approvedOn)?.toLocaleString() || '—',
        approvedBy: row.approvedBy,
        active: row.isActive ? 'Yes' : 'No',
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'currentStatus', label: 'Current Status' },
          { key: 'approvedPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'currentOptimalPrice', label: `Current Optimal Price (${baseCurrency})` },
          { key: 'actualMarkupPercent', label: 'Actual Markup %' },
          { key: 'approvedOn', label: 'Approved On' },
          { key: 'approvedBy', label: 'Approved By' },
          { key: 'active', label: 'Active' },
        ],
        filename: 'approval-history-report.csv',
      };
    }

    if (selectedReport === 'product-pricing-overview') {
      const rows = (reportData as ReportResultMap['product-pricing-overview']).rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        productionCost: Number(row.productionCost.toFixed(2)),
        approvedPrice: row.approvedPrice == null ? '' : Number(row.approvedPrice.toFixed(2)),
        optimalPrice: Number(row.optimalPrice.toFixed(2)),
        actualMarkupPercent: row.actualMarkupPercent == null ? '' : Number(row.actualMarkupPercent.toFixed(1)),
        approvalStatus: row.approvalStatus,
        pricingHealth: row.pricingHealth,
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'approvedPrice', label: `Approved Base Price (${baseCurrency})` },
          { key: 'optimalPrice', label: `Optimal Price (${baseCurrency})` },
          { key: 'actualMarkupPercent', label: 'Actual Markup %' },
          { key: 'approvalStatus', label: 'Approval Status' },
          { key: 'pricingHealth', label: 'Pricing Health' },
        ],
        filename: 'product-pricing-overview-report.csv',
      };
    }

    if (selectedReport === 'margin-health') {
      const products = (reportData as ReportResultMap['margin-health']).products;
      const rows = products.map((product) => {
        const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
        const markup = approvedPrice > 0 && product.totalCost > 0
          ? calculateActualMarkupPercent(approvedPrice, product.totalCost)
          : null;
        return {
          productName: product.name,
          category: product.category || 'Uncategorised',
          productionCost: Number(product.totalCost.toFixed(2)),
          approvedPrice: approvedPrice > 0 ? Number(approvedPrice.toFixed(2)) : '',
          actualMarkupPercent: markup == null ? '' : Number(markup.toFixed(1)),
          approvalStatus: product.approvalStatus || 'pending',
        };
      });
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'approvedPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'actualMarkupPercent', label: 'Actual Markup %' },
          { key: 'approvalStatus', label: 'Approval Status' },
        ],
        filename: 'margin-health-report.csv',
      };
    }

    if (selectedReport === 'profitability-ranking') {
      const data = reportData as ReportResultMap['profitability-ranking'];
      const rows = data.rows.map((row, index) => ({
        rank: index + 1,
        productName: row.productName,
        category: row.category,
        productionCost: Number(row.productionCost.toFixed(2)),
        approvedPrice: Number(row.approvedPrice.toFixed(2)),
        actualMarkupPercent: Number(row.actualMarkupPercent.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'approvedPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'actualMarkupPercent', label: 'Actual Markup %' },
        ],
        filename: 'profitability-ranking-report.csv',
      };
    }

    if (selectedReport === 'price-vs-cost-drift') {
      const rows = (reportData as ReportResultMap['price-vs-cost-drift']).rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        approvedPrice: Number(row.approvedPrice.toFixed(2)),
        currentCost: Number(row.currentCost.toFixed(2)),
        currentMarkupPercent: Number(row.currentMarkupPercent.toFixed(1)),
        targetMarkupPercent: Number(row.targetMarkupPercent.toFixed(1)),
        markupDrift: Number(row.markupDrift.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'approvedPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'currentCost', label: `Current Cost (${baseCurrency})` },
          { key: 'currentMarkupPercent', label: 'Current Markup %' },
          { key: 'targetMarkupPercent', label: 'Target Markup %' },
          { key: 'markupDrift', label: 'Markup Drift' },
        ],
        filename: 'price-vs-cost-drift-report.csv',
      };
    }

    if (selectedReport === 'optimal-vs-actual-gap') {
      const rows = (reportData as ReportResultMap['optimal-vs-actual-gap']).rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        optimalPrice: Number(row.optimalPrice.toFixed(2)),
        approvedPrice: Number(row.approvedPrice.toFixed(2)),
        gap: Number(row.gap.toFixed(2)),
        gapPercent: Number(row.gapPercent.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'optimalPrice', label: `Optimal Price (${baseCurrency})` },
          { key: 'approvedPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'gap', label: `Gap (${baseCurrency})` },
          { key: 'gapPercent', label: 'Gap %' },
        ],
        filename: 'optimal-vs-actual-gap-report.csv',
      };
    }

    if (selectedReport === 'materials-cost-analysis') {
      const rows = (reportData as ReportResultMap['materials-cost-analysis']).rows.map((row) => ({
        materialName: row.materialName,
        category: row.category,
        unit: row.unit,
        unitCost: Number(row.unitCost.toFixed(2)),
        productsUsedCount: row.productsUsedCount,
      }));
      return {
        rows,
        columns: [
          { key: 'materialName', label: 'Material Name' },
          { key: 'category', label: 'Category' },
          { key: 'unit', label: 'Unit' },
          { key: 'unitCost', label: `Unit Cost (${baseCurrency})` },
          { key: 'productsUsedCount', label: 'Used in Products' },
        ],
        filename: 'materials-cost-analysis-report.csv',
      };
    }

    if (selectedReport === 'top-cost-drivers') {
      const data = reportData as ReportResultMap['top-cost-drivers'];
      const rows = data.rows.map((row, index) => ({
        rank: index + 1,
        materialName: row.materialName,
        category: row.category,
        unitCost: Number(row.unitCost.toFixed(2)),
        bomUsageCount: row.bomUsageCount,
        totalContribution: Number(row.totalContribution.toFixed(2)),
        percentOfTotal: Number(row.percentOfTotal.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'materialName', label: 'Material Name' },
          { key: 'category', label: 'Category' },
          { key: 'unitCost', label: `Unit Cost (${baseCurrency})` },
          { key: 'bomUsageCount', label: 'Times Used in BOMs' },
          { key: 'totalContribution', label: `Total BOM Contribution (${baseCurrency})` },
          { key: 'percentOfTotal', label: '% of Total Cost' },
        ],
        filename: 'top-cost-drivers-report.csv',
      };
    }

    if (selectedReport === 'price-volatility') {
      const rows = (reportData as ReportResultMap['price-volatility']).rows.map((row) => ({
        materialName: row.materialName,
        category: row.category,
        unit: row.unit,
        costAtStart: Number(row.costAtStart.toFixed(2)),
        currentCost: Number(row.currentCost.toFixed(2)),
        changeAmount: Number(row.changeAmount.toFixed(2)),
        changePercent: Number(row.changePercent.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'materialName', label: 'Material Name' },
          { key: 'category', label: 'Category' },
          { key: 'unit', label: 'Unit' },
          { key: 'costAtStart', label: `Cost at Start (${baseCurrency})` },
          { key: 'currentCost', label: `Current Cost (${baseCurrency})` },
          { key: 'changeAmount', label: `Change Amount (${baseCurrency})` },
          { key: 'changePercent', label: 'Change %' },
        ],
        filename: 'price-volatility-report.csv',
      };
    }

    if (selectedReport === 'material-price-history') {
      const data = reportData as ReportResultMap['material-price-history'];
      const rows = data.rows.map((row) => ({
        date: row.date,
        oldCost: row.oldCost == null ? '' : Number(row.oldCost.toFixed(2)),
        newCost: Number(row.newCost.toFixed(2)),
        changeAmount: row.changeAmount == null ? '' : Number(row.changeAmount.toFixed(2)),
        changePercent: row.changePercent == null ? '' : Number(row.changePercent.toFixed(1)),
        changedBy: row.changedBy,
      }));
      return {
        rows,
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'oldCost', label: `Old Cost (${baseCurrency})` },
          { key: 'newCost', label: `New Cost (${baseCurrency})` },
          { key: 'changeAmount', label: `Change Amount (${baseCurrency})` },
          { key: 'changePercent', label: 'Change %' },
          { key: 'changedBy', label: 'Changed By' },
        ],
        filename: `material-price-history-${data.materialName || 'report'}.csv`,
      };
    }

    if (selectedReport === 'inactive-in-boms') {
      const rows = (reportData as ReportResultMap['inactive-in-boms']).rows.map((row) => ({
        materialName: row.materialName,
        category: row.category,
        status: row.status,
        productsUsingIt: row.productNames.join(', '),
        productsAffectedCount: row.productsAffectedCount,
      }));
      return {
        rows,
        columns: [
          { key: 'materialName', label: 'Material Name' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'productsUsingIt', label: 'Products Using It' },
          { key: 'productsAffectedCount', label: 'Products Affected' },
        ],
        filename: 'inactive-in-boms-report.csv',
      };
    }

    if (selectedReport !== 'currency-exposure') return null;

    const mainRows = (reportData as ReportResultMap['currency-exposure']).rows.map((row) => ({
      currency: row.currencyName,
      currencyCode: row.currencyCode,
      materialsCount: row.materialsCount,
      currentRateToGhs: Number(row.currentRateToGhs.toFixed(4)),
    }));

    return {
      rows: mainRows,
      columns: [
        { key: 'currency', label: 'Currency' },
        { key: 'currencyCode', label: 'Currency Code' },
        { key: 'materialsCount', label: 'Materials Count' },
        { key: 'currentRateToGhs', label: `Current Rate to ${baseCurrency}` },
      ],
      filename: 'currency-exposure-report.csv',
    };
  }

  function handleExportExcel() {
    if (selectedReport === 'currency-exposure' && reportData) {
      const summaryRows = (reportData as ReportResultMap['currency-exposure']).rows.map((row) => ({
        currency: row.currencyName,
        code: row.currencyCode,
        materialsCount: row.materialsCount,
        currentRateToGhs: Number(row.currentRateToGhs.toFixed(4)),
      }));

      const detailRows = (reportData as ReportResultMap['currency-exposure']).rows.flatMap((row) =>
        row.materials.map((material) => ({
          materialName: material.materialName,
          category: material.category,
          currency: material.purchaseCurrency,
          unitPriceGhs: Number(material.unitPriceGhs.toFixed(2)),
          exchangeRate: Number(material.exchangeRateUsed.toFixed(2)),
        }))
      );

      exportToExcelWorkbook(
        [
          {
            name: 'Summary',
            rows: summaryRows,
            columns: [
              { key: 'currency', label: 'Currency' },
              { key: 'code', label: 'Code' },
              { key: 'materialsCount', label: 'Materials Count' },
              { key: 'currentRateToGhs', label: `Current Rate to ${baseCurrency}` },
            ],
          },
          {
            name: 'Materials Detail',
            rows: detailRows,
            columns: [
              { key: 'materialName', label: 'Material Name' },
              { key: 'category', label: 'Category' },
              { key: 'currency', label: 'Currency' },
              { key: 'unitPriceGhs', label: `Unit Price (${baseCurrency})` },
              { key: 'exchangeRate', label: 'Exchange Rate' },
            ],
          },
        ],
        'currency-exposure-report.xlsx',
      );
      return;
    }

    const payload = getExcelPayload();
    if (!payload) return;
    exportToExcel(payload.rows, payload.columns, payload.filename.replace(/\.csv$/i, '.xlsx'));
  }

  function handleExportPDF() {
    exportToPDF('reporting-centre-print-area', `${selectedMeta?.name || 'report'}.pdf`);
  }

  function handlePrintReport() {
    void handlePrint({
      title: selectedMeta?.name || 'Report',
      subtitle: `Generated: ${new Date().toLocaleDateString('en-GB')}`,
    });
  }

  const pricingCategories = useMemo(() => availableCategories, [availableCategories]);
  const markupAnalysisCategories = useMemo(() => availableCategories, [availableCategories]);
  const approvalCategories = useMemo(() => availableCategories, [availableCategories]);
  const productReportCategories = useMemo(() => availableCategories, [availableCategories]);

  function resetFiltersForReport(report: ReportKey) {
    if (report === 'pricing-status') {
      setPricingCategoryFilter('All');
      setPricingStatusFilter('All');
      setPricingSort('Product Name');
      return;
    }

    if (report === 'markup-analysis') {
      setMarkupAnalysisThreshold(lowMarkupThreshold);
      setMarkupAnalysisFilter('all');
      setMarkupAnalysisCategory('All');
      setMarkupAnalysisMinRange('');
      setMarkupAnalysisMaxRange('');
      return;
    }

    if (report === 'approval-history') {
      setApprovalFromDate(getDefaultApprovalFromDate());
      setApprovalToDate(getDefaultApprovalToDate());
      setApprovalStatusFilter('All');
      setApprovalCategoryFilter('All');
      return;
    }

    if (report === 'profitability-ranking') {
      setProfitabilityCategoryFilter('All');
      setProfitabilitySort('Markup desc');
      return;
    }

    if (report === 'price-vs-cost-drift') {
      setDriftFilter('Negative only');
      return;
    }

    if (report === 'optimal-vs-actual-gap') {
      setOptimalGapFilter('All');
      return;
    }

    if (report === 'materials-cost-analysis') {
      setMaterialsCostCategoryFilter('All');
      return;
    }

    if (report === 'price-volatility') {
      setPriceVolatilityPeriod('90');
      return;
    }

    if (report === 'material-price-history') {
      setMaterialPriceHistoryMaterialId(null);
      return;
    }

    if (report === 'product-pricing-overview') {
      setOverviewCategoryFilter('All');
      setOverviewApprovalFilter('All');
      setOverviewPricingHealthFilter('All');
    }
  }

  function getActiveFilterChips(): ActiveFilterChip[] {
    if (!selectedReport) return [];

    if (selectedReport === 'pricing-status') {
      const chips: ActiveFilterChip[] = [];
      if (pricingCategoryFilter !== 'All') {
        chips.push({
          key: 'pricing-category',
          label: `Category: ${pricingCategoryFilter}`,
          onClear: () => setPricingCategoryFilter('All'),
        });
      }
      if (pricingStatusFilter !== 'All') {
        chips.push({
          key: 'pricing-status',
          label: `Status: ${pricingStatusFilter}`,
          onClear: () => setPricingStatusFilter('All'),
        });
      }
      if (pricingSort !== 'Product Name') {
        chips.push({
          key: 'pricing-sort',
          label: `Sort: ${pricingSort}`,
          onClear: () => setPricingSort('Product Name'),
        });
      }
      return chips;
    }

    if (selectedReport === 'markup-analysis') {
      const chips: ActiveFilterChip[] = [];
      if (markupAnalysisThreshold !== lowMarkupThreshold) {
        chips.push({
          key: 'markup-analysis-threshold',
          label: `Target: ${markupAnalysisThreshold}%`,
          onClear: () => setMarkupAnalysisThreshold(lowMarkupThreshold),
        });
      }
      if (markupAnalysisFilter !== 'all') {
        const filterLabel = markupAnalysisFilter === 'above'
          ? 'Above target'
          : markupAnalysisFilter === 'below'
            ? 'Below target'
            : 'Custom range';
        chips.push({
          key: 'markup-analysis-filter',
          label: `Showing: ${filterLabel}`,
          onClear: () => setMarkupAnalysisFilter('all'),
        });
      }
      if (markupAnalysisCategory !== 'All') {
        chips.push({
          key: 'markup-analysis-category',
          label: `Category: ${markupAnalysisCategory}`,
          onClear: () => setMarkupAnalysisCategory('All'),
        });
      }
      if (markupAnalysisFilter === 'custom' && (markupAnalysisMinRange !== '' || markupAnalysisMaxRange !== '')) {
        chips.push({
          key: 'markup-analysis-range',
          label: `Range: ${markupAnalysisMinRange || '…'}%–${markupAnalysisMaxRange || '…'}%`,
          onClear: () => {
            setMarkupAnalysisMinRange('');
            setMarkupAnalysisMaxRange('');
          },
        });
      }
      return chips;
    }

    if (selectedReport === 'approval-history') {
      const chips: ActiveFilterChip[] = [];
      if (approvalFromDate !== getDefaultApprovalFromDate()) {
        chips.push({
          key: 'approval-from',
          label: `From: ${approvalFromDate}`,
          onClear: () => setApprovalFromDate(getDefaultApprovalFromDate()),
        });
      }
      if (approvalToDate !== getDefaultApprovalToDate()) {
        chips.push({
          key: 'approval-to',
          label: `To: ${approvalToDate}`,
          onClear: () => setApprovalToDate(getDefaultApprovalToDate()),
        });
      }
      if (approvalStatusFilter !== 'All') {
        chips.push({
          key: 'approval-status',
          label: `Status: ${approvalStatusFilter}`,
          onClear: () => setApprovalStatusFilter('All'),
        });
      }
      if (approvalCategoryFilter !== 'All') {
        chips.push({
          key: 'approval-category',
          label: `Category: ${approvalCategoryFilter}`,
          onClear: () => setApprovalCategoryFilter('All'),
        });
      }
      return chips;
    }

    if (selectedReport === 'profitability-ranking') {
      const chips: ActiveFilterChip[] = [];
      if (profitabilityCategoryFilter !== 'All') {
        chips.push({
          key: 'profitability-category',
          label: `Category: ${profitabilityCategoryFilter}`,
          onClear: () => setProfitabilityCategoryFilter('All'),
        });
      }
      if (profitabilitySort !== 'Markup desc') {
        chips.push({
          key: 'profitability-sort',
          label: `Sort: ${profitabilitySort}`,
          onClear: () => setProfitabilitySort('Markup desc'),
        });
      }
      return chips;
    }

    if (selectedReport === 'price-vs-cost-drift') {
      if (driftFilter !== 'Negative only') {
        return [{
          key: 'drift-filter',
          label: 'Showing: All products',
          onClear: () => setDriftFilter('Negative only'),
        }];
      }
      return [];
    }

    if (selectedReport === 'optimal-vs-actual-gap') {
      if (optimalGapFilter !== 'All') {
        return [{
          key: 'optimal-gap-filter',
          label: `Showing: ${optimalGapFilter}`,
          onClear: () => setOptimalGapFilter('All'),
        }];
      }
      return [];
    }

    if (selectedReport === 'materials-cost-analysis') {
      if (materialsCostCategoryFilter !== 'All') {
        return [{
          key: 'materials-cost-category',
          label: `Category: ${materialsCostCategoryFilter}`,
          onClear: () => setMaterialsCostCategoryFilter('All'),
        }];
      }
      return [];
    }

    if (selectedReport === 'price-volatility') {
      if (priceVolatilityPeriod !== '90') {
        const label = priceVolatilityPeriod === '30'
          ? 'Last 30 days'
          : priceVolatilityPeriod === '180'
            ? 'Last 6 months'
            : 'Last 12 months';
        return [{
          key: 'price-volatility-period',
          label: `Period: ${label}`,
          onClear: () => setPriceVolatilityPeriod('90'),
        }];
      }
      return [];
    }

    if (selectedReport === 'product-pricing-overview') {
      const chips: ActiveFilterChip[] = [];
      if (overviewCategoryFilter !== 'All') {
        chips.push({
          key: 'overview-category',
          label: `Category: ${overviewCategoryFilter}`,
          onClear: () => setOverviewCategoryFilter('All'),
        });
      }
      if (overviewApprovalFilter !== 'All') {
        chips.push({
          key: 'overview-approval',
          label: `Approval: ${overviewApprovalFilter}`,
          onClear: () => setOverviewApprovalFilter('All'),
        });
      }
      if (overviewPricingHealthFilter !== 'All') {
        chips.push({
          key: 'overview-pricing-health',
          label: `Pricing position: ${overviewPricingHealthFilter}`,
          onClear: () => setOverviewPricingHealthFilter('All'),
        });
      }
      return chips;
    }

    if (selectedReport === 'material-price-history') {
      if (materialPriceHistoryMaterialId != null) {
        let materialName = 'Selected material';
        if (reportData && selectedReport === 'material-price-history') {
          const historyData = reportData as ReportResultMap['material-price-history'];
          materialName = historyData.materialName
            || historyData.materialOptions.find((material) => material.id === materialPriceHistoryMaterialId)?.name
            || materialName;
        }
        return [{
          key: 'material-price-history-material',
          label: `Material: ${materialName}`,
          onClear: () => setMaterialPriceHistoryMaterialId(null),
        }];
      }
      return [];
    }

    return [];
  }

  function clearAllFiltersForReport() {
    if (!selectedReport) return;
    resetFiltersForReport(selectedReport);
  }

  function renderFilterChips() {
    const chips = getActiveFilterChips();
    if (chips.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '12px', marginBottom: '4px' }}>
        {chips.map((chip) => (
          <span key={chip.key} style={FILTER_CHIP_STYLE}>
            {chip.label}
            <button
              type="button"
              onClick={chip.onClear}
              aria-label={`Clear ${chip.label}`}
              style={FILTER_CHIP_CLEAR_STYLE}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={clearAllFiltersForReport}
          style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600 }}
        >
          Clear all filters
        </button>
      </div>
    );
  }

  function renderEmptyStateGuidance() {
    const hasNonDefaultFilters = getActiveFilterChips().length > 0;

    return (
      <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
        <div style={{ color: '#64748b', fontSize: '14px' }}>
          No results match your current filters
        </div>
        {!hasNonDefaultFilters && (
          <div style={{ color: '#64748b', fontSize: '14px' }}>
            No data available yet. Data will appear here once you have products, approvals, or price levels set up.
          </div>
        )}
      </div>
    );
  }

  function renderFilters() {
    if (!selectedReport) return null;

    if (selectedReport === 'pricing-status') {
      return (
        <>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={pricingCategoryFilter} onChange={(e) => setPricingCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              {pricingCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Pricing Status</label>
            <select className="app-control" value={pricingStatusFilter} onChange={(e) => setPricingStatusFilter(e.target.value as typeof pricingStatusFilter)}>
              <option value="All">All</option>
              <option value="Above Optimal">Above Optimal</option>
              <option value="Below Optimal">Below Optimal</option>
              <option value="At Optimal">At Optimal</option>
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Sort by</label>
            <select className="app-control" value={pricingSort} onChange={(e) => setPricingSort(e.target.value as typeof pricingSort)}>
              <option>Product Name</option>
              <option>Markup % desc</option>
              <option>Markup % asc</option>
              <option>Variance desc</option>
              <option>Variance asc</option>
            </select>
          </div>
        </>
      );
    }

    if (selectedReport === 'markup-analysis') {
      return (
        <>
          <div style={{ ...INLINE_FILTER_FIELD, minWidth: '150px' }}>
            <label className="app-settings-label">Target markup %</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                className="app-control"
                type="number"
                value={markupAnalysisThreshold}
                onChange={(e) => setMarkupAnalysisThreshold(Number(e.target.value || 0))}
              />
              <span style={{ fontWeight: 600 }}>%</span>
            </div>
            <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.35 }}>
              Defaults to your system threshold. Change system default in Settings → Pricing Engine
            </span>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Show</label>
            <select
              className="app-control"
              value={markupAnalysisFilter}
              onChange={(e) => setMarkupAnalysisFilter(e.target.value as typeof markupAnalysisFilter)}
            >
              <option value="all">All products</option>
              <option value="above">Above target</option>
              <option value="below">Below target</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          {markupAnalysisFilter === 'custom' && (
            <>
              <div style={INLINE_FILTER_FIELD}>
                <label className="app-settings-label">Min %</label>
                <input
                  className="app-control"
                  type="number"
                  value={markupAnalysisMinRange}
                  onChange={(e) => setMarkupAnalysisMinRange(e.target.value)}
                />
              </div>
              <div style={INLINE_FILTER_FIELD}>
                <label className="app-settings-label">Max %</label>
                <input
                  className="app-control"
                  type="number"
                  value={markupAnalysisMaxRange}
                  onChange={(e) => setMarkupAnalysisMaxRange(e.target.value)}
                />
              </div>
            </>
          )}
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={markupAnalysisCategory} onChange={(e) => setMarkupAnalysisCategory(e.target.value)}>
              <option value="All">All</option>
              {markupAnalysisCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </>
      );
    }

    if (selectedReport === 'approval-history') {
      return (
        <>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">From</label>
            <input className="app-control" type="date" value={approvalFromDate} onChange={(e) => setApprovalFromDate(e.target.value)} />
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">To</label>
            <input className="app-control" type="date" value={approvalToDate} onChange={(e) => setApprovalToDate(e.target.value)} />
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Approval status</label>
            <select className="app-control" value={approvalStatusFilter} onChange={(e) => setApprovalStatusFilter(e.target.value as typeof approvalStatusFilter)}>
              <option value="All">All</option>
              <option value="approved">Approved</option>
              <option value="needs_review">Needs Review</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={approvalCategoryFilter} onChange={(e) => setApprovalCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              {approvalCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </>
      );
    }

    if (selectedReport === 'profitability-ranking') {
      return (
        <>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={profitabilityCategoryFilter} onChange={(e) => setProfitabilityCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              {productReportCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Sort by</label>
            <select className="app-control" value={profitabilitySort} onChange={(e) => setProfitabilitySort(e.target.value as typeof profitabilitySort)}>
              <option>Markup desc</option>
              <option>Markup asc</option>
              <option>Product Name</option>
            </select>
          </div>
        </>
      );
    }

    if (selectedReport === 'price-vs-cost-drift') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Show</label>
          <select className="app-control" value={driftFilter} onChange={(e) => setDriftFilter(e.target.value as typeof driftFilter)}>
            <option value="Negative only">Negative drift only</option>
            <option value="All">All products</option>
          </select>
        </div>
      );
    }

    if (selectedReport === 'optimal-vs-actual-gap') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Gap filter</label>
          <select className="app-control" value={optimalGapFilter} onChange={(e) => setOptimalGapFilter(e.target.value as typeof optimalGapFilter)}>
            <option value="All">All</option>
            <option value="Above Optimal">Above optimal</option>
            <option value="Below Optimal">Below optimal</option>
          </select>
        </div>
      );
    }

    if (selectedReport === 'materials-cost-analysis') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Category</label>
          <select className="app-control" value={materialsCostCategoryFilter} onChange={(e) => setMaterialsCostCategoryFilter(e.target.value)}>
            <option value="All">All</option>
            {availableMaterialCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      );
    }

    if (selectedReport === 'price-volatility') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Time period</label>
          <select className="app-control" value={priceVolatilityPeriod} onChange={(e) => setPriceVolatilityPeriod(e.target.value as typeof priceVolatilityPeriod)}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
          </select>
        </div>
      );
    }

    if (selectedReport === 'material-price-history') {
      const options = reportData && selectedReport === 'material-price-history'
        ? (reportData as ReportResultMap['material-price-history']).materialOptions
        : [];

      return (
        <div style={{ ...INLINE_FILTER_FIELD, minWidth: '240px' }}>
          <label className="app-settings-label">Material</label>
          <select
            className="app-control"
            value={materialPriceHistoryMaterialId ?? ''}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setMaterialPriceHistoryMaterialId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
            }}
          >
            <option value="">Select material</option>
            {options.map((material) => (
              <option key={material.id} value={material.id}>{material.name}</option>
            ))}
          </select>
        </div>
      );
    }

    if (selectedReport === 'product-pricing-overview') {
      return (
        <>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={overviewCategoryFilter} onChange={(e) => setOverviewCategoryFilter(e.target.value)}>
              <option value="All">All</option>
              {productReportCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Approval status</label>
            <select className="app-control" value={overviewApprovalFilter} onChange={(e) => setOverviewApprovalFilter(e.target.value as typeof overviewApprovalFilter)}>
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="needs_review">Needs Review</option>
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Pricing position</label>
            <select className="app-control" value={overviewPricingHealthFilter} onChange={(e) => setOverviewPricingHealthFilter(e.target.value as typeof overviewPricingHealthFilter)}>
              <option value="All">All</option>
              <option value="Healthy">Healthy</option>
              <option value="Low Markup">Low Markup</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </>
      );
    }

    return null;
  }

  function renderExportButtons() {
    const exportDisabled = !generatedAt || isLoading || !!error || !canExportReport;

    return (
      <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <TableZoomControl zoomPercent={zoomPercent} decreaseZoom={decreaseZoom} increaseZoom={increaseZoom} />
        <button type="button" className="btn btn-outline btn-sm" onClick={handlePrintReport} disabled={exportDisabled}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={14} strokeWidth={2} />
            Print
          </span>
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleExportPDF} disabled={exportDisabled}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} strokeWidth={2} />
            Export PDF
          </span>
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleExportExcel} disabled={exportDisabled}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} strokeWidth={2} />
            Export Excel
          </span>
        </button>
      </div>
    );
  }

  function renderFilterExportRow() {
    return (
      <div style={INLINE_FILTER_ROW_STYLE}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          {renderFilters()}
        </div>
        {renderExportButtons()}
      </div>
    );
  }

  function renderPaginationControls(rowCount: number) {
    if (rowCount === 0) return null;
    const totalPages = getTotalPages(rowCount);

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          style={{ color: currentPage <= 1 ? undefined : '#0F2847' }}
          aria-label="Previous page"
        >
          ←
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          style={{ color: currentPage >= totalPages ? undefined : '#0F2847' }}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    );
  }

  function renderReportBody() {
    if (!selectedReport || !reportData) return null;

    if (selectedReport === 'pricing-status') {
      const data = reportData as ReportResultMap['pricing-status'];
      const withSellingPrice = data.rows.filter((row) => row.hasSellingPrice);
      const aboveCount = withSellingPrice.filter((row) => row.sellingPrice > row.optimalPrice + 0.01).length;
      const belowCount = withSellingPrice.filter((row) => row.sellingPrice < row.optimalPrice - 0.01).length;
      const approvedCount = data.rows.filter((row) => row.approvalStatus === 'approved').length;
      const pendingCount = data.rows.filter((row) => row.approvalStatus === 'pending').length;
      const needsReviewCount = data.rows.filter((row) => row.approvalStatus === 'needs_review').length;
      const markupEligibleRows = withSellingPrice.filter((row) => row.productionCost > 0 && row.sellingPrice > 0);
      const avgMarkupPct = markupEligibleRows.length > 0
        ? markupEligibleRows.reduce((sum, row) => sum + row.markupPct, 0) / markupEligibleRows.length
        : null;
      const paginatedPricingRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Products" value={String(data.rows.length)} secondary={`${approvedCount} approved · ${pendingCount} pending · ${needsReviewCount} needs review`} />
            <StatCard label="Above Optimal" value={String(aboveCount)} tone="success" />
            <StatCard label="Below Optimal" value={String(belowCount)} tone="danger" />
            <StatCard
              label="Avg Markup %"
              value={avgMarkupPct === null ? '—' : formatPct(avgMarkupPct)}
              secondary={`Based on ${markupEligibleRows.length} products with approved base prices set`}
              tone={avgMarkupPct != null && avgMarkupPct >= lowMarkupThreshold ? 'success' : avgMarkupPct != null ? 'warning' : 'default'}
            />
          </div>

          {renderPricingStatusTable(paginatedPricingRows, { formatCurrency, markupThreshold: lowMarkupThreshold })}
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'markup-analysis') {
      const data = reportData as ReportResultMap['markup-analysis'];
      const paginatedRows = paginateRows(data.rows, currentPage);
      const threshold = data.threshold;
      const halfThreshold = threshold / 2;
      const aboveTargetPct = data.totalAnalysed > 0 ? (data.aboveTargetCount / data.totalAnalysed) * 100 : 0;

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Products Analysed" value={String(data.totalAnalysed)} />
            <StatCard label="Above Target" value={String(data.aboveTargetCount)} tone="success" />
            <StatCard label="Below Target" value={String(data.belowTargetCount)} tone="danger" />
            <StatCard
              label="Average Markup"
              value={formatPct(data.averageMarkup)}
              tone={data.averageMarkup >= threshold ? 'success' : data.averageMarkup >= halfThreshold ? 'warning' : 'danger'}
            />
            <StatCard
              label="Distribution"
              value={`${aboveTargetPct.toFixed(0)}% above target`}
              secondary={`Target: ${threshold.toFixed(1)}% markup`}
            />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Production Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>Price</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Actual Markup %</th>
                  <th style={{ textAlign: 'right' }}>Target Gap</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.productName}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <ThresholdMarkupBar value={row.actualMarkupPercent} threshold={threshold} />
                    </td>
                    <td style={{ textAlign: 'right', color: row.targetGap >= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                      {formatPct(row.targetGap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
          <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
            Actual markup = (Approved Price − Production Cost) / Production Cost × 100. Target gap = Actual Markup % − target threshold. Only approved products with price and cost are included.
          </div>
        </div>
      );
    }

    if (selectedReport === 'price-list-summary') {
      const data = reportData as ReportResultMap['price-list-summary'];
      const paginatedPriceListRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Price Lists" value={String(data.rows.length)} />
            <StatCard label="Active" value={String(data.activeCount)} tone="success" />
            <StatCard label="Expiring Within 30 Days" value={String(data.expiringSoonCount)} tone="warning" />
            <StatCard label="Expired" value={String(data.expiredCount)} tone="danger" />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Price List Name</th>
                  <th style={{ textAlign: 'left' }}>Type</th>
                  <th style={{ textAlign: 'left', whiteSpace: 'normal', minWidth: '70px' }}>Customer /<br/>Level</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '70px' }}>Products<br/>Covered</th>
                  <th style={{ textAlign: 'left' }}>Valid From</th>
                  <th style={{ textAlign: 'left' }}>Valid Until</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '70px' }}>Days Until<br/>Expiry</th>
                  <th style={{ textAlign: 'left' }}>Last Updated</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPriceListRows.map((row, index) => {
                  const expiry = row.daysUntilExpiry;
                  const expiresThisWeek = expiry !== null && expiry <= 7 && expiry >= 0;
                  const expiringSoon = expiry !== null && expiry > 7 && expiry <= 30;
                  const expired = expiry !== null && expiry < 0;

                  return (
                    <tr key={`${row.priceListName}-${index}`}>
                      <td style={{ textAlign: 'left' }}>{row.priceListName}</td>
                      <td style={{ textAlign: 'left' }}>{row.listType}</td>
                      <td style={{ textAlign: 'left' }}>{row.customerOrLevel}</td>
                      <td style={{ textAlign: 'right' }}>{row.productsCovered}</td>
                      <td style={{ textAlign: 'left' }}>{row.validFrom}</td>
                      <td style={{ textAlign: 'left', textDecoration: expired ? 'line-through' : 'none', color: expired || expiresThisWeek ? '#b91c1c' : expiringSoon ? '#b45309' : undefined }}>
                        {row.validUntil}
                      </td>
                      <td style={{ textAlign: 'right', color: expired || expiresThisWeek ? '#b91c1c' : expiringSoon ? '#b45309' : undefined }}>
                        {expiry === null ? '—' : expiry}
                        {expiresThisWeek && <span style={{ marginLeft: '6px' }}><AppBadge variant="danger" size="sm">Expires This Week</AppBadge></span>}
                        {expiringSoon && <span style={{ marginLeft: '6px' }}><AppBadge variant="warning" size="sm">Expiring Soon</AppBadge></span>}
                      </td>
                      <td style={{ textAlign: 'left' }}>{row.lastUpdated}</td>
                      <td style={{ textAlign: 'left' }}>{row.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'approval-history') {
      const data = reportData as ReportResultMap['approval-history'];
      const approved = data.rows.filter((row) => row.currentStatus === 'approved').length;
      const pending = data.rows.filter((row) => row.currentStatus === 'pending').length;
      const needsReview = data.rows.filter((row) => row.currentStatus === 'needs_review').length;
      const paginatedApprovalRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Products" value={String(data.rows.length)} />
            <StatCard label="Approved" value={String(approved)} tone="success" />
            <StatCard label="Pending" value={String(pending)} tone="default" />
            <StatCard label="Needs Review" value={String(needsReview)} tone="warning" />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'left' }}>Current Status</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                  <th style={{ textAlign: 'right' }}>Optimal Price</th>
                  <th style={{ textAlign: 'right' }}>Actual Markup %</th>
                  <th style={{ textAlign: 'left' }}>Approved On</th>
                  <th style={{ textAlign: 'left' }}>Approved By</th>
                  <th style={{ textAlign: 'left' }}>Active?</th>
                </tr>
              </thead>
              <tbody>
                {paginatedApprovalRows.map((row, index) => (
                  <tr key={`${row.productName}-${index}`}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'left' }}><AppBadge variant={statusBadgeVariant(row.currentStatus)} size="sm">{row.currentStatus}</AppBadge></td>
                    <td style={{ textAlign: 'right' }}>{row.approvedPrice === null ? '—' : formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.optimalPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{row.actualMarkupPercent == null ? '—' : formatPct(row.actualMarkupPercent)}</td>
                    <td style={{ textAlign: 'left' }}>{parseDate(row.approvedOn)?.toLocaleString() || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{row.approvedBy}</td>
                    <td style={{ textAlign: 'left' }}>{row.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}

          <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
            † Optimal price shown is current calculated value. Historical optimal price at time of approval is not stored.
          </div>
        </div>
      );
    }

    if (selectedReport === 'margin-health') {
      const data = reportData as ReportResultMap['margin-health'];
      return (
        <div id="reporting-centre-print-area">
          <ProductsAnalysisTab
            products={data.products}
            lowMarginThreshold={lowMarkupThreshold}
          />
        </div>
      );
    }

    if (selectedReport === 'product-pricing-overview') {
      const data = reportData as ReportResultMap['product-pricing-overview'];
      const paginatedRows = paginateRows(data.rows, currentPage);
      const halfThreshold = lowMarkupThreshold / 2;
      const markupHealthCards = [
        {
          count: data.healthyMarkupCount,
          label: 'Healthy markup',
          sub: `Actual Markup % >= ${lowMarkupThreshold}%`,
          color: '#16a34a',
          background: '#f0fdf4',
          border: '#bbf7d0',
        },
        {
          count: data.lowMarkupCount,
          label: 'Low markup',
          sub: `Actual Markup % ${halfThreshold.toFixed(1)}-${lowMarkupThreshold}%`,
          color: '#d97706',
          background: '#fffbeb',
          border: '#fde68a',
        },
        {
          count: data.criticalMarkupCount,
          label: 'Critical markup',
          sub: `Actual Markup % < ${halfThreshold.toFixed(1)}%`,
          color: '#dc2626',
          background: '#fef2f2',
          border: '#fecaca',
        },
        {
          count: data.notPricedCount,
          label: 'Not priced',
          sub: 'No approved price',
          color: '#6b7280',
          background: '#f9fafb',
          border: '#e5e7eb',
        },
      ];

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Active Products" value={String(data.totalActiveProducts)} />
            <StatCard label="Approved" value={String(data.approvedCount)} tone="success" />
            <StatCard label="Pending Approval" value={String(data.pendingCount)} tone="warning" />
            <StatCard label="Needs Review" value={String(data.needsReviewCount)} tone="warning" />
            <StatCard label="Healthy Markup" value={String(data.healthyMarkupCount)} tone="success" />
            <StatCard label="Low Markup" value={String(data.lowMarkupCount)} tone="warning" />
            <StatCard label="Critical Markup" value={String(data.criticalMarkupCount)} tone="danger" />
          </div>

          <div className="app-card" style={{ display: 'grid', gap: '10px', marginBottom: '14px', padding: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F2847' }}>Pricing health</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
              {markupHealthCards.map((card) => (
                <div
                  key={card.label}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '16px',
                    borderRadius: '10px',
                    border: `1px solid ${card.border}`,
                    backgroundColor: card.background,
                    display: 'grid',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '30px', fontWeight: 700, color: card.color, fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1 }}>
                    {card.count}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{card.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 400, color: '#6b7280' }}>{card.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Production Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>Base Price</th>
                  <th style={{ textAlign: 'right' }}>Optimal Price</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Actual Markup %</th>
                  <th style={{ textAlign: 'left' }}>Approval Status</th>
                  <th style={{ textAlign: 'left' }}>Pricing Health</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.productId}>
                    <td style={{ textAlign: 'left' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${row.productId}`)}
                        style={{ border: 'none', background: 'transparent', color: '#0F2847', cursor: 'pointer', fontWeight: 600, padding: 0, textAlign: 'left' }}
                      >
                        {row.productName}
                      </button>
                    </td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
                    <td style={{ textAlign: 'right' }}>{row.approvedPrice == null ? '—' : formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.optimalPrice)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {row.actualMarkupPercent == null ? '—' : (
                        <ThresholdMarkupBar value={row.actualMarkupPercent} threshold={lowMarkupThreshold} />
                      )}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <AppBadge variant={statusBadgeVariant(row.approvalStatus)} size="sm">
                        {row.approvalStatus === 'needs_review' ? 'Needs Review' : row.approvalStatus === 'approved' ? 'Approved' : 'Pending'}
                      </AppBadge>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <AppBadge variant={pricingHealthBadgeVariant(row.pricingHealth)} size="sm">
                        {row.pricingHealth}
                      </AppBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'profitability-ranking') {
      const data = reportData as ReportResultMap['profitability-ranking'];
      const paginatedProfitabilityRows = paginateRows(data.rows, currentPage);
      const rankOffset = (currentPage - 1) * ROWS_PER_PAGE;

      return (
        <div id="reporting-centre-print-area">
          <div style={{ marginBottom: '14px', fontSize: '15px', color: '#334155', fontWeight: 600 }}>
            {data.rankedCount} product{data.rankedCount === 1 ? '' : 's'} ranked by profitability
          </div>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', width: '56px' }}>Rank</th>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Production Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '120px' }}>Actual Markup %</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProfitabilityRows.map((row, index) => (
                  <tr key={`${row.productName}-${index}`}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{rankOffset + index + 1}</td>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <ThresholdMarkupBar value={row.actualMarkupPercent} threshold={lowMarkupThreshold} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'price-vs-cost-drift') {
      const data = reportData as ReportResultMap['price-vs-cost-drift'];
      const paginatedDriftRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ marginBottom: '14px', fontSize: '15px', color: '#334155', fontWeight: 600 }}>
            {data.affectedCount} product{data.affectedCount === 1 ? '' : 's'} with cost changes affecting markup
          </div>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                  <th style={{ textAlign: 'right' }}>Current Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Current Markup %</th>
                  <th style={{ textAlign: 'right' }}>Target Markup %</th>
                  <th style={{ textAlign: 'right' }}>Markup Drift</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDriftRows.map((row, index) => (
                  <tr key={`${row.productName}-${index}`}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPct(row.currentMarkupPercent)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPct(row.targetMarkupPercent)}</td>
                    <td style={{ textAlign: 'right', color: row.markupDrift >= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                      {formatPct(row.markupDrift)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
          <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
            Markup drift compares current Actual Markup % to the target markup stored at approval (profit margin). Negative drift means costs have risen since approval.
          </div>
        </div>
      );
    }

    if (selectedReport === 'optimal-vs-actual-gap') {
      const data = reportData as ReportResultMap['optimal-vs-actual-gap'];
      const paginatedGapRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ marginBottom: '14px', fontSize: '15px', color: '#334155', fontWeight: 600 }}>
            {data.aboveCount} product{data.aboveCount === 1 ? '' : 's'} approved above optimal · {data.belowCount} below optimal · {data.atOptimalCount} at optimal
          </div>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Optimal Price</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                  <th style={{ textAlign: 'right' }}>Gap</th>
                  <th style={{ textAlign: 'right' }}>Gap %</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGapRows.map((row, index) => {
                  const gapColor = row.gapPercent >= 0
                    ? '#166534'
                    : row.gapPercent >= -10
                      ? '#d97706'
                      : '#b91c1c';
                  return (
                    <tr key={`${row.productName}-${index}`}>
                      <td style={{ textAlign: 'left' }}>{row.productName}</td>
                      <td style={{ textAlign: 'left' }}>{row.category}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.optimalPrice)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                      <td style={{ textAlign: 'right', color: gapColor, fontWeight: 600 }}>{formatSignedNumber(row.gap)}</td>
                      <td style={{ textAlign: 'right', color: gapColor, fontWeight: 600 }}>{formatPct(row.gapPercent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'materials-cost-analysis') {
      const data = reportData as ReportResultMap['materials-cost-analysis'];
      const paginatedRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Active Materials" value={String(data.totalActiveMaterials)} />
            <StatCard label="Average Unit Cost" value={formatCurrency(data.averageUnitCost)} />
            <StatCard label="Most Expensive Material" value={data.mostExpensiveName} secondary={formatCurrency(data.mostExpensiveCost)} />
            <StatCard label="Categories" value={String(data.categoryCount)} />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Material Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'left' }}>Unit</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Used in Products</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <tr key={`${row.materialName}-${index}`}>
                    <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'left' }}>{row.unit}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.unitCost)}</td>
                    <td style={{ textAlign: 'right' }}>{row.productsUsedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'top-cost-drivers') {
      const data = reportData as ReportResultMap['top-cost-drivers'];
      const paginatedRows = paginateRows(data.rows, currentPage);
      const rankOffset = (currentPage - 1) * ROWS_PER_PAGE;

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Materials in BOMs" value={String(data.totalMaterialsInBoms)} />
            <StatCard label="Total Weighted Cost" value={formatCurrency(data.totalWeightedCost)} />
            <StatCard label="Most Impactful Material" value={data.mostImpactfulMaterial} />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', width: '56px' }}>Rank</th>
                  <th style={{ textAlign: 'left' }}>Material Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Times Used in BOMs</th>
                  <th style={{ textAlign: 'right' }}>Total BOM Contribution</th>
                  <th style={{ textAlign: 'right' }}>% of Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <tr key={`${row.materialName}-${index}`}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{rankOffset + index + 1}</td>
                    <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.unitCost)}</td>
                    <td style={{ textAlign: 'right' }}>{row.bomUsageCount}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.totalContribution)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '100px', height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(0, row.percentOfTotal))}%`, height: '100%', backgroundColor: '#16a34a', borderRadius: '999px' }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{formatPct(row.percentOfTotal)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPaginationControls(data.rows.length)}
        </div>
      );
    }

    if (selectedReport === 'price-volatility') {
      const data = reportData as ReportResultMap['price-volatility'];
      const paginatedRows = paginateRows(data.rows, currentPage);

      if (!data.endpointAvailable) {
        return (
          <div id="reporting-centre-print-area">
            <div style={{ color: '#64748b', fontSize: '14px' }}>
              Price history data not available — prices are recorded when materials are updated
            </div>
          </div>
        );
      }

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Materials with Price Changes" value={String(data.materialsWithChanges)} />
            <StatCard label="Average Change %" value={formatPct(data.averageChangePercent)} />
            <StatCard label="Biggest Increase" value={data.biggestIncreaseName} secondary={formatPct(data.biggestIncreasePercent)} tone="danger" />
            <StatCard label="Biggest Decrease" value={data.biggestDecreaseName} secondary={formatPct(data.biggestDecreasePercent)} tone="success" />
          </div>

          {data.rows.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px' }}>
              No materials had price changes in the selected period.
            </div>
          ) : (
            <>
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Material Name</th>
                      <th style={{ textAlign: 'left' }}>Category</th>
                      <th style={{ textAlign: 'left' }}>Unit</th>
                      <th style={{ textAlign: 'right' }}>Cost at Start of Period</th>
                      <th style={{ textAlign: 'right' }}>Current Cost</th>
                      <th style={{ textAlign: 'right' }}>Change Amount</th>
                      <th style={{ textAlign: 'right' }}>Change %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, index) => {
                      const changeColor = row.changePercent < 0 ? '#166534' : row.changePercent > 0 ? '#b91c1c' : '#64748b';
                      return (
                        <tr key={`${row.materialName}-${index}`}>
                          <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                          <td style={{ textAlign: 'left' }}>{row.category}</td>
                          <td style={{ textAlign: 'left' }}>{row.unit}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(row.costAtStart)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentCost)}</td>
                          <td style={{ textAlign: 'right', color: changeColor, fontWeight: 600 }}>{formatSignedNumber(row.changeAmount)}</td>
                          <td style={{ textAlign: 'right', color: changeColor, fontWeight: 600 }}>{formatPct(row.changePercent)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPaginationControls(data.rows.length)}
            </>
          )}
        </div>
      );
    }

    if (selectedReport === 'material-price-history') {
      const data = reportData as ReportResultMap['material-price-history'];

      if (!data.materialId) {
        return (
          <div id="reporting-centre-print-area">
            <div style={{ color: '#64748b', fontSize: '14px' }}>
              Select a material above to view its price history
            </div>
          </div>
        );
      }

      const paginatedRows = paginateRows(data.rows, currentPage);
      const trendLabel = data.costTrend === 'up' ? 'Up' : data.costTrend === 'down' ? 'Down' : 'Stable';
      const trendTone = data.costTrend === 'up' ? 'danger' : data.costTrend === 'down' ? 'success' : 'default';

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Current Cost" value={formatCurrency(data.currentCost)} />
            <StatCard label="First Recorded Cost" value={data.firstRecordedCost == null ? '—' : formatCurrency(data.firstRecordedCost)} />
            <StatCard label="Price Changes" value={String(data.priceChangeCount)} />
            <StatCard label="Cost Trend" value={trendLabel} tone={trendTone as 'default' | 'success' | 'danger'} />
          </div>

          {data.rows.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px' }}>No price changes recorded for this material.</div>
          ) : (
            <>
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'right' }}>Old Cost</th>
                      <th style={{ textAlign: 'right' }}>New Cost</th>
                      <th style={{ textAlign: 'right' }}>Change Amount</th>
                      <th style={{ textAlign: 'right' }}>Change %</th>
                      <th style={{ textAlign: 'left' }}>Changed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, index) => (
                      <tr key={`${row.date}-${index}`}>
                        <td style={{ textAlign: 'left' }}>{row.date}</td>
                        <td style={{ textAlign: 'right' }}>{row.oldCost == null ? '—' : formatCurrency(row.oldCost)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(row.newCost)}</td>
                        <td style={{ textAlign: 'right' }}>{row.changeAmount == null ? '—' : formatSignedNumber(row.changeAmount)}</td>
                        <td style={{ textAlign: 'right' }}>{row.changePercent == null ? '—' : formatPct(row.changePercent)}</td>
                        <td style={{ textAlign: 'left' }}>{row.changedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPaginationControls(data.rows.length)}
            </>
          )}
        </div>
      );
    }

    if (selectedReport === 'inactive-in-boms') {
      const data = reportData as ReportResultMap['inactive-in-boms'];
      const paginatedRows = paginateRows(data.rows, currentPage);

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Inactive Materials" value={String(data.totalInactiveMaterials)} />
            <StatCard label="Inactive in Active BOMs" value={String(data.inactiveAffectingProducts)} tone={data.inactiveAffectingProducts > 0 ? 'warning' : 'success'} />
            <StatCard label="Products Affected" value={String(data.productsAffected)} tone={data.productsAffected > 0 ? 'danger' : 'success'} />
          </div>

          {data.rows.length === 0 ? (
            <div style={{ padding: '16px', borderRadius: '8px', background: '#ecfdf5', color: '#166534', fontSize: '14px' }}>
              All materials in your active product BOMs are currently active. No action needed.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontSize: '14px' }}>
                These materials are marked inactive but are still referenced in active product BOMs. Review and update your BOMs or reactivate these materials.
              </div>
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr style={{ backgroundColor: '#fef2f2' }}>
                      <th style={{ textAlign: 'left' }}>Material Name</th>
                      <th style={{ textAlign: 'left' }}>Category</th>
                      <th style={{ textAlign: 'left' }}>Status</th>
                      <th style={{ textAlign: 'left' }}>Products Using It</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, index) => (
                      <tr key={`${row.materialName}-${index}`}>
                        <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                        <td style={{ textAlign: 'left' }}>{row.category}</td>
                        <td style={{ textAlign: 'left' }}>{row.status}</td>
                        <td style={{ textAlign: 'left' }}>{row.productNames.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPaginationControls(data.rows.length)}
            </>
          )}
        </div>
      );
    }

    if (selectedReport === 'currency-exposure') {
    const data = reportData as ReportResultMap['currency-exposure'];
    const paginatedCurrencyRows = paginateRows(data.rows, currentPage);

    return (
      <div id="reporting-centre-print-area">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
          <StatCard label="Total Materials" value={String(data.totalMaterials)} />
          <StatCard label="Currencies Used" value={String(data.rows.length)} />
        </div>

        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Currency</th>
                <th style={{ textAlign: 'left' }}>Currency Code</th>
                <th style={{ textAlign: 'right' }}>Materials Count</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Current Rate<br/>to {baseCurrency}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCurrencyRows.map((row) => (
                <tr key={row.currencyCode} style={{ backgroundColor: row.isBaseCurrency ? '#f8fafc' : undefined }}>
                  <td style={{ textAlign: 'left' }}>{row.currencyName}</td>
                  <td style={{ textAlign: 'left' }}>{row.currencyCode}</td>
                  <td style={{ textAlign: 'right' }}>{row.materialsCount}</td>
                  <td style={{ textAlign: 'right' }}>{row.currentRateToGhs.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPaginationControls(data.rows.length)}

        <div style={{ marginTop: '14px' }}>
          <strong>Materials by Currency</strong>
          <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
            {data.rows.map((row) => {
              const expanded = expandedCurrencyCodes.has(row.currencyCode);
              return (
                <div key={row.currencyCode} style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedCurrencyCodes);
                      if (next.has(row.currencyCode)) next.delete(row.currencyCode);
                      else next.add(row.currencyCode);
                      setExpandedCurrencyCodes(next);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: 'none',
                      background: '#fff',
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{row.currencyCode} · {row.materials.length} materials</span>
                    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 12px' }}>
                      <div className="app-table-wrap">
                        <table className="app-table">
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>Material Name</th>
                              <th style={{ textAlign: 'right' }}>Unit Price ({baseCurrency})</th>
                              <th style={{ textAlign: 'right' }}>Original Price</th>
                              <th style={{ textAlign: 'left' }}>Category</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.materials.map((material) => (
                              <tr key={`${row.currencyCode}-${material.materialName}`}>
                                <td style={{ textAlign: 'left' }}>{material.materialName}</td>
                                <td style={{ textAlign: 'right' }}>{formatCurrency(material.unitPriceGhs)}</td>
                                <td style={{ textAlign: 'right' }}>{material.originalPrice.toFixed(4)} {material.purchaseCurrency}</td>
                                <td style={{ textAlign: 'left' }}>{material.category}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
          Shows how many active materials are purchased in each currency. Expand a currency to see individual materials and current exchange rates.
        </div>
      </div>
    );
    }

    return null;
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <h1 className="app-page-title">Reports & Analysis</h1>
        <div className="app-section-tabs" role="tablist" aria-label="Report groups">
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'pricing'}
            className={`app-section-tab ${activeGroup === 'pricing' ? 'is-active' : ''}`}
            onClick={() => handleGroupTabChange('pricing')}
          >
            Pricing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'products'}
            className={`app-section-tab ${activeGroup === 'products' ? 'is-active' : ''}`}
            onClick={() => handleGroupTabChange('products')}
          >
            Products
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'materials'}
            className={`app-section-tab ${activeGroup === 'materials' ? 'is-active' : ''}`}
            onClick={() => handleGroupTabChange('materials')}
          >
            Materials
          </button>
        </div>
      </div>

      <div ref={pageContentRef} className="app-page-content app-page-content--data">
        {(activeGroup === 'pricing' || activeGroup === 'products') && (
          <div style={{ ...REPORT_SELECTOR_STICKY_STYLE, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {GROUP_REPORT_KEYS[activeGroup].map((reportKey) => {
              const report = REPORT_METADATA_BY_KEY[reportKey];
              const isActive = selectedReport === reportKey;
              return (
                <button
                  key={reportKey}
                  type="button"
                  onClick={() => selectReport(reportKey)}
                  style={{
                    ...REPORT_PILL_STYLE,
                    ...(isActive ? REPORT_PILL_ACTIVE_STYLE : REPORT_PILL_INACTIVE_STYLE),
                  }}
                >
                  {report.pillLabel}
                </button>
              );
            })}
          </div>
        )}

        {activeGroup === 'materials' && (
          <div style={{ ...REPORT_SELECTOR_STICKY_STYLE, display: 'grid', gap: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#16A34A' }}>
              Active report: {selectedMeta.pillLabel}
            </div>
            <select
              className="app-control"
              value={selectedReport}
              onChange={(event) => {
                const nextValue = event.target.value as ReportKey;
                if (GROUP_REPORT_KEYS.materials.includes(nextValue)) {
                  selectReport(nextValue);
                }
              }}
              style={{
                maxWidth: '280px',
                width: '100%',
                borderLeft: '3px solid #16A34A',
              }}
              aria-label="Select materials report"
            >
              <option value="" disabled>Select report</option>
              {MATERIALS_DROPDOWN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="app-card" style={{ padding: '16px' }}>
          <div style={{ marginBottom: '4px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selectedMeta.name}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '15px' }}>{selectedMeta.description}</p>
            {generatedAt && (
              <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '13px' }}>
                Generated: {generatedAt.toLocaleString()}
              </div>
            )}
          </div>

          {renderFilterExportRow()}

          {renderFilterChips()}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '36px 0', color: '#334155' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Loading report data...
            </div>
          )}

          {!isLoading && error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
              {error}
            </div>
          )}

          {!isLoading && !error && !shouldShowReportBody && (
            <div style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
              No data matches the selected filters.
              {renderEmptyStateGuidance()}
            </div>
          )}

          {!isLoading && !error && shouldShowReportBody && (
            <div style={{ zoom: `${zoomPercent}%` }}>
              {renderReportBody()}
            </div>
          )}
        </div>
      </div>
      <MarginLegendCard />
    </div>
  );
}

function ThresholdMarkupBar({ value, threshold }: { value: number; threshold: number }) {
  const color = getThresholdMarkupColor(value, threshold);
  const scaleMax = Math.min(threshold * 2, 100);
  const widthPercent = scaleMax > 0 ? Math.min(100, Math.max(0, (value / scaleMax) * 100)) : 0;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div style={{ width: '120px', height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${widthPercent}%`, height: '100%', backgroundColor: color, borderRadius: '999px' }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>{formatPct(value)}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
  secondary,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  secondary?: string;
}) {
  const colorByTone = tone === 'success'
    ? '#166534'
    : tone === 'danger'
      ? '#b91c1c'
      : tone === 'warning'
        ? '#92400e'
        : '#0f172a';

  const backgroundByTone = tone === 'success'
    ? '#f0fdf4'
    : tone === 'danger'
      ? '#fef2f2'
      : tone === 'warning'
        ? '#fffbeb'
        : '#f8fafc';

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', backgroundColor: backgroundByTone }}>
      <div style={{ fontSize: '13px', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: colorByTone }}>{value}</div>
      {secondary && <div style={{ marginTop: '2px', fontSize: '13px', color: '#64748b' }}>{secondary}</div>}
    </div>
  );
}

function renderPricingStatusTable(
  rows: PricingStatusComputedRow[],
  options?: { noSellingPriceMode?: boolean; formatCurrency?: (value: number) => string; markupThreshold?: number },
) {
  const noSellingPriceMode = options?.noSellingPriceMode === true;
  const formatMoney = options?.formatCurrency ?? ((value: number) => formatCurrencyAmount(value, 'GHS'));
  const markupThreshold = options?.markupThreshold ?? 20;

  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Product Name</th>
            <th style={{ textAlign: 'left' }}>Approval</th>
            <th style={{ textAlign: 'left' }}>Category</th>
            <th style={{ textAlign: 'right' }}>Prod. Cost</th>
            <th style={{ textAlign: 'right' }}>Optimal Price</th>
            <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
            <th style={{ textAlign: 'right' }}>Variance</th>
            <th style={{ textAlign: 'right' }}>Profit</th>
            <th style={{ textAlign: 'right' }}>Actual Markup %</th>
            <th style={{ textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productName}>
              <td style={{ textAlign: 'left' }}>{row.productName}</td>
              <td style={{ textAlign: 'left' }}>
                <AppBadge variant={statusBadgeVariant(row.approvalStatus)} size="sm">
                  {approvalStatusLabel(row.approvalStatus)}
                </AppBadge>
              </td>
              <td style={{ textAlign: 'left' }}>{row.category}</td>
              <td style={{ color: '#64748b', textAlign: 'right' }}>{formatMoney(row.productionCost)}</td>
              <td style={{ color: '#64748b', textAlign: 'right' }}>{formatMoney(row.optimalPrice)}</td>
              <td style={{ textAlign: 'right' }}>{row.hasSellingPrice && !noSellingPriceMode ? formatMoney(row.sellingPrice) : '—'}</td>
              <td style={{ textAlign: 'right', color: row.variance < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{row.hasSellingPrice && !noSellingPriceMode ? formatSignedNumber(row.variance) : '—'}</td>
              <td style={{ textAlign: 'right', color: row.profit < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{row.hasSellingPrice && !noSellingPriceMode ? formatSignedNumber(row.profit) : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {row.hasSellingPrice && !noSellingPriceMode ? (
                  <ThresholdMarkupBar value={row.markupPct} threshold={markupThreshold} />
                ) : '—'}
              </td>
              <td style={{ textAlign: 'left' }}>
                {row.hasSellingPrice && !noSellingPriceMode ? (
                  <AppBadge variant={row.pricingStatus === 'Above Optimal' ? 'success' : row.pricingStatus === 'Below Optimal' ? 'danger' : 'info'} size="sm">
                    {row.pricingStatus}
                  </AppBadge>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
