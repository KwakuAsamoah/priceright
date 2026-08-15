import StatCard from '../shared/StatCard';
import ReportTableShell from '../shared/ReportTableShell';
import type { CostChangesReportResultMap } from '../types';
import { formatPct, formatSignedNumber, paginateRows } from '../utils/reportUtils';

type PriceVolatilityViewProps = {
  data: CostChangesReportResultMap['price-volatility'];
  currentPage: number;
  onPageChange: (page: number) => void;
  formatCurrency: (value: number) => string;
};

export default function PriceVolatilityView({
  data,
  currentPage,
  onPageChange,
  formatCurrency,
}: PriceVolatilityViewProps) {
  const paginatedRows = paginateRows(data.rows, currentPage);

  if (!data.endpointAvailable) {
    return (
      <div id="reporting-centre-print-area">
        <div style={{ color: '#64748b', fontSize: '14px' }}>
          Price history data not available — prices are recorded when materials are updated
        </div>
      </div>
    );
  }

  return (
    <div id="reporting-centre-print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        <StatCard label="Materials with Price Changes" value={String(data.materialsWithChanges)} />
        <StatCard label="Average Change %" value={formatPct(data.averageChangePercent)} />
        <StatCard label="Biggest Increase" value={data.biggestIncreaseName} secondary={formatPct(data.biggestIncreasePercent)} tone="danger" />
        <StatCard label="Biggest Decrease" value={data.biggestDecreaseName} secondary={formatPct(data.biggestDecreasePercent)} tone="success" />
      </div>

      {data.rows.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px' }}>
          No materials had price changes in the selected period.
        </div>
      ) : (
        <ReportTableShell rowCount={data.rows.length} currentPage={currentPage} onPageChange={onPageChange}>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Material Name</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th style={{ textAlign: 'left' }}>Unit</th>
                  <th style={{ textAlign: 'right' }}>Cost at Start of Period</th>
                  <th style={{ textAlign: 'right' }}>Current Cost</th>
                  <th style={{ textAlign: 'right' }}>Change Amount</th>
                  <th style={{ textAlign: 'right' }}>Change %</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => {
                  const changeColor = row.changePercent < 0 ? '#166534' : row.changePercent > 0 ? '#b91c1c' : '#64748b';
                  return (
                    <tr key={`${row.materialName}-${index}`}>
                      <td style={{ textAlign: 'left' }}>{row.materialName}</td>
                      <td style={{ textAlign: 'left' }}>{row.category}</td>
                      <td style={{ textAlign: 'left' }}>{row.unit}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.costAtStart)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentCost)}</td>
                      <td style={{ textAlign: 'right', color: changeColor, fontWeight: 600 }}>{formatSignedNumber(row.changeAmount)}</td>
                      <td style={{ textAlign: 'right', color: changeColor, fontWeight: 600 }}>{formatPct(row.changePercent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportTableShell>
      )}
    </div>
  );
}
