import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, History, RotateCcw, TrendingUp, XCircle } from 'lucide-react';
import IntermediateMaterialIndicator, { isIntermediateMaterial } from './IntermediateMaterialIndicator';
import { activityLogApi, materialsApi, type ActivityEntry, type IntermediateBomItemRecord } from '../api';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';
import { getThresholdMarkupColor } from '../utils/margin';
import { safeRender } from '../utils/render';
import { TabErrorBoundary } from './ErrorBoundary';
interface Product {
  id: number;
  name: string;
  sku?: string;
  category?: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  overheadPercentage: number;
  profitMargin: number;
  currentSellingPrice?: number;
}

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  materialType?: 'primary' | 'intermediate' | string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
}

interface ProductTabsProps {
  product: Product;
  productId: number;
  displayBom: BOMMaterial[];
  bomLoading: boolean;
  activeTab: 'bom' | 'history';
  onTabChange: (tab: 'bom' | 'history') => void;
  activityEntries: ActivityEntry[];
  activityLoading: boolean;
  activityViewAllHref: string;
  onEditProduct?: () => void;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const TAB_BUTTONS = [
  { id: 'bom', label: 'Bill of materials' },
  { id: 'history', label: 'History' },
];

function formatAbsoluteDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSeconds;

  if (delta < 60) return 'just now';
  if (delta < 3600) {
    const minutes = Math.floor(delta / 60);
    return `${minutes}m ago`;
  }
  if (delta < 86400) {
    const hours = Math.floor(delta / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(delta / 86400);
  return `${days}d ago`;
}

function describeProductActivity(action: string, details: Record<string, unknown> | null | undefined, currencyCode: string) {
  const data = details || {};
  if (action === 'product.approved') {
    const newPrice = Number(data.newPrice);
    return Number.isFinite(newPrice)
      ? `Approved base price at ${currencyCode} ${newPrice.toFixed(2)}`
      : 'Approved product base price';
  }
  if (action === 'product.reset_to_pending') {
    const reason = data.reason ? ` - ${safeRender(data.reason)}` : '';
    return `Price reset to pending${reason}`;
  }
  if (action === 'product.rejected') {
    const reason = data.reason ? ` - ${safeRender(data.reason)}` : '';
    return `Rejected product price${reason}`;
  }
  if (action === 'product.needs_review') {
    return 'Flagged for review after cost change';
  }
  if (action === 'material.cost_updated') {
    return 'Material cost updated';
  }
  return action;
}

function getActivityVisual(action: string) {
  if (action === 'product.approved') {
    return { Icon: CheckCircle2, color: '#16a34a' };
  }
  if (action === 'product.reset_to_pending') {
    return { Icon: RotateCcw, color: '#64748b' };
  }
  if (action === 'product.rejected') {
    return { Icon: XCircle, color: '#dc2626' };
  }
  if (action === 'product.needs_review') {
    return { Icon: AlertTriangle, color: '#d97706' };
  }
  if (action === 'material.cost_updated') {
    return { Icon: TrendingUp, color: '#475569' };
  }
  return { Icon: Clock3, color: '#64748b' };
}

export default function ProductTabs({
  product,
  productId,
  displayBom,
  bomLoading,
  activeTab,
  onTabChange,
  activityEntries,
  activityLoading,
  activityViewAllHref,
  onEditProduct,
}: ProductTabsProps) {
  const navigate = useNavigate();
  const { baseCurrency } = useBaseCurrency();
  const lowMarkupThreshold = useLowMarkupThreshold();
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approvals'>('all');
  const [priceHistory, setPriceHistory] = useState<ActivityEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFetched, setHistoryFetched] = useState(false);
  const [expandedIntermediateIds, setExpandedIntermediateIds] = useState<Set<number>>(new Set());
  const [intermediateBomById, setIntermediateBomById] = useState<Record<number, IntermediateBomItemRecord[]>>({});
  const [intermediateBomLoadingIds, setIntermediateBomLoadingIds] = useState<Set<number>>(new Set());
  const [intermediateBomErrorById, setIntermediateBomErrorById] = useState<Record<number, string>>({});

  useEffect(() => {
    setHistoryFilter('all');
    setHistoryFetched(false);
    setPriceHistory([]);
    setHistoryError(null);
    setExpandedIntermediateIds(new Set());
    setIntermediateBomById({});
    setIntermediateBomLoadingIds(new Set());
    setIntermediateBomErrorById({});
  }, [productId]);

  const fetchIntermediateBom = useCallback(async (materialId: number) => {
    setIntermediateBomLoadingIds((prev) => new Set(prev).add(materialId));
    setIntermediateBomErrorById((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });

    try {
      const rows = await materialsApi.getIntermediateBom(materialId);
      setIntermediateBomById((prev) => ({
        ...prev,
        [materialId]: Array.isArray(rows) ? rows : [],
      }));
    } catch {
      setIntermediateBomErrorById((prev) => ({
        ...prev,
        [materialId]: 'Could not load sub-recipe materials.',
      }));
    } finally {
      setIntermediateBomLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  }, []);

  function toggleIntermediatePreview(materialId: number, event: React.MouseEvent) {
    event.stopPropagation();
    const isExpanded = expandedIntermediateIds.has(materialId);
    if (isExpanded) {
      setExpandedIntermediateIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
      return;
    }

    setExpandedIntermediateIds((prev) => new Set(prev).add(materialId));
    if (intermediateBomById[materialId] === undefined && !intermediateBomLoadingIds.has(materialId)) {
      void fetchIntermediateBom(materialId);
    }
  }

  const combinedHistoryEntries = useMemo(() => {
    const byId = new Map<number, ActivityEntry>();
    [...activityEntries, ...priceHistory].forEach((entry) => {
      byId.set(entry.id, entry);
    });
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [activityEntries, priceHistory]);

  const fetchHistory = useCallback(async () => {
    if (historyFetched) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await activityLogApi.getAll({
        entityType: 'product',
        action: 'product.approved',
        entityId: productId,
        limit: 100,
      });
      setPriceHistory(result.entries);
      setHistoryFetched(true);
    } catch {
      setHistoryError('Could not load price history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [productId, historyFetched]);

  useEffect(() => {
    if (activeTab === 'history') {
      void fetchHistory();
    }
  }, [activeTab, fetchHistory]);
  return (
    <div>
      {/* Tab Header Buttons */}
      <div className="app-section-tabs" role="tablist" aria-label="Product detail sections">
        {TAB_BUTTONS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id as any)}
            className={`app-section-tab ${activeTab === tab.id ? 'is-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ backgroundColor: 'white' }}>
        {activeTab === 'bom' && (
          <TabErrorBoundary>
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Bill of Materials {product.productionMode === 'batch' ? `(per unit from batch of ${product.batchYield || 1})` : ''}
            </div>
            {bomLoading ? (
              <div style={{ padding: '12px', color: '#64748b' }}>Loading BOM...</div>
            ) : displayBom.length === 0 ? (
              <div style={{ padding: '12px' }}>
                <div style={{ color: '#64748b', marginBottom: '8px' }}>No materials in BOM</div>
                <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 12px' }}>
                  This product has no materials in its bill of materials. Add materials to calculate production cost and optimal price.
                </p>
                {onEditProduct ? (
                  <button type="button" className="btn btn-outline" onClick={onEditProduct}>
                    Edit product to add materials
                  </button>
                ) : null}
              </div>
            ) : (
              <Fragment>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e2e8f0' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Material Name</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Quantity</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayBom.map((item) => {
                      const totalCost = toNumber(item.unitPrice) * item.quantity;
                      const isIntermediate = isIntermediateMaterial(item.materialType);
                      const isExpanded = isIntermediate && expandedIntermediateIds.has(item.materialId);
                      const nestedBom = intermediateBomById[item.materialId];
                      const isNestedLoading = intermediateBomLoadingIds.has(item.materialId);
                      const nestedError = intermediateBomErrorById[item.materialId];

                      return (
                        <Fragment key={item.id}>
                          <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px', textAlign: 'left', fontSize: '13px' }}>
                              {isIntermediate ? (
                                <button
                                  type="button"
                                  onClick={(event) => toggleIntermediatePreview(item.materialId, event)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    margin: 0,
                                    font: 'inherit',
                                    color: '#0F2847',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    maxWidth: '100%',
                                  }}
                                  aria-expanded={isExpanded}
                                  title={isExpanded ? 'Collapse sub-recipe preview' : 'Expand sub-recipe preview'}
                                >
                                  {isExpanded ? (
                                    <ChevronUp size={14} color="#64748B" strokeWidth={2} aria-hidden="true" />
                                  ) : (
                                    <ChevronDown size={14} color="#64748B" strokeWidth={2} aria-hidden="true" />
                                  )}
                                  <span>{item.materialName}</span>
                                  <IntermediateMaterialIndicator inline />
                                </button>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  {item.materialName}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{item.quantity.toFixed(3)}</td>
                            <td style={{ padding: '8px', textAlign: 'left', fontSize: '13px' }}>{item.unit}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{baseCurrency} {toNumber(item.unitPrice).toFixed(2)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>{baseCurrency} {totalCost.toFixed(2)}</td>
                          </tr>
                          {isExpanded ? (
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td colSpan={5} style={{ padding: 0 }}>
                                <div
                                  style={{
                                    backgroundColor: '#f8fafc',
                                    borderTop: '1px solid #e2e8f0',
                                    padding: '10px 12px 10px 28px',
                                    fontSize: '12px',
                                    color: '#475569',
                                  }}
                                >
                                  <div style={{ fontWeight: 600, marginBottom: '8px', color: '#64748b' }}>
                                    Sub-recipe: {item.materialName}
                                  </div>
                                  {isNestedLoading ? (
                                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>Loading sub-recipe materials...</div>
                                  ) : nestedError ? (
                                    <div style={{ color: '#dc2626' }}>{nestedError}</div>
                                  ) : nestedBom && nestedBom.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b' }}>
                                          <th style={{ padding: '4px 8px 4px 0', textAlign: 'left', fontWeight: 600 }}>Material Name</th>
                                          <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Quantity</th>
                                          <th style={{ padding: '4px 0 4px 8px', textAlign: 'left', fontWeight: 600 }}>Unit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {nestedBom.map((component) => (
                                          <tr key={component.id}>
                                            <td style={{ padding: '4px 8px 4px 0' }}>{component.componentMaterialName || '—'}</td>
                                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{Number(component.quantity || 0).toFixed(3)}</td>
                                            <td style={{ padding: '4px 0 4px 8px' }}>{component.unit || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>No materials in this sub-recipe.</div>
                                  )}
                                  <div style={{ marginTop: '8px', fontWeight: 600, color: '#334155' }}>
                                    Cost per unit: {baseCurrency} {toNumber(item.unitPrice).toFixed(2)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigate(`/intermediate-materials/${item.materialId}`, { state: { from: `/products/${productId}` } });
                                    }}
                                    style={{
                                      marginTop: '8px',
                                      border: 'none',
                                      background: 'transparent',
                                      padding: 0,
                                      font: 'inherit',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: '#0F2847',
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      textUnderlineOffset: '2px',
                                    }}
                                  >
                                    View full details →
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </Fragment>
            )}
          </div>
          </TabErrorBoundary>
        )}

        {activeTab === 'history' && (
          <TabErrorBoundary>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`app-pill-tab app-pill-tab--compact${historyFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setHistoryFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`app-pill-tab app-pill-tab--compact${historyFilter === 'approvals' ? ' is-active' : ''}`}
                onClick={() => setHistoryFilter('approvals')}
              >
                Approvals only
              </button>
            </div>

            {historyFilter === 'all' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>Recent activity</div>
                  <Link to={activityViewAllHref} style={{ fontSize: '13px', color: '#0F2847', textDecoration: 'none', fontWeight: 600 }}>
                    View all activity
                  </Link>
                </div>

                {activityLoading || historyLoading ? (
                  <div style={{ padding: '8px', color: '#64748b', fontSize: '13px' }}>Loading activity...</div>
                ) : combinedHistoryEntries.length === 0 ? (
                  <div style={{ padding: '8px', color: '#64748b', fontSize: '13px' }}>No recent activity yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {combinedHistoryEntries.map((entry) => {
                      const visual = getActivityVisual(entry.action);
                      return (
                        <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                          <visual.Icon size={14} style={{ color: visual.color }} />
                          <div style={{ fontSize: '13px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={describeProductActivity(entry.action, entry.details, baseCurrency)}>
                            {describeProductActivity(entry.action, entry.details, baseCurrency)}
                          </div>
                          <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right' }}>
                            {formatRelativeTime(entry.createdAt)}{entry.performedBy ? ` by ${safeRender(entry.performedBy)}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : historyLoading ? (
              <div style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>Loading price history...</div>
            ) : historyError ? (
              <div style={{ padding: '12px', color: '#dc2626', fontSize: '13px' }}>{historyError}</div>
            ) : priceHistory.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '32px 16px', color: '#94a3b8' }}>
                <History size={28} />
                <span style={{ fontSize: '14px' }}>No approved prices yet</span>
                <span style={{ fontSize: '13px' }}>Approve a price to start tracking history.</span>
              </div>
            ) : (
              <Fragment>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e2e8f0' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Approved price</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Production cost</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>
                        <div>Markup %</div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 400 }} title="Older entries store gross margin at approval time">(historical values)</div>
                      </th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Change</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Approved by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry, index) => {
                      const d = entry.details as Record<string, unknown> | null;
                      const newPrice = typeof d?.newPrice === 'number' ? d.newPrice : null;
                      const oldPrice = typeof d?.oldPrice === 'number' ? d.oldPrice : null;
                      const productionCostVal = typeof d?.productionCost === 'number' ? d.productionCost : null;
                      const markupPercentVal = typeof d?.markupPercent === 'number' ? d.markupPercent : null;
                      const marginVal = typeof d?.margin === 'number' ? d.margin : null;
                      const displayPercent = markupPercentVal ?? marginVal;

                      const priceChange = newPrice !== null && oldPrice !== null
                        ? newPrice - oldPrice
                        : null;
                      const isFirst = index === 0;
                      const isMostRecent = index === 0;

                      return (
                        <Fragment key={entry.id}>
                          {index === 1 && (
                            <tr>
                              <td colSpan={6} style={{ padding: '8px 8px 4px', color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #e2e8f0' }}>
                                Previous approvals
                              </td>
                            </tr>
                          )}
                          <tr style={{ backgroundColor: isMostRecent ? '#f0f9ff' : undefined, borderTop: index > 1 ? '1px solid #f1f5f9' : undefined }}>
                            <td style={{ padding: '8px', textAlign: 'left' }}>
                              <div style={{ fontWeight: 500 }}>{formatAbsoluteDate(entry.createdAt)}</div>
                              <div style={{ color: '#94a3b8', fontSize: '13px' }}>{formatRelativeTime(entry.createdAt)}</div>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                              {newPrice !== null ? `${baseCurrency} ${newPrice.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#475569' }}>
                              {productionCostVal !== null ? `${baseCurrency} ${productionCostVal.toFixed(2)}` : '—'}
                            </td>
                            <td style={{
                              padding: '8px',
                              textAlign: 'right',
                              fontWeight: 600,
                              // Historical values are gross margin — threshold comparison is approximate
                              color: displayPercent !== null ? getThresholdMarkupColor(displayPercent, lowMarkupThreshold) : '#475569',
                            }}>
                              {displayPercent !== null ? `${displayPercent.toFixed(1)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {isFirst && oldPrice === null ? (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>First approval</span>
                              ) : priceChange !== null ? (
                                <span style={{ color: priceChange >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                  {priceChange >= 0 ? '+' : ''}{baseCurrency} {priceChange.toFixed(2)}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'left', color: '#475569' }}>
                              {entry.performedBy ? safeRender(entry.performedBy) : '—'}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '8px', color: '#94a3b8', fontSize: '13px', textAlign: 'right' }}>
                  Showing {priceHistory.length} approval{priceHistory.length !== 1 ? 's' : ''}
                </div>
              </Fragment>
            )}
          </div>
          </TabErrorBoundary>
        )}
      </div>
    </div>
  );
}
