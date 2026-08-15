import StatCard from '../shared/StatCard';
import PricingStatusTable from '../shared/PricingStatusTable';
import ReportTableShell from '../shared/ReportTableShell';
import type { PricingHealthReportResultMap } from '../types';
import { formatPct, paginateRows } from '../utils/reportUtils';

type PricingStatusViewProps = {
  data: PricingHealthReportResultMap['pricing-status'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
  lowMarkupThreshold: number;
};

export default function PricingStatusView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
  lowMarkupThreshold,
}: PricingStatusViewProps) {
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
  const paginatedRows = paginateRows(data.rows, currentPage);

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

      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
        <PricingStatusTable
          rows={paginatedRows}
          formatCurrency={formatCurrency}
          markupThreshold={lowMarkupThreshold}
        />
      </ReportTableShell>
    </div>
  );
}
