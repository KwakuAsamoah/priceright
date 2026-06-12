import { useState, type CSSProperties } from 'react';

interface InfoTooltipProps {
  title: string;
  explanation: string;
  formula?: string;
  example?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTooltip({
  title,
  explanation,
  formula,
  example,
  position = 'top',
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  const positionStyles: Record<string, CSSProperties> = {
    top: {
      bottom: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    bottom: {
      top: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    right: {
      left: 'calc(100% + 8px)',
      top: '50%',
      transform: 'translateY(-50%)',
    },
    left: {
      right: 'calc(100% + 8px)',
      top: '50%',
      transform: 'translateY(-50%)',
    },
  };

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '4px',
        verticalAlign: 'middle',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: '#E2E8F0',
          color: '#64748b',
          fontSize: '10px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        i
      </span>

      {visible && (
        <div
          style={{
            position: 'absolute',
            ...positionStyles[position],
            width: '240px',
            background: '#0F2847',
            color: 'white',
            borderRadius: '10px',
            padding: '12px 14px',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'white',
              marginBottom: '6px',
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.5,
              marginBottom: formula ? '8px' : 0,
            }}
          >
            {explanation}
          </div>

          {formula && (
            <div
              style={{
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                padding: '6px 10px',
                marginBottom: example ? '6px' : 0,
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.45)',
                  marginBottom: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Formula
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#34D399',
                  fontFamily: 'monospace',
                }}
              >
                {formula}
              </div>
            </div>
          )}

          {example && (
            <div
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.4,
                marginTop: '6px',
              }}
            >
              {example}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
