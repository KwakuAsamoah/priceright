import { useState } from 'react';

export function LockScreen({
  email,
  onLicenceEntered,
}: {
  email: string;
  onLicenceEntered: () => void;
}) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  async function handleValidate() {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI!.validateLicence(key.trim());
      if (result.valid) {
        onLicenceEntered();
      } else {
        const reason = result.reason;
        setError(
          result.message
            ? result.message
            : reason === 'wrong_machine'
            ? 'This licence is activated on a different computer. Contact support.'
            : reason === 'revoked'
            ? 'This licence has been revoked. Contact support.'
            : 'Invalid licence key. Please check and try again.'
        );
      }
    } catch {
      setError('Could not connect to licence server. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch('http://localhost:3000/api/backup');
      if (!response.ok) throw new Error('Failed');
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      await window.electronAPI!.saveBackupFile(base64, 'PriceRight_DataExport.db');
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'grid', placeItems: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '440px', background: '#ffffff',
        borderRadius: '20px', padding: '40px',
        boxShadow: '0 24px 60px rgba(15,23,42,0.5)',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>PriceRight</div>
        </div>

        {/* Expired message */}
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '16px', marginBottom: '28px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>
            Your trial has expired
          </div>
          <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
            Your 14-day free trial has ended.{email ? ` Account: ${email}.` : ''}{' '}
            Purchase a licence to continue using PriceRight and keep all your data.
          </div>
        </div>

        {/* Licence key entry */}
        <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
          Enter your licence key
        </div>

        <input
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
            marginBottom: '12px',
          }}
        >
          {loading ? 'Validating...' : 'Activate licence'}
        </button>

        <button
          type="button"
          onClick={() => window.open('https://priceright.app', '_blank')}
          style={{
            width: '100%', padding: '12px', background: 'white', color: '#0f172a',
            border: '2px solid #0f172a', borderRadius: '8px',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '28px',
          }}
        >
          Purchase a licence →
        </button>

        {/* Data export */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>
            Want to save your data first?
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            style={{
              background: 'none', border: 'none', color: '#3b82f6',
              fontSize: '13px', fontWeight: 600, cursor: exporting ? 'default' : 'pointer',
              textDecoration: 'underline', opacity: exporting ? 0.6 : 1, padding: 0,
            }}
          >
            {exporting ? 'Exporting...' : 'Download my data backup'}
          </button>
        </div>
      </div>
    </div>
  );
}
