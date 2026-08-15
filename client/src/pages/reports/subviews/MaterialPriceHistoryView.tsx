import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import type { CostChangesReportResultMap } from '../types';
import { formatPct, formatSignedNumber, paginateRows } from '../utils/reportUtils';

type MaterialPriceHistoryViewProps = {
  data: CostChangesReportResultMap['material-price-history'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function MaterialPriceHistoryView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: MaterialPriceHistoryViewProps) {
  if (!data.materialId) {
    return (
      <div id="reporting-centre-print-area">
        <div style={{ color: '#64748b', fontSize: '14px' }}>
          Select a material above to view its price history
        </div>
      </div>
    );
  }

  const paginatedRows = paginateRows(data.rows, currentPage);
  const trendLabel = data.costTrend === 'up' ? 'Up' : data.costTrend === 'down' ? 'Down' : 'Stable';
  const trendTone = data.costTrend === 'up' ? 'danger' : data.costTrend === 'down' ? 'success' : 'default';

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Current Cost" value={formatCurrency(data.currentCost)} />
        <StatCard label="First Recorded Cost" value={data.firstRecordedCost == null ? '—' : formatCurrency(data.firstRecordedCost)} />
        <StatCard label="Price Changes" value={String(data.priceChangeCount)} />
        <StatCard label="Cost Trend" value={trendLabel} tone={trendTone as 'default' | 'success' | 'danger'} />
      </div>

      {data.rows.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px' }}>No price changes recorded for this material.</div>
      ) : (
        <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'right' }}>Old Cost</th>
                  <th style={{ textAlign: 'right' }}>New Cost</th>
                  <th style={{ textAlign: 'right' }}>Change Amount</th>
                  <th style={{ textAlign: 'right' }}>Change %</th>
                  <th style={{ textAlign: 'left' }}>Changed By</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <tr key={`${row.date}-${index}`}>
                    <td style={{ textAlign: 'left' }}>{row.date}</td>
                    <td style={{ textAlign: 'right' }}>{row.oldCost == null ? '—' : formatCurrency(row.oldCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.newCost)}</td>
                    <td style={{ textAlign: 'right' }}>{row.changeAmount == null ? '—' : formatSignedNumber(row.changeAmount)}</td>
                    <td style={{ textAlign: 'right' }}>{row.changePercent == null ? '—' : formatPct(row.changePercent)}</td>
                    <td style={{ textAlign: 'left' }}>{row.changedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportTableShell>
      )}
    </div>
  );
}
