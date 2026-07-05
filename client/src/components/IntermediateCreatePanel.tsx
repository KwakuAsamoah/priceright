import { useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import AppToast from '../components/AppToast';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';
import { materialsApi, currenciesApi, settingsApi, type MaterialRecord } from '../api';
import useAppToast from '../hooks/useAppToast';
import { useFormState } from '../context/FormStateContext';

interface MaterialFormState {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  intermediateCostMode: 'yield' | 'completed_output';
  bulkQuantity: string;
  overheadPercentage: string;
  marginPercentage: string;
  yieldPercentage: string;
}

interface TempBomItem {
  componentMaterialId: number;
  componentName: string;
  componentUnit: string;
  quantity: number;
  unitCost: number;
}

const emptyForm: MaterialFormState = {
  name: '',
  sku: '',
  description: '',
  category: '',
  unit: 'kg',
  intermediateCostMode: 'completed_output',
  bulkQuantity: '0',
  overheadPercentage: '0',
  marginPercentage: '0',
  yieldPercentage: '100',
};

const panelTitleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#64748b',
  marginBottom: '16px',
  marginTop: 0,
} as const;

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '15px',
  fontWeight: '600',
} as const;

const fieldInputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxSizing: 'border-box' as const,
} as const;

const pageOverlayStyle = {
  position: 'fixed' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  zIndex: 99,
};

interface IntermediateCreatePanelProps {
  onClose: () => void;
  onSaved: () => void;
}

const pageContainerStyle = {
  position: 'fixed' as const,
  top: '16px',
  right: '16px',
  bottom: '16px',
  width: 'calc((100vw - 220px) * 2 / 3)',
  height: 'calc(100vh - 32px)',
  background: '#ffffff',
  borderRadius: '12px',
  boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden',
};

const leftPanelStyle = {
  width: '35%',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden',
  minHeight: 0,
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const rightPanelStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden',
  minHeight: 0,
  minWidth: 0,
  borderLeft: '1px solid #E2E8F0',
  paddingLeft: '16px',
  paddingRight: '16px',
  boxSizing: 'border-box' as const,
};

const bomControlsRowStyle = {
  display: 'flex',
  flexWrap: 'nowrap' as const,
  gap: '8px',
  marginBottom: '4px',
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const bodyRowStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'row' as const,
  overflow: 'hidden',
  padding: '16px',
  gap: '16px',
  minHeight: 0,
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const bomSectionStyle = {
  flexShrink: 0,
  marginBottom: '12px',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const bomSearchInputFullWidthStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  marginBottom: '8px',
};

const bomTableContainerStyle = {
  flex: 1,
  minHeight: '200px',
  minWidth: 0,
  overflowX: 'auto' as const,
  overflowY: 'auto' as const,
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxSizing: 'border-box' as const,
};

const bomTableStyle = {
  width: '100%',
  minWidth: '480px',
};

const costSummaryRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  minWidth: 0,
  alignItems: 'flex-start',
};

const costSummaryValueStyle = {
  flexShrink: 0,
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const bomActionCellStyle = {
  textAlign: 'center' as const,
  whiteSpace: 'nowrap' as const,
  minWidth: '72px',
};

const COSTING_TAB_BASE_STYLE = {
  borderRadius: '999px',
  padding: '8px 14px',
  fontSize: '14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const COSTING_TAB_ACTIVE_STYLE = {
  ...COSTING_TAB_BASE_STYLE,
  backgroundColor: '#16A34A',
  color: '#ffffff',
  border: '1.5px solid #16A34A',
  fontWeight: 600,
};

const COSTING_TAB_INACTIVE_STYLE = {
  ...COSTING_TAB_BASE_STYLE,
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: '1.5px solid #E2E8F0',
  fontWeight: 400,
};

const panelHeaderStyle = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  padding: '16px 20px',
  borderBottom: '1px solid #E2E8F0',
  flexShrink: 0,
  position: 'relative' as const,
};

function parseConfiguredList(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  const text = rawValue.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0);
    }
  } catch {
    // Ignore and fallback to delimited parsing
  }

  return text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeChoiceValue(selectedValue: string, customValue: string, fallback = '') {
  const resolved = selectedValue === '__custom__' ? customValue : selectedValue;
  const trimmed = resolved.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
}

