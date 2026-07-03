import { useCallback, useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, History, TrendingUp, XCircle } from 'lucide-react';
import { activityLogApi, type ActivityEntry } from '../api';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
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
  activeTab: 'bom' | 'history' | 'activity';
  onTabChange: (tab: 'bom' | 'history' | 'activity') => void;
  activityEntries: Array<{
    id: number;
    action: string;
    createdAt: number;
    performedBy?: string | null;
    details?: Record<string, unknown> | null;
  }>;
  activityLoading: boolean;
  activityViewAllHref: string;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const TAB_BUTTONS = [
  { id: 'bom', label: 'Bill of materials' },
  { id: 'history', label: 'Price history' },
  { id: 'activity', label: 'Activity' },
];

function formatAbsoluteDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getMarginColor(margin: number): string {
  if (margin >= 15) return '#16a34a';
  if (margin >= 10) return '#d97706';
  return '#dc2626';
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
  if (action === 'product.rejected') {
    const reason = data.reason ? ` - ${String(data.reason)}` : '';
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
}: ProductTabsProps) {
  const { baseCurrency } = useBaseCurrency();
  const [priceHistory, setPriceHistory] = useState<ActivityEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFetched, setHistoryFetched] = useState(false);

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
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Bill of Materials {product.productionMode === 'batch' ? `(per unit from batch of ${product.batchYield || 1})` : ''}
            </div>
            {bomLoading ? (
              <div style={{ padding: '12px', color: '#64748b' }}>Loading BOM...</div>
            ) : displayBom.length === 0 ? (
              <div style={{ padding: '12px', color: '#64748b' }}>No materials in BOM</div>
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
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', textAlign: 'left', fontSize: '13px' }}>{item.materialName}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{item.quantity.toFixed(3)}</td>
                          <td style={{ padding: '8px', textAlign: 'left', fontSize: '13px' }}>{item.unit}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{baseCurrency} {toNumber(item.unitPrice).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>{baseCurrency} {totalCost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Fragment>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Recent activity</div>
              <Link to={activityViewAllHref} style={{ fontSize: '13px', color: '#0F2847', textDecoration: 'none', fontWeight: 600 }}>
                View all activity
              </Link>
            </div>

            {activityLoading ? (
              <div style={{ padding: '8px', color: '#64748b', fontSize: '13px' }}>Loading activity...</div>
            ) : activityEntries.length === 0 ? (
              <div style={{ padding: '8px', color: '#64748b', fontSize: '13px' }}>No recent activity yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {activityEntries.map((entry) => {
                  const visual = getActivityVisual(entry.action);
                  return (
                    <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                      <visual.Icon size={14} style={{ color: visual.color }} />
                      <div style={{ fontSize: '13px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={describeProductActivity(entry.action, entry.details, baseCurrency)}>
                        {describeProductActivity(entry.action, entry.details, baseCurrency)}
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right' }}>
                        {formatRelativeTime(entry.createdAt)}{entry.performedBy ? ` by ${entry.performedBy}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ padding: '16px' }}>
            {historyLoading ? (
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
                      <th style={{ padding: '8px', textAlign: 'right' }}>Margin</th>
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
                      const marginVal = typeof d?.margin === 'number' ? d.margin : null;

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
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: marginVal !== null ? getMarginColor(marginVal) : '#475569' }}>
                              {marginVal !== null ? `${marginVal.toFixed(1)}%` : '—'}
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
                              {entry.performedBy ?? '—'}
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
        )}
      </div>
    </div>
  );
}
