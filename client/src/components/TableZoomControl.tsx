interface TableZoomControlProps {
  zoomPercent: number;
  increaseZoom: () => void;
  decreaseZoom: () => void;
}

export default function TableZoomControl({ zoomPercent, increaseZoom, decreaseZoom }: TableZoomControlProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '14px', color: '#475569', whiteSpace: 'nowrap' }}>Zoom: {zoomPercent}%</span>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={decreaseZoom}
        disabled={zoomPercent === 75}
        aria-label="Decrease table zoom"
      >
        −
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={increaseZoom}
        disabled={zoomPercent === 130}
        aria-label="Increase table zoom"
      >
        +
      </button>
    </div>
  );
}
