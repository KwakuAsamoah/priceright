import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  Clock,
  Clock3,
  FileText,
  HelpCircle,
  PlusCircle,
  Printer,
  Tag,
  Trash2,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { activityLogApi, settingsApi, type ActivityEntry } from '../api';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import useCompanyName from '../hooks/useCompanyName';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';
import { getThresholdMarkupColor } from '../utils/margin';
import { safeRender } from '../utils/render';
import { generateTablePDF, printTable } from '../utils/exportPrint';

const PAGE_SIZE = 50;

const ACTIVITY_PDF_COLUMNS = [
  { header: 'Date', dataKey: 'date' },
  { header: 'Action', dataKey: 'action' },
  { header: 'Product', dataKey: 'product' },
  { header: 'Details', dataKey: 'details' },
] as const;

function buildActivityPdfRows(entries: ActivityEntry[], currencyCode: string): Record<string, unknown>[] {
  return entries.map((entry) => {
    const description = getActivityDescription(entry, currencyCode);
    return {
      date: formatAbsoluteTime(entry.createdAt),
      action: entry.action,
      product: safeRender(
        entry.entityName
        ?? (entry.details as Record<string, unknown> | undefined)?.productName
        ?? (entry.details as Record<string, unknown> | undefined)?.materialName
        ?? (entry.details as Record<string, unknown> | undefined)?.levelName
        ?? 'Item',
      ),
      details: [description.title, description.subline].filter(Boolean).join(' | '),
    };
  });
}

function buildActivityPdfOptions(
  entries: ActivityEntry[],
  currencyCode: string,
  dateRange: string,
  companyName?: string,
) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    title: 'Activity Log',
    subtitle: dateRange,
    columns: [...ACTIVITY_PDF_COLUMNS],
    rows: buildActivityPdfRows(entries, currencyCode),
    landscape: false,
    companyName,
    filename: `activity-log-${date}.pdf`,
  };
}

type EntityFilter = 'all' | 'product' | 'material' | 'price_level' | 'exchange_rate';
type ActionGroupFilter = 'all' | 'approvals' | 'cost_changes' | 'created' | 'deleted';

type EntryVisual = {
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
};

const ENTITY_FILTER_LABELS: Record<EntityFilter, string> = {
  all: 'All types',
  product: 'Products',
  material: 'Materials',
  price_level: 'Price Levels',
  exchange_rate: 'Exchange Rates',
};

const ACTION_GROUP_LABELS: Record<ActionGroupFilter, string> = {
  all: 'All actions',
  approvals: 'Approvals',
  cost_changes: 'Cost changes',
  created: 'Created',
  deleted: 'Deleted',
};

const FILTER_CHIP_STYLE: React.CSSProperties = {
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

const FILTER_CHIP_CLOSE_STYLE: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#94A3B8',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '2px 4px',
  margin: '-2px -4px -2px 0',
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
    case 'product.reset_to_pending':
      return { Icon: RotateCcw, color: '#64748b' };
    case 'product.rejected':
      return { Icon: Clock3, color: '#64748b' };
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
    case 'price_level_item.bulk_approved':
      return { Icon: CheckCheck, color: '#16a34a' };
    default:
      return { Icon: Clock3, color: '#64748b' };
  }
}

function formatOverrideType(overrideType: unknown, value: unknown, currencyCode: string): string {
  if (overrideType === 'rule_discount') {
    return `Discount ${toNumberString(value)}%`;
  }
  if (overrideType === 'rule_markup') {
    return `Markup ${toNumberString(value)}%`;
  }
  if (overrideType === 'fixed_amount_add') {
    return `+${currencyCode} ${toNumberString(value)}`;
  }
  if (overrideType === 'fixed_amount_deduct') {
    return `-${currencyCode} ${toNumberString(value)}`;
  }
  if (overrideType === 'custom_price') {
    return 'Custom price';
  }
  return String(overrideType || 'Custom price');
}

