import { useEffect, useState } from 'react';
import Materials from './Materials';
import IntermediateMaterials from './IntermediateMaterials';
import MaterialsAnalysisTab from '../components/MaterialsAnalysisTab';
import { currenciesApi, exchangeRatesApi, materialsApi } from '../api';

type MaterialTab = 'primary' | 'intermediate' | 'analysis';

export default function MaterialsPage() {
  const [activeTab, setActiveTab] = useState<MaterialTab>(() => {
    try {
      const saved = window.localStorage.getItem('priceright_materials_active_tab');
      if (saved === 'primary' || saved === 'intermediate' || saved === 'analysis') {
        return saved;
      }
    } catch {
      // Ignore storage errors.
    }
    return 'primary';
  });
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMaterials, setAnalysisMaterials] = useState<any[]>([]);
  const [analysisCurrencies, setAnalysisCurrencies] = useState<any[]>([]);
  const [analysisExchangeRates, setAnalysisExchangeRates] = useState<any[]>([]);

  async function ensureAnalysisDataLoaded() {
    if (analysisLoaded || analysisLoading) return;
    setAnalysisLoading(true);
    try {
      const [materials, currencies, exchangeRates] = await Promise.all([
        materialsApi.getAll('all', 'primary'),
        currenciesApi.getAll(),
        exchangeRatesApi.getAll(),
      ]);
      setAnalysisMaterials(Array.isArray(materials) ? materials : []);
      setAnalysisCurrencies(Array.isArray(currencies) ? currencies : []);
      setAnalysisExchangeRates(Array.isArray(exchangeRates) ? exchangeRates : []);
      setAnalysisLoaded(true);
    } catch {
      setAnalysisMaterials([]);
      setAnalysisCurrencies([]);
      setAnalysisExchangeRates([]);
      setAnalysisLoaded(true);
    } finally {
      setAnalysisLoading(false);
    }
  }

  function handleTabChange(tab: MaterialTab) {
    setActiveTab(tab);
    try {
      window.localStorage.setItem('priceright_materials_active_tab', tab);
    } catch {
      // Ignore storage errors.
    }
    if (tab === 'analysis') {
      void ensureAnalysisDataLoaded();
    }
  }

  useEffect(() => {
    if (activeTab === 'analysis') {
      void ensureAnalysisDataLoaded();
    }
  }, [activeTab]);

  return (
    <div className="app-page materials-shell">
      <div className="app-page-header">
        <h1 className="app-page-title">Materials</h1>
      </div>

      <div className="app-page-content app-page-content-tight">
        <div className="app-section-tabs" role="tablist" aria-label="Material workflows">
        {([
          { key: 'primary', label: 'Primary' },
          { key: 'intermediate', label: 'Intermediate' },
          { key: 'analysis', label: 'Analysis' },
        ] as Array<{ key: MaterialTab; label: string }>).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`app-section-tab ${isActive ? 'is-active' : ''}`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
        </div>

        <div className="materials-tab-panel" style={{ minHeight: 0 }}>
        {activeTab === 'primary' && (
          <div>
            <Materials materialType="primary" />
          </div>
        )}
        {activeTab === 'intermediate' && (
          <div>
            <IntermediateMaterials />
          </div>
        )}
        {activeTab === 'analysis' && (
          <div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <MaterialsAnalysisTab
                materials={analysisMaterials}
                currencies={analysisCurrencies}
                exchangeRates={analysisExchangeRates}
                loading={analysisLoading}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
