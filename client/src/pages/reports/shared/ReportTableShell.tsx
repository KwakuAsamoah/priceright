import type { ReactNode } from 'react';
import { getTotalPages } from '../utils/reportUtils';

type ReportTableShellProps = {
  rowCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  children: ReactNode;
};

export default function ReportTableShell({
  rowCount,
  currentPage,
  onPageChange,
  children,
}: ReportTableShellProps) {
  if (rowCount === 0) {
    return <>{children}</>;
  }

  const totalPages = getTotalPages(rowCount);

  return (
    <>
      {children}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          style={{ color: currentPage <= 1 ? undefined : '#0F2847' }}
          aria-label="Previous page"
        >
          ←
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          style={{ color: currentPage >= totalPages ? undefined : '#0F2847' }}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </>
  );
}
