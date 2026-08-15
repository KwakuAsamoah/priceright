import type { ReactNode } from 'react';
import { INLINE_FILTER_ROW_STYLE } from '../utils/reportUtils';

type ReportFilterBarProps = {
  filters: ReactNode;
  exportToolbar: ReactNode;
};

export default function ReportFilterBar({ filters, exportToolbar }: ReportFilterBarProps) {
  return (
    <div style={INLINE_FILTER_ROW_STYLE}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
        {filters}
      </div>
      {exportToolbar}
    </div>
  );
}
