import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import type { MaterialCostsReportResultMap } from '../types';
import { paginateRows } from '../utils/reportUtils';

type MaterialsCostAnalysisViewProps = {
  data: MaterialCostsReportResultMap['materials-cost-analysis'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function MaterialsCostAnalysisView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: MaterialsCostAnalysisViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Total Active Materials" value={String(data.totalActiveMaterials)} />
        <StatCard label="Average Unit Cost" value={formatCurrency(data.averageUnitCost)} />
        <StatCard label="Most Expensive Material" value={data.mostExpensiveName} secondary={formatCurrency(data.mostExpensiveCost)} />
        <StatCard label="Categories" value={String(data.categoryCount)} />
      </div>

      <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Material Name</th>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'left' }}>Unit</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th style={{ textAlign: 'right' }}>Used in Products</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr key={`${row.materialName}-${index}`}>
                  <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                  <td style={{ textAlign: 'left' }}>{row.category}</td>
                  <td style={{ textAlign: 'left' }}>{row.unit}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(row.unitCost)}</td>
                  <td style={{ textAlign: 'right' }}>{row.productsUsedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTableShell>
    </div>
  );
}
