import { Fragment, type ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { Link, Navigate, Outlet, useLocation, useNavigate, useBlocker, RouterProvider } from 'react-router-dom';
import { createHashRouter } from 'react-router';
import { BarChart2, ClipboardList, HelpCircle, LayoutDashboard, Layers, Package, Power, Settings as SettingsIcon, Tag, AlertTriangle } from 'lucide-react';
import { FormStateProvider, useFormState } from './context/FormStateContext';
import { BaseCurrencyContext } from './context/BaseCurrencyContext';
import Dashboard from './pages/Dashboard';
import MaterialsPage from './pages/MaterialsPage';
import Products from './pages/Products';
import PriceLevels from './pages/PriceLevels';
import ProductDetail from './pages/ProductDetail';
import IntermediateDetail from './pages/IntermediateDetail';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import HelpPage from './pages/HelpPage';
import UndoBanner from './components/UndoBanner';
import { UndoActionProvider } from './hooks/useUndoAction';
import { WelcomeModal } from './components/WelcomeModal';
import { OnboardingBar } from './components/OnboardingBar';
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext';
import HelpPanel from './components/HelpPanel';
import DemoModeBanner from './components/DemoModeBanner';
import PriceRightLogoIcon from './components/PriceRightLogoIcon';
import { DemoModeProvider, useDemoMode } from './context/DemoModeContext';
import PINScreen from './components/PINScreen';
import { LicenceGate } from './components/LicenceGate';
import { TrialBanner } from './components/TrialBanner';
import { BackupReminderBanner } from './components/BackupReminderBanner';
import { UpdateModal } from './components/UpdateModal';
import { NotificationBell } from './components/NotificationBell';
import { NotificationProvider } from './context/NotificationContext';
import { MaterialCostSyncProvider } from './context/MaterialCostSyncContext';
import { pinApi, materialsApi, productsApi, priceLevelRulesApi, currenciesApi, settingsApi, demoModeApi } from './api';

function isRouteActive(pathname: string, basePath: string): boolean {
  if (basePath === '/') {
    return pathname === '/';
  }
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

const NAV_SECTIONS = [
  {
    title: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, isActive: (pathname: string) => isRouteActive(pathname, '/') },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/materials', label: 'Materials', icon: Layers, isActive: (pathname: string) => isRouteActive(pathname, '/materials') },
      { to: '/products', label: 'Products', icon: Package, isActive: (pathname: string) => isRouteActive(pathname, '/products') },
      { to: '/price-levels', label: 'Price levels', icon: Tag, isActive: (pathname: string) => isRouteActive(pathname, '/price-levels') },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, isActive: (pathname: string) => isRouteActive(pathname, '/settings') },
    ],
  },
  {
    title: 'Pricing',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart2, isActive: (pathname: string) => isRouteActive(pathname, '/reports') },
      { to: '/activity', label: 'Activity', icon: ClipboardList, isActive: (pathname: string) => isRouteActive(pathname, '/activity') },
    ],
  },
];

function evaluateNumericExpression(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const looksLikeExpression = trimmed.startsWith('=') || /[+*/()×÷]/.test(trimmed) || trimmed.slice(1).includes('-');
  if (!looksLikeExpression) {
    return null;
  }

  const normalized = trimmed
    .replace(/^=/, '')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .trim();

  if (!normalized || !/^[0-9+\-*/().\s]+$/.test(normalized)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${normalized});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null;
    }

    const rounded = Math.round((result + Number.EPSILON) * 1_000_000) / 1_000_000;
    return String(rounded);
  } catch {
    return null;
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function isElectronApp() {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

function enableElectronInputFocusFix() {
  if (!isElectronApp()) {
    return () => {};
  }

  const handleMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement)
    ) {
      return;
    }

    if (target.disabled) {
      return;
    }

    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.readOnly
    ) {
      return;
    }

    // Chromium/Electron can show a focused field that ignores keyboard input
    // until the window is alt-tabbed. Forcing focus on mousedown fixes it.
    if (document.activeElement !== target) {
      event.preventDefault();
      target.focus();
    }
  };

  document.addEventListener('mousedown', handleMouseDown, true);
  return () => document.removeEventListener('mousedown', handleMouseDown, true);
}

