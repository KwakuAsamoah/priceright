import { useDemoMode } from '../context/DemoModeContext';
import { useNavigate } from 'react-router-dom';

export default function DemoModeBanner() {
  const { isDemoMode, loading } = useDemoMode();
  const navigate = useNavigate();

  if (loading || !isDemoMode) {
    return null;
  }

  return (
    <div
      className="app-card"
      style={{
        marginBottom: '12px',
        padding: '10px 14px',
        backgroundColor: '#fff7ed',
        border: '1px solid #fdba74',
        borderLeft: '4px solid #f59e0b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
      }}
      role="button"
      aria-live="polite"
      aria-label="Demo mode active. Click to open settings"
      title="Demo mode active"
      onClick={() => navigate('/settings')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate('/settings');
        }
      }}
      tabIndex={0}
    >
      <div style={{ display: 'grid', gap: '2px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span className="demo-dot" aria-hidden="true" />
          <span className="demo-pill-text" style={{ color: '#9a3412', fontWeight: 700 }}>Demo mode is ON</span>
        </div>
        <div style={{ fontSize: '14px', color: '#9a3412' }}>
          Exploring sample data. To switch to your own data, go to Settings and open Data and Backups.
        </div>
      </div>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#9a3412' }}>Open Settings</span>
    </div>
  );
}
