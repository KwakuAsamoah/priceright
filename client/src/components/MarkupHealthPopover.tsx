import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';

function formatThresholdValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function HealthBandRow({
  dotColor,
  label,
  range,
  isLast = false,
}: {
  dotColor: string;
  label: string;
  range: string;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: isLast ? 0 : '6px',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#0F2847',
          width: '52px',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: '11px', color: '#64748b' }}>{range}</span>
    </div>
  );
}

export default function MarkupHealthPopover() {
  const threshold = useLowMarkupThreshold();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const halfThreshold = Math.round((threshold / 2) * 10) / 10;
  const thresholdLabel = formatThresholdValue(threshold);
  const halfThresholdLabel = formatThresholdValue(halfThreshold);

  useEffect(() => {
    if (!open) return;

    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title="Markup Health Guide"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          color: hovered ? '#0F2847' : '#94A3B8',
        }}
      >
        <Info size={16} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Markup health guide"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            zIndex: 200,
            width: '240px',
            backgroundColor: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#94A3B8',
              marginBottom: '10px',
            }}
          >
            Markup Health Guide
          </div>

          <HealthBandRow
            dotColor="#16A34A"
            label="Healthy"
            range={`≥ ${thresholdLabel}% markup`}
          />
          <HealthBandRow
            dotColor="#D97706"
            label="Low"
            range={`${halfThresholdLabel}%–${thresholdLabel}% markup`}
          />
          <HealthBandRow
            dotColor="#DC2626"
            label="Critical"
            range={`< ${halfThresholdLabel}% markup`}
            isLast
          />

          <div
            style={{
              borderTop: '1px solid #F1F5F9',
              marginTop: '10px',
              paddingTop: '10px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/settings?tab=pricing');
              }}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                fontSize: '11px',
                color: '#94A3B8',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Change in Settings → Pricing Engine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
