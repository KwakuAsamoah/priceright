import { useState } from 'react';
import { Download } from 'lucide-react';
import { API_BASE, demoModeApi } from '../api';

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

  async function handleExportData() {
    try {
      const demoState = await demoModeApi.get();
      if (demoState.demoMode) {
        alert('You are in demo mode. Switch to your real data first.');
        return;
      }
    } catch {
      // If demo mode cannot be checked, continue with export attempt
    }

    setExporting(true);
    try {
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `priceright_backup_${date}.db`;

      if (window.electronAPI?.isElectron) {
        const response = await fetch(`${API_BASE}/backup/download`);
        if (!response.ok) throw new Error('Backup download failed');
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const result = await window.electronAPI.saveBackupFile(base64, filename);
        if (!result.canceled && !result.success) {
          throw new Error(result.error ?? 'Save failed');
        }
      } else {
        const link = document.createElement('a');
        link.href = `${API_BASE}/backup/download`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
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
          onClick={() => window.open('https://paystack.shop/pay/4bsuzaofbj', '_blank')}
          style={{
            width: '100%', padding: '12px', background: 'white', color: '#0f172a',
            border: '2px solid #0f172a', borderRadius: '8px',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Purchase a licence →
        </button>

        <div style={{
          borderTop: '1px solid #F1F5F9',
          marginTop: '20px',
          paddingTop: '16px',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#94a3b8',
            textAlign: 'center',
            marginBottom: '8px',
          }}>
            Not ready to purchase?
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleExportData()}
            disabled={exporting}
            style={{
              width: '100%',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Download my data before I decide'}
          </button>
          <div style={{
            textAlign: 'center',
            marginTop: '12px',
            fontSize: '12px',
            color: '#94a3b8',
          }}>
            Need help?{' '}
            <a
              href="mailto:hello@therighthub.com"
              style={{
                color: '#0F2847',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              hello@therighthub.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