function evaluateMathExpression(rawValue: string): string | null {
  const trimmed = String(rawValue || '').trim();
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

function commitMathExpression(rawValue: string, onResolved: (value: string) => void) {
  const resolved = evaluateMathExpression(rawValue);
  if (resolved !== null && resolved !== rawValue) {
    onResolved(resolved);
    return resolved;
  }
  return rawValue;
}

function toSafePositiveNumber(rawValue: string, fallback: number) {
  const resolved = evaluateMathExpression(rawValue) ?? rawValue;
  const numericValue = Number(resolved);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }
  return numericValue;
}

export default function IntermediateCreatePanel({ onClose, onSaved }: IntermediateCreatePanelProps) {
  const { setHasOpenForm } = useFormState();
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MaterialFormState>(emptyForm);
  const [materialCustomCategoryValue, setMaterialCustomCategoryValue] = useState('');
  const [configuredMaterialCategories, setConfiguredMaterialCategories] = useState<string[]>([]);
  const [components, setComponents] = useState<MaterialRecord[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('');

  const [componentMaterialId, setComponentMaterialId] = useState(0);
  const [componentQuantity, setComponentQuantity] = useState('1');
  const [componentSearch, setComponentSearch] = useState('');
  const [tempBomItems, setTempBomItems] = useState<TempBomItem[]>([]);
  const [closeButtonHovered, setCloseButtonHovered] = useState(false);

  useEffect(() => {
    setHasOpenForm(true);
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  useEffect(() => {
    async function loadData() {
      try {
        const [componentData, settingsData, currenciesData] = await Promise.all([
          materialsApi.getAll('active', 'all'),
          settingsApi.getAll(),
          currenciesApi.getAll(),
        ]);

        const safeComponents = Array.isArray(componentData) ? componentData : [];
        const safeSettings = Array.isArray(settingsData) ? settingsData : [];
        const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];
        const materialCategoriesSetting = safeSettings.find((entry: any) => entry.settingKey === 'materialCategories');
        const baseCurrencySetting = safeSettings.find((entry: any) => entry.settingKey === 'baseCurrency');
        const baseCurrencyId = Number(baseCurrencySetting?.settingValue || 0);
        const baseCurrency = safeCurrencies.find((currency: any) => Number(currency?.id) === baseCurrencyId);

        setConfiguredMaterialCategories(parseConfiguredList(materialCategoriesSetting?.settingValue));
        setComponents(safeComponents);
        setCurrencySymbol(String(baseCurrency?.symbol || safeCurrencies[0]?.symbol || safeComponents[0]?.baseCurrencySymbol || ''));
      } catch (error) {
        console.error('Error loading intermediate create data:', error);
        setConfiguredMaterialCategories([]);
        setComponents([]);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const materialCategories = useMemo(
    () => Array.from(new Set(configuredMaterialCategories)).sort((a, b) => a.localeCompare(b)),
    [configuredMaterialCategories],
  );

  const availableComponents = useMemo(
    () => components.filter((material) => material.isActive),
    [components],
  );

  const filteredAvailableComponents = useMemo(() => {
    const query = componentSearch.trim().toLowerCase();
    if (!query) {
      return availableComponents;
    }

    return availableComponents.filter((material) => {
      const haystack = [material.name, material.sku, material.category]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [availableComponents, componentSearch]);

  const estimatedCostPerUnit = useMemo(() => {
    if (tempBomItems.length === 0) {
      return null;
    }
    const totalMaterialCost = tempBomItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const yieldPercent = Math.max(0.0001, Number(form.yieldPercentage || 100));
    return totalMaterialCost / (yieldPercent / 100);
  }, [tempBomItems, form.yieldPercentage]);

  const liveCost = useMemo(() => {
    const batchMaterialCost = tempBomItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const overheadPercentage = Number(form.overheadPercentage || 0) / 100;
    const batchOverheadCost = batchMaterialCost * overheadPercentage;
    const batchTotalCost = batchMaterialCost + batchOverheadCost;
    const parsedBulkQuantity = Number(form.bulkQuantity);
    const batchQuantity = Number.isFinite(parsedBulkQuantity) && parsedBulkQuantity >= 0 ? parsedBulkQuantity : 0;
    const yieldPercent = Math.max(0.0001, Number(form.yieldPercentage || 100));
    const effectiveOutputQuantity = form.intermediateCostMode === 'completed_output'
      ? batchQuantity
      : batchQuantity * (yieldPercent / 100);
    const costPerUnit = effectiveOutputQuantity > 0 ? batchTotalCost / effectiveOutputQuantity : 0;
    const marginPercentage = Number(form.marginPercentage || 0) / 100;
    const profitAmount = costPerUnit * marginPercentage;
    const optimalPrice = costPerUnit + profitAmount;

    return {
      batchMaterialCost,
      batchOverheadCost,
      batchTotalCost,
      effectiveOutputQuantity,
      costPerUnit,
      profitAmount,
      optimalPrice,
    };
  }, [tempBomItems, form.overheadPercentage, form.bulkQuantity, form.yieldPercentage, form.intermediateCostMode, form.marginPercentage]);

  function formatMoney(amount: number) {
    return `${currencySymbol}${currencySymbol ? ' ' : ''}${amount.toFixed(2)}`;
  }

  function resolveCategoryForSave() {
    const resolved = normalizeChoiceValue(form.category, materialCustomCategoryValue);
    if (resolved) return resolved;
    if (materialCategories.includes('General')) return 'General';
    if (materialCategories.length > 0) return materialCategories[0];
    return 'Intermediate';
  }

  function removeTempBomItem(index: number) {
    setTempBomItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function addToTempBomItems() {
    if (componentMaterialId <= 0) return;

    const resolvedQuantityText = commitMathExpression(componentQuantity, setComponentQuantity);
    const quantity = Number(resolvedQuantityText || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToastMessage('Please enter a valid quantity', 'error');
      return;
    }

    const component = components.find((material) => material.id === componentMaterialId);
    if (!component) {
      showToastMessage('Selected component material not found', 'error');
      return;
    }

    setTempBomItems((prev) => [
      ...prev,
      {
        componentMaterialId: component.id,
        componentName: String(component.name || ''),
        componentUnit: String(component.unit || ''),
        quantity,
        unitCost: Number(component.unitPrice || 0),
      },
    ]);
    setComponentMaterialId(0);
    setComponentQuantity('1');
    setComponentSearch('');
  }

  function validateForm() {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) {
      errors.name = 'Material name is required.';
    }
    if (!form.unit.trim()) {
      errors.unit = 'Unit is required.';
    }
    const yieldVal = Number(form.yieldPercentage);
    if (Number.isNaN(yieldVal) || yieldVal <= 0) {
      errors.yieldPercentage = 'Yield % must be greater than 0.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveMaterial() {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const resolvedCategory = resolveCategoryForSave();
      const resolvedBulkQuantity = toSafePositiveNumber(form.bulkQuantity, 0);
      if (String(resolvedBulkQuantity) !== form.bulkQuantity) {
        setForm((prev) => ({ ...prev, bulkQuantity: String(resolvedBulkQuantity) }));
      }

      const created = await materialsApi.create({
        ...form,
        category: resolvedCategory,
        materialType: 'intermediate',
        intermediateCostMode: form.intermediateCostMode,
        bulkQuantity: resolvedBulkQuantity,
        bulkPrice: 0,
        purchaseCurrencyId: 1,
        overheadPercentage: Number(form.overheadPercentage || 0),
        marginPercentage: Number(form.marginPercentage || 0),
        yieldPercentage: form.intermediateCostMode === 'completed_output' ? 100 : Number(form.yieldPercentage || 100),
        calculatedCostPerUnit: Number(liveCost.costPerUnit || 0),
        supplier: '',
      });

      for (const item of tempBomItems) {
        await materialsApi.addIntermediateBomItem(created.id, {
          componentMaterialId: item.componentMaterialId,
          quantity: item.quantity,
        });
      }

      await materialsApi.recalculateIntermediateCost(created.id);
      showToastMessage('Intermediate material created', 'success');
      onSaved();
    } catch (error: any) {
      showToastMessage(error?.message || 'Failed to save intermediate material', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      <div style={pageOverlayStyle} onClick={onClose} aria-hidden="true" />
      <div style={pageContainerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={panelHeaderStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#0F2847', margin: 0 }}>
              New Intermediate Material
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            onMouseEnter={() => setCloseButtonHovered(true)}
            onMouseLeave={() => setCloseButtonHovered(false)}
            style={{
              background: closeButtonHovered ? '#F1F5F9' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              borderRadius: '6px',
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '16px 20px', color: '#64748b' }}>Loading form...</div>
        ) : (
          <div style={bodyRowStyle}>
              {/* Left panel — form fields */}
              <div style={leftPanelStyle}>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
                  <h3 style={panelTitleStyle}>Material Details</h3>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div>
                      <label style={fieldLabelStyle}>Material Name *</label>
                      <input className="app-input" type="text" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} style={fieldInputStyle} />
                      {fieldErrors.name ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{fieldErrors.name}</div> : null}
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>Unit *</label>
                      <input className="app-input" type="text" value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} style={fieldInputStyle} />
                      {fieldErrors.unit ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{fieldErrors.unit}</div> : null}
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>Yield % *</label>
                      <input className="app-input" type="number" step="0.1" value={form.yieldPercentage} onChange={(e) => setForm((prev) => ({ ...prev, yieldPercentage: e.target.value }))} style={fieldInputStyle} />
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                        Enter the usable output as a percentage. For example if 100g of ingredients yields 80g of finished material enter 80.
                      </div>
                      {fieldErrors.yieldPercentage ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{fieldErrors.yieldPercentage}</div> : null}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #E2E8F0', margin: '16px 0' }} />

                  <h3 style={panelTitleStyle}>Cost Settings</h3>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={fieldLabelStyle}>SKU</label>
                        <input className="app-input" type="text" value={form.sku} onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))} style={fieldInputStyle} />
                      </div>
                      <div>
                        <label style={fieldLabelStyle}>Category *</label>
                        <select
                          className="app-input"
                          value={form.category}
                          onChange={(e) => {
                            const value = e.target.value;
                            setForm((prev) => ({ ...prev, category: value }));
                            if (value !== '__custom__') {
                              setMaterialCustomCategoryValue('');
                            }
                          }}
                          style={fieldInputStyle}
                        >
                          <option value="" disabled>Select category</option>
                          {materialCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                          <option value="__custom__">+ Add new category...</option>
                        </select>
                        {form.category === '__custom__' ? (
                          <input
                            className="app-input"
                            type="text"
                            value={materialCustomCategoryValue}
                            onChange={(e) => setMaterialCustomCategoryValue(e.target.value)}
                            placeholder="Enter new category"
                            style={{ ...fieldInputStyle, marginTop: '8px' }}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <label style={fieldLabelStyle}>Description</label>
                      <textarea className="app-input" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} style={{ ...fieldInputStyle, minHeight: '60px', resize: 'none' }} />
                    </div>

                    <div>
                      <label style={fieldLabelStyle}>Costing Method</label>
                      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px' }} role="tablist" aria-label="Costing method">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={form.intermediateCostMode === 'completed_output'}
                          style={form.intermediateCostMode === 'completed_output' ? COSTING_TAB_ACTIVE_STYLE : COSTING_TAB_INACTIVE_STYLE}
                          onClick={() => setForm((prev) => ({ ...prev, intermediateCostMode: 'completed_output', yieldPercentage: '100' }))}
                        >
                          Completed output
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={form.intermediateCostMode === 'yield'}
                          style={form.intermediateCostMode === 'yield' ? COSTING_TAB_ACTIVE_STYLE : COSTING_TAB_INACTIVE_STYLE}
                          onClick={() => setForm((prev) => ({ ...prev, intermediateCostMode: 'yield' }))}
                        >
                          Yield-based
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={fieldLabelStyle}>{form.intermediateCostMode === 'completed_output' ? 'Completed Output Quantity *' : 'Batch Quantity *'}</label>
                      <input
                        className="app-input"
                        type="text"
                        inputMode="decimal"
                        value={form.bulkQuantity}
                        onChange={(e) => setForm((prev) => ({ ...prev, bulkQuantity: e.target.value }))}
                        onBlur={() => {
                          commitMathExpression(form.bulkQuantity, (value) => setForm((prev) => ({ ...prev, bulkQuantity: value })));
                        }}
                        style={fieldInputStyle}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={fieldLabelStyle}>Overhead % *</label>
                        <input className="app-input" type="number" step="0.1" value={form.overheadPercentage} onChange={(e) => setForm((prev) => ({ ...prev, overheadPercentage: e.target.value }))} style={fieldInputStyle} />
                      </div>
                      <div>
                        <label style={{ ...fieldLabelStyle, display: 'inline-flex', alignItems: 'center' }}>
                          Markup % *
                          <MarkupInfoTooltip />
                        </label>
                        <input className="app-input" type="number" step="0.1" value={form.marginPercentage} onChange={(e) => setForm((prev) => ({ ...prev, marginPercentage: e.target.value }))} style={fieldInputStyle} />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => void saveMaterial()}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Create Intermediate'}
                  </button>
                </div>
              </div>

              {/* Right panel — BOM + cost summary */}
              <div style={rightPanelStyle}>
                <div style={bomSectionStyle}>
                  <h3 style={panelTitleStyle}>Bill of Materials (Recipe)</h3>
                  <label style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Select Material</label>
                  <input className="app-input" type="search" placeholder="Search and select material..." value={componentSearch} onChange={(e) => setComponentSearch(e.target.value)} style={bomSearchInputFullWidthStyle} />
                  <div style={bomControlsRowStyle}>
                    <select className="app-input" value={componentMaterialId} onChange={(e) => setComponentMaterialId(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }}>
                      <option value={0}>Select component material...</option>
                      {filteredAvailableComponents.map((material) => (
                        <option key={material.id} value={material.id}>{material.name}</option>
                      ))}
                    </select>
                    <input
                      className="app-input"
                      type="text"
                      inputMode="decimal"
                      value={componentQuantity}
                      onChange={(e) => setComponentQuantity(e.target.value)}
                      onBlur={() => {
                        commitMathExpression(componentQuantity, setComponentQuantity);
                      }}
                      placeholder="Qty or =2+2"
                      style={{ width: '100px', flexShrink: 0 }}
                    />
                    <button className="btn btn-secondary btn-sm" type="button" onClick={addToTempBomItems} style={{ flexShrink: 0 }}>Add</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Showing {filteredAvailableComponents.length} of {availableComponents.length} active component materials
                  </div>
                </div>

                <div style={bomTableContainerStyle}>
                  <table className="app-table app-table-compact" style={bomTableStyle}>
                    <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ textAlign: 'left', minWidth: '140px' }}>Material</th>
                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Quantity</th>
                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Unit Price</th>
                        <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Total</th>
                        <th style={bomActionCellStyle}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tempBomItems.map((item, index) => {
                        const rowTotal = item.quantity * item.unitCost;
                        return (
                          <tr key={`${item.componentMaterialId}-${index}`}>
                            <td style={{ textAlign: 'left', wordBreak: 'break-word', minWidth: '140px' }}>{item.componentName}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{item.quantity.toFixed(3)} {item.componentUnit}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(item.unitCost)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(rowTotal)}</td>
                            <td style={bomActionCellStyle}>
                              <button className="btn btn-danger btn-sm" type="button" onClick={() => removeTempBomItem(index)}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {tempBomItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ color: '#64748b', textAlign: 'center', padding: '32px' }}>
                            No components yet — search and add raw materials on the left.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div style={{ flexShrink: 0, marginTop: '12px', padding: '12px', background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: '8px', boxSizing: 'border-box', minWidth: 0 }}>
                  {tempBomItems.length > 0 && estimatedCostPerUnit != null ? (
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '8px' }}>
                      Estimated cost per unit (before save): {formatMoney(estimatedCostPerUnit)}
                    </div>
                  ) : null}
                  <h3 className="app-form-section-title" style={{ marginTop: 0, marginBottom: '8px', fontSize: '14px' }}>Cost Summary (per unit)</h3>
                  <div style={{ display: 'grid', gap: '4px', fontSize: '14px' }}>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Material Cost (batch)</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{formatMoney(liveCost.batchMaterialCost)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Overhead ({Number(form.overheadPercentage || 0).toFixed(0)}%)</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{formatMoney(liveCost.batchOverheadCost)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Total Production Cost (batch)</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700' }}>{formatMoney(liveCost.batchTotalCost)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>{form.intermediateCostMode === 'completed_output' ? 'Completed Output Qty' : 'Effective Output Qty'}</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{liveCost.effectiveOutputQuantity.toFixed(3)} {form.unit || '-'}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Cost Per Unit</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700' }}>{formatMoney(liveCost.costPerUnit)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Profit ({Number(form.marginPercentage || 0).toFixed(0)}%)</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{formatMoney(liveCost.profitAmount)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ fontWeight: '700', minWidth: 0 }}>Optimal Price</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700', color: '#16a34a', fontSize: '16px' }}>{formatMoney(liveCost.optimalPrice)}</span>
                    </div>
                  </div>
                </div>
              </div>
          </div>
        )}
      </div>
    </>
  );
}
