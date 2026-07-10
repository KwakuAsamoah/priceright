import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AppToast from '../components/AppToast';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';
import { materialsApi, currenciesApi, settingsApi, type MaterialRecord } from '../api';
import IntermediateOutputSection from './IntermediateOutputSection';
import useAppToast from '../hooks/useAppToast';
import { useFormState } from '../context/FormStateContext';
import {
  buildOutputSavePayload,
  getActualOutputQuantity,
  sumRawInputQuantities,
  type OutputInputMethod,
} from '../utils/intermediateOutput';

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
  id: number;
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
  width: 'max(1400px, 92vw)',
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
  width: '872px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'stretch' as const,
  overflow: 'visible',
  minHeight: 0,
  borderLeft: '1px solid #E2E8F0',
  paddingLeft: '16px',
  paddingRight: '16px',
  boxSizing: 'border-box' as const,
};

const BOM_PANEL_BORDER = '1px solid #e2e8f0';

const bomAlignedBlockStyle = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  marginLeft: 0,
  marginRight: 0,
  scrollbarGutter: 'stable' as const,
} as const;

const bomPanelBorderStyle = {
  border: BOM_PANEL_BORDER,
  borderRadius: '8px',
} as const;

const bomSearchInputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '10px 12px',
  borderRadius: '7px',
  border: 'none',
  outline: 'none',
  background: 'transparent',
} as const;

const bomSearchDropdownStyle = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  right: 0,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
  backgroundColor: 'white',
  border: '1px solid #e2e8f0',
  borderTop: 'none',
  borderRadius: '0 0 8px 8px',
  maxHeight: '200px',
  overflowY: 'auto' as const,
  overflowX: 'hidden' as const,
  zIndex: 10,
  boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
  scrollbarGutter: 'stable' as const,
};

const bomSearchWrapperStyle = {
  ...bomAlignedBlockStyle,
  ...bomPanelBorderStyle,
  position: 'relative' as const,
  flexShrink: 0,
  marginBottom: '12px',
};

const bodyRowStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'row' as const,
  overflow: 'visible',
  padding: '16px',
  gap: '16px',
  minHeight: 0,
  minWidth: 0,
  boxSizing: 'border-box' as const,
};

const bomTableContainerStyle = {
  ...bomAlignedBlockStyle,
  ...bomPanelBorderStyle,
  flex: 1,
  minHeight: '200px',
  overflow: 'visible' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  alignSelf: 'stretch' as const,
};

const bomTableStyle = {
  ...bomAlignedBlockStyle,
  tableLayout: 'fixed' as const,
  borderCollapse: 'collapse' as const,
  margin: 0,
  border: 'none',
};

const costSummaryCardStyle = {
  ...bomAlignedBlockStyle,
  ...bomPanelBorderStyle,
  flexShrink: 0,
  marginTop: '12px',
  padding: '12px',
  background: '#f8fbff',
  alignSelf: 'stretch' as const,
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

const bomColMaterialStyle = {
  width: '320px',
  textAlign: 'left' as const,
};

const bomColQuantityStyle = {
  width: '90px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const bomColUnitStyle = {
  width: '60px',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
};

const bomColUnitPriceStyle = {
  width: '110px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const bomColTotalStyle = {
  width: '110px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const bomMaterialCellStyle = {
  ...bomColMaterialStyle,
  wordBreak: 'break-word' as const,
};

const bomActionCellStyle = {
  width: '150px',
  textAlign: 'center' as const,
  whiteSpace: 'nowrap' as const,
  paddingLeft: '8px',
  paddingRight: '12px',
};

const bomActionButtonsStyle = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'center',
  flexWrap: 'nowrap' as const,
  flexShrink: 0,
};