function getActivityDescription(
  entry: ActivityEntry,
  currencyCode: string,
): {
  title: string;
  subline?: string;
  markupPercentAtApproval?: number;
  markupIsHistoricalGrossMargin?: boolean;
} {
  const details = (entry.details || {}) as Record<string, unknown>;
  const entityName = safeRender(
    entry.entityName ?? details.productName ?? details.materialName ?? details.levelName ?? details.currencyCode ?? 'Item',
  ) || 'Item';

  switch (entry.action) {
    case 'product.approved': {
      const oldPrice = details.oldPrice;
      const newPrice = details.newPrice;
      const title = oldPrice !== null && oldPrice !== undefined
        ? `${entityName} base price approved, changed from ${currencyCode} ${toMoney(oldPrice)} to ${currencyCode} ${toMoney(newPrice)}`
        : `${entityName} base price approved at ${currencyCode} ${toMoney(newPrice)}`;
      const hasMarkupPercent = details.markupPercent !== undefined
        && details.markupPercent !== null
        && Number.isFinite(Number(details.markupPercent));
      const markupIsHistoricalGrossMargin = !hasMarkupPercent
        && (details.grossMargin !== undefined || details.margin !== undefined);
      const markupPercentAtApproval = hasMarkupPercent
        ? Number(details.markupPercent)
        : Number(details.grossMargin ?? details.margin);
      return {
        title,
        subline: `Production cost: ${currencyCode} ${toMoney(details.productionCost)}`,
        markupPercentAtApproval: Number.isFinite(markupPercentAtApproval) ? markupPercentAtApproval : undefined,
        markupIsHistoricalGrossMargin,
      };
    }
    case 'product.reset_to_pending': {
      const reason = details.reason ? `Reason: ${safeRender(details.reason)}` : undefined;
      return {
        title: 'Price reset to pending',
        subline: reason,
      };
    }
    case 'product.rejected':
      return {
        title: 'Historical price rejection',
        subline: entityName !== 'Item' ? entityName : undefined,
      };
    case 'product.needs_review':
      return {
        title: `${entityName} flagged for price review`,
        subline: 'Cost change affected optimal price',
      };
    case 'material.cost_updated':
      return {
        title: `${entityName} unit cost updated`,
        subline: `${currencyCode} ${toMoney(details.oldGhsPrice)} -> ${currencyCode} ${toMoney(details.newGhsPrice)}`,
      };
    case 'material.created':
      return {
        title: `${entityName} added to materials`,
      };
    case 'exchange_rate.updated':
      return {
        title: `${safeRender(details.currencyCode || entityName)} exchange rate updated`,
        subline: `${toNumberString(details.oldRate, 4)} -> ${toNumberString(details.newRate, 4)} ${currencyCode} | ${toNumberString(details.productsAffected, 0)} products affected`,
      };
    case 'price_level.created':
      return {
        title: `Price level '${safeRender(details.levelName || entityName)}' created`,
      };
    case 'price_level.deleted':
      return {
        title: `Price level '${safeRender(details.levelName || entityName)}' deleted`,
      };
    case 'price_level_item.approved':
      return {
        title: `${safeRender(details.productName || entityName)} price approved in ${safeRender(details.levelName || 'Price level')}`,
        subline: `${formatOverrideType(details.overrideType, details.value, currencyCode)} - ${currencyCode} ${toMoney(details.finalPrice)}`,
      };
    case 'price_level_item.bulk_approved':
      return {
        title: `${toNumberString(details.count, 0)} prices approved in ${safeRender(details.levelName || entityName || 'Price level')}`,
      };
    default:
      return {
        title: safeRender(entry.action),
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
  const navigate = useNavigate();
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const lowMarkupThreshold = useLowMarkupThreshold();
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

  async function handleExportActivityPdf() {
    if (entries.length === 0) {
      setError('No activity entries to export.');
      return;
    }

    const dateRange = fromDate || toDate
      ? `${fromDate || 'start'} to ${toDate || 'today'}`
      : 'All dates';

    try {
      await generateTablePDF(buildActivityPdfOptions(entries, baseCurrency, dateRange, companyName));
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export activity log PDF.');
    }
  }

  async function handleActivityPrint() {
    if (entries.length === 0) {
      setError('No activity entries to print.');
      return;
    }

    const dateRange = fromDate || toDate
      ? `${fromDate || 'start'} to ${toDate || 'today'}`
      : 'All dates';

    try {
      await printTable(buildActivityPdfOptions(entries, baseCurrency, dateRange, companyName));
    } catch (printError: unknown) {
      setError(printError instanceof Error ? printError.message : 'Allow pop-ups to print the activity log.');
    }
  }

  const hasActiveFilters = entityType !== 'all'
    || actionGroup !== 'all'
    || fromDate !== ''
    || toDate !== '';

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
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }} data-print-hide>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              void handleExportActivityPdf();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={14} />
            Export PDF
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              void handleActivityPrint();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} />
            Print
          </button>
        </div>
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

            {hasActiveFilters ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
                {entityType !== 'all' ? (
                  <span style={FILTER_CHIP_STYLE}>
                    Type: {ENTITY_FILTER_LABELS[entityType]}
                    <button
                      type="button"
                      onClick={() => setEntityType('all')}
                      aria-label="Clear entity type filter"
                      style={FILTER_CHIP_CLOSE_STYLE}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
                {actionGroup !== 'all' ? (
                  <span style={FILTER_CHIP_STYLE}>
                    Action: {ACTION_GROUP_LABELS[actionGroup]}
                    <button
                      type="button"
                      onClick={() => setActionGroup('all')}
                      aria-label="Clear action filter"
                      style={FILTER_CHIP_CLOSE_STYLE}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
                {fromDate !== '' ? (
                  <span style={FILTER_CHIP_STYLE}>
                    From: {fromDate}
                    <button
                      type="button"
                      onClick={() => setFromDate('')}
                      aria-label="Clear date from filter"
                      style={FILTER_CHIP_CLOSE_STYLE}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
                {toDate !== '' ? (
                  <span style={FILTER_CHIP_STYLE}>
                    To: {toDate}
                    <button
                      type="button"
                      onClick={() => setToDate('')}
                      aria-label="Clear date to filter"
                      style={FILTER_CHIP_CLOSE_STYLE}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600 }}
                >
                  Clear all filters
                </button>
              </div>
            ) : null}

            <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: '14px',
                  color: '#64748b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
                data-print-hide
              >
                <span>Showing {entries.length} of {total} entries</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    title="Help"
                    onClick={() => navigate('/help?context=activity')}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: '4px',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.color = '#0F2847';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.color = '#94A3B8';
                    }}
                  >
                    <HelpCircle size={20} />
                  </button>
                </div>
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
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ marginTop: '16px' }}
                      onClick={clearFilters}
                    >
                      Clear all filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div>
                  {entries.map((entry) => {
                    const visual = resolveEntryVisual(entry.action);
                    const description = getActivityDescription(entry, baseCurrency);
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
                          {(description.subline || description.markupPercentAtApproval !== undefined) && (
                            <div style={{ marginTop: '3px', fontSize: '14px', color: '#64748b' }}>
                              {description.markupPercentAtApproval !== undefined && (
                                <>
                                  Markup %:{' '}
                                  <span style={{
                                    color: description.markupIsHistoricalGrossMargin
                                      ? '#64748b'
                                      : getThresholdMarkupColor(description.markupPercentAtApproval, lowMarkupThreshold),
                                    fontWeight: 600,
                                  }}>
                                    {description.markupPercentAtApproval.toFixed(1)}%
                                    {description.markupIsHistoricalGrossMargin ? ' (gross margin)' : ''}
                                  </span>
                                  {description.subline ? ' | ' : null}
                                </>
                              )}
                              {description.subline}
                            </div>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', minWidth: '140px' }}>
                          <div title={absoluteTime} style={{ fontSize: '14px', color: '#334155' }}>{relativeTime}</div>
                          <div style={{ marginTop: '2px', fontSize: '14px', color: '#94a3b8' }}>{safeRender(entry.userName || entry.performedBy || currentUserName || 'Admin')}</div>
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
