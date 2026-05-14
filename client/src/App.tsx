import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, ClipboardList, HelpCircle, LayoutDashboard, Layers, Package, Settings as SettingsIcon, Tag } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MaterialsPage from './pages/MaterialsPage';
import Products from './pages/Products';
import PriceLevels from './pages/PriceLevels';
import ProductDetail from './pages/ProductDetail';
import Catalog from './pages/Catalog';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import HelpPage from './pages/HelpPage';
import UndoBanner from './components/UndoBanner';
import { UndoActionProvider } from './hooks/useUndoAction';
import WelcomeModal from './components/WelcomeModal';
import HelpPanel from './components/HelpPanel';
import DemoModeBanner from './components/DemoModeBanner';
import { DemoModeProvider } from './context/DemoModeContext';
import PINScreen from './components/PINScreen';
import { pinApi } from './api';

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

    try {
      target.type = 'text';
    } catch {
      // Ignore browsers that do not allow changing the type dynamically.
    }
  };

  const finalizeInput = (input: HTMLInputElement) => {
    if (input.dataset.originalInputType !== 'number') {
      return;
    }

    const resolvedValue = evaluateNumericExpression(input.value);

    try {
      input.type = 'number';
    } catch {
      // Ignore browsers that do not allow changing the type dynamically.
    }

    delete input.dataset.originalInputType;

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

        try {
          target.type = 'number';
        } catch {
          // Ignore browsers that do not allow changing the type dynamically.
        }

        delete target.dataset.originalInputType;
        setNativeInputValue(target, resolvedValue);
        target.blur();
      }
    }

    if (event.key === 'Escape') {
      try {
        target.type = 'number';
      } catch {
        // Ignore browsers that do not allow changing the type dynamically.
      }

      delete target.dataset.originalInputType;
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
  const [isUnlocked, setIsUnlocked] = useState(skipPIN);
  const [isCheckingPin, setIsCheckingPin] = useState(!skipPIN);
  const [pinServerError, setPinServerError] = useState('');

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
              {section.items.map((item) => (
                <Link
                    key={item.to}
                    to={item.to}
                    className={`app-nav-link ${item.isActive(location.pathname) ? 'is-active' : ''}`}
                  >
                    <span className="app-nav-icon" aria-hidden="true"><item.icon size={16} strokeWidth={2} /></span>
                    {item.label}
                  </Link>
              ))}
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
        </div>

        <div className="app-user-panel">
          <div className="app-user-row">
            <div className="app-user-role" style={{ fontSize: '12px', color: 'rgba(241, 245, 249, 0.72)' }}>PriceRight</div>
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
          onStartSetup={() => navigate('/materials')}
          onSkip={() => dismissWelcome()}
        />
      )}
    </>
  );
}

function AuthenticatedApp() {
  return (
    <UndoActionProvider>
      <DemoModeProvider>
        <BrowserRouter>
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
              <Route path="/price-lists" element={<Navigate to="/price-levels" replace />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/pricing-console" element={<Navigate to="/price-levels" replace />} />
              <Route path="/pricing-console/:section" element={<Navigate to="/price-levels" replace />} />
              <Route path="/pricing-console/:section/:customerId" element={<Navigate to="/price-levels" replace />} />
              <Route path="/customers" element={<Navigate to="/price-levels" replace />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/help/:articleId" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/products" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
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