function enableSpreadsheetStyleNumberInputs() {
  // Capture the prototype descriptor once so we can build a per-element override
  // that blocks React's reconciler from reverting type="text" back to type="number"
  // while the user is actively editing a math expression.
  const typePropDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');

  /**
   * Remove the per-element type override so the prototype setter is restored.
   * Must be called before we intentionally change the type back to 'number'.
   */
  function releaseTextMode(input: HTMLInputElement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input as any).type;
  }

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.noMathShortcuts === 'true' || target.type !== 'number') {
      return;
    }

    target.dataset.originalInputType = 'number';
    target.inputMode = 'decimal';

    // Defer the DOM type mutation so Electron's internal focus cycle completes
    // before we touch the element. Synchronous type-switching during focusin
    // corrupts Electron/Chromium's native caret state, making the field appear
    // focused but unresponsive to keyboard input until the window is alt-tabbed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
      // Guard: field may have lost focus before the frame ran — do not mutate.
      if (target.dataset.originalInputType !== 'number') return;

      // Install a per-element property override so React's controlled-input
      // reconciler cannot revert type="text" back to type="number" on re-renders.
      if (typePropDesc?.get && typePropDesc?.set) {
        const protoGet = typePropDesc.get as (this: HTMLInputElement) => string;
        const protoSet = typePropDesc.set as (this: HTMLInputElement, v: string) => void;
        Object.defineProperty(target, 'type', {
          configurable: true,
          enumerable: true,
          get() { return protoGet.call(this); },
          set(value: string) {
            // Block React from switching back to 'number' while in math mode.
            if (value === 'number' && (this as HTMLInputElement).dataset.originalInputType === 'number') return;
            protoSet.call(this, value);
          },
        });
      }

      try {
        target.type = 'text';
      } catch {
        // Ignore browsers that do not allow changing the type dynamically.
      }

      // Select the entire current value so the first keystroke replaces it
      // rather than appending (prevents "05" from typing "5" into a field showing "0").
      try {
        target.select();
      } catch {
        // Ignore
      }
      });
    });
  };

  const finalizeInput = (input: HTMLInputElement) => {
    if (input.dataset.originalInputType !== 'number') {
      return;
    }

    const resolvedValue = evaluateNumericExpression(input.value);

    // Restore the prototype setter before changing type back to 'number'.
    releaseTextMode(input);
    delete input.dataset.originalInputType;

    try {
      input.type = 'number';
    } catch {
      // Ignore browsers that do not allow changing the type dynamically.
    }

    if (resolvedValue !== null && resolvedValue !== input.value) {
      setNativeInputValue(input, resolvedValue);
    }
  };

  const handleFocusOut = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      finalizeInput(target);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.originalInputType !== 'number') {
      return;
    }

    if (event.key === 'Enter') {
      const resolvedValue = evaluateNumericExpression(target.value);
      if (resolvedValue !== null) {
        event.preventDefault();

        releaseTextMode(target);
        delete target.dataset.originalInputType;

        try {
          target.type = 'number';
        } catch {
          // Ignore browsers that do not allow changing the type dynamically.
        }

        setNativeInputValue(target, resolvedValue);
        target.blur();
      }
    }

    if (event.key === 'Escape') {
      releaseTextMode(target);
      delete target.dataset.originalInputType;

      try {
        target.type = 'number';
      } catch {
        // Ignore browsers that do not allow changing the type dynamically.
      }

      target.blur();
    }
  };

  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('focusout', handleFocusOut);
    document.removeEventListener('keydown', handleKeyDown);
  };
}

