export default function StatCard({
  label,
  value,
  tone = 'default',
  secondary,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  secondary?: string;
}) {
  const colorByTone = tone === 'success'
    ? '#166534'
    : tone === 'danger'
      ? '#b91c1c'
      : tone === 'warning'
        ? '#92400e'
        : '#0f172a';

  const backgroundByTone = tone === 'success'
    ? '#f0fdf4'
    : tone === 'danger'
      ? '#fef2f2'
      : tone === 'warning'
        ? '#fffbeb'
        : '#f8fafc';

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', backgroundColor: backgroundByTone }}>
      <div style={{ fontSize: '13px', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: colorByTone }}>{value}</div>
      {secondary && <div style={{ marginTop: '2px', fontSize: '13px', color: '#64748b' }}>{secondary}</div>}
    </div>
  );
}
