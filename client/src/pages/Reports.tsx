import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import AppBadge from '../components/AppBadge';
import ReportWrapper from '../components/ReportWrapper';
import { currenciesApi, exchangeRatesApi, materialsApi, priceListsApi, productsApi, settingsApi } from '../api';
import { exportToExcel, exportToExcelWorkbook, exportToPDF } from '../utils/reportExport';
import { usePrint } from '../hooks/usePrint';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { formatCurrency as formatCurrencyAmount } from '../utils/currency';
import type { ColumnDef, ReportRow } from '../utils/reportExport';

type ReportKey =
  | 'pricing-status'
  | 'low-margin'
  | 'price-list-summary'
  | 'approval-history'
  | 'currency-exposure';

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
  purchaseCurrencyId: number;
  purchaseCurrencyCode?: string;
  unitPrice: number | string;
  bulkPrice: number | string;
  bulkQuantity: number | string;
  isActive: boolean;
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
  profitPct: number;
  pricingStatus: 'Above Optimal' | 'Below Optimal' | 'At Optimal';
};

type LowMarginComputedRow = {
  productName: string;
  category: string;
  currentSellingPrice: number;
  productionCost: number;
  realisedMargin: number;
  targetMargin: number;
  gap: number;
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
  actualGrossMarginPercent: number | null;
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
  'low-margin': {
    rows: LowMarginComputedRow[];
    threshold: number;
    allApprovedAverage: number;
    reviewedCount: number;
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
};

const REPORT_METADATA: Array<{
  key: ReportKey;
  name: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: 'pricing-status',
    name: 'Pricing Status Report',
    description: 'Approved base price vs optimal across all products',
    icon: TrendingUp,
  },
  {
    key: 'low-margin',
    name: 'Low Margin Report',
    description: 'Products with realised margin below threshold',
    icon: AlertTriangle,
  },
  {
    key: 'price-list-summary',
    name: 'Price List Summary',
    description: 'All price lists and their coverage',
    icon: FileText,
  },
  {
    key: 'approval-history',
    name: 'Approval History',
    description: 'Product price approvals with dates',
    icon: ShieldCheck,
  },
  {
    key: 'currency-exposure',
    name: 'Currency Exposure Report',
    description: 'Material cost exposure by currency',
    icon: RefreshCw,
  },
];

const DEFAULT_LOW_MARGIN_THRESHOLD = 20;

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

