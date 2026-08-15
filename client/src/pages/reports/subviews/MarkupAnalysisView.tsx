import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import ThresholdMarkupBar from '../shared/ThresholdMarkupBar';
import type { PricingHealthReportResultMap } from '../types';
import { formatPct, paginateRows } from '../utils/reportUtils';

type MarkupAnalysisViewProps = {
  data: PricingHealthReportResultMap['markup-analysis'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
  markupAnalysisThreshold: number;
};

export default function MarkupAnalysisView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
  markupAnalysisThreshold,
}: MarkupAnalysisViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);
  const threshold = Number.isFinite(data.threshold) ? data.threshold : markupAnalysisThreshold;
  const averageMarkup = Number.isFinite(data.averageMarkup) ? data.averageMarkup : null;
  const halfThreshold = threshold / 2;
  const aboveTargetPct = data.totalAnalysed > 0 ? (data.aboveTargetCount / data.totalAnalysed) * 100 : 0;

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Total Products Analysed" value={String(data.totalAnalysed)} />
        <StatCard label="Above Target" value={String(data.aboveTargetCount)} tone="success" />
        <StatCard label="Below Target" value={String(data.belowTargetCount)} tone="danger" />
        <StatCard
          label="Average Markup"
          value={formatPct(averageMarkup)}
          tone={averageMarkup != null && averageMarkup >= threshold ? 'success' : averageMarkup != null && averageMarkup >= halfThreshold ? 'warning' : 'danger'}
        />
        <StatCard
          label="Distribution"
          value={`${aboveTargetPct.toFixed(0)}% above target`}
          secondary={`Target: ${Number.isFinite(threshold) ? threshold.toFixed(1) : '—'}% markup`}
        />
      </div>

      {data.rows.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px' }}>No products match the selected filters.</div>
      ) : (
        <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'right' }}>Production Cost</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>Price</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Actual Markup %</th>
                  <th style={{ textAlign: 'right' }}>Target Gap</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.productName}>
                    <td style={{ textAlign: 'left' }}>{row.productName}</td>
                    <td style={{ textAlign: 'left' }}>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <ThresholdMarkupBar value={row.actualMarkupPercent} threshold={threshold} />
                    </td>
                    <td style={{ textAlign: 'right', color: row.targetGap >= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                      {formatPct(row.targetGap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportTableShell>
      )}

      <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
        Actual markup = (Approved Price − Production Cost) / Production Cost × 100. Target gap = Actual Markup % − target threshold. Only approved products with price and cost are included.
      </div>
    </div>
  );
}
