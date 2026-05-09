import { useEffect } from 'react';
import AppToast from './AppToast';
import useUndoAction from '../hooks/useUndoAction';

export default function UndoBanner() {
  const { undoState, executeUndo, dismissUndo, isUndoing, feedback, clearFeedback } = useUndoAction();

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => clearFeedback(), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback, clearFeedback]);

  return (
    <>
      <AppToast
        open={Boolean(feedback)}
        message={feedback?.message || ''}
        type={feedback?.type || 'success'}
        onClose={clearFeedback}
      />
      {undoState && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '560px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            borderRadius: '8px',
            padding: '14px 20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 2100,
            fontSize: '13px',
            fontWeight: 400,
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{undoState.description} Undo?</span>
          <button
            type="button"
            onClick={executeUndo}
            disabled={isUndoing}
            style={{
              border: 'none',
              backgroundColor: '#ffffff',
              color: '#000000',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isUndoing ? 'not-allowed' : 'pointer',
            }}
          >
            {isUndoing ? 'Undoing...' : 'Yes, Undo'}
          </button>
          <button
            type="button"
            onClick={dismissUndo}
            style={{
              border: '1px solid rgba(255,255,255,0.3)',
              backgroundColor: 'transparent',
              color: '#ffffff',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            No, Keep
          </button>
        </div>
      )}
    </>
  );
}
