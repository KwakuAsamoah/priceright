import { useEffect, useMemo, useState } from 'react';
import { materialsApi, productsApi } from '../api';

type MaterialRecord = {
  id: number;
  name: string;
  category: string;
  unitPrice: number | string;
  purchaseCurrencyCode?: string;
  purchaseCurrencyId?: number;
};

type CurrencyRecord = {
  id: number;
  code: string;
  name: string;
};

type ExchangeRateRecord = {
  currencyId: number;
  rateToBase: number | string;
};

type PriceHistoryEntry = {
  id: number;
  priceInBaseCurrency: number | string;
  changedAt: string;
};



function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return `GHS ${value.toFixed(2)}`;
}



export default function MaterialsAnalysisTab({
  materials,
  loading,
}: {
  materials: MaterialRecord[];
  currencies: CurrencyRecord[];
  exchangeRates: ExchangeRateRecord[];
  loading: boolean;
}) {
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const byCategory = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();

    for (const material of materials) {
      const key = (material.category || 'Uncategorized').trim() || 'Uncategorized';
      const entry = grouped.get(key) || { total: 0, count: 0 };
      entry.total += toNumber(material.unitPrice);
      entry.count += 1;
      grouped.set(key, entry);
    }

    return Array.from(grouped.entries())
      .map(([category, value]) => ({
        category,
        count: value.count,
        average: value.count > 0 ? value.total / value.count : 0,
      }))
      .sort((a, b) => b.average - a.average);
  }, [materials]);

  const categoryStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const material of materials) {
      const key = (material.category || 'Uncategorized').trim() || 'Uncategorized';
      stats.set(key, (stats.get(key) || 0) + 1);
    }
    return Array.from(stats.entries())
      .map(([category, count]) => ({
        category,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [materials]);

  const maxCategoryAverage = useMemo(() => {
    if (byCategory.length === 0) return 1;
    return Math.max(...byCategory.map((entry) => entry.average), 1);
  }, [byCategory]);

  const mostUsedMaterials = useMemo(() => {
    const materialUsage = new Map<number, { name: string; count: number }>();

    for (const product of products) {
      const bom = product.bom || [];
      for (const entry of bom) {
        if (entry.materialId) {
          const material = materials.find((m) => m.id === entry.materialId);
          if (material) {
            const existing = materialUsage.get(entry.materialId) || { name: material.name, count: 0 };
            existing.count += 1;
            materialUsage.set(entry.materialId, existing);
          }
        }
      }
    }

    return Array.from(materialUsage.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [products, materials]);

  const topFive = useMemo(() => {
    return materials
      .slice()
      .sort((a, b) => toNumber(b.unitPrice) - toNumber(a.unitPrice))
      .slice(0, 5);
  }, [materials]);

  // Load products and their BOMs for "most used materials" analysis
  useEffect(() => {
    let mounted = true;
    setProductsLoading(true);

    Promise.resolve()
      .then(() => productsApi.getAll('all'))
      .then(async (allProducts) => {
        if (!mounted) return;
        if (!Array.isArray(allProducts)) {
          setProducts([]);
          return;
        }

        // Fetch BOM for each product
        const productsWithBom = await Promise.all(
          allProducts.map(async (product) => {
            try {
              const bom = await productsApi.getBOM(product.id);
              return { ...product, bom: Array.isArray(bom) ? bom : [] };
            } catch {
              return { ...product, bom: [] };
            }
          })
        );

        if (!mounted) return;
        setProducts(productsWithBom);
      })
      .catch(() => {
        if (!mounted) return;
        setProducts([]);
      })
      .finally(() => {
        if (mounted) setProductsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedMaterialId) {
      setHistory([]);
      return;
    }

    let mounted = true;
    setHistoryLoading(true);

    materialsApi
      .getPriceHistory(selectedMaterialId)
      .then((rows) => {
        if (!mounted) return;
        setHistory(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!mounted) return;
        setHistory([]);
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedMaterialId]);

  if (loading) {
    return <div className="app-card">Loading materials analysis...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div className="app-card">
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Material count by category</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          {categoryStats.length === 0 ? (
            <div style={{ color: '#64748b' }}>No materials available</div>
          ) : (
            categoryStats.map((entry) => {
              const maxCount = Math.max(...categoryStats.map((e) => e.count), 1);
              const widthPercent = (entry.count / maxCount) * 100;
              return (
                <div key={entry.category} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', alignItems: 'center', gap: '10px' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.category}</div>
                  <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
                    <div style={{ width: `${Math.max(2, widthPercent)}%`, height: '8px', borderRadius: '4px', backgroundColor: '#1a1a1a' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 500 }}>{entry.count} items</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="app-card">
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Average unit cost by category</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          {byCategory.map((entry) => {
            const widthPercent = (entry.average / maxCategoryAverage) * 100;
            return (
              <div key={entry.category} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px', alignItems: 'center', gap: '10px' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.category}</div>
                <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
                  <div style={{ width: `${Math.max(2, widthPercent)}%`, height: '8px', borderRadius: '4px', backgroundColor: '#1a1a1a' }} />
                </div>
                <div style={{ textAlign: 'right' }}>{formatMoney(entry.average)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="app-card">
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Most used materials</h2>
        {productsLoading ? (
          <div style={{ color: '#64748b' }}>Analyzing product BOMs...</div>
        ) : mostUsedMaterials.length === 0 ? (
          <div style={{ color: '#64748b' }}>No materials are used in any products yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {mostUsedMaterials.map((material, index) => (
              <div key={material.name} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px', gap: '10px', alignItems: 'center' }}>
                <span>{index + 1}.</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</span>
                <span style={{ textAlign: 'right', fontWeight: 500 }}>{material.count}× used</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="app-card">
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Price history</h2>
        <label className="app-settings-label">Select a material to view price history</label>
        <select
          className="app-control"
          value={selectedMaterialId ?? ''}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            setSelectedMaterialId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
          }}
          style={{ maxWidth: '360px', marginBottom: '12px' }}
        >
          <option value="">Select material</option>
          {materials.slice().sort((a, b) => a.name.localeCompare(b.name)).map((material) => (
            <option key={material.id} value={material.id}>{material.name}</option>
          ))}
        </select>

        {!selectedMaterialId ? null : historyLoading ? (
          <div>Loading history...</div>
        ) : history.length === 0 ? (
          <div>No price history recorded for this material.</div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {history.map((entry, index) => {
              const current = toNumber(entry.priceInBaseCurrency);
              const previous = index + 1 < history.length ? toNumber(history[index + 1].priceInBaseCurrency) : null;
              const change = previous === null ? null : current - previous;
              return (
                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '180px 140px 1fr', gap: '12px' }}>
                  <span>{new Date(entry.changedAt).toLocaleDateString()}</span>
                  <span>{formatMoney(current)}</span>
                  <span style={{ color: change == null ? '#64748b' : change >= 0 ? '#166534' : '#b91c1c' }}>
                    {change == null ? 'Initial record' : `${change >= 0 ? '+' : '-'} ${formatMoney(Math.abs(change))}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="app-card">
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Top 5 highest unit costs</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {topFive.map((material, index) => (
            <div key={material.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 180px 150px', gap: '10px' }}>
              <span>{index + 1}.</span>
              <span>{material.name}</span>
              <span>{material.category || '-'}</span>
              <span>{formatMoney(toNumber(material.unitPrice))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
