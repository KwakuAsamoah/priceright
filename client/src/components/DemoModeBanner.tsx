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
      className="demo-pill"
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
      <span className="demo-dot" aria-hidden="true" />
      <span className="demo-pill-text">Demo</span>
      <span className="demo-tooltip" role="tooltip">Demo mode active - click to switch to live data</span>
    </div>
  );
}
