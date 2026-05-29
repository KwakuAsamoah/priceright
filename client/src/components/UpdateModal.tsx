import { useState, useEffect } from 'react';

function parseReleaseNotes(notes: string | undefined): string {
  if (!notes) return '';
  return notes
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function UpdateModal() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateInfo(info);
      setIsDownloading(true);
    });

    api.onUpdateDownloaded?.((info: UpdateInfo) => {
      setUpdateInfo(info);
      setIsDownloading(false);
      setShowModal(true);
      setDismissed(false);
    });
  }, []);

  function handleRestartNow() {
    window.electronAPI?.restartAndUpdate?.();
  }

  function handleLater() {
    setShowModal(false);
    setDismissed(true);
  }

  const notes = parseReleaseNotes(updateInfo?.releaseNotes);

  return (
    <>
      {/* Subtle downloading bar */}
      {isDownloading && updateInfo && (
        <div style={{
          background: '#eff6ff',
          borderBottom: '1px solid #bfdbfe',
          padding: '7px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#1d4ed8',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Downloading PriceRight v{updateInfo.version}...</span>
        </div>
      )}

      {/* Notification badge when dismissed but update is ready */}
      {dismissed && updateInfo && !showModal && (
        <div style={{
          background: '#f0fdf4',
          borderBottom: '1px solid #bbf7d0',
          padding: '7px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          fontSize: '12px',
          color: '#166534',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>PriceRight v{updateInfo.version} is ready to install</span>
          </div>
          <button
            type="button"
            onClick={() => { setShowModal(true); setDismissed(false); }}
            style={{
              background: 'none',
              border: '1px solid #166534',
              borderRadius: '4px',
              color: '#166534',
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 10px',
              cursor: 'pointer',
            }}
          >
            View update
          </button>
        </div>
      )}

      {/* Update modal overlay */}
      {showModal && updateInfo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            width: '100%',
            maxWidth: '480px',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              padding: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                    Update ready
                  </div>
                  <div style={{ color: '#fff', fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>
                    PriceRight v{updateInfo.version}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginTop: '3px' }}>
                    Downloaded and ready to install
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLater}
                aria-label="Dismiss"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '4px 8px',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Release notes */}
            {notes && (
              <div style={{ padding: '20px 24px 0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '8px' }}>
                  What&apos;s new
                </div>
                <div style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#374151',
                  lineHeight: 1.6,
                  maxHeight: '160px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {notes}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ padding: '20px 24px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleRestartNow}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Restart and update now
              </button>
              <button
                type="button"
                onClick={handleLater}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remind me later
              </button>
            </div>

            {/* Footer */}
            <div style={{
              padding: '0 24px 18px',
              fontSize: '11px',
              color: '#9ca3af',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              The app will restart to apply the update. Your data will not be affected.
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
