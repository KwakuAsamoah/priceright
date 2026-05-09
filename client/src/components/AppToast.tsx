import { useEffect } from 'react';

interface AppToastProps {
  open: boolean;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  autoHideMs?: number;
}

export default function AppToast({ open, message, type, onClose, autoHideMs = 3500 }: AppToastProps) {
  useEffect(() => {
    if (!open || autoHideMs <= 0) return;

    const timeout = window.setTimeout(() => {
      onClose();
    }, autoHideMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, message, type, autoHideMs, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: type === 'success' ? '#d1fae5' : '#fee2e2',
        color: type === 'success' ? '#065f46' : '#991b1b',
        padding: '16px 24px',
        borderRadius: '8px',
        fontWeight: 600,
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        zIndex: 2000,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ whiteSpace: 'pre-line' }}>{message}</div>
      <button
        onClick={onClose}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          fontSize: '16px',
          fontWeight: 700,
          cursor: 'pointer',
          lineHeight: 1,
        }}
        aria-label="Close notification"
        title="Close"
      >
        ×
      </button>
    </div>
  );
}