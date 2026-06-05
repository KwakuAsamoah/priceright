import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number | string;
  wide?: boolean;
};

function focusFirstField(container: HTMLElement | null) {
  if (!container) return;
  const first = container.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
  );
  first?.focus();
}

export default function AppModal({
  open,
  onClose,
  title,
  children,
  maxWidth = 600,
  wide = false,
}: AppModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    // Electron/Chromium can miss keyboard focus on first open unless we defer
    // until after the modal paint and window focus cycle complete.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusFirstField(panelRef.current);
      });
    });
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="app-modal-overlay">
      <div
        ref={panelRef}
        className={`app-modal${wide ? ' app-modal-wide' : ''}`}
        style={{ maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className="btn-close-x" type="button" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 className="app-modal-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
