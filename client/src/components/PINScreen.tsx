import { useEffect, useRef, useState } from 'react';
import { pinApi } from '../api';

type PinScreenMode = 'loading' | 'set' | 'enter' | 'forgot';

function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function PINScreen({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<PinScreenMode>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    pinApi.getStatus()
      .then((status) => {
        if (!isMounted) {
          return;
        }
        setMode(status.hasPIN ? 'enter' : 'set');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setErrorMessage('Could not load PIN settings. Please restart PriceRight.');
        setMode('enter');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode === 'set' || mode === 'enter') {
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [mode]);

  async function handleSetPin(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage('');

    if (!/^\d{4,6}$/.test(pin)) {
      setErrorMessage('PIN must be 4 to 6 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setErrorMessage('PINs do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await pinApi.set(pin);
      onUnlock();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to set PIN.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyPin(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage('');

    if (!/^\d{4,6}$/.test(pin)) {
      setErrorMessage('Enter a 4 to 6 digit PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await pinApi.verify(pin);
      if (result.valid) {
        onUnlock();
        return;
      }

      setErrorMessage('Incorrect PIN. Please try again.');
      setPin('');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      setErrorMessage('Incorrect PIN. Please try again.');
      setPin('');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', padding: '32px', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>PriceRight</div>
          <div style={{ marginTop: '6px', fontSize: '15px', color: '#64748b' }}>Pricing management</div>
        </div>

        {mode === 'loading' && (
          <div style={{ fontSize: '16px', textAlign: 'center', color: '#334155' }}>Loading security settings...</div>
        )}

        {mode === 'set' && (
          <form onSubmit={handleSetPin} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>Create your PIN</div>
              <div style={{ marginTop: '6px', fontSize: '15px', lineHeight: 1.5, color: '#64748b' }}>Choose a 4-6 digit PIN to protect your data</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>New PIN</label>
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="4-6 digits"
                value={pin}
                onChange={(event) => setPin(sanitizePinInput(event.target.value))}
                disabled={isSubmitting}
                autoComplete="new-password"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Re-enter PIN"
                value={confirmPin}
                onChange={(event) => setConfirmPin(sanitizePinInput(event.target.value))}
                disabled={isSubmitting}
                autoComplete="new-password"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            {errorMessage && <div style={{ fontSize: '15px', color: '#dc2626' }}>{errorMessage}</div>}

            <button
              type="submit"
              disabled={isSubmitting || pin.length === 0 || confirmPin.length === 0}
              style={{ width: '100%', border: 'none', borderRadius: '10px', padding: '12px 14px', background: '#0f172a', color: '#ffffff', fontSize: '16px', fontWeight: 700, cursor: isSubmitting ? 'default' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
            >
              {isSubmitting ? '...' : 'Set PIN'}
            </button>
          </form>
        )}

        {mode === 'enter' && (
          <form onSubmit={handleVerifyPin} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>Welcome back</div>
              <div style={{ marginTop: '6px', fontSize: '15px', lineHeight: 1.5, color: '#64748b' }}>Enter your PIN to continue</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>PIN</label>
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter your PIN"
                value={pin}
                onChange={(event) => setPin(sanitizePinInput(event.target.value))}
                disabled={isSubmitting}
                autoComplete="current-password"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            {errorMessage && <div style={{ fontSize: '15px', color: '#dc2626' }}>{errorMessage}</div>}

            <button
              type="submit"
              disabled={isSubmitting || pin.length === 0}
              style={{ width: '100%', border: 'none', borderRadius: '10px', padding: '12px 14px', background: '#0f172a', color: '#ffffff', fontSize: '16px', fontWeight: 700, cursor: isSubmitting ? 'default' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
            >
              {isSubmitting ? '...' : 'Unlock'}
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setMode('forgot');
              }}
              style={{ border: 'none', background: 'transparent', padding: 0, color: '#64748b', fontSize: '15px', textDecoration: 'underline', cursor: 'pointer', justifySelf: 'center' }}
            >
              Forgot your PIN?
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>Reset your PIN</div>
              <div style={{ marginTop: '10px', fontSize: '16px', lineHeight: 1.6, color: '#334155' }}>
                To reset your PIN, contact PriceRight support with your licence key.
              </div>
              <a href="mailto:support@priceright.app" style={{ display: 'inline-block', marginTop: '10px', fontSize: '16px', color: '#0f172a', fontWeight: 600 }}>
                support@priceright.app
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setPin('');
                setMode('enter');
              }}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', background: '#ffffff', color: '#0f172a', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}