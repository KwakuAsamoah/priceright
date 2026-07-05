import { useDemoMode } from '../context/DemoModeContext';
import { useNavigate } from 'react-router-dom';

export default function DemoModeBanner() {
  const { isDemoMode, loading } = useDemoMode();
  const navigate = useNavigate();

  if (loading || !isDemoMode) {
    return null;
  }

  return (
    <button
      type="button"
      className="demo-pill"
      onClick={() => navigate('/settings?section=data')}
      aria-label="Demo mode active. Click to open Data and Backups to switch to your own data."
    >
      <span className="demo-dot" aria-hidden="true" />
      <span className="demo-pill-text">Demo</span>
      <span className="demo-tooltip">Sample data · Switch in Data &amp; Backups</span>
    </button>
  );
}
