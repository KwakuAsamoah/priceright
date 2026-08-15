import AppBadge from '../../../components/AppBadge';
import ReportTableShell from '../shared/ReportTableShell';
import StatCard from '../shared/StatCard';
import type { ApprovalsListsReportResultMap } from '../types';
import { formatPct, paginateRows, parseDate, statusBadgeVariant } from '../utils/reportUtils';

type ApprovalHistoryViewProps = {
  data: ApprovalsListsReportResultMap['approval-history'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function ApprovalHistoryView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: ApprovalHistoryViewProps) {
  const approved = data.rows.filter((row) => row.currentStatus === 'approved').length;
  const pending = data.rows.filter((row) => row.currentStatus === 'pending').length;
  const needsReview = data.rows.filter((row) => row.currentStatus === 'needs_review').length;
  const paginatedRows = paginateRows(data.rows, currentPage);

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Total Approvals" value={String(data.rows.length)} />
        <StatCard label="Approved" value={String(approved)} tone="success" />
        <StatCard label="Pending" value={String(pending)} tone="default" />
        <StatCard label="Needs Review" value={String(needsReview)} tone="warning" />
      </div>

      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
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
              {paginatedRows.map((row, index) => (
                <tr key={`${row.productName}-${index}`}>
                  <td style={{ textAlign: 'left' }}>{row.productName}</td>
                  <td style={{ textAlign: 'left' }}>{row.category}</td>
                  <td style={{ textAlign: 'left' }}>
                    <AppBadge variant={statusBadgeVariant(row.currentStatus)} size="sm">{row.currentStatus}</AppBadge>
                  </td>
                  <td style={{ textAlign: 'right' }}>{row.approvedPrice === null ? '—' : formatCurrency(row.approvedPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{row.optimalPrice == null ? '—' : formatCurrency(row.optimalPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{row.actualMarkupPercent == null ? '—' : formatPct(row.actualMarkupPercent)}</td>
                  <td style={{ textAlign: 'left' }}>{parseDate(row.approvedOn)?.toLocaleString() || '—'}</td>
                  <td style={{ textAlign: 'left' }}>{row.approvedBy}</td>
                  <td style={{ textAlign: 'left' }}>{row.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTableShell>

      <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
        † Approved base price, production cost, and markup % come from the recorded approval snapshot. Optimal price and current status are shown as today&apos;s values. Historical optimal price at approval time is not stored. Approvals logged before activity history was introduced may not appear.
      </div>
    </div>
  );
}