export default function Reports() {
  const { baseCurrency } = useBaseCurrency();
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const text = formatCurrencyAmount(absValue, baseCurrency);
    return value < 0 ? `(${text})` : text;
  };
  const [selectedReport, setSelectedReport] = useState<ReportKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [reportData, setReportData] = useState<ReportResultMap[ReportKey] | null>(null);
  const [expandedCurrencyCodes, setExpandedCurrencyCodes] = useState<Set<string>>(new Set());
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [defaultLowMarginThreshold, setDefaultLowMarginThreshold] = useState(DEFAULT_LOW_MARGIN_THRESHOLD);

  const [pricingCategoryFilter, setPricingCategoryFilter] = useState('All');
  const [pricingStatusFilter, setPricingStatusFilter] = useState<'All' | 'Above Optimal' | 'Below Optimal' | 'At Optimal'>('All');
  const [pricingSort, setPricingSort] = useState<'Product Name' | 'Profit % desc' | 'Profit % asc' | 'Variance desc' | 'Variance asc'>('Product Name');

  const [lowMarginThreshold, setLowMarginThreshold] = useState(DEFAULT_LOW_MARGIN_THRESHOLD);
  const [lowMarginCategoryFilter, setLowMarginCategoryFilter] = useState('All');

  const [approvalFromDate, setApprovalFromDate] = useState(getDefaultApprovalFromDate);
  const [approvalToDate, setApprovalToDate] = useState(getDefaultApprovalToDate);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | 'approved' | 'needs_review' | 'pending'>('All');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState('All');

  const selectedMeta = REPORT_METADATA.find((item) => item.key === selectedReport) || null;
  const { handlePrint } = usePrint();

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
    let cancelled = false;

    async function loadDefaultThreshold() {
      try {
        const settings = await settingsApi.getAll();
        if (cancelled) return;
        const marginSetting = settings.find((entry: { settingKey: string; settingValue: string }) => entry.settingKey === 'defaultProfitMargin');
        if (marginSetting?.settingValue) {
          const parsed = Number(marginSetting.settingValue);
          if (Number.isFinite(parsed) && parsed > 0) {
            setDefaultLowMarginThreshold(parsed);
            setLowMarginThreshold((current) => (current === DEFAULT_LOW_MARGIN_THRESHOLD ? parsed : current));
          }
        }
      } catch {
        // Keep default threshold.
      }
    }

    void loadDefaultThreshold();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedReport) return;
    void generateReport();
  }, [
    selectedReport,
    pricingCategoryFilter,
    pricingStatusFilter,
    pricingSort,
    lowMarginThreshold,
    lowMarginCategoryFilter,
    approvalFromDate,
    approvalToDate,
    approvalStatusFilter,
    approvalCategoryFilter,
    baseCurrency,
  ]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData) return 0;
    return Array.isArray((reportData as any).rows) ? (reportData as any).rows.length : 0;
  }, [reportData]);

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
          const profitPct = hasApprovedPrice && sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
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
            profitPct,
            pricingStatus,
          };
        });

        const filtered = rows
          .filter((row) => (pricingCategoryFilter === 'All' ? true : row.category === pricingCategoryFilter))
          .filter((row) => (pricingStatusFilter === 'All' ? true : row.pricingStatus === pricingStatusFilter));

        filtered.sort((a, b) => {
          if (pricingSort === 'Product Name') return a.productName.localeCompare(b.productName);
          if (pricingSort === 'Profit % desc') return b.profitPct - a.profitPct;
          if (pricingSort === 'Profit % asc') return a.profitPct - b.profitPct;
          if (pricingSort === 'Variance desc') return b.variance - a.variance;
          return a.variance - b.variance;
        });

        setReportData({ rows: filtered });
      }

      if (selectedReport === 'low-margin') {
        const products = (await productsApi.getAll('all')) as ProductRow[];
        const approvedActive = products.filter((p) => {
          const approvedPrice = p.approvedPrice != null ? toNumber(p.approvedPrice) : 0;
          return p.approvalStatus === 'approved' && p.isActive && approvedPrice > 0 && toNumber(p.productionCost) > 0;
        });

        const allRows = approvedActive.map((product) => {
          const approvedPrice = toNumber(product.approvedPrice);
          const productionCost = toNumber(product.productionCost);
          const realisedMargin = approvedPrice > 0 ? ((approvedPrice - productionCost) / approvedPrice) * 100 : 0;
          const targetMargin = toNumber(product.profitMargin);
          const gap = realisedMargin - targetMargin;

          return {
            productName: product.name,
            category: product.category || 'Uncategorised',
            currentSellingPrice: approvedPrice,
            productionCost,
            realisedMargin,
            targetMargin,
            gap,
          };
        });

        const avgAcrossAllApproved = allRows.length > 0
          ? allRows.reduce((sum, row) => sum + row.realisedMargin, 0) / allRows.length
          : 0;

        const belowThreshold = allRows
          .filter((row) => row.realisedMargin < lowMarginThreshold)
          .filter((row) => (lowMarginCategoryFilter === 'All' ? true : row.category === lowMarginCategoryFilter))
          .sort((a, b) => a.realisedMargin - b.realisedMargin);

        setReportData({
          rows: belowThreshold,
          threshold: lowMarginThreshold,
          allApprovedAverage: avgAcrossAllApproved,
          reviewedCount: allRows.length,
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
              ? ((approvedPrice - productionCost) / productionCost) * 100
              : null;
            const actualGrossMarginPercent = approvedPrice != null && approvedPrice > 0 && productionCost > 0
              ? ((approvedPrice - productionCost) / approvedPrice) * 100
              : null;

            return {
              productName: product.name,
              category: product.category || 'Uncategorised',
              currentStatus: product.approvalStatus || 'pending',
              approvedPrice,
              optimalPrice: toNumber(product.optimalPrice),
              productionCost,
              actualMarkupPercent,
              actualGrossMarginPercent,
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
        profitPct: row.hasSellingPrice ? Number(row.profitPct.toFixed(1)) : null,
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
          { key: 'profitPct', label: 'Profit %' },
          { key: 'pricingStatus', label: 'Pricing Status' },
        ],
        filename: 'pricing-status-report.csv',
      };
    }

    if (selectedReport === 'low-margin') {
      const data = reportData as ReportResultMap['low-margin'];
      const rows = data.rows.map((row) => ({
        productName: row.productName,
        category: row.category,
        currentSellingPrice: Number(row.currentSellingPrice.toFixed(2)),
        productionCost: Number(row.productionCost.toFixed(2)),
        realisedMargin: Number(row.realisedMargin.toFixed(1)),
        targetMargin: Number(row.targetMargin.toFixed(1)),
        gap: Number(row.gap.toFixed(1)),
        thresholdApplied: Number(data.threshold.toFixed(1)),
      }));
      return {
        rows,
        columns: [
          { key: 'productName', label: 'Product Name' },
          { key: 'category', label: 'Category' },
          { key: 'currentSellingPrice', label: `Approved base price (${baseCurrency})` },
          { key: 'productionCost', label: `Production Cost (${baseCurrency})` },
          { key: 'realisedMargin', label: 'Actual Gross Margin %' },
          { key: 'targetMargin', label: 'Target Markup %' },
          { key: 'gap', label: 'Gap %' },
          { key: 'thresholdApplied', label: 'Threshold Applied' },
        ],
        filename: 'low-margin-report.csv',
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
        actualGrossMarginPercent: row.actualGrossMarginPercent == null ? '' : row.actualGrossMarginPercent.toFixed(1),
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
          { key: 'actualGrossMarginPercent', label: 'Actual Gross Margin %' },
          { key: 'approvedOn', label: 'Approved On' },
          { key: 'approvedBy', label: 'Approved By' },
          { key: 'active', label: 'Active' },
        ],
        filename: 'approval-history-report.csv',
      };
    }

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
  const lowMarginCategories = useMemo(() => availableCategories, [availableCategories]);
  const approvalCategories = useMemo(() => availableCategories, [availableCategories]);

  function resetFiltersForReport(report: ReportKey) {
    if (report === 'pricing-status') {
      setPricingCategoryFilter('All');
      setPricingStatusFilter('All');
      setPricingSort('Product Name');
      return;
    }

    if (report === 'low-margin') {
      setLowMarginThreshold(defaultLowMarginThreshold);
      setLowMarginCategoryFilter('All');
      return;
    }

    if (report === 'approval-history') {
      setApprovalFromDate(getDefaultApprovalFromDate());
      setApprovalToDate(getDefaultApprovalToDate());
      setApprovalStatusFilter('All');
      setApprovalCategoryFilter('All');
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
          label: `Pricing Status: ${pricingStatusFilter}`,
          onClear: () => setPricingStatusFilter('All'),
        });
      }
      return chips;
    }

    if (selectedReport === 'low-margin') {
      const chips: ActiveFilterChip[] = [];
      if (lowMarginThreshold !== defaultLowMarginThreshold) {
        chips.push({
          key: 'low-margin-threshold',
          label: `Margin below: ${lowMarginThreshold}%`,
          onClear: () => setLowMarginThreshold(defaultLowMarginThreshold),
        });
      }
      if (lowMarginCategoryFilter !== 'All') {
        chips.push({
          key: 'low-margin-category',
          label: `Category: ${lowMarginCategoryFilter}`,
          onClear: () => setLowMarginCategoryFilter('All'),
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
          label: `Approval status: ${approvalStatusFilter}`,
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

    return [];
  }

  function clearAllFiltersForReport() {
    if (!selectedReport) return;
    resetFiltersForReport(selectedReport);
  }

  function renderEmptyStateGuidance() {
    const activeFilters = getActiveFilterChips();
    const hasNonDefaultFilters = activeFilters.length > 0;

    return (
      <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
        <div style={{ color: '#64748b', fontSize: '14px' }}>
          No results match your current filters
        </div>
        {hasNonDefaultFilters ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {activeFilters.map((chip) => (
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
            </div>
            <button
              type="button"
              onClick={clearAllFiltersForReport}
              style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600, justifySelf: 'start' }}
            >
              Clear all filters
            </button>
          </>
        ) : (
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
        <div className="report-filter-panel" style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '10px' }}>
            <div>
              <label className="app-settings-label">Category</label>
              <select className="app-control" value={pricingCategoryFilter} onChange={(e) => setPricingCategoryFilter(e.target.value)}>
                <option value="All">All</option>
                {pricingCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="app-settings-label">Pricing Status</label>
              <select className="app-control" value={pricingStatusFilter} onChange={(e) => setPricingStatusFilter(e.target.value as any)}>
                <option value="All">All</option>
                <option value="Above Optimal">Above Optimal</option>
                <option value="Below Optimal">Below Optimal</option>
                <option value="At Optimal">At Optimal</option>
              </select>
            </div>
            <div>
              <label className="app-settings-label">Sort by</label>
              <select className="app-control" value={pricingSort} onChange={(e) => setPricingSort(e.target.value as any)}>
                <option>Product Name</option>
                <option>Profit % desc</option>
                <option>Profit % asc</option>
                <option>Variance desc</option>
                <option>Variance asc</option>
              </select>
            </div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'low-margin') {
      return (
        <div className="report-filter-panel" style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 200px', gap: '10px' }}>
            <div>
              <label className="app-settings-label">Flag products with margin below:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input className="app-control" type="number" value={lowMarginThreshold} onChange={(e) => setLowMarginThreshold(Number(e.target.value || 0))} />
                <span style={{ fontWeight: 600 }}>%</span>
              </div>
            </div>
            <div>
              <label className="app-settings-label">Category</label>
              <select className="app-control" value={lowMarginCategoryFilter} onChange={(e) => setLowMarginCategoryFilter(e.target.value)}>
                <option value="All">All</option>
                {lowMarginCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }

    if (selectedReport === 'approval-history') {
      return (
        <div className="report-filter-panel" style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: '10px' }}>
            <div>
              <label className="app-settings-label">From</label>
              <input className="app-control" type="date" value={approvalFromDate} onChange={(e) => setApprovalFromDate(e.target.value)} />
            </div>
            <div>
              <label className="app-settings-label">To</label>
              <input className="app-control" type="date" value={approvalToDate} onChange={(e) => setApprovalToDate(e.target.value)} />
            </div>
            <div>
              <label className="app-settings-label">Approval status</label>
              <select className="app-control" value={approvalStatusFilter} onChange={(e) => setApprovalStatusFilter(e.target.value as any)}>
                <option value="All">All</option>
                <option value="approved">Approved</option>
                <option value="needs_review">Needs Review</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="app-settings-label">Category</label>
              <select className="app-control" value={approvalCategoryFilter} onChange={(e) => setApprovalCategoryFilter(e.target.value)}>
                <option value="All">All</option>
                {approvalCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderReportBody() {
    if (!selectedReport || !reportData) return null;

    if (selectedReport === 'pricing-status') {
      const data = reportData as ReportResultMap['pricing-status'];
      const withSellingPrice = data.rows.filter((row) => row.hasSellingPrice);
      const noSellingPrice = data.rows.filter((row) => !row.hasSellingPrice);
      const aboveCount = withSellingPrice.filter((row) => row.sellingPrice > row.optimalPrice + 0.01).length;
      const belowCount = withSellingPrice.filter((row) => row.sellingPrice < row.optimalPrice - 0.01).length;
      const atOptimalCount = withSellingPrice.filter((row) => Math.abs(row.sellingPrice - row.optimalPrice) <= 0.01).length;
      const below = withSellingPrice.filter((row) => row.pricingStatus === 'Below Optimal');
      const above = withSellingPrice.filter((row) => row.pricingStatus === 'Above Optimal');
      const atOptimal = withSellingPrice.filter((row) => row.pricingStatus === 'At Optimal');
      const approvedCount = data.rows.filter((row) => row.approvalStatus === 'approved').length;
      const pendingCount = data.rows.filter((row) => row.approvalStatus === 'pending').length;
      const needsReviewCount = data.rows.filter((row) => row.approvalStatus === 'needs_review').length;
      const profitEligibleRows = withSellingPrice.filter((row) => row.productionCost > 0 && row.sellingPrice > 0);
      const avgProfitPct = profitEligibleRows.length > 0
        ? profitEligibleRows.reduce((sum, row) => sum + (((row.sellingPrice - row.productionCost) / row.sellingPrice) * 100), 0) / profitEligibleRows.length
        : null;

      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Total Products" value={String(data.rows.length)} secondary={`${approvedCount} approved · ${pendingCount} pending · ${needsReviewCount} needs review`} />
            <StatCard label="Above Optimal" value={String(aboveCount)} tone="success" />
            <StatCard label="Below Optimal" value={String(belowCount)} tone="danger" />
            <StatCard
              label="Avg Profit %"
              value={avgProfitPct === null ? '—' : formatPct(avgProfitPct)}
              secondary={`Based on ${profitEligibleRows.length} products with approved base prices set`}
            />
          </div>

          {below.length > 0 && (
            <section style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <strong>⚠ Below Optimal — Requires Attention</strong>
                <AppBadge variant="danger" size="sm">{below.length}</AppBadge>
              </div>
              {renderPricingStatusTable(below, { formatCurrency })}
            </section>
          )}

          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <strong>✓ Above Optimal</strong>
              <AppBadge variant="success" size="sm">{above.length}</AppBadge>
            </div>
            {renderPricingStatusTable(above, { formatCurrency })}
          </section>

          <section style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <strong>○ No Approved base price set</strong>
              <AppBadge variant="inactive" size="sm">{noSellingPrice.length}</AppBadge>
            </div>
            {renderPricingStatusTable(noSellingPrice, { noSellingPriceMode: true, formatCurrency })}
          </section>

          <section style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <strong>= At Optimal</strong>
              <AppBadge variant="inactive" size="sm">{atOptimalCount}</AppBadge>
            </div>
            {renderPricingStatusTable(atOptimal, { formatCurrency })}
          </section>
        </div>
      );
    }

    if (selectedReport === 'low-margin') {
      const data = reportData as ReportResultMap['low-margin'];
      return (
        <div id="reporting-centre-print-area">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
            <StatCard label="Products Reviewed" value={String(data.reviewedCount)} />
            <StatCard label="Below Threshold" value={String(data.rows.length)} tone="danger" />
            <StatCard label="Avg Actual Gross Margin" value={formatPct(data.allApprovedAverage)} />
            <StatCard label="Threshold Applied" value={formatPct(data.threshold)} />
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                  <th style={{ textAlign: 'right' }}>Prod. Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Actual Gross<br/>Margin %</th>
                  <th style={{ textAlign: 'right' }}>Target Markup %</th>
                  <th style={{ textAlign: 'right' }}>Gap</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.productName}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentSellingPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <InlinePercentBar value={row.realisedMargin} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatPct(row.targetMargin)}</td>
                    <td style={{ textAlign: 'right', color: row.gap < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{formatPct(row.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
            Actual gross margin = (Approved base price − Production Cost) / Approved base price. Only approved products with an official approved price are included.
          </div>
        </div>
      );
    }

    if (selectedReport === 'price-list-summary') {
      const data = reportData as ReportResultMap['price-list-summary'];

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
                {data.rows.map((row, index) => {
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
        </div>
      );
    }

    if (selectedReport === 'approval-history') {
      const data = reportData as ReportResultMap['approval-history'];
      const approved = data.rows.filter((row) => row.currentStatus === 'approved').length;
      const pending = data.rows.filter((row) => row.currentStatus === 'pending').length;
      const needsReview = data.rows.filter((row) => row.currentStatus === 'needs_review').length;

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
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Actual Gross<br/>Margin %</th>
                  <th style={{ textAlign: 'left' }}>Approved On</th>
                  <th style={{ textAlign: 'left' }}>Approved By</th>
                  <th style={{ textAlign: 'left' }}>Active?</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${row.productName}-${index}`}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'left' }}><AppBadge variant={statusBadgeVariant(row.currentStatus)} size="sm">{row.currentStatus}</AppBadge></td>
                    <td style={{ textAlign: 'right' }}>{row.approvedPrice === null ? '—' : formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.optimalPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{row.actualMarkupPercent == null ? '—' : formatPct(row.actualMarkupPercent)}</td>
                    <td style={{ textAlign: 'right' }}>{row.actualGrossMarginPercent == null ? '—' : formatPct(row.actualGrossMarginPercent)}</td>
                    <td style={{ textAlign: 'left' }}>{parseDate(row.approvedOn)?.toLocaleString() || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{row.approvedBy}</td>
                    <td style={{ textAlign: 'left' }}>{row.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
            † Optimal price shown is current calculated value. Historical optimal price at time of approval is not stored.
          </div>
        </div>
      );
    }

    const data = reportData as ReportResultMap['currency-exposure'];

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
              {data.rows.map((row) => (
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

  return (
    <div className="app-page">
      <div className="app-page-header">
        <h1 className="app-page-title">Reporting Centre</h1>
      </div>

      <div className="app-page-content app-page-content--data">
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', minHeight: 0 }}>
          <aside
            className="app-card report-selector-panel"
            style={{
              width: '320px',
              flexShrink: 0,
              overflow: 'visible',
              padding: '10px',
              position: 'sticky',
              top: '10px',
            }}
          >
            <div style={{ display: 'grid', gap: '8px' }}>
              {REPORT_METADATA.map((report) => {
                const Icon = report.icon;
                const isActive = selectedReport === report.key;

                return (
                  <button
                    type="button"
                    key={report.key}
                    onClick={() => {
                      resetFiltersForReport(report.key);
                      setSelectedReport(report.key);
                      setReportData(null);
                      setGeneratedAt(null);
                      setError(null);
                      setExpandedCurrencyCodes(new Set());
                    }}
                    className={`app-panel-tab ${isActive ? 'is-active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
                      <strong style={{ fontSize: '15px', fontWeight: 700, whiteSpace: 'nowrap' }}>{report.name}</strong>
                    </div>
                    <div className="app-panel-tab-description">
                      {report.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: '10px', color: '#888', fontSize: '13px', fontWeight: 400 }}>
              Reports are generated from live PriceRight data.
            </div>
          </aside>

          <section className="report-viewer-panel" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {!selectedReport && (
              <div className="app-card" style={{ minHeight: '420px', display: 'grid', placeItems: 'center' }}>
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
                    <BarChart2 size={24} color="#94a3b8" />
                  </div>
                  <div className="app-empty-state-title">
                    Select a report
                  </div>
                  <div className="app-empty-state-text">
                    Choose a report from the list on the left to view your pricing and cost analysis.
                  </div>
                </div>
              </div>
            )}

            {selectedReport && selectedMeta && (
              <>
                <div className="app-card" style={{ padding: '16px', marginBottom: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selectedMeta.name}</h2>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '15px' }}>{selectedMeta.description}</p>
                  <div style={{ marginTop: '10px' }}>{renderFilters()}</div>
                </div>

                <ReportWrapper
                  title={selectedMeta.name}
                  subtitle={selectedMeta.description}
                  onExportPDF={handleExportPDF}
                  onExportExcel={handleExportExcel}
                  onPrint={handlePrintReport}
                  isLoading={isLoading}
                  error={error}
                  isEmpty={!isLoading && !error && generatedRowsCount === 0}
                  generatedAt={generatedAt}
                  emptyStateExtra={renderEmptyStateGuidance()}
                >
                  {renderReportBody()}
                </ReportWrapper>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function InlinePercentBar({ value }: { value: number }) {
  const clampedWidth = Math.min(100, Math.max(0, value));
  const negative = value < 0;

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden', maxWidth: '140px' }}>
        <div style={{ width: `${clampedWidth}%`, height: '100%', backgroundColor: negative ? '#dc2626' : '#16a34a' }} />
      </div>
      <span style={{ color: negative ? '#b91c1c' : '#166534', fontWeight: 600 }}>{formatPct(value)}</span>
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
  options?: { noSellingPriceMode?: boolean; formatCurrency?: (value: number) => string },
) {
  const noSellingPriceMode = options?.noSellingPriceMode === true;
  const formatMoney = options?.formatCurrency ?? ((value: number) => formatCurrencyAmount(value, 'GHS'));

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
            <th style={{ textAlign: 'right' }}>Profit %</th>
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
              <td style={{ textAlign: 'right' }}>{row.hasSellingPrice && !noSellingPriceMode ? <InlinePercentBar value={row.profitPct} /> : '—'}</td>
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
