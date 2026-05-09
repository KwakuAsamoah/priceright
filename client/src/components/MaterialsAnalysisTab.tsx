import { useEffect, useMemo, useState } from 'react';
import { materialsApi } from '../api';

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

function currencyColor(code: string): string {
  if (code === 'GHS') return '#1a1a1a';
  if (code === 'USD') return '#2563eb';
  if (code === 'EUR') return '#7c3aed';
  if (code === 'GBP') return '#059669';
  return '#e65100';
}

export default function MaterialsAnalysisTab({
  materials,
  currencies,
  exchangeRates,
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
        average: value.count > 0 ? value.total / value.count : 0,
      }))
      .sort((a, b) => b.average - a.average);
  }, [materials]);

  const maxCategoryAverage = useMemo(() => {
    if (byCategory.length === 0) return 1;
    return Math.max(...byCategory.map((entry) => entry.average), 1);
  }, [byCategory]);

  const byCurrency = useMemo(() => {
    const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));
    const grouped = new Map<string, { code: string; name: string; total: number }>();

    for (const material of materials) {
      const currencyCode = (material.purchaseCurrencyCode || '').trim().toUpperCase();
      const fallback = currencyById.get(Number(material.purchaseCurrencyId || 0));
      const code = currencyCode || fallback?.code || 'OTHER';
      const name = fallback?.name || code;
      const entry = grouped.get(code) || { code, name, total: 0 };
      entry.total += toNumber(material.unitPrice);
      grouped.set(code, entry);
    }

    const overallTotal = Array.from(grouped.values()).reduce((sum, value) => sum + value.total, 0);

    return {
      overallTotal,
      rows: Array.from(grouped.values())
        .map((row) => ({
          ...row,
          exposure: overallTotal > 0 ? (row.total / overallTotal) * 100 : 0,
        }))
        .sort((a, b) => b.exposure - a.exposure),
    };
  }, [materials, currencies]);

  const topFive = useMemo(() => {
    return materials
      .slice()
      .sort((a, b) => toNumber(b.unitPrice) - toNumber(a.unitPrice))
      .slice(0, 5);
  }, [materials]);

  const exchangeRateRows = useMemo(() => {
    const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));
    return exchangeRates
      .map((rate) => {
        const currency = currencyById.get(rate.currencyId);
        return {
          code: currency?.code || `ID ${rate.currencyId}`,
          value: toNumber(rate.rateToBase),
        };
      })
      .filter((row) => row.code !== 'GHS')
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [exchangeRates, currencies]);

  const materialOptions = useMemo(() => {
    return materials
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [materials]);

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
        <h2 style={{ margin: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>Material cost by currency</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {byCurrency.rows.map((row) => (
            <div key={row.code} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: currencyColor(row.code), display: 'inline-block' }} />
              <span>
                {row.name} ({row.code}) - {row.exposure.toFixed(1)}% of total material value ({formatMoney(row.total)})
              </span>
            </div>
          ))}
        </div>
        {exchangeRateRows.length > 0 && (
          <div style={{ marginTop: '10px', color: '#64748b', fontSize: '12px' }}>
            {exchangeRateRows.map((rate) => `${rate.code}: ${rate.value.toFixed(4)}`).join(' | ')}
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
          {materialOptions.map((material) => (
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
