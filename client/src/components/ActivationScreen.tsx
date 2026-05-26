import { useState, useRef, useEffect } from 'react';
import { LicenceKeyModal } from './LicenceKeyModal';

export function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  async function handleActivate() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI!.activateTrial(trimmed);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onActivated(), 2000);
      } else {
        setError(result.error || 'Could not activate trial. Check your internet connection.');
      }
    } catch {
      setError('Could not connect to activation server. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'grid', placeItems: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', background: '#ffffff',
        borderRadius: '20px', padding: '40px',
        boxShadow: '0 24px 60px rgba(15,23,42,0.5)',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
            PriceRight
          </div>
          <div style={{ marginTop: '6px', fontSize: '14px', color: '#64748b' }}>
            Know your true production cost.
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: '#dcfce7', color: '#16a34a',
              display: 'grid', placeItems: 'center',
              fontSize: '24px', margin: '0 auto 16px',
            }}>
              ✓
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Trial activated!
            </div>
            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
              Check your email for details.<br />Opening PriceRight...
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                Start your free 14-day trial
              </div>
              <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
                Enter your email address to activate your free trial. No credit card required.
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                Email address
              </label>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleActivate(); }}
                placeholder="you@company.com"
                style={{
                  width: '100%', padding: '10px 14px',
                  border: '1px solid #e2e8f0', borderRadius: '8px',
                  fontSize: '15px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>
            )}

            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={loading}
              style={{
                width: '100%', padding: '12px', background: '#0f172a', color: '#ffffff',
                border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
                marginBottom: '16px',
              }}
            >
              {loading ? 'Activating...' : 'Start free trial →'}
            </button>

            <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
              Already have a licence key?{' '}
              <button
                type="button"
                onClick={() => setShowKeyModal(true)}
                style={{
                  background: 'none', border: 'none', color: '#0f172a',
                  fontWeight: 600, cursor: 'pointer', fontSize: '13px',
                  textDecoration: 'underline', padding: 0,
                }}
              >
                Enter licence key
              </button>
            </div>
          </>
        )}
      </div>

      {showKeyModal && (
        <LicenceKeyModal
          onClose={() => setShowKeyModal(false)}
          onSuccess={() => { setShowKeyModal(false); onActivated(); }}
        />
      )}
    </div>
  );
}
