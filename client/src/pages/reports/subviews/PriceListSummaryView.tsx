import AppBadge from '../../../components/AppBadge';
import ReportTableShell from '../shared/ReportTableShell';
import StatCard from '../shared/StatCard';
import type { ApprovalsListsReportResultMap } from '../types';
import { paginateRows } from '../utils/reportUtils';

type PriceListSummaryViewProps = {
  data: ApprovalsListsReportResultMap['price-list-summary'];
  currentPage: number;
  onPageChange: (page: number) => void;
};

export default function PriceListSummaryView({
  data,
  currentPage,
  onPageChange,
}: PriceListSummaryViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Total Price Lists" value={String(data.rows.length)} />
        <StatCard label="Active" value={String(data.activeCount)} tone="success" />
        <StatCard label="Expiring Within 30 Days" value={String(data.expiringSoonCount)} tone="warning" />
        <StatCard label="Expired" value={String(data.expiredCount)} tone="danger" />
      </div>

      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
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
              {paginatedRows.map((row, index) => {
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
      </ReportTableShell>
    </div>
  );
}
