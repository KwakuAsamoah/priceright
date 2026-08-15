import AppBadge from '../../../components/AppBadge';
import type { PricingStatusRow } from '../types';
import { formatSignedNumber, statusBadgeVariant } from '../utils/reportUtils';
import ThresholdMarkupBar from './ThresholdMarkupBar';

function approvalStatusLabel(status: PricingStatusRow['approvalStatus']): string {
  if (status === 'needs_review') return 'Needs Review';
  if (status === 'approved') return 'Approved';
  if (status === 'pending' || status === 'rejected') return 'Pending';
  return 'Pending';
}

type PricingStatusTableProps = {
  rows: PricingStatusRow[];
  formatCurrency: (value: number) => string;
  markupThreshold: number;
};

export default function PricingStatusTable({
  rows,
  formatCurrency,
  markupThreshold,
}: PricingStatusTableProps) {
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Product Name</th>
            <th style={{ textAlign: 'left' }}>Approval</th>
            <th style={{ textAlign: 'left' }}>Category</th>
            <th style={{ textAlign: 'right' }}>Prod. Cost</th>
            <th style={{ textAlign: 'right' }}>Optimal Price</th>
            <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>Approved<br/>base price</th>
            <th style={{ textAlign: 'right' }}>Variance</th>
            <th style={{ textAlign: 'right' }}>Profit</th>
            <th style={{ textAlign: 'right' }}>Actual Markup %</th>
            <th style={{ textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productName}>
              <td style={{ textAlign: 'left' }}>{row.productName}</td>
              <td style={{ textAlign: 'left' }}>
                <AppBadge variant={statusBadgeVariant(row.approvalStatus)} size="sm">
                  {approvalStatusLabel(row.approvalStatus)}
                </AppBadge>
              </td>
              <td style={{ textAlign: 'left' }}>{row.category}</td>
              <td style={{ color: '#64748b', textAlign: 'right' }}>{formatCurrency(row.productionCost)}</td>
              <td style={{ color: '#64748b', textAlign: 'right' }}>{formatCurrency(row.optimalPrice)}</td>
              <td style={{ textAlign: 'right' }}>{row.hasSellingPrice ? formatCurrency(row.sellingPrice) : '—'}</td>
              <td style={{ textAlign: 'right', color: row.variance < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{row.hasSellingPrice ? formatSignedNumber(row.variance) : '—'}</td>
              <td style={{ textAlign: 'right', color: row.profit < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{row.hasSellingPrice ? formatSignedNumber(row.profit) : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {row.hasSellingPrice ? (
                  <ThresholdMarkupBar value={row.markupPct} threshold={markupThreshold} />
                ) : '—'}
              </td>
              <td style={{ textAlign: 'left' }}>
                {row.hasSellingPrice ? (
                  <AppBadge variant={row.pricingStatus === 'Above Optimal' ? 'success' : row.pricingStatus === 'Below Optimal' ? 'danger' : 'info'} size="sm">
                    {row.pricingStatus}
                  </AppBadge>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
