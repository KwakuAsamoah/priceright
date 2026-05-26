import { useState, useRef, useEffect } from 'react';

export function LicenceKeyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  async function handleValidate() {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI!.validateLicence(key.trim());
      if (result.valid) {
        onSuccess();
      } else {
        setError(result.message || 'Invalid licence key. Please check and try again.');
      }
    } catch {
      setError('Could not connect to licence server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      display: 'grid', placeItems: 'center', zIndex: 1000, padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', background: '#ffffff',
        borderRadius: '16px', padding: '32px',
        boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Enter licence key</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', color: '#64748b', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '14px', color: '#475569', marginBottom: '20px', lineHeight: 1.6 }}>
          Your licence key was emailed to you after purchase. It looks like:{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
            PR-XXXXXX-XXXXXX-XXXXXX-XXXXXX
          </span>
        </p>

        <input
          ref={inputRef}
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleValidate(); }}
          placeholder="PR-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
          style={{
            width: '100%', padding: '10px 14px',
            border: '1px solid #e2e8f0', borderRadius: '8px',
            fontSize: '14px', fontFamily: 'monospace', letterSpacing: '1px',
            marginBottom: '12px', boxSizing: 'border-box', outline: 'none',
          }}
        />

        {error && (
          <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>
        )}

        <button
          type="button"
          onClick={() => void handleValidate()}
          disabled={loading || !key.trim()}
          style={{
            width: '100%', padding: '12px', background: '#0f172a', color: '#ffffff',
            border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700,
            cursor: loading || !key.trim() ? 'default' : 'pointer',
            opacity: loading || !key.trim() ? 0.7 : 1,
          }}
        >
          {loading ? 'Validating...' : 'Activate'}
        </button>
      </div>
    </div>
  );
}
