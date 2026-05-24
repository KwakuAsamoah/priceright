import { useEffect, useMemo, useState } from 'react';
import { materialsApi, productsApi } from '../api';

type MaterialRecord = {
  id: number;
  name: string;
  category: string;
  unit: string;
  unitPrice: number | string;
  bulkQuantity: number | string;
  bulkPrice: number | string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode?: string;
  isActive: boolean;
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

type ProductWithBOM = {
  id: number;
  name?: string;
  isActive?: boolean;
  bom?: Array<{ materialId?: number; quantity?: number | string }>;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return `GHS ${value.toFixed(2)}`;
}

function panelHeader(title: string) {
  return (
    <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '18px', fontWeight: 700 }}>{title}</h2>
  );
}

export default function MaterialsAnalysisTab(props: {
  materials: MaterialRecord[];
  currencies: CurrencyRecord[];
  exchangeRates: ExchangeRateRecord[];
  loading: boolean;
}) {
  const { materials, loading, currencies, exchangeRates } = props;
  void currencies;
  void exchangeRates;
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [products, setProducts] = useState<ProductWithBOM[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const byCategory = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();

    for (const material of materials) {
      const category = (material.category || 'Uncategorized').trim() || 'Uncategorized';
      const entry = grouped.get(category) || { total: 0, count: 0 };
      entry.total += toNumber(material.unitPrice);
      entry.count += 1;
      grouped.set(category, entry);
    }

    return Array.from(grouped.entries())
      .map(([category, value]) => ({
        category,
        count: value.count,
        average: value.count > 0 ? value.total / value.count : 0,
      }))
      .sort((a, b) => b.average - a.average);
  }, [materials]);

  const maxCategoryAverage = useMemo(() => {
    if (byCategory.length === 0) return 1;
    return Math.max(...byCategory.map((entry) => entry.average), 1);
  }, [byCategory]);

  const mostUsedMaterials = useMemo(() => {
    const usage = new Map<number, { name: string; category: string; count: number }>();

    for (const product of products) {
      if (product.isActive === false) continue;
      const bom = product.bom || [];
      const seenThisProduct = new Set<number>();

      for (const entry of bom) {
        if (!entry.materialId || seenThisProduct.has(entry.materialId)) continue;
        const material = materials.find((m) => m.id === entry.materialId);
        if (!material) continue;
        seenThisProduct.add(entry.materialId);

        const existing = usage.get(entry.materialId) || {
          name: material.name,
          category: material.category || 'Uncategorized',
          count: 0,
        };
        existing.count += 1;
        usage.set(entry.materialId, existing);
      }
    }

    return Array.from(usage.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [products, materials]);

  const topFive = useMemo(() => {
    return materials
      .slice()
      .sort((a, b) => toNumber(b.unitPrice) - toNumber(a.unitPrice))
      .slice(0, 5);
  }, [materials]);

  const costExposure = useMemo(() => {
    const exposure = new Map<number, {
      materialName: string;
      category: string;
      totalCost: number;
      productIds: Set<number>;
    }>;

    for (const product of products) {
      if (product.isActive === false) continue;
      const bom = product.bom || [];
      for (const entry of bom) {
        if (!entry.materialId) continue;
        const material = materials.find((m) => m.id === entry.materialId);
        if (!material) continue;

        const lineCost = toNumber(entry.quantity) * toNumber(material.unitPrice);
        const existing = exposure.get(entry.materialId) || {
          materialName: material.name,
          category: material.category || 'Uncategorized',
          totalCost: 0,
          productIds: new Set<number>(),
        };
        existing.totalCost += lineCost;
        existing.productIds.add(product.id);
        exposure.set(entry.materialId, existing);
      }
    }

    return Array.from(exposure.values())
      .map((entry) => ({
        ...entry,
        productCount: entry.productIds.size,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);
  }, [products, materials]);

  const currencyExposure = useMemo(() => {
    const groups = new Map<string, { code: string; count: number; totalValue: number }>();

    for (const material of materials) {
      const code = (material.purchaseCurrencyCode || 'GHS').trim() || 'GHS';
      const existing = groups.get(code) || { code, count: 0, totalValue: 0 };
      existing.count += 1;
      existing.totalValue += toNumber(material.unitPrice);
      groups.set(code, existing);
    }

    return Array.from(groups.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [materials]);

  const uncostedMaterials = useMemo(() => {
    return materials.filter((m) => toNumber(m.unitPrice) === 0);
  }, [materials]);

  const inactiveMaterialsInBoms = useMemo(() => {
    const inactiveIds = new Set(materials.filter((m) => m.isActive === false).map((m) => m.id));
    const uniquePairs = new Set<string>();
    const found: Array<{ materialName: string; productName: string }> = [];

    for (const product of products) {
      if (product.isActive === false) continue;
      const bom = product.bom || [];
      for (const entry of bom) {
        if (!entry.materialId || !inactiveIds.has(entry.materialId)) continue;
        const material = materials.find((m) => m.id === entry.materialId);
        const pairKey = `${entry.materialId}-${product.id}`;
        if (uniquePairs.has(pairKey)) continue;
        uniquePairs.add(pairKey);
        found.push({
          materialName: material?.name || 'Unknown',
          productName: product.name || 'Unknown product',
        });
      }
    }

    return found;
  }, [materials, products]);

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

  if (materials.length === 0) {
    return (
      <div className="app-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>📦</div>
        <h2 style={{ margin: 0, marginBottom: '8px', fontSize: '20px', fontWeight: 700 }}>No materials to analyse</h2>
        <div style={{ color: '#64748b' }}>Add materials to see analysis here.</div>
      </div>
    );
  }

  const maxCurrencyValue = Math.max(...currencyExposure.map((item) => item.totalValue), 1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="app-card">
          {panelHeader('Average unit cost by category')}
          <div style={{ display: 'grid', gap: '10px' }}>
            {byCategory.map((entry) => {
              const widthPercent = (entry.average / maxCategoryAverage) * 100;
              return (
                <div
                  key={entry.category}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '12px',
                    transition: 'background 150ms ease',
                    cursor: 'default',
                  }}
                  onMouseEnter={(event) => {
                    (event.currentTarget as HTMLDivElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={(event) => {
                    (event.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.category}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{entry.count} item{entry.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
                    <div style={{ width: `${Math.max(2, widthPercent)}%`, height: '8px', borderRadius: '4px', backgroundColor: '#0F2847' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: '#0F2847' }}>{formatMoney(entry.average)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="app-card">
          {panelHeader('Most used materials in products')}
          {productsLoading ? (
            <div style={{ color: '#64748b' }}>Analyzing product BOMs...</div>
          ) : mostUsedMaterials.length === 0 ? (
            <div style={{ color: '#64748b' }}>No materials are used in any products yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {mostUsedMaterials.map((material, index) => (
                <div
                  key={`${material.name}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    background: index === 0 ? '#fffbeb' : '#f8fafc',
                  }}
                >
                  <div style={{ minWidth: '32px', minHeight: '32px', borderRadius: '999px', background: '#0F2847', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{index + 1}</div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.category}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600 }}>{material.count} product{material.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          {panelHeader('Top 5 highest unit cost materials')}
          <div style={{ display: 'grid', gap: '10px' }}>
            {topFive.map((material, index) => (
              <div
                key={material.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '12px',
                  borderRadius: '12px',
                  background: index === 0 ? '#fffbeb' : '#f8fafc',
                }}
              >
                <div style={{ minWidth: '32px', minHeight: '32px', borderRadius: '999px', background: index === 0 ? '#f59e0b' : '#0F2847', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{index + 1}</div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{material.category || 'Uncategorized'}</div>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: '#0F2847' }}>{formatMoney(toNumber(material.unitPrice))}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-card">
          {panelHeader('Cost exposure across product range')}
          <div style={{ color: '#475569', fontSize: '14px', marginBottom: '12px' }}>
            Materials at the top would have the biggest impact on product costs if their prices increased.
          </div>
          {productsLoading ? (
            <div style={{ color: '#64748b' }}>Loading product BOM exposure...</div>
          ) : costExposure.length === 0 ? (
            <div style={{ color: '#64748b' }}>No BOM data available for exposure analysis.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {costExposure.map((entry) => {
                const widthPercent = (entry.totalCost / costExposure[0].totalCost) * 100;
                return (
                  <div key={entry.materialName} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.materialName}</div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>{entry.productCount} product{entry.productCount !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#e5e7eb' }}>
                        <div style={{ width: `${Math.max(4, widthPercent)}%`, height: '8px', borderRadius: '4px', backgroundColor: '#0F2847' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(entry.totalCost)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="app-card">
          {panelHeader('Price history')}
          <label className="app-settings-label" style={{ display: 'block', marginBottom: '8px' }}>Select a material to view price history</label>
          <select
            className="app-control"
            value={selectedMaterialId ?? ''}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setSelectedMaterialId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
            }}
            style={{ width: '100%', maxWidth: '100%', marginBottom: '16px' }}
          >
            <option value="">Select material</option>
            {materials.slice().sort((a, b) => a.name.localeCompare(b.name)).map((material) => (
              <option key={material.id} value={material.id}>{material.name}</option>
            ))}
          </select>

          {!selectedMaterialId ? (
            <div style={{ color: '#64748b' }}>Choose a material to see its price history timeline.</div>
          ) : historyLoading ? (
            <div>Loading history...</div>
          ) : history.length === 0 ? (
            <div>No changes recorded.</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {history.map((entry, index) => {
                const current = toNumber(entry.priceInBaseCurrency);
                const previous = index + 1 < history.length ? toNumber(history[index + 1].priceInBaseCurrency) : null;
                const change = previous === null ? null : current - previous;
                const isIncrease = change !== null && change > 0;
                const changeColor = change === null ? '#64748b' : isIncrease ? '#b91c1c' : '#166534';
                const arrow = change === null ? '•' : isIncrease ? '↑' : '↓';
                return (
                  <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: '12px', background: '#f8fafc' }}>
                    <div style={{ fontSize: '14px', color: '#475569' }}>{new Date(entry.changedAt).toLocaleDateString()}</div>
                    <div style={{ fontWeight: 600, color: '#0F2847' }}>{formatMoney(current)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: changeColor, fontWeight: 600, gap: '6px' }}>
                      <span>{arrow}</span>
                      <span>{change === null ? 'Initial record' : `${change >= 0 ? '+' : '-'}${formatMoney(Math.abs(change))}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-card">
          {panelHeader('Currency exposure')}
          <div style={{ color: '#475569', fontSize: '14px', marginBottom: '12px' }}>
            Foreign currency materials are subject to exchange rate risk. A rate change will affect your production costs.
          </div>
          {currencyExposure.length === 0 ? (
            <div style={{ color: '#64748b' }}>No currency exposure data available.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {currencyExposure.map((entry) => {
                const widthPercent = (entry.totalValue / maxCurrencyValue) * 100;
                return (
                  <div key={entry.code} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center', padding: '12px', borderRadius: '12px', background: '#f8fafc' }}>
                    <div style={{ minWidth: '52px', padding: '6px 12px', borderRadius: '999px', background: '#e2e8f0', color: '#0f172a', fontWeight: 700, fontSize: '13px', textAlign: 'center' }}>{entry.code}</div>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px', fontSize: '13px' }}>
                        <span>{entry.count} material{entry.count !== 1 ? 's' : ''}</span>
                        <span>{formatMoney(entry.totalValue)}</span>
                      </div>
                      <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px' }}>
                        <div style={{ width: `${Math.max(4, widthPercent)}%`, height: '8px', borderRadius: '4px', backgroundColor: '#0F2847' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-card">
          {panelHeader('Materials with no price changes')}
          {uncostedMaterials.length === 0 ? (
            <div style={{ padding: '16px', borderRadius: '12px', background: '#ecfdf5', color: '#166534' }}>All materials have a unit cost set. ✓</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ color: '#64748b' }}>These materials have a unit cost of zero and may need to be updated.</div>
              {uncostedMaterials.map((material) => (
                <div key={material.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', padding: '12px', borderRadius: '12px', background: '#f8fafc' }}>
                  <div>{material.name}</div>
                  <div style={{ textAlign: 'right', color: '#64748b' }}>{material.category || 'Uncategorized'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          {panelHeader('Inactive materials still in product BOMs')}
          {inactiveMaterialsInBoms.length === 0 ? (
            <div style={{ padding: '16px', borderRadius: '12px', background: '#ecfdf5', color: '#166534' }}>No inactive materials found in product BOMs. ✓</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ padding: '12px', borderRadius: '12px', background: '#fef3c7', color: '#92400e' }}>
                These inactive materials are still used in active product BOMs. Consider reactivating them or updating the affected products.
              </div>
              {inactiveMaterialsInBoms.map((item, index) => (
                <div key={`${item.materialName}-${item.productName}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', padding: '12px', borderRadius: '12px', background: '#f8fafc' }}>
                  <div>{item.materialName}</div>
                  <div style={{ textAlign: 'right', color: '#64748b' }}>{item.productName}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
