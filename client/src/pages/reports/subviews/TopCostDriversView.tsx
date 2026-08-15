import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import type { MaterialCostsReportResultMap } from '../types';
import { paginateRows, ROWS_PER_PAGE, formatPct } from '../utils/reportUtils';

type TopCostDriversViewProps = {
  data: MaterialCostsReportResultMap['top-cost-drivers'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function TopCostDriversView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: TopCostDriversViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);
  const rankOffset = (currentPage - 1) * ROWS_PER_PAGE;

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Materials in BOMs" value={String(data.totalMaterialsInBoms)} />
        <StatCard label="Total Weighted Cost" value={formatCurrency(data.totalWeightedCost)} />
        <StatCard label="Most Impactful Material" value={data.mostImpactfulMaterial} />
      </div>

      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'center', width: '56px' }}>Rank</th>
                <th style={{ textAlign: 'left' }}>Material Name</th>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th style={{ textAlign: 'right' }}>Times Used in BOMs</th>
                <th style={{ textAlign: 'right' }}>Total BOM Contribution</th>
                <th style={{ textAlign: 'right' }}>% of Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr key={`${row.materialName}-${index}`}>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{rankOffset + index + 1}</td>
                  <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                  <td style={{ textAlign: 'left' }}>{row.category}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(row.unitCost)}</td>
                  <td style={{ textAlign: 'right' }}>{row.bomUsageCount}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(row.totalContribution)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                      <div style={{ width: '100px', height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, row.percentOfTotal))}%`, height: '100%', backgroundColor: '#16a34a', borderRadius: '999px' }} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{formatPct(row.percentOfTotal)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTableShell>
    </div>
  );
}
