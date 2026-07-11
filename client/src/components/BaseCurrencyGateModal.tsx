import { useEffect, useState } from 'react';
import { currenciesApi, settingsApi } from '../api';
import { clearCurrencyCache } from '../utils/currency';

interface CurrencyOption {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isActive?: boolean;
}

interface BaseCurrencyGateModalProps {
  onComplete: () => void;
}

/**
 * Unskippable full-screen gate: app is unusable until a base currency is set.
 * Reuses Settings' currenciesApi.create + settingsApi.save(baseCurrency) pattern.
 */
export function BaseCurrencyGateModal({ onComplete }: BaseCurrencyGateModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ code: '', name: '', symbol: '' });

  async function loadCurrencies() {
    setLoading(true);
    setError('');
    try {
      const data = await currenciesApi.getAll();
      const list = Array.isArray(data) ? (data as CurrencyOption[]) : [];
      setCurrencies(list);
      setShowAddForm(list.length === 0);
      if (list.length > 0) {
        setSelectedCode((prev) => prev || list[0].code);
      }
    } catch {
      setError('Could not load currencies. Please try again.');
      setCurrencies([]);
      setShowAddForm(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCurrencies();
  }, []);

  async function persistBaseCurrency(code: string) {
    await settingsApi.save({ settingKey: 'baseCurrency', settingValue: code });
    clearCurrencyCache();
    onComplete();
  }

  async function handleSetExistingBase(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCode) {
      setError('Select a currency to use as your base.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await persistBaseCurrency(selectedCode);
    } catch {
      setError('Failed to set base currency. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAndSetBase(e: React.FormEvent) {
    e.preventDefault();
    const code = formData.code.trim().toUpperCase();
    const name = formData.name.trim();
    const symbol = formData.symbol.trim();
    if (!code || !name || !symbol) {
      setError('Fill in currency code, name, and symbol.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await currenciesApi.create({ code, name, symbol });
      await persistBaseCurrency(code);
    } catch {
      setError('Failed to add currency. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="welcome-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="base-currency-gate-title"
      style={{ zIndex: 6000 }}
    >
      <div
        className="welcome-modal-card"
        style={{ textAlign: 'left', maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="base-currency-gate-title" className="welcome-modal-title" style={{ textAlign: 'left' }}>
          Set your base currency
        </h2>
        <p className="welcome-modal-subtitle" style={{ textAlign: 'left', marginBottom: 20 }}>
          PriceRight needs a base currency before you can add materials, products, or calculate costs.
          This step cannot be skipped.
        </p>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : showAddForm || currencies.length === 0 ? (
          <form onSubmit={(e) => void handleAddAndSetBase(e)}>
            <div style={{ marginBottom: 16 }}>
              <label className="app-settings-label" htmlFor="gate-currency-code">
                Currency Code *
              </label>
              <input
                id="gate-currency-code"
                className="app-control"
                type="text"
                required
                maxLength={3}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., USD"
                disabled={saving}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="app-settings-label" htmlFor="gate-currency-name">
                Currency Name *
              </label>
              <input
                id="gate-currency-name"
                className="app-control"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., US Dollar"
                disabled={saving}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="app-settings-label" htmlFor="gate-currency-symbol">
                Symbol *
              </label>
              <input
                id="gate-currency-symbol"
                className="app-control"
                type="text"
                required
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                placeholder="e.g., $"
                disabled={saving}
              />
            </div>
            {error ? (
              <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }} role="alert">
                {error}
              </p>
            ) : null}
            <div className="app-modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              {currencies.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => {
                    setShowAddForm(false);
                    setError('');
                  }}
                >
                  Back
                </button>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save as base currency'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSetExistingBase(e)}>
            <div style={{ marginBottom: 16 }}>
              <label className="app-settings-label" htmlFor="gate-currency-select">
                Choose base currency *
              </label>
              <select
                id="gate-currency-select"
                className="app-control"
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                disabled={saving}
                required
              >
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.code}>
                    {currency.code} — {currency.name} ({currency.symbol})
                  </option>
                ))}
              </select>
            </div>
            {error ? (
              <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }} role="alert">
                {error}
              </p>
            ) : null}
            <div className="app-modal-actions" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => {
                  setShowAddForm(true);
                  setError('');
                }}
              >
                Add a new currency
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !selectedCode}>
                {saving ? 'Saving…' : 'Set as base currency'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
