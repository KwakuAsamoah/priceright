interface TableDensityToggleProps {
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
}

export default function TableDensityToggle({ density, onToggleDensity }: TableDensityToggleProps) {
  return (
    <div
      style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}
      title="Table row density"
    >
      <button
        type="button"
        onClick={() => {
          if (density !== 'comfortable') onToggleDensity();
        }}
        style={{
          border: 'none',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          backgroundColor: density === 'comfortable' ? '#111827' : '#fff',
          color: density === 'comfortable' ? '#fff' : '#334155',
        }}
      >
        Comfortable
      </button>
      <button
        type="button"
        onClick={() => {
          if (density !== 'compact') onToggleDensity();
        }}
        style={{
          border: 'none',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          backgroundColor: density === 'compact' ? '#111827' : '#fff',
          color: density === 'compact' ? '#fff' : '#334155',
        }}
      >
        Compact
      </button>
    </div>
  );
}