const bomActionButtonStyle = {
  padding: '4px 10px',
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

  const [componentSearch, setComponentSearch] = useState('');
  const [componentDropdownOpen, setComponentDropdownOpen] = useState(false);
  const [componentHighlightedIndex, setComponentHighlightedIndex] = useState(0);
  const componentInputRef = useRef<HTMLInputElement>(null);
  const [tempBomItems, setTempBomItems] = useState<TempBomItem[]>([]);
  const [editingBomId, setEditingBomId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState('');
  const [closeButtonHovered, setCloseButtonHovered] = useState(false);
  const [outputInputMethod, setOutputInputMethod] = useState<OutputInputMethod>('exact');

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

  const totalRawInput = useMemo(
    () => sumRawInputQuantities(tempBomItems.map((item) => item.quantity)),
    [tempBomItems],
  );

  const liveCost = useMemo(() => {
    const batchMaterialCost = tempBomItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const overheadPercentage = Number(form.overheadPercentage || 0) / 100;
    const batchOverheadCost = batchMaterialCost * overheadPercentage;
    const batchTotalCost = batchMaterialCost + batchOverheadCost;
    const actualOutputQuantity = getActualOutputQuantity(
      Number(form.bulkQuantity),
      totalRawInput,
      Number(form.yieldPercentage || 100),
    );
    const effectiveOutputQuantity = Math.max(0, actualOutputQuantity);
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
  }, [tempBomItems, form.overheadPercentage, form.bulkQuantity, form.yieldPercentage, form.marginPercentage, totalRawInput]);

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

  function removeTempBomItem(id: number) {
    setTempBomItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleSelectComponentFromDropdown(material: MaterialRecord) {
    setTempBomItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        componentMaterialId: material.id,
        componentName: String(material.name || ''),
        componentUnit: String(material.unit || ''),
        quantity: 1,
        unitCost: Number(material.unitPrice || 0),
      },
    ]);
    setComponentSearch('');
    setComponentDropdownOpen(false);
    setComponentHighlightedIndex(0);
    componentInputRef.current?.focus();
  }

  function handleComponentKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setComponentDropdownOpen(true);
      setComponentHighlightedIndex((prev) => Math.min(prev + 1, filteredAvailableComponents.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setComponentHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAvailableComponents[componentHighlightedIndex]) {
        handleSelectComponentFromDropdown(filteredAvailableComponents[componentHighlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setComponentDropdownOpen(false);
    }
  }

  function handleEditBomItem(id: number, currentQuantity: string) {
    setEditingBomId(id);
    setEditingQuantity(currentQuantity);
  }

  function handleSaveBomEdit(id: number) {
    const quantity = parseFloat(editingQuantity);
    if (!editingQuantity || Number.isNaN(quantity) || quantity <= 0) {
      showToastMessage('Please enter a valid quantity', 'error');
      return;
    }

    setTempBomItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
    setEditingBomId(null);
    setEditingQuantity('');
  }

  function handleCancelBomEdit() {
    setEditingBomId(null);
    setEditingQuantity('');
  }

  function handleInlineQuantityChange(id: number, rawValue: string) {
    const quantity = parseFloat(rawValue);
    if (!rawValue || Number.isNaN(quantity) || quantity <= 0) {
      return;
    }

    setTempBomItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  }

  function validateForm() {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) {
      errors.name = 'Material name is required.';
    }
    if (!form.unit.trim()) {
      errors.unit = 'Unit is required.';
    }
    const actualOutput = getActualOutputQuantity(
      Number(form.bulkQuantity),
      totalRawInput,
      Number(form.yieldPercentage || 100),
    );
    if (!Number.isFinite(actualOutput) || actualOutput <= 0) {
      errors.output = 'Enter how much finished product this batch produced.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveMaterial() {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const resolvedCategory = resolveCategoryForSave();
      const outputPayload = buildOutputSavePayload(
        outputInputMethod,
        totalRawInput,
        Number(form.bulkQuantity),
        Number(form.yieldPercentage || 100),
      );

      const created = await materialsApi.create({
        ...form,
        category: resolvedCategory,
        materialType: 'intermediate',
        intermediateCostMode: outputPayload.intermediateCostMode,
        bulkQuantity: outputPayload.bulkQuantity,
        bulkPrice: 0,
        purchaseCurrencyId: 1,
        overheadPercentage: Number(form.overheadPercentage || 0),
        marginPercentage: Number(form.marginPercentage || 0),
        yieldPercentage: outputPayload.yieldPercentage,
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
                <h3 style={panelTitleStyle}>Bill of Materials (Recipe)</h3>
                <label style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Select Material</label>
                <div
                  style={{
                    ...bomSearchWrapperStyle,
                    border: `1px solid ${componentDropdownOpen ? '#0F2847' : '#e2e8f0'}`,
                    boxShadow: componentDropdownOpen ? '0 0 0 3px rgba(15, 40, 71, 0.08)' : 'none',
                  }}
                >
                  <input
                    ref={componentInputRef}
                    className="app-input"
                    type="text"
                    placeholder="Search and select material..."
                    value={componentSearch}
                    onChange={(e) => {
                      setComponentSearch(e.target.value);
                      setComponentDropdownOpen(true);
                      setComponentHighlightedIndex(0);
                    }}
                    onFocus={() => setComponentDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setComponentDropdownOpen(false), 200)}
                    onKeyDown={handleComponentKeyDown}
                    style={bomSearchInputStyle}
                  />
                  {componentDropdownOpen && filteredAvailableComponents.length > 0 ? (
                    <div style={bomSearchDropdownStyle}>
                        {filteredAvailableComponents.map((material, index) => (
                          <div
                            key={material.id}
                            onMouseDown={() => handleSelectComponentFromDropdown(material)}
                            onMouseEnter={() => setComponentHighlightedIndex(index)}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              backgroundColor: index === componentHighlightedIndex ? 'rgba(15, 40, 71, 0.05)' : 'white',
                              borderBottom: '1px solid #f1f5f9',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ fontSize: '14px', fontWeight: '500', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</span>
                            <span style={{ fontSize: '13px', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {formatMoney(Number(material.unitPrice || 0))}/{material.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                </div>
                {componentSearch.trim() ? (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: '6px', marginBottom: '6px' }}>
                    Showing {filteredAvailableComponents.length} of {availableComponents.length} active component materials
                  </div>
                ) : null}

                <div style={bomTableContainerStyle}>
                  <table className="app-table app-table-compact" style={bomTableStyle}>
                    <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={bomColMaterialStyle}>Material</th>
                        <th style={bomColQuantityStyle}>Quantity</th>
                        <th style={bomColUnitStyle}>Unit</th>
                        <th style={bomColUnitPriceStyle}>Unit Price</th>
                        <th style={bomColTotalStyle}>Total</th>
                        <th style={bomActionCellStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tempBomItems.map((item) => {
                        const rowTotal = item.quantity * item.unitCost;
                        return (
                          <tr key={item.id}>
                            <td style={bomMaterialCellStyle}>{item.componentName}</td>
                            <td style={bomColQuantityStyle}>
                              {editingBomId === item.id ? (
                                <input
                                  type="number"
                                  step="0.001"
                                  value={editingQuantity}
                                  onChange={(e) => setEditingQuantity(e.target.value)}
                                  autoFocus
                                  style={{ width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #E2E8F0' }}
                                />
                              ) : (
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0.001"
                                  value={item.quantity}
                                  onChange={(e) => handleInlineQuantityChange(item.id, e.target.value)}
                                  style={{ width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #E2E8F0', textAlign: 'right' }}
                                />
                              )}
                            </td>
                            <td style={bomColUnitStyle}>{item.componentUnit}</td>
                            <td style={bomColUnitPriceStyle}>{formatMoney(item.unitCost)}</td>
                            <td style={{ ...bomColTotalStyle, fontWeight: '600' }}>{formatMoney(rowTotal)}</td>
                            <td style={bomActionCellStyle}>
                              {editingBomId === item.id ? (
                                <div style={bomActionButtonsStyle}>
                                  <button type="button" onClick={() => handleSaveBomEdit(item.id)} className="btn btn-success btn-sm" style={bomActionButtonStyle}>Save</button>
                                  <button type="button" onClick={handleCancelBomEdit} className="btn btn-ghost btn-sm" style={bomActionButtonStyle}>Cancel</button>
                                </div>
                              ) : (
                                <div style={bomActionButtonsStyle}>
                                  <button type="button" onClick={() => handleEditBomItem(item.id, item.quantity.toString())} className="btn btn-secondary btn-sm" style={bomActionButtonStyle}>Edit</button>
                                  <button type="button" onClick={() => removeTempBomItem(item.id)} className="btn btn-danger btn-sm" style={bomActionButtonStyle}>Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {tempBomItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ color: '#64748b', textAlign: 'center', padding: '32px' }}>
                            No components yet — search and select materials above.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <IntermediateOutputSection
                  unit={form.unit}
                  totalRawInput={totalRawInput}
                  outputInputMethod={outputInputMethod}
                  onOutputInputMethodChange={setOutputInputMethod}
                  completedOutput={form.bulkQuantity}
                  yieldPercentage={form.yieldPercentage}
                  onSyncValues={(completedOutput, yieldPercentage, intermediateCostMode) => {
                    setForm((prev) => ({
                      ...prev,
                      bulkQuantity: completedOutput,
                      yieldPercentage,
                      intermediateCostMode,
                    }));
                  }}
                  errorMessage={fieldErrors.output}
                />

                <div style={costSummaryCardStyle}>
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
                      <span style={{ minWidth: 0 }}>Actual Output Qty</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{liveCost.effectiveOutputQuantity.toFixed(3)} {form.unit || '-'}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Cost Per Unit</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700' }}>{formatMoney(liveCost.costPerUnit)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ minWidth: 0 }}>Markup ({Number(form.marginPercentage || 0).toFixed(0)}%)</span>
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
