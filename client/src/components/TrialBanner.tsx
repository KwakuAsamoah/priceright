import { useState } from 'react';
import { useLicence } from './LicenceGate';

export function TrialBanner() {
  const { licenceState, openLicenceKeyModal } = useLicence();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (licenceState.status === 'licensed') return null;
  if (licenceState.status !== 'active' && licenceState.status !== 'offline_grace') return null;

  const days = licenceState.daysRemaining;
  const isUrgent = days <= 3;
  const bg = isUrgent ? '#dc2626' : '#1d4ed8';

  const daysLabel =
    days === 0
      ? 'Trial expires today'
      : days === 1
      ? '1 day left in your trial'
      : `${days} days left in your trial`;

  return (
    <div style={{
      backgroundColor: bg, color: 'white',
      padding: '8px 20px', display: 'flex', alignItems: 'center',
      gap: '12px', flexWrap: 'wrap', fontSize: '13px',
    }}>
      <span style={{ flex: 1, fontWeight: 600 }}>
        {licenceState.offline ? '⚠ Offline mode — ' : ''}
        {daysLabel}
        {licenceState.offline ? ' — connect to internet to validate' : ''}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={openLicenceKeyModal}
          style={{
            padding: '4px 12px', background: 'white', color: bg,
            border: 'none', borderRadius: '6px',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Enter licence key
        </button>

        <button
          type="button"
          onClick={() => window.open('https://paystack.shop/pay/4bsuzaofbj', '_blank')}
          style={{
            padding: '4px 12px', background: 'transparent', color: 'white',
            border: '1px solid rgba(255,255,255,0.6)', borderRadius: '6px',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Buy licence
        </button>

        {days > 3 && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px',
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
