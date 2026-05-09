import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { demoModeApi } from '../api';

interface DemoModeContextValue {
  isDemoMode: boolean;
  loading: boolean;
  setDemoMode: (demoMode: boolean) => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMode = async () => {
      try {
        const response = await demoModeApi.get();
        if (mounted) {
          setIsDemoMode(Boolean(response?.demoMode));
        }
      } catch {
        if (mounted) {
          setIsDemoMode(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadMode();

    return () => {
      mounted = false;
    };
  }, []);

  const setDemoMode = useCallback(async (demoMode: boolean) => {
    const response = await demoModeApi.set(demoMode);
    setIsDemoMode(Boolean(response?.demoMode));
  }, []);

  const value = useMemo(
    () => ({
      isDemoMode,
      loading,
      setDemoMode,
    }),
    [isDemoMode, loading, setDemoMode]
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error('useDemoMode must be used within DemoModeProvider');
  }
  return context;
}
