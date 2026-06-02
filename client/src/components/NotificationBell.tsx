import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

interface NotificationBellProps {
  variant?: 'header' | 'sidebar';
}

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

export function NotificationBell({ variant = 'header' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const {
    notifications,
    unreadCount,
    isDownloading,
    isUpdateReady,
    updateInfo,
    markAllRead,
    restartAndUpdate,
  } = useNotifications();

  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  }

  const notes = parseReleaseNotes(updateInfo?.releaseNotes);

  /* ── Sidebar variant button styles ── */
  const sidebarBtnStyle: React.CSSProperties = {
    position: 'relative',
    width: '30px',
    height: '30px',
    borderRadius: '7px',
    background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: open ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
    transition: 'all 0.15s',
    flexShrink: 0,
  };

  /* ── Header variant button styles ── */
  const headerBtnStyle: React.CSSProperties = {
    position: 'relative',
    background: open ? '#F1F5F9' : 'none',
    border: 'none',
    borderRadius: '8px',
    color: open ? '#0F2847' : '#475569',
    cursor: 'pointer',
    padding: '7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
  };

  /* ── Panel position: sidebar opens upward to the right, header opens down ── */
  const panelPositionStyle: React.CSSProperties = isSidebar
    ? { bottom: 'calc(100% + 8px)', left: 0 }
    : { top: 'calc(100% + 8px)', right: 0 };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        style={isSidebar ? sidebarBtnStyle : headerBtnStyle}
        onMouseEnter={e => {
          if (isSidebar) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
          } else {
            e.currentTarget.style.background = '#F1F5F9';
            e.currentTarget.style.color = '#0F2847';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            if (isSidebar) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
            } else {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#475569';
            }
          }
        }}
      >
        <Bell size={isSidebar ? 14 : 18} />

        {/* Badge — sidebar: green dot; header: red count pill */}
        {unreadCount > 0 && isSidebar && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#059669',
            border: '1px solid rgba(0,0,0,0.2)',
          }} />
        )}
        {unreadCount > 0 && !isSidebar && (
          <span style={{
            position: 'absolute',
            top: '3px',
            right: '3px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            lineHeight: 1,
            minWidth: '14px',
            height: '14px',
            borderRadius: '7px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* Downloading pulse — sidebar: blue dot; header: pulse ring */}
        {isDownloading && isSidebar && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#3b82f6',
            animation: 'bellPulse 1.5s ease-in-out infinite',
          }} />
        )}
        {isDownloading && !isSidebar && (
          <span style={{
            position: 'absolute',
            inset: '2px',
            borderRadius: '6px',
            border: '2px solid #3b82f6',
            animation: 'bellPulse 1.5s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div style={{
          position: 'absolute',
          ...panelPositionStyle,
          width: '320px',
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
          zIndex: 9000,
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
              Notifications
            </span>
            {notifications.length > 0 && (
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                {notifications.length} item{notifications.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Downloading state */}
          {isDownloading && updateInfo && (
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#EFF6FF',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1D4ED8' }}>
                  Downloading v{updateInfo.version}...
                </div>
                <div style={{ fontSize: '11px', color: '#60A5FA', marginTop: '1px' }}>
                  Update will be ready shortly
                </div>
              </div>
            </div>
          )}

          {/* Update ready */}
          {isUpdateReady && updateInfo && (
            <div style={{
              padding: '14px 16px',
              borderBottom: notifications.length > 0 ? '1px solid #F1F5F9' : 'none',
              background: '#F0FDF4',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#15803D' }}>
                  PriceRight v{updateInfo.version} ready
                </span>
              </div>

              {notes && (
                <div style={{
                  fontSize: '12px',
                  color: '#374151',
                  lineHeight: 1.5,
                  maxHeight: '80px',
                  overflowY: 'auto',
                  marginBottom: '10px',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.7)',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap',
                }}>
                  {notes}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={restartAndUpdate}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Restart and update
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '8px 12px',
                    background: 'white',
                    color: '#475569',
                    border: '1px solid #E2E8F0',
                    borderRadius: '7px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {notifications.length === 0 && !isDownloading && !isUpdateReady && (
            <div style={{
              padding: '32px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: '#94A3B8',
            }}>
              <Bell size={24} strokeWidth={1.5} />
              <span style={{ fontSize: '13px' }}>No notifications</span>
            </div>
          )}

          {/* Notification list */}
          {notifications.map(n => (
            <div key={n.id} style={{
              padding: '12px 16px',
              borderTop: '1px solid #F8FAFC',
              background: n.read ? '#fff' : '#FAFBFF',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>
                  {n.title}
                </span>
                <span style={{ fontSize: '10px', color: '#94A3B8', flexShrink: 0 }}>
                  {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                {n.message}
              </p>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes bellPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.08); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
