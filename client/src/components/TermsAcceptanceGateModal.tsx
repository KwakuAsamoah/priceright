import { useEffect, useState } from 'react';
import { settingsApi } from '../api';
import {
  CURRENT_TERMS_VERSION,
  PrivacyPolicyContent,
  TermsOfServiceContent,
} from '../data/legalContent';

interface TermsAcceptanceGateModalProps {
  onComplete: () => void;
}

/**
 * Unskippable full-screen gate: app is unusable until Terms and Privacy are accepted.
 * Mirrors BaseCurrencyGateModal (no close button, no Escape dismiss).
 */
export function TermsAcceptanceGateModal({ onComplete }: TermsAcceptanceGateModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function blockEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener('keydown', blockEscape, true);
    return () => document.removeEventListener('keydown', blockEscape, true);
  }, []);

  async function handleAccept() {
    if (!agreed) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await settingsApi.save({
        settingKey: 'termsAcceptedVersion',
        settingValue: CURRENT_TERMS_VERSION,
      });
      onComplete();
    } catch {
      setError('Failed to save your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="welcome-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
      style={{ zIndex: 6100 }}
    >
      <div
        className="welcome-modal-card"
        style={{ textAlign: 'left', maxWidth: 640, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="terms-gate-title" className="welcome-modal-title" style={{ textAlign: 'left' }}>
          Terms of Service &amp; Privacy Policy
        </h2>
        <p className="welcome-modal-subtitle" style={{ textAlign: 'left', marginBottom: 16 }}>
          Please read and accept the following before using PriceRight. This step cannot be skipped.
        </p>

        <div
          style={{
            maxHeight: '60vh',
            overflowY: 'auto',
            paddingRight: 4,
            marginBottom: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 16px',
            background: '#f8fafc',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
            Terms of Service
          </h3>
          <TermsOfServiceContent />
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#0f172a',
              marginTop: 24,
              marginBottom: 12,
            }}
          >
            Privacy Policy
          </h3>
          <PrivacyPolicyContent />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 14,
            color: '#334155',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={saving}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            I have read and agree to the Terms of Service and Privacy Policy.
          </span>
        </label>

        {error ? (
          <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }} role="alert">
            {error}
          </p>
        ) : null}

        <div className="app-modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!agreed || saving}
            onClick={() => void handleAccept()}
          >
            {saving ? 'Saving…' : 'Accept and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
