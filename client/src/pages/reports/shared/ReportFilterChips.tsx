import type { ActiveFilterChip } from '../types';
import { FILTER_CHIP_CLEAR_STYLE, FILTER_CHIP_STYLE } from '../utils/reportUtils';

type ReportFilterChipsProps = {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
};

export default function ReportFilterChips({ chips, onClearAll }: ReportFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '12px', marginBottom: '4px' }}>
      {chips.map((chip) => (
        <span key={chip.key} style={FILTER_CHIP_STYLE}>
          {chip.label}
          <button
            type="button"
            onClick={chip.onClear}
            aria-label={`Clear ${chip.label}`}
            style={FILTER_CHIP_CLEAR_STYLE}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        style={{ border: 'none', background: 'transparent', color: '#16A34A', cursor: 'pointer', fontSize: '12px', padding: '3px 0', fontWeight: 600 }}
      >
        Clear all filters
      </button>
    </div>
  );
}
