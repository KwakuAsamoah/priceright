import type { ColumnDef, ReportRow } from '../../../utils/reportExport';
import { calculateActualMarkupPercent } from '../../../utils/margin';

export const ROWS_PER_PAGE = 15;

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDate(value: string | number | null | undefined): Date | null {
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

export function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getDefaultApprovalFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export function getDefaultApprovalToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatApprovalExportDate(timestamp: string | number | null | undefined): string {
  const date = parseDate(timestamp);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function statusBadgeVariant(status: string): 'approved' | 'pending' | 'needs-review' | 'inactive' {
  if (status === 'approved') return 'approved';
  if (status === 'pending' || status === 'rejected') return 'pending';
  if (status === 'needs_review') return 'needs-review';
  return 'inactive';
}

export function approvalStatusLabel(status: string): string {
  if (status === 'needs_review') return 'Needs Review';
  if (status === 'approved') return 'Approved';
  if (status === 'pending' || status === 'rejected') return 'Pending';
  return 'Pending';
}

export function formatSignedNumber(value: number): string {
  const absValue = Math.abs(value).toFixed(2);
  return value < 0 ? `(${absValue})` : absValue;
}

export function roundExportMarkupPercent(approvedPrice: number, totalCost: number): number | null {
  const markup = calculateActualMarkupPercent(approvedPrice, totalCost);
  if (markup == null) return null;
  return Math.round(markup * 100) / 100;
}

export function getPriceVolatilityPeriodLabel(period: '30' | '90' | '180' | '365'): string {
  if (period === '30') return 'Last 30 days';
  if (period === '180') return 'Last 180 days';
  if (period === '365') return 'Last 365 days';
  return 'Last 90 days';
}

export function getPriceVolatilityStartColumnLabel(period: '30' | '90' | '180' | '365'): string {
  return `Cost at Start (${period} days ago)`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)}%`;
}

export function paginateRows<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * ROWS_PER_PAGE;
  return rows.slice(start, start + ROWS_PER_PAGE);
}

export function getTotalPages(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / ROWS_PER_PAGE));
}

export function withCurrencyColumnAfter(
  payload: { rows: ReportRow[]; columns: ColumnDef[]; filename: string },
  afterKey: string,
  currencyCode: string,
) {
  const afterIndex = payload.columns.findIndex((column) => column.key === afterKey);
  if (afterIndex === -1) {
    return payload;
  }

  return {
    ...payload,
    rows: payload.rows.map((row) => ({ ...row, currency: currencyCode })),
    columns: [
      ...payload.columns.slice(0, afterIndex + 1),
      { key: 'currency', label: 'Currency' },
      ...payload.columns.slice(afterIndex + 1),
    ],
  };
}

export const INLINE_FILTER_ROW_STYLE = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  backgroundColor: '#F8FAFC',
  padding: '10px 16px',
  borderRadius: '8px',
  marginBottom: '12px',
} as const;

export const INLINE_FILTER_FIELD = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: '130px',
} as const;

export const REPORT_SELECTOR_STICKY_STYLE = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  backgroundColor: 'var(--color-bg)',
  paddingTop: '8px',
  paddingBottom: '8px',
} as const;

export const FILTER_CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: '#F1F5F9',
  border: '1px solid #CBD5E1',
  color: '#475569',
  fontSize: '12px',
  padding: '3px 8px',
  borderRadius: '12px',
} as const;

export const FILTER_CHIP_CLEAR_STYLE = {
  border: 'none',
  background: 'transparent',
  color: '#94A3B8',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: '2px 4px',
  margin: '-2px -4px -2px 0',
} as const;
