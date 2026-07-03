import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Dot, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { priceLevelItemsApi, priceLevelRulesApi } from '../api';
import AppBadge from './AppBadge';
import { ActualGrossMarginInfoTooltip, ActualMarkupInfoTooltip } from './ProfitTooltips';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { formatCurrency } from '../utils/currency';

interface ProductRow {
  id: number;
  name: string;
  category?: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  currentSellingPrice?: number;
  approvedPrice?: number | null;
  totalCost: number;
  optimalPrice: number;
  isActive: boolean;
}

type FilterKey =
  | null
  | 'healthy'
  | 'low'
  | 'critical'
  | 'not-priced'
  | 'band-below-0'
  | 'band-0-5'
  | 'band-5-10'
  | 'band-10-15'
  | 'band-15-20'
  | 'band-20-plus';

type SortDirection = 'asc' | 'desc';

interface CoverageState {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  coveredProductIds: Set<number>;
  levelsByProductId: Map<number, string[]>;
}

const MARGIN_BANDS = [
  { key: 'band-below-0' as const, band: 'Below 0%', color: '#dc2626', test: (value: number) => value < 0 },
  { key: 'band-0-5' as const, band: '0 - 5%', color: '#ef4444', test: (value: number) => value >= 0 && value < 5 },
  { key: 'band-5-10' as const, band: '5 - 10%', color: '#f97316', test: (value: number) => value >= 5 && value < 10 },
  { key: 'band-10-15' as const, band: '10 - 15%', color: '#eab308', test: (value: number) => value >= 10 && value < 15 },
  { key: 'band-15-20' as const, band: '15 - 20%', color: '#84cc16', test: (value: number) => value >= 15 && value < 20 },
  { key: 'band-20-plus' as const, band: '20%+', color: '#16a34a', test: (value: number) => value >= 20 },
];

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getApprovedPrice(product: ProductRow): number | null {
  const approved = toNumber(product.approvedPrice);
  return approved > 0 ? approved : null;
}

function getMarginPercent(product: ProductRow): number | null {
  const approved = getApprovedPrice(product);
  const cost = toNumber(product.totalCost);
  if (approved == null || approved <= 0 || cost <= 0) {
    return null;
  }
  return ((approved - cost) / cost) * 100;
}

function getOnSalesPercent(product: ProductRow): number | null {
  const approved = getApprovedPrice(product);
  const cost = toNumber(product.totalCost);
  if (approved == null || approved <= 0 || cost <= 0) {
    return null;
  }
  return ((approved - cost) / approved) * 100;
}

function getMarginColor(margin: number | null): string {
  if (margin == null) return '#9ca3af';
  if (margin < 12) return '#dc2626';
  if (margin < 20) return '#d97706';
  return '#16a34a';
}

function getOnSalesColor(value: number | null): string {
  if (value == null) return '#9ca3af';
  if (value < 10) return '#dc2626';
  if (value < 15) return '#d97706';
  return '#16a34a';
}

function getFilterLabel(filterKey: FilterKey): string {
  if (filterKey === 'healthy') return 'Showing: Healthy markup (>= 20%)';
  if (filterKey === 'low') return 'Showing: Low markup (12 - 19.9%)';
  if (filterKey === 'critical') return 'Showing: Critical markup (Below 12%)';
  if (filterKey === 'not-priced') return 'Showing: Not priced';
  const band = MARGIN_BANDS.find((item) => item.key === filterKey);
  if (band) return `Showing: ${band.band} markup`;
  return '';
}

