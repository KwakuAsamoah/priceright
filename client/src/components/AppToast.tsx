import { useEffect } from 'react';

interface AppToastProps {
  open: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
  autoHideMs?: number;
}

export default function AppToast({ open, message, type, onClose, autoHideMs }: AppToastProps) {
  const resolvedAutoHideMs = autoHideMs ?? ((): number => {
    if (type === 'success') return 4000;
    if (type === 'info') return 5000;
    return 0;
  })();

  useEffect(() => {
    if (!open || resolvedAutoHideMs <= 0) return;

    const timeout = window.setTimeout(() => {
      onClose();
    }, resolvedAutoHideMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, message, type, resolvedAutoHideMs, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 2000,
      }}
    >
      <div
        style={{
        backgroundColor:
          type === 'success'
            ? '#d1fae5'
            : type === 'error'
              ? '#fee2e2'
              : type === 'warning'
                ? '#fef3c7'
                : '#dbeafe',
        color:
          type === 'success'
            ? '#065f46'
            : type === 'error'
              ? '#991b1b'
              : type === 'warning'
                ? '#92400e'
                : '#1e3a8a',
        padding: '16px 24px',
        borderRadius: '8px',
        fontWeight: 600,
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        animation: 'slideIn 0.3s ease-out',
        position: 'relative',
      }}
      >
        <div style={{ whiteSpace: 'pre-line', paddingRight: '18px' }}>{message}</div>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b',
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px 6px',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}