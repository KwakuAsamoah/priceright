import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import Materials from './Materials';
import IntermediateMaterials from './IntermediateMaterials';
import MaterialsAnalysisTab from '../components/MaterialsAnalysisTab';
import { currenciesApi, exchangeRatesApi, materialsApi } from '../api';

type MaterialTab = 'primary' | 'intermediate' | 'analysis';

const MATERIAL_TAB_TOOLTIPS: Record<MaterialTab, string> = {
  primary: 'Raw materials and ingredients you purchase — the building blocks of your products',
  intermediate: 'Materials you make yourself from other raw materials — for example a spice blend, a sauce base, or a cream mixture — before using them in your final products',
  analysis: 'Cost trends, usage patterns, and currency exposure across all your materials',
};

function parseMaterialTab(value: string | null): MaterialTab {
  if (value === 'intermediate' || value === 'analysis' || value === 'primary') {
    return value;
  }
  return 'primary';
}

export default function MaterialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MaterialTab>(() => parseMaterialTab(searchParams.get('tab')));
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMaterials, setAnalysisMaterials] = useState<any[]>([]);
  const [analysisCurrencies, setAnalysisCurrencies] = useState<any[]>([]);
  const [analysisExchangeRates, setAnalysisExchangeRates] = useState<any[]>([]);
  const [intermediateRefreshKey, setIntermediateRefreshKey] = useState(0);

  function notifyIntermediateMaterialsRefresh() {
    setIntermediateRefreshKey((current) => current + 1);
  }

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
    setSearchParams({ tab }, { replace: true });
    if (tab === 'analysis') {
      void ensureAnalysisDataLoaded();
    }
    if (tab === 'intermediate') {
      notifyIntermediateMaterialsRefresh();
    }
  }

  useEffect(() => {
    const urlTab = parseMaterialTab(searchParams.get('tab'));
    setActiveTab(urlTab);
    if (urlTab === 'analysis') {
      void ensureAnalysisDataLoaded();
    }
    if (urlTab === 'intermediate') {
      notifyIntermediateMaterialsRefresh();
    }
  }, [searchParams]);

  return (
    <div className="app-page materials-shell">
      <div className="app-page-header">
        <h1 className="app-page-title">Materials</h1>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {tab.label}
              <span
                title={MATERIAL_TAB_TOOLTIPS[tab.key]}
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex', flexShrink: 0, cursor: 'help' }}
                aria-hidden="true"
              >
                <Info size={13} color="#94A3B8" />
              </span>
            </button>
          );
        })}
        </div>
      </div>

      <div className="app-page-content">
        <div className="materials-tab-panel">
        <div style={{ display: activeTab === 'primary' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <Materials materialType="primary" onPrimaryCostChange={notifyIntermediateMaterialsRefresh} />
        </div>
        <div style={{ display: activeTab === 'intermediate' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <IntermediateMaterials refreshKey={intermediateRefreshKey} isActive={activeTab === 'intermediate'} />
        </div>
        {activeTab === 'analysis' && (
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '8px 0',
          }}>
            <MaterialsAnalysisTab
              materials={analysisMaterials}
              currencies={analysisCurrencies}
              exchangeRates={analysisExchangeRates}
              loading={analysisLoading}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
