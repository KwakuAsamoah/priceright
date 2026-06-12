import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  Clock,
  Clock3,
  PlusCircle,
  Tag,
  Trash2,
  TrendingUp,
  XCircle,
  XSquare,
} from 'lucide-react';
import { activityLogApi, settingsApi, type ActivityEntry } from '../api';

const PAGE_SIZE = 50;

type EntityFilter = 'all' | 'product' | 'material' | 'price_level' | 'exchange_rate';
type ActionGroupFilter = 'all' | 'approvals' | 'rejections' | 'cost_changes' | 'created' | 'deleted';

type EntryVisual = {
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
};

function toMoney(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }
  return numeric.toFixed(2);
}

function toNumberString(value: unknown, digits = 2): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toFixed(digits);
}

function formatAbsoluteTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSeconds;

  if (delta < 60) return 'just now';
  if (delta < 3600) {
    const minutes = Math.floor(delta / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (delta < 86400) {
    const hours = Math.floor(delta / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (delta < 604800) {
    const days = Math.floor(delta / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  const weeks = Math.floor(delta / 604800);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

function toEpochStartOfDay(dateValue: string): number | undefined {
  if (!dateValue) return undefined;
  const parsed = new Date(`${dateValue}T00:00:00`);
  const ms = parsed.getTime();
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
}

function toEpochEndOfDay(dateValue: string): number | undefined {
  if (!dateValue) return undefined;
  const parsed = new Date(`${dateValue}T23:59:59`);
  const ms = parsed.getTime();
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
}

function resolveEntryVisual(action: string): EntryVisual {
  switch (action) {
    case 'product.approved':
      return { Icon: CheckCircle2, color: '#16a34a' };
    case 'product.rejected':
      return { Icon: XCircle, color: '#dc2626' };
    case 'product.needs_review':
      return { Icon: AlertTriangle, color: '#d97706' };
    case 'material.cost_updated':
      return { Icon: TrendingUp, color: '#475569' };
    case 'material.created':
      return { Icon: PlusCircle, color: '#475569' };
    case 'exchange_rate.updated':
      return { Icon: ArrowLeftRight, color: '#7c3aed' };
    case 'price_level.created':
      return { Icon: Tag, color: '#0f172a' };
    case 'price_level.deleted':
      return { Icon: Trash2, color: '#dc2626' };
    case 'price_level_item.approved':
      return { Icon: CheckSquare, color: '#16a34a' };
    case 'price_level_item.rejected':
      return { Icon: XSquare, color: '#dc2626' };
    case 'price_level_item.bulk_approved':
      return { Icon: CheckCheck, color: '#16a34a' };
    default:
      return { Icon: Clock3, color: '#64748b' };
  }
}

function formatOverrideType(overrideType: unknown, value: unknown): string {
  if (overrideType === 'rule_discount') {
    return `Discount ${toNumberString(value)}%`;
  }
  if (overrideType === 'rule_markup') {
    return `Markup ${toNumberString(value)}%`;
  }
  if (overrideType === 'fixed_amount_add') {
    return `+GHS ${toNumberString(value)}`;
  }
  if (overrideType === 'fixed_amount_deduct') {
    return `-GHS ${toNumberString(value)}`;
  }
  if (overrideType === 'custom_price') {
    return 'Custom price';
  }
  return String(overrideType || 'Custom price');
}

function getActivityDescription(entry: ActivityEntry): { title: string; subline?: string } {
  const details = (entry.details || {}) as Record<string, unknown>;
  const entityName = entry.entityName || details.productName || details.materialName || details.levelName || details.currencyCode || 'Item';

  switch (entry.action) {
    case 'product.approved': {
      const oldPrice = details.oldPrice;
      const newPrice = details.newPrice;
      const title = oldPrice !== null && oldPrice !== undefined
        ? `${entityName} base price approved, changed from GHS ${toMoney(oldPrice)} to GHS ${toMoney(newPrice)}`
        : `${entityName} base price approved at GHS ${toMoney(newPrice)}`;
      return {
        title,
        subline: `Gross Margin %: ${toNumberString(details.margin)}% | Production cost: GHS ${toMoney(details.productionCost)}`,
      };
    }
    case 'product.rejected': {
      const reason = details.reason ? `Reason: ${String(details.reason)}` : undefined;
      return {
        title: `${entityName} base price rejected`,
        subline: reason,
      };
    }
    case 'product.needs_review':
      return {
        title: `${entityName} flagged for price review`,
        subline: 'Cost change affected optimal price',
      };
    case 'material.cost_updated':
      return {
        title: `${entityName} unit cost updated`,
        subline: `GHS ${toMoney(details.oldGhsPrice)} -> GHS ${toMoney(details.newGhsPrice)}`,
      };
    case 'material.created':
      return {
        title: `${entityName} added to materials`,
      };
    case 'exchange_rate.updated':
      return {
        title: `${String(details.currencyCode || entityName)} exchange rate updated`,
        subline: `${toNumberString(details.oldRate, 4)} -> ${toNumberString(details.newRate, 4)} GHS | ${toNumberString(details.productsAffected, 0)} products affected`,
      };
    case 'price_level.created':
      return {
        title: `Price level '${String(details.levelName || entityName)}' created`,
      };
    case 'price_level.deleted':
      return {
        title: `Price level '${String(details.levelName || entityName)}' deleted`,
      };
    case 'price_level_item.approved':
      return {
        title: `${String(details.productName || entityName)} price approved in ${String(details.levelName || 'Price level')}`,
        subline: `${formatOverrideType(details.overrideType, details.value)} - GHS ${toMoney(details.finalPrice)}`,
      };
    case 'price_level_item.rejected':
      return {
        title: `${String(details.productName || entityName)} price rejected in ${String(details.levelName || 'Price level')}`,
        subline: details.reason ? `Reason: ${String(details.reason)}` : undefined,
      };
    case 'price_level_item.bulk_approved':
      return {
        title: `${toNumberString(details.count, 0)} prices approved in ${String(details.levelName || entityName || 'Price level')}`,
      };
    default:
      return {
        title: entry.action,
      };
  }
}

function matchesEntityFilter(entry: ActivityEntry, filter: EntityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'price_level') {
    return entry.entityType === 'price_level' || entry.entityType === 'price_level_item';
  }
  return entry.entityType === filter;
}

function matchesActionFilter(entry: ActivityEntry, filter: ActionGroupFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'approvals') {
    return entry.action.endsWith('.approved') || entry.action.endsWith('.bulk_approved');
  }
  if (filter === 'rejections') {
    return entry.action.endsWith('.rejected');
  }
  if (filter === 'cost_changes') {
    return entry.action === 'material.cost_updated' || entry.action === 'exchange_rate.updated' || entry.action === 'product.needs_review';
  }
  if (filter === 'created') {
    return entry.action.endsWith('.created');
  }
  if (filter === 'deleted') {
    return entry.action.endsWith('.deleted');
  }
  return true;
}

export default function Activity() {
  // Tier 2: add role-based access control here
  // For Tier 1 Solo this page is accessible to all users
  const searchParams = new URLSearchParams(window.location.search);
  const initialEntityType = (searchParams.get('entityType') || '').trim();

  const [currentUserName, setCurrentUserName] = useState('');

  const [entityType, setEntityType] = useState<EntityFilter>(
    initialEntityType === 'product' || initialEntityType === 'material' || initialEntityType === 'exchange_rate' || initialEntityType === 'price_level'
      ? initialEntityType
      : (initialEntityType === 'price_level_item' ? 'price_level' : 'all')
  );
  const [actionGroup, setActionGroup] = useState<ActionGroupFilter>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCurrentUserName() {
      try {
        const settings = await settingsApi.getAll() as Array<{ settingKey: string; settingValue: string }>;
        if (!mounted) return;
        const userName = settings.find((item) => item.settingKey === 'userName')?.settingValue?.trim()
          || settings.find((item) => item.settingKey === 'companyName')?.settingValue?.trim()
          || 'Admin';
        setCurrentUserName(userName);
      } catch {
        if (!mounted) return;
        setCurrentUserName('Admin');
      }
    }

    loadCurrentUserName();

    return () => {
      mounted = false;
    };
  }, []);

  const fetchEntries = useCallback(async (nextOffset: number, append: boolean) => {
    const isAppend = append && nextOffset > 0;
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const fromEpoch = toEpochStartOfDay(fromDate);
      const toEpoch = toEpochEndOfDay(toDate);

      const response = await activityLogApi.getAll({
        limit: PAGE_SIZE,
        offset: nextOffset,
        entityType: entityType === 'all' || entityType === 'price_level' ? undefined : entityType,
        from: fromEpoch,
        to: toEpoch,
      });

      const incoming = Array.isArray(response.entries) ? response.entries : [];
      const filteredIncoming = incoming
        .filter((entry) => matchesEntityFilter(entry, entityType))
        .filter((entry) => matchesActionFilter(entry, actionGroup));

      setEntries((prev) => (append ? [...prev, ...filteredIncoming] : filteredIncoming));
      setTotal(Number(response.total || 0));
      setOffset(nextOffset);
    } catch (fetchError: any) {
      setError(fetchError?.message || 'Failed to fetch activity log.');
      if (!append) {
        setEntries([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [entityType, actionGroup, fromDate, toDate]);

  useEffect(() => {
    void fetchEntries(0, false);
  }, [fetchEntries]);

  const canLoadMore = entries.length < total;

  const clearFilters = () => {
    setEntityType('all');
    setActionGroup('all');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <h1 className="app-page-title">Activity</h1>
        <div className="app-page-subtitle">Complete record of all actions across the app</div>
      </div>

      <div className="app-page-content app-page-content--data">
        <>
            <div className="app-card app-filter-card" style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: '10px' }}>
                <div>
                  <label className="app-settings-label">Entity type</label>
                  <select className="app-control" value={entityType} onChange={(e) => setEntityType(e.target.value as EntityFilter)}>
                    <option value="all">All types</option>
                    <option value="product">Products</option>
                    <option value="material">Materials</option>
                    <option value="price_level">Price Levels</option>
                    <option value="exchange_rate">Exchange Rates</option>
                  </select>
                </div>

                <div>
                  <label className="app-settings-label">Action</label>
                  <select className="app-control" value={actionGroup} onChange={(e) => setActionGroup(e.target.value as ActionGroupFilter)}>
                    <option value="all">All actions</option>
                    <option value="approvals">Approvals</option>
                    <option value="rejections">Rejections</option>
                    <option value="cost_changes">Cost changes</option>
                    <option value="created">Created</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </div>

                <div>
                  <label className="app-settings-label">Date from</label>
                  <input className="app-control" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>

                <div>
                  <label className="app-settings-label">Date to</label>
                  <input className="app-control" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={clearFilters}
                    style={{ width: '100%' }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </div>

            <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#64748b' }}>
                Showing {entries.length} of {total} entries
              </div>

              {loading ? (
                <div style={{ padding: '22px 16px', textAlign: 'center', color: '#64748b' }}>Loading activity...</div>
              ) : error ? (
                <div style={{ padding: '16px', color: '#b91c1c', fontSize: '15px' }}>{error}</div>
              ) : entries.length === 0 ? (
                <div className="app-empty-state" style={{ minHeight: '260px' }}>
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
                    <Clock size={24} color="#94a3b8" />
                  </div>
                  <div className="app-empty-state-title">
                    No activity yet
                  </div>
                  <div className="app-empty-state-text">
                    Actions in PriceRight are recorded here — approvals, price changes, material updates, and more.
                  </div>
                </div>
              ) : (
                <div>
                  {entries.map((entry) => {
                    const visual = resolveEntryVisual(entry.action);
                    const description = getActivityDescription(entry);
                    const absoluteTime = formatAbsoluteTime(entry.createdAt);
                    const relativeTime = formatRelativeTime(entry.createdAt);

                    return (
                      <div
                        key={entry.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '22px minmax(0, 1fr) auto',
                          gap: '12px',
                          alignItems: 'center',
                          borderBottom: '1px solid #f0f0f0',
                          padding: '14px 16px',
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.backgroundColor = '#f8fafc';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <visual.Icon size={16} style={{ color: visual.color }} />

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '15px', color: '#0f172a' }}>{description.title}</div>
                          {description.subline && (
                            <div style={{ marginTop: '3px', fontSize: '14px', color: '#64748b' }}>{description.subline}</div>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', minWidth: '140px' }}>
                          <div title={absoluteTime} style={{ fontSize: '14px', color: '#334155' }}>{relativeTime}</div>
                          <div style={{ marginTop: '2px', fontSize: '14px', color: '#94a3b8' }}>{entry.userName || entry.performedBy || currentUserName || 'Admin'}</div>
                        </div>
                      </div>
                    );
                  })}

                  {canLoadMore && (
                    <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void fetchEntries(offset + PAGE_SIZE, true)}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
        </>
      </div>
    </div>
  );
}