function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isHelpPage = location.pathname.startsWith('/help');
  const skipPIN = import.meta.env.VITE_SKIP_PIN === 'true';
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { isDemoMode } = useDemoMode();
  const { hasOpenForm } = useFormState();
  const { resumeOnboarding } = useOnboarding();
  const [navCounts, setNavCounts] = useState({ materials: 0, products: 0, priceLevels: 0 });
  const [baseCurrencyMissing, setBaseCurrencyMissing] = useState(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasOpenForm && currentLocation.pathname !== nextLocation.pathname
  );

  const pendingNavigation = useMemo<(() => void) | null>(
    () => (blocker.state === 'blocked' ? blocker.proceed : null),
    [blocker.state, blocker.proceed],
  );
  const showNavWarning = blocker.state === 'blocked';

  function handleNavConfirm() {
    if (pendingNavigation) {
      pendingNavigation();
    }
  }

  function handleNavCancel() {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      try {
        const [mats, prods, levels] = await Promise.all([
          materialsApi.getAll('active'),
          productsApi.getAll(),
          priceLevelRulesApi.getAll(),
        ]);
        if (!cancelled) {
          setNavCounts({
            materials: Array.isArray(mats) ? mats.length : 0,
            products: Array.isArray(prods) ? prods.length : 0,
            priceLevels: Array.isArray(levels) ? levels.length : 0,
          });
        }
        // Check base currency — fetch demo mode directly from API to avoid stale context state
        if (!cancelled) {
          const demoStatus = await demoModeApi.get();
          if (!demoStatus?.demoMode && !cancelled) {
            const [allCurrencies, allSettings] = await Promise.all([
              currenciesApi.getAll(),
              settingsApi.getAll(),
            ]);
            const baseCurrencySetting = Array.isArray(allSettings)
              ? allSettings.find((s: { settingKey: string; settingValue: string }) => s.settingKey === 'baseCurrency')
              : undefined;
            setBaseCurrencyMissing(
              !Array.isArray(allCurrencies) ||
              allCurrencies.length === 0 ||
              !baseCurrencySetting?.settingValue
            );
          } else if (!cancelled) {
            setBaseCurrencyMissing(false);
          }
        }
      } catch {
        // fail silently — counts are non-critical
      }
    }
    void fetchCounts();
    return () => { cancelled = true; };
  }, [location.pathname, isDemoMode]);
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (skipPIN) return true;
    try {
      // Don't remove the key here — isCheckingPin initializer clears it below.
      return sessionStorage.getItem('priceright_skip_pin_once') === '1';
    } catch {
      return false;
    }
  });
  const [isCheckingPin, setIsCheckingPin] = useState(() => {
    if (skipPIN) return false;
    try {
      const skipOnce = sessionStorage.getItem('priceright_skip_pin_once') === '1';
      if (skipOnce) {
        sessionStorage.removeItem('priceright_skip_pin_once');
        return false; // no server check needed — already authenticated
      }
    } catch {
      // sessionStorage unavailable
    }
    return true;
  });
  const [pinServerError, setPinServerError] = useState('');

  function handleExit() {
    // Clear all PIN unlock state so PIN screen shows on next launch
    sessionStorage.removeItem('priceright_skip_pin_once');
    // Immediately show PIN screen — no reload needed; setIsUnlocked(false)
    // triggers a re-render and the useEffect([skipPIN]) does not re-run
    setIsUnlocked(false);
    // In Electron, close the window
    if (window.electronAPI?.isElectron) {
      window.close();
    }
  }

  useEffect(() => {
    let isMounted = true;

    if (skipPIN) {
      setIsUnlocked(true);
      setIsCheckingPin(false);
      return () => {
        isMounted = false;
      };
    }

    setIsCheckingPin(true);
    setPinServerError('');

    pinApi.getStatus()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setIsCheckingPin(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setPinServerError('Could not connect to the app server. Please restart PriceRight.');
        setIsCheckingPin(false);
      });

    return () => {
      isMounted = false;
    };
  }, [skipPIN]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    let cancelled = false;

    async function checkOnboarding() {
      try {
        const settings = await settingsApi.getAll();
        if (cancelled) return;

        const onboardingDone = Array.isArray(settings)
          ? settings.find(
              (s: { settingKey: string; settingValue: string }) => s.settingKey === 'onboardingCompleted',
            )
          : undefined;

        if (!onboardingDone || onboardingDone.settingValue === 'in_progress') {
          if (onboardingDone?.settingValue === 'in_progress') {
            resumeOnboarding();
          } else if (onboardingDone?.settingValue !== 'in_progress') {
            setShowWelcome(true);
          }
        }
      } catch {
        // Fail open — don't block the app if settings can't load.
      } finally {
        if (!cancelled) {
          setWelcomeChecked(true);
        }
      }
    }

    void checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [isUnlocked, resumeOnboarding]);

  if (!isUnlocked) {
    if (isCheckingPin) {
      return (
        <div style={{ minHeight: '100vh', background: '#0f172a', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', padding: '32px', textAlign: 'center', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>PriceRight</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>Pricing management</div>
            <div style={{ marginTop: '24px', fontSize: '14px', color: '#334155' }}>Checking security settings...</div>
          </div>
        </div>
      );
    }

    if (pinServerError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0f172a', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '360px', background: '#ffffff', borderRadius: '16px', padding: '32px', textAlign: 'center', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>PriceRight</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>Pricing management</div>
            <div style={{ marginTop: '24px', fontSize: '14px', lineHeight: 1.5, color: '#334155' }}>{pinServerError}</div>
          </div>
        </div>
      );
    }

    return <PINScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <BaseCurrencyContext.Provider value={{ setBaseCurrencyMissing }}>
    <>
      {isHelpPage ? (
        <div className="app-help-route-shell">
          {children}
        </div>
      ) : (
        <div className="app-shell">
          <aside className="app-sidebar">
            <div className="app-brand-wrap">
              <div className="app-brand-row">
                <div className="app-brand-icon" aria-hidden="true">
                  <PriceRightLogoIcon />
                </div>
                <div className="app-brand-text">
                  <div className="app-brand-title">PriceRight</div>
                  <div className="app-brand-subtitle">Pricing Management</div>
                </div>
              </div>
            </div>

            <nav className="app-sidebar-nav">
              {NAV_SECTIONS.map((section, sectionIndex) => (
                <Fragment key={`section-${sectionIndex}`}>
                  {sectionIndex === 2 && <div className="app-nav-divider" aria-hidden="true" />}
                  <section className="app-nav-section">
                    {section.items.map((item) => {
                      const count =
                        item.to === '/materials' ? navCounts.materials :
                        item.to === '/products' ? navCounts.products :
                        item.to === '/price-levels' ? navCounts.priceLevels :
                        0;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`app-nav-link ${item.isActive(location.pathname) ? 'is-active' : ''}`}
                        >
                          <span className="app-nav-icon" aria-hidden="true"><item.icon size={18} strokeWidth={2} /></span>
                          {item.label}
                          {count > 0 && (
                            <span className="app-nav-count-badge">{count}</span>
                          )}
                        </Link>
                      );
                    })}
                    {sectionIndex === 2 && (
                      <button
                        type="button"
                        className={`app-nav-link app-help-trigger ${helpOpen ? 'is-active' : ''}`}
                        onClick={() => setHelpOpen((current) => !current)}
                      >
                        <span className="app-nav-icon" aria-hidden="true"><HelpCircle size={18} strokeWidth={2} /></span>
                        Help
                      </button>
                    )}
                  </section>
                </Fragment>
              ))}
            </nav>

            <div className="app-sidebar-bottom">
              <div className="app-sidebar-bottom-label-wrap">
                <span className="app-sidebar-bottom-label">PriceRight</span>
                <span className="app-sidebar-bottom-version">v{import.meta.env.VITE_APP_VERSION}</span>
              </div>
              <div className="app-sidebar-bottom-actions">
                <DemoModeBanner />
                <NotificationBell variant="sidebar" />
                <button
                  type="button"
                  className="app-sidebar-action-btn"
                  onClick={handleExit}
                  title="Lock and exit"
                  aria-label="Lock and exit"
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
          </aside>

        <main className="app-main">
          {/* IPC listener — registers update events, renders nothing */}
          <UpdateModal />
          <TrialBanner />
          <BackupReminderBanner />
          {baseCurrencyMissing && (
            <div style={{ backgroundColor: '#DC2626', color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>
                No base currency set.{' '}Cost calculations will not work correctly until you set a base currency.
              </span>
              <button
                onClick={() => navigate('/settings?tab=currencies')}
                style={{ background: 'white', color: '#DC2626', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Set base currency →
              </button>
            </div>
          )}
          <OnboardingBar />
          {children}
        </main>
          <UndoBanner />
        </div>
      )}
      {!isHelpPage && <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />}
      {showNavWarning && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={handleNavCancel} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Leave this page?</h2>
            <p style={{ marginTop: '12px', color: '#475569' }}>
              You have a form open with unsaved changes. If you leave now your changes will be lost.
            </p>
            <div className="app-modal-actions" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" type="button" onClick={handleNavCancel}>
                Stay on page
              </button>
              <button className="btn btn-primary" type="button" onClick={handleNavConfirm} style={{ marginLeft: '12px' }}>
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {showWelcome && welcomeChecked && !isHelpPage && (
        <WelcomeModal onDismiss={() => setShowWelcome(false)} />
      )}
    </>
    </BaseCurrencyContext.Provider>
  );
}

function OnboardingProviderWrapper({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return <OnboardingProvider navigate={navigate}>{children}</OnboardingProvider>;
}

function AuthenticatedApp() {
  const router = createHashRouter([
    {
      path: '/',
      element: (
        <OnboardingProviderWrapper>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </OnboardingProviderWrapper>
      ),
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'materials', element: <MaterialsPage /> },
        { path: 'materials/primary', element: <Navigate to="/materials?tab=primary" replace /> },
        { path: 'materials/intermediate', element: <Navigate to="/materials?tab=intermediate" replace /> },
        { path: 'products', element: <Products /> },
        { path: 'products/:id', element: <ProductDetail /> },
        { path: 'intermediate-materials/:id', element: <IntermediateDetail /> },
        { path: 'products/*', element: <Products /> },
        { path: 'price-levels', element: <PriceLevels /> },
        { path: 'reports', element: <Reports /> },
        { path: 'activity', element: <Activity /> },
        { path: 'settings', element: <Settings /> },
        { path: 'help', element: <HelpPage /> },
        { path: 'help/:articleId', element: <HelpPage /> },
        { path: '*', element: <Navigate to="products" replace /> },
      ],
    },
  ]);

  return (
    <UndoActionProvider>
      <DemoModeProvider>
        <FormStateProvider>
          <MaterialCostSyncProvider>
            <RouterProvider router={router} />
          </MaterialCostSyncProvider>
        </FormStateProvider>
      </DemoModeProvider>
    </UndoActionProvider>
  );
}

export default function App() {
  useEffect(() => {
    window.localStorage.removeItem('priceright-theme');
    const cleanupMathInputs = enableSpreadsheetStyleNumberInputs();
    const cleanupElectronFocus = enableElectronInputFocusFix();

    return () => {
      cleanupMathInputs();
      cleanupElectronFocus();
    };
  }, []);

  return (
    <NotificationProvider>
      <LicenceGate>
        <AuthenticatedApp />
      </LicenceGate>
    </NotificationProvider>
  );
}