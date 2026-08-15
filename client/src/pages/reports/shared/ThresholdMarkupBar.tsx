import { getThresholdMarkupColor } from '../../../utils/margin';
import { formatPct } from '../utils/reportUtils';

export default function ThresholdMarkupBar({ value, threshold }: { value: number | null | undefined; threshold: number }) {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(threshold)) {
    return <span style={{ color: '#94a3b8' }}>—</span>;
  }

  const color = getThresholdMarkupColor(value, threshold);
  const scaleMax = Math.min(threshold * 2, 100);
  const widthPercent = scaleMax > 0 ? Math.min(100, Math.max(0, (value / scaleMax) * 100)) : 0;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
      <div style={{ width: '120px', height: '8px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${widthPercent}%`, height: '100%', backgroundColor: color, borderRadius: '999px' }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>{formatPct(value)}</span>
    </div>
  );
}