export default function ProductsAnalysisTab({ products }: { products: ProductRow[] }) {
  const { baseCurrency } = useBaseCurrency();
  const formatMoney = (value: number) => formatCurrency(value, baseCurrency);
  const navigate = useNavigate();

  const [selectedBand, setSelectedBand] = useState<FilterKey>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [coverageState, setCoverageState] = useState<CoverageState>({
    loading: false,
    loaded: false,
    error: null,
    coveredProductIds: new Set<number>(),
    levelsByProductId: new Map<number, string[]>(),
  });

  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);

  const activeApprovedProducts = useMemo(
    () => activeProducts.filter((product) => getApprovedPrice(product) != null),
    [activeProducts],
  );

  const summaryCounts = useMemo(() => {
    let healthy = 0;
    let low = 0;
    let critical = 0;
    let notPriced = 0;

    activeProducts.forEach((product) => {
      const margin = getMarginPercent(product);
      if (margin == null) {
        notPriced += 1;
        return;
      }
      if (margin >= 20) healthy += 1;
      else if (margin >= 12) low += 1;
      else if (margin >= 0) critical += 1;
      else critical += 1;
    });

    return { healthy, low, critical, notPriced };
  }, [activeProducts]);

  const bandData = useMemo(() => {
    const marginValues = activeApprovedProducts
      .map((product) => getMarginPercent(product))
      .filter((margin): margin is number => margin !== null);

    return MARGIN_BANDS.map((band) => ({
      key: band.key,
      band: band.band,
      color: band.color,
      count: marginValues.filter((margin) => band.test(margin)).length,
    }));
  }, [activeApprovedProducts]);

  const rankedRows = useMemo(() => {
    const rows = activeProducts.map((product) => {
      const margin = getMarginPercent(product);
      const onSales = getOnSalesPercent(product);
      return {
        product,
        margin,
        onSales,
        approvedPrice: getApprovedPrice(product),
      };
    });

    const filteredRows = rows.filter((row) => {
      if (selectedBand === null) return true;
      if (selectedBand === 'healthy') return row.margin !== null && row.margin >= 20;
      if (selectedBand === 'low') return row.margin !== null && row.margin >= 12 && row.margin < 20;
      if (selectedBand === 'critical') return row.margin !== null && row.margin < 12;
      if (selectedBand === 'not-priced') return row.margin === null;

      const band = MARGIN_BANDS.find((item) => item.key === selectedBand);
      if (!band || row.margin === null) return false;
      return band.test(row.margin);
    });

    filteredRows.sort((a, b) => {
      const aMargin = a.margin ?? Number.POSITIVE_INFINITY;
      const bMargin = b.margin ?? Number.POSITIVE_INFINITY;
      return sortDirection === 'asc' ? aMargin - bMargin : bMargin - aMargin;
    });

    return filteredRows;
  }, [activeProducts, selectedBand, sortDirection]);

  const hasAnyApprovedPrices = useMemo(
    () => activeProducts.some((product) => getApprovedPrice(product) != null),
    [activeProducts],
  );

  useEffect(() => {
    if (coverageState.loaded || coverageState.loading) {
      return;
    }

    let cancelled = false;

    async function loadCoverage() {
      setCoverageState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const levels = await priceLevelRulesApi.getAll() as Array<{ id: number; name: string }>;
        const itemLists = await Promise.all(
          levels.map(async (level) => {
            try {
              const items = await priceLevelItemsApi.getAll(level.id);
              return { level, items };
            } catch {
              return { level, items: [] as any[] };
            }
          }),
        );

        const coveredProductIds = new Set<number>();
        const levelsByProduct = new Map<number, Set<string>>();

        itemLists.forEach(({ level, items }) => {
          items.forEach((item: any) => {
            if (item?.status !== 'approved') {
              return;
            }
            const productId = Number(item.productId);
            if (!Number.isFinite(productId) || productId <= 0) {
              return;
            }
            coveredProductIds.add(productId);
            const existing = levelsByProduct.get(productId) ?? new Set<string>();
            existing.add(level.name);
            levelsByProduct.set(productId, existing);
          });
        });

        if (!cancelled) {
          const normalizedMap = new Map<number, string[]>();
          levelsByProduct.forEach((set, key) => {
            normalizedMap.set(key, Array.from(set).sort((a, b) => a.localeCompare(b)));
          });

          setCoverageState({
            loading: false,
            loaded: true,
            error: null,
            coveredProductIds,
            levelsByProductId: normalizedMap,
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          setCoverageState((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
            error: error?.message || 'Failed to load price level coverage',
          }));
        }
      }
    }

    loadCoverage();

    return () => {
      cancelled = true;
    };
  }, [coverageState.loaded, coverageState.loading]);

  const coverageRows = useMemo(() => {
    const covered = activeProducts.filter((product) => coverageState.coveredProductIds.has(product.id));
    const uncovered = activeProducts.filter((product) => !coverageState.coveredProductIds.has(product.id));
    return { covered, uncovered };
  }, [activeProducts, coverageState.coveredProductIds]);

  const chartMaxCount = Math.max(1, ...bandData.map((item) => item.count));

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div className="app-card" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F2847' }}>Pricing health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
          {[
            {
              key: 'healthy' as const,
              count: summaryCounts.healthy,
              label: 'Healthy markup',
              sub: 'Actual Markup % >= 20%',
              color: '#16a34a',
              background: '#f0fdf4',
              border: '#bbf7d0',
            },
            {
              key: 'low' as const,
              count: summaryCounts.low,
              label: 'Low markup',
              sub: 'Actual Markup % 12-19.9%',
              color: '#d97706',
              background: '#fffbeb',
              border: '#fde68a',
            },
            {
              key: 'critical' as const,
              count: summaryCounts.critical,
              label: 'Critical markup',
              sub: 'Actual Markup % < 12%',
              color: '#dc2626',
              background: '#fef2f2',
              border: '#fecaca',
            },
            {
              key: 'not-priced' as const,
              count: summaryCounts.notPriced,
              label: 'Not priced',
              sub: 'No approved price',
              color: '#6b7280',
              background: '#f9fafb',
              border: '#e5e7eb',
            },
          ].map((card) => {
            const active = selectedBand === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedBand((prev) => (prev === card.key ? null : card.key))}
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: '16px',
                  borderRadius: '10px',
                  border: `1px solid ${active ? card.color : card.border}`,
                  backgroundColor: card.background,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: '4px',
                  boxShadow: active ? `0 0 0 1px ${card.color} inset` : 'none',
                }}
                title={`Filter by ${card.label.toLowerCase()}`}
              >
                <div style={{ fontSize: '30px', fontWeight: 700, color: card.color, fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1 }}>
                  {card.count}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{card.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 400, color: '#6b7280' }}>{card.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="app-card" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F2847', marginBottom: '2px' }}>Margin distribution</div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {bandData.map((item) => {
            const isSelected = selectedBand === item.key;
            const widthPercent = chartMaxCount > 0 ? (item.count / chartMaxCount) * 100 : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedBand((prev) => (prev === item.key ? null : item.key))}
                style={{
                  border: `1px solid ${isSelected ? item.color : '#e5e7eb'}`,
                  borderRadius: '8px',
                  padding: '8px 10px',
                  background: '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                title={`Filter by ${item.band}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>{item.band}</span>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{item.count}</span>
                </div>
                <div style={{ height: '12px', borderRadius: '6px', backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(4, widthPercent)}%`,
                      backgroundColor: item.color,
                      borderRadius: '6px',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="app-card" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F2847' }}>Products by margin</div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDirection === 'asc' ? 'Lowest first' : 'Highest first'}
          </button>
        </div>

        {selectedBand !== null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#92400e', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '999px', padding: '4px 10px', width: 'fit-content' }}>
            <span>{getFilterLabel(selectedBand)}</span>
            <button
              type="button"
              onClick={() => setSelectedBand(null)}
              style={{ border: 'none', background: 'none', color: '#c2410c', cursor: 'pointer', fontWeight: 700, padding: 0 }}
              aria-label="Clear margin filter"
            >
              x
            </button>
          </div>
        )}

        {rankedRows.length === 0 ? (
          <div style={{ border: '1px dashed #d1d5db', borderRadius: '8px', padding: '14px', color: '#6b7280', fontSize: '15px' }}>
            {selectedBand !== null
              ? 'No products in this band.'
              : hasAnyApprovedPrices
                ? 'No active products available for analysis.'
                : 'No products have approved prices yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table app-table-uniform-numbers" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '42px', textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: '210px', textAlign: 'left' }}>Product</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Production cost</th>
                  <th style={{ textAlign: 'right' }}>Approved base price</th>
                  <th style={{ minWidth: '210px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Actual Markup %
                      <ActualMarkupInfoTooltip position="bottom" />
                    </span>
                  </th>
                  <th style={{ minWidth: '140px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Actual Gross Margin %
                      <ActualGrossMarginInfoTooltip position="bottom" />
                    </span>
                  </th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Needs review</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, index) => {
                  const margin = row.margin;
                  const onSales = row.onSales;
                  const marginColor = getMarginColor(margin);
                  const onSalesColor = getOnSalesColor(onSales);
                  const normalizedMargin = Math.max(0, Math.min(40, margin ?? 0));
                  const barWidth = `${(normalizedMargin / 40) * 100}%`;
                  return (
                    <tr
                      key={row.product.id}
                      onClick={() => navigate(`/products/${row.product.id}`)}
                      style={{ cursor: 'pointer' }}
                      title="Open product details"
                    >
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{index + 1}</td>
                      <td style={{ textAlign: 'left' }}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/products/${row.product.id}`);
                          }}
                          style={{ border: 'none', background: 'none', color: '#0f172a', padding: 0, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          {row.product.name}
                        </button>
                      </td>
                      <td style={{ textAlign: 'left' }}>{row.product.category || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(toNumber(row.product.totalCost))}</td>
                      <td style={{ textAlign: 'right' }}>{row.approvedPrice == null ? '—' : formatMoney(row.approvedPrice)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {margin == null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#9ca3af' }}>—</span>
                            <AppBadge variant="muted" size="sm">Not priced</AppBadge>
                          </span>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                            <div style={{ width: '110px', height: '8px', borderRadius: '999px', backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                              <div style={{ width: barWidth, height: '100%', backgroundColor: marginColor, borderRadius: '999px' }} />
                            </div>
                            <span style={{ color: marginColor, fontWeight: 700 }}>{margin.toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {onSales == null ? (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        ) : (
                          <span style={{ color: onSalesColor, fontWeight: 700 }}>{onSales.toFixed(1)}%</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.product.approvalStatus === 'needs_review' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#e65100' }} title="Needs review">
                            <Dot size={20} />
                          </span>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F2847' }}>Price level coverage</div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/price-levels')}
          >
            Manage in Price Levels
            <ExternalLink size={12} strokeWidth={2} />
          </button>
        </div>

        {coverageState.loading ? (
          <div style={{ fontSize: '15px', color: '#64748b' }}>Loading coverage...</div>
        ) : coverageState.error ? (
          <div style={{ fontSize: '15px', color: '#b91c1c' }}>{coverageState.error}</div>
        ) : (
          <>
            <div style={{ fontSize: '14px', color: '#475569' }}>
              {coverageRows.covered.length} of {activeProducts.length} active products are in at least one approved price level item.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div style={{ border: '1px solid #d1fae5', borderRadius: '8px', padding: '10px', backgroundColor: '#f0fdf4' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>Covered</div>
                {coverageRows.covered.length === 0 ? (
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>No covered products yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {coverageRows.covered.slice(0, 8).map((product) => (
                      <div key={product.id} style={{ fontSize: '14px', color: '#14532d', display: 'grid', gap: '2px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                          <CheckCircle size={12} strokeWidth={2} />
                          {product.name}
                        </span>
                        <span style={{ color: '#166534' }}>
                          {(coverageState.levelsByProductId.get(product.id) ?? []).join(', ') || 'Approved level'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', backgroundColor: '#f9fafb' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>Not covered</div>
                {coverageRows.uncovered.length === 0 ? (
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>All active products are covered.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {coverageRows.uncovered.slice(0, 8).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => navigate('/price-levels')}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          textAlign: 'left',
                          fontSize: '14px',
                          color: '#4b5563',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {product.name} - Add to price level
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
