import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import './App.css';
import { HashRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, ClipboardList, HelpCircle, LayoutDashboard, Layers, LogOut, Package, Settings as SettingsIcon, Tag } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MaterialsPage from './pages/MaterialsPage';
import Products from './pages/Products';
import PriceLevels from './pages/PriceLevels';
import ProductDetail from './pages/ProductDetail';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import HelpPage from './pages/HelpPage';
import UndoBanner from './components/UndoBanner';
import { UndoActionProvider } from './hooks/useUndoAction';
import WelcomeModal from './components/WelcomeModal';
import HelpPanel from './components/HelpPanel';
import DemoModeBanner from './components/DemoModeBanner';
import { DemoModeProvider, useDemoMode } from './context/DemoModeContext';
import PINScreen from './components/PINScreen';
import { pinApi, materialsApi, productsApi, priceLevelRulesApi } from './api';

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
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return !window.localStorage.getItem('priceright_launched');
    } catch {
      return false;
    }
  });
  const [helpOpen, setHelpOpen] = useState(false);

  const { isDemoMode } = useDemoMode();
  const [navCounts, setNavCounts] = useState({ materials: 0, products: 0, priceLevels: 0 });

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

  function dismissWelcome(nextRoute?: string) {
    try {
      window.localStorage.setItem('priceright_launched', 'true');
    } catch {
      // Ignore localStorage access failures.
    }
    setShowWelcome(false);
    if (nextRoute) {
      navigate(nextRoute);
    }
  }

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
              <ClipboardList size={20} strokeWidth={2} />
            </div>
            <div>
              <div className="app-brand-title">PriceRight</div>
              <div className="app-brand-subtitle">Pricing Management</div>
            </div>
          </div>
        </div>

        <nav className="app-sidebar-nav">
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <section key={`section-${sectionIndex}`} className="app-nav-section">
              {section.title ? <div className="app-nav-title">{section.title}</div> : null}
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
                    <span className="app-nav-icon" aria-hidden="true"><item.icon size={16} strokeWidth={2} /></span>
                    {item.label}
                    {count > 0 && (
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '11px',
                        fontWeight: 700,
                        lineHeight: 1,
                        padding: '2px 6px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        color: 'rgba(241,245,249,0.85)',
                        minWidth: '20px',
                        textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <button
            type="button"
            className={`app-nav-link app-help-trigger ${helpOpen ? 'is-active' : ''}`}
            onClick={() => setHelpOpen((current) => !current)}
          >
            <span className="app-nav-icon" aria-hidden="true"><HelpCircle size={16} strokeWidth={2} /></span>
            Help
          </button>
          <button
            type="button"
            className="app-nav-link"
            onClick={handleExit}
          >
            <span className="app-nav-icon" aria-hidden="true"><LogOut size={16} strokeWidth={2} /></span>
            Exit
          </button>
        </div>

        <div className="app-user-panel">
          <div className="app-user-row">
            <div className="app-user-role" style={{ fontSize: '13px', color: 'rgba(241, 245, 249, 0.72)' }}>PriceRight</div>
          </div>
        </div>
        </aside>

        <main className="app-main">
          <DemoModeBanner />
          {children}
        </main>
          <UndoBanner />
        </div>
      )}
      {!isHelpPage && <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />}
      {showWelcome && !isHelpPage && (
        <WelcomeModal
          onGetStarted={() => dismissWelcome()}
        />
      )}
    </>
  );
}

function AuthenticatedApp() {
  return (
    <UndoActionProvider>
      <DemoModeProvider>
        <HashRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/materials/primary" element={<Navigate to="/materials" replace />} />
              <Route path="/materials/intermediate" element={<Navigate to="/materials" replace />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/products/*" element={<Products />} />
              <Route path="/price-levels" element={<PriceLevels />} />

              <Route path="/reports" element={<Reports />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/help/:articleId" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/products" replace />} />
            </Routes>
          </AppLayout>
        </HashRouter>
      </DemoModeProvider>
    </UndoActionProvider>
  );
}

export default function App() {
  useEffect(() => {
    window.localStorage.removeItem('priceright-theme');
    const cleanupMathInputs = enableSpreadsheetStyleNumberInputs();

    return () => {
      cleanupMathInputs();
    };
  }, []);

  return <AuthenticatedApp />;
}