import ReportTableShell from '../shared/ReportTableShell';
import type { CostChangesReportResultMap } from '../types';
import { formatPct, paginateRows } from '../utils/reportUtils';

type PriceVsCostDriftViewProps = {
  data: CostChangesReportResultMap['price-vs-cost-drift'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function PriceVsCostDriftView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: PriceVsCostDriftViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);

  return (
    <div id="reporting-centre-print-area">
      <div style={{ marginBottom: '14px', fontSize: '15px', color: '#334155', fontWeight: 600 }}>
        {data.affectedCount} product{data.affectedCount === 1 ? '' : 's'} with cost changes affecting markup
      </div>
      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Product Name</th>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
                <th style={{ textAlign: 'right' }}>Current Cost</th>
                <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Current Markup %</th>
                <th style={{ textAlign: 'right' }}>Target Markup %</th>
                <th style={{ textAlign: 'right' }}>Markup Drift</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr key={`${row.productName}-${index}`}>
                  <td style={{ textAlign: 'left' }}>{row.productName}</td>
                  <td style={{ textAlign: 'left' }}>{row.category}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(row.approvedPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentCost)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPct(row.currentMarkupPercent)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPct(row.targetMarkupPercent)}</td>
                  <td style={{ textAlign: 'right', color: row.markupDrift >= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                    {formatPct(row.markupDrift)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTableShell>
      <div style={{ marginTop: '8px', color: '#64748b', fontSize: '13px' }}>
        Markup drift compares current Actual Markup % to the target markup stored at approval (profit margin). Negative drift means costs have risen since approval.
      </div>
    </div>
  );
}
