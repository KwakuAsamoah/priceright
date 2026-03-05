import type { ReactNode } from 'react';
import { useEffect } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Boxes, ClipboardList, Cog, FlaskConical, LayoutDashboard, Package, Users } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import Products from './pages/Products';
import MaterialsRequirement from './pages/MaterialsRequirement';
import PriceLists from './pages/PriceLists';
import Settings from './pages/Settings';
import SpecialPricing from './pages/SpecialPricing';
import Customers from './pages/Customers';

const NAV_MAIN_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, isActive: (pathname: string) => pathname === '/' },
  { to: '/materials', label: 'Raw Materials', icon: Package, isActive: (pathname: string) => pathname === '/materials' },
  { to: '/products', label: 'Products', icon: Boxes, isActive: (pathname: string) => pathname === '/products' },
  {
    to: '/customers',
    label: 'Customers',
    icon: Users,
    isActive: (pathname: string) => pathname === '/customers' || pathname.startsWith('/special-pricing'),
  },
  {
    to: '/materials-requirement',
    label: 'Materials Requirement',
    icon: FlaskConical,
    isActive: (pathname: string) => pathname === '/materials-requirement',
  },
  { to: '/price-lists', label: 'Price Lists', icon: ClipboardList, isActive: (pathname: string) => pathname === '/price-lists' },
];

const NAV_TOOLS_ITEMS = [
  { to: '/settings', label: 'Settings', icon: Cog, isActive: (pathname: string) => pathname === '/settings' },
];

function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
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
          <section className="app-nav-section">
            <div className="app-nav-title">MAIN</div>
            {NAV_MAIN_ITEMS.map((item) => (
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

          <section className="app-nav-section">
            <div className="app-nav-title">TOOLS</div>
            {NAV_TOOLS_ITEMS.map((item) => (
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
        </nav>

        <div className="app-user-panel">
          <div className="app-user-row">
            <div className="app-user-avatar" aria-hidden="true">
              U
            </div>
            <div className="app-user-meta">
              <div className="app-user-name">User</div>
              <div className="app-user-role">Product Manager</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/products" element={<Products />} />
          <Route path="/materials-requirement" element={<MaterialsRequirement />} />
          <Route path="/price-lists" element={<PriceLists />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/special-pricing" element={<SpecialPricing />} />
          <Route path="/special-pricing/:customerId" element={<SpecialPricing />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default function App() {
  useEffect(() => {
    window.localStorage.removeItem('priceright-theme');
  }, []);

  return <AuthenticatedApp />;
}