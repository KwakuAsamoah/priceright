import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ActivationScreen } from './ActivationScreen';
import { LockScreen } from './LockScreen';
import { LicenceKeyModal } from './LicenceKeyModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LicenceStatus =
  | 'checking'
  | 'not_activated'
  | 'active'
  | 'expired'
  | 'licensed'
  | 'offline_grace';

interface LicenceState {
  status: LicenceStatus;
  daysRemaining: number;
  email: string;
  offline: boolean;
  offlineLaunches: number;
}

interface LicenceContextValue {
  licenceState: LicenceState;
  refreshLicence: () => void;
  openLicenceKeyModal: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DEFAULT_STATE: LicenceState = {
  status: 'checking',
  daysRemaining: 0,
  email: '',
  offline: false,
  offlineLaunches: 0,
};

const LicenceContext = createContext<LicenceContextValue>({
  licenceState: DEFAULT_STATE,
  refreshLicence: () => {},
  openLicenceKeyModal: () => {},
});

export function useLicence() {
  return useContext(LicenceContext);
}

// ---------------------------------------------------------------------------
// LicenceGate
// ---------------------------------------------------------------------------

export function LicenceGate({ children }: { children: ReactNode }) {
  const isElectron =
    typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

  const [licenceState, setLicenceState] = useState<LicenceState>(DEFAULT_STATE);
  const [showKeyModal, setShowKeyModal] = useState(false);

  const checkLicence = useCallback(async () => {
    if (!isElectron) return;
    try {
      const result = await window.electronAPI!.checkLicence();

      let status: LicenceStatus = result.status as LicenceStatus;

      if (result.forceOnline) {
        status = 'expired';
      } else if (result.offline && result.status === 'active') {
        status = 'offline_grace';
      }

      setLicenceState({
        status,
        daysRemaining: result.daysRemaining ?? 0,
        email: result.email ?? '',
        offline: result.offline ?? false,
        offlineLaunches: result.offlineLaunches ?? 0,
      });
    } catch {
      setLicenceState((prev) => ({
        ...prev,
        status: prev.status === 'checking' ? 'offline_grace' : prev.status,
        offline: true,
      }));
    }
  }, [isElectron]);

  useEffect(() => {
    void checkLicence();
  }, [checkLicence]);

  // In browser dev mode — skip licence check entirely
  if (!isElectron) {
    return <>{children}</>;
  }

  // Checking
  if (licenceState.status === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f172a',
        display: 'grid', placeItems: 'center', padding: '24px',
      }}>
        <div style={{
          width: '100%', maxWidth: '360px', background: '#ffffff',
          borderRadius: '16px', padding: '32px', textAlign: 'center',
          boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>PriceRight</div>
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>Pricing management</div>
          <div style={{ marginTop: '24px', fontSize: '14px', color: '#334155' }}>Checking licence...</div>
        </div>
      </div>
    );
  }

  // Not activated
  if (licenceState.status === 'not_activated') {
    return <ActivationScreen onActivated={() => void checkLicence()} />;
  }

  // Expired / forced online
  if (licenceState.status === 'expired') {
    return (
      <LockScreen
        email={licenceState.email}
        onLicenceEntered={() => void checkLicence()}
      />
    );
  }

  // Active, licensed, or offline_grace — show the app
  return (
    <LicenceContext.Provider
      value={{
        licenceState,
        refreshLicence: () => void checkLicence(),
        openLicenceKeyModal: () => setShowKeyModal(true),
      }}
    >
      {children}
      {showKeyModal && (
        <LicenceKeyModal
          onClose={() => setShowKeyModal(false)}
          onSuccess={() => {
            setShowKeyModal(false);
            void checkLicence();
          }}
        />
      )}
    </LicenceContext.Provider>
  );
}
