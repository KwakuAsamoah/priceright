import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import type { MaterialCostsReportResultMap } from '../types';
import { paginateRows, ROWS_PER_PAGE } from '../utils/reportUtils';

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Materials in BOMs" value={String(data.totalMaterialsInBoms)} />
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTableShell>
    </div>
  );
}
