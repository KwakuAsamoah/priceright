import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { materialsApi, productsApi, settingsApi } from '../api';
import AppToast from '../components/AppToast';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';
import useAppToast from '../hooks/useAppToast';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { useFormState } from '../context/FormStateContext';

interface Material {
  id: number;
  name: string;
  unit: string;
  unitPrice: string;
  baseCurrencySymbol: string;
  materialType?: 'primary' | 'intermediate';
}

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
  materialType?: 'primary' | 'intermediate';
}

interface StepDef {
  number: number;
  label: string;
}

function StepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: {
  steps: StepDef[];
  currentStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', marginBottom: '24px' }}>
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.number);
        const isCurrent = currentStep === step.number;
        const isFuture = !isCompleted && !isCurrent;

        const circleBg = isCompleted ? '#16A34A' : isCurrent ? '#0F2847' : '#E2E8F0';
        const circleColor = isFuture ? '#94A3B8' : '#ffffff';
        const labelColor = isCompleted ? '#16A34A' : isCurrent ? '#0F2847' : '#94A3B8';
        const connectorGreen = completedSteps.includes(step.number);

        return (
          <div key={step.number} style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '100px' }}>
              <button
                type="button"
                onClick={() => {
                  if (isCompleted) onStepClick(step.number);
                }}
                disabled={isFuture}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: circleBg,
                  color: circleColor,
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: isCompleted ? 'pointer' : isFuture ? 'not-allowed' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {step.number}
              </button>
              <span style={{ marginTop: '6px', fontSize: '12px', color: labelColor, textAlign: 'center', maxWidth: '110px' }}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div
                style={{
                  width: '60px',
                  height: '2px',
                  background: connectorGreen ? '#16A34A' : '#E2E8F0',
                  marginTop: '17px',
                  flexShrink: 0,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

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

const STEPS: StepDef[] = [
  { number: 1, label: 'Product Details' },
  { number: 2, label: 'Production and Pricing' },
  { number: 3, label: 'Materials and Review' },
];

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
} as const;

const panelContainerStyle = {
  background: '#ffffff',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  display: 'flex',
  flexDirection: 'column' as const,
  height: 'calc(100vh - 248px)',
  padding: '20px 24px',
  overflow: 'hidden',
};

export default function ProductCreatePage() {
  const navigate = useNavigate();
  const { setHasOpenForm } = useFormState();
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { baseCurrency } = useBaseCurrency();

  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [panelErrors, setPanelErrors] = useState<Record<string, string>>({});

  const [materials, setMaterials] = useState<Material[]>([]);
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    overheadPercentage: '30',
    profitMargin: '30',
    otherDirectCosts: '0',
    productionMode: 'single' as 'single' | 'batch',
    batchYield: '1',
    currentSellingPrice: '0',
  });
  const [newCategoryValue, setNewCategoryValue] = useState('');

  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const [materialHighlightedIndex, setMaterialHighlightedIndex] = useState(0);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [tempBomMaterials, setTempBomMaterials] = useState<BOMMaterial[]>([]);
  const [editingBomId, setEditingBomId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState('');

  useEffect(() => {
    setHasOpenForm(true);
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  useEffect(() => {
    async function loadData() {
      try {
        const [materialsData, settingsData] = await Promise.all([
          materialsApi.getAll(),
          settingsApi.getAll(),
        ]);
        setMaterials(Array.isArray(materialsData) ? materialsData : []);

        const safeSettings = Array.isArray(settingsData) ? settingsData : [];
        const overheadSetting = safeSettings.find((entry: any) => entry.settingKey === 'defaultOverhead');
        const profitMarginSetting = safeSettings.find((entry: any) => entry.settingKey === 'defaultProfitMargin');
        const productCategoriesSetting = safeSettings.find((entry: any) => entry.settingKey === 'productCategories');

        const overhead = overheadSetting?.settingValue || '30';
        const profitMargin = profitMarginSetting?.settingValue || '30';

        setConfiguredCategories(parseConfiguredList(productCategoriesSetting?.settingValue));

        setFormData((prev) => ({
          ...prev,
          overheadPercentage: overhead,
          profitMargin,
        }));
      } catch (error) {
        console.error('Error loading product create data:', error);
        setMaterials([]);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const categoryOptions = useMemo(
    () => Array.from(new Set(configuredCategories)).sort((a, b) => a.localeCompare(b)),
    [configuredCategories],
  );

  const filteredMaterials = useMemo(() => {
    if (!materialSearchTerm) return materials;
    return materials.filter((material) =>
      material.name.toLowerCase().includes(materialSearchTerm.toLowerCase()),
    );
  }, [materials, materialSearchTerm]);

  function handleSelectMaterialFromDropdown(material: Material) {
    const newMaterial: BOMMaterial = {
      id: Date.now(),
      materialId: material.id,
      materialName: material.name,
      quantity: 1,
      unit: material.unit,
      unitPrice: material.unitPrice,
      currencySymbol: material.baseCurrencySymbol,
      materialType: material.materialType,
    };

    setTempBomMaterials((prev) => [...prev, newMaterial]);
    setMaterialSearchTerm('');
    setMaterialDropdownOpen(false);
    setMaterialHighlightedIndex(0);
    materialInputRef.current?.focus();
  }

  function handleMaterialKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const filtered = materials.filter((m) =>
      m.name.toLowerCase().includes(materialSearchTerm.toLowerCase()),
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMaterialDropdownOpen(true);
      setMaterialHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMaterialHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[materialHighlightedIndex]) {
        handleSelectMaterialFromDropdown(filtered[materialHighlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setMaterialDropdownOpen(false);
    }
  }

  function handleRemoveMaterialFromTemp(id: number) {
    setTempBomMaterials((prev) => prev.filter((m) => m.id !== id));
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

    setTempBomMaterials((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
    setEditingBomId(null);
    setEditingQuantity('');
  }

  function handleCancelBomEdit() {
    setEditingBomId(null);
    setEditingQuantity('');
  }

  function calculateLiveCost() {
    if (tempBomMaterials.length === 0) {
      return {
        materialCost: 0,
        overheadCost: 0,
        totalCost: 0,
        profitAmount: 0,
        optimalPrice: 0,
      };
    }

    const totalMaterialCost = tempBomMaterials.reduce((sum, item) => {
      return sum + item.quantity * parseFloat(item.unitPrice);
    }, 0);

    const overheadPercentage = parseFloat(formData.overheadPercentage) / 100;
    const overheadCost = totalMaterialCost * overheadPercentage;

    const otherDirectCosts = parseFloat(formData.otherDirectCosts) || 0;
    const totalCost = totalMaterialCost + overheadCost + otherDirectCosts;

    const profitMargin = parseFloat(formData.profitMargin) / 100;
    const profitAmount = totalCost * profitMargin;
    const totalPrice = totalCost + profitAmount;

    const batchYield = formData.productionMode === 'batch'
      ? Math.max(0.001, parseFloat(formData.batchYield || '1'))
      : 1;

    return {
      materialCost: totalMaterialCost / batchYield,
      overheadCost: overheadCost / batchYield,
      totalCost: totalCost / batchYield,
      profitAmount: profitAmount / batchYield,
      optimalPrice: totalPrice / batchYield,
    };
  }

  const liveCost = calculateLiveCost();

  function validateStep1() {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = 'Product name is required.';
    }

    const resolvedCategory = (formData.category === '__custom__' ? newCategoryValue : formData.category).trim();
    if (!formData.category || (formData.category === '__custom__' && !newCategoryValue.trim())) {
      errors.category = 'Please select a category or enter a new one.';
    } else if (!resolvedCategory) {
      errors.category = 'Please select a category or enter a new one.';
    }

    setPanelErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep2() {
    const errors: Record<string, string> = {};

    const overhead = parseFloat(formData.overheadPercentage);
    if (Number.isNaN(overhead)) {
      errors.overheadPercentage = 'Overhead % must be a valid number.';
    }

    const markup = parseFloat(formData.profitMargin);
    if (Number.isNaN(markup)) {
      errors.profitMargin = 'Markup % must be a valid number.';
    }

    if (formData.productionMode === 'batch') {
      const batchYield = parseFloat(formData.batchYield);
      if (Number.isNaN(batchYield) || batchYield <= 0) {
        errors.batchYield = 'Batch Yield must be greater than 0.';
      }
    }

    setPanelErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function markStepCompleted(step: number) {
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }

  function handleNext() {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      markStepCompleted(1);
      setCurrentStep(2);
      setPanelErrors({});
      return;
    }

    if (currentStep === 2) {
      if (!validateStep2()) return;
      markStepCompleted(2);
      setCurrentStep(3);
      setPanelErrors({});
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setPanelErrors({});
    }
  }

  function handleStepClick(step: number) {
    if (completedSteps.includes(step)) {
      setCurrentStep(step);
      setPanelErrors({});
    }
  }

  async function handleSave() {
    if (saving) return;

    if (tempBomMaterials.length === 0) {
      showToastMessage('No materials added to BOM — product will be saved without materials.', 'error');
    }

    const resolvedCategory = (formData.category === '__custom__' ? newCategoryValue : formData.category).trim();
    if (!resolvedCategory) {
      showToastMessage('Please select a category or enter a new one.', 'error');
      setCurrentStep(1);
      return;
    }

    try {
      setSaving(true);
      const productData = {
        ...formData,
        category: resolvedCategory,
        overheadPercentage: parseFloat(formData.overheadPercentage),
        profitMargin: parseFloat(formData.profitMargin),
        otherDirectCosts: parseFloat(formData.otherDirectCosts),
        productionMode: formData.productionMode,
        batchYield: parseFloat(formData.batchYield),
        currentSellingPrice: parseFloat(formData.currentSellingPrice) || 0,
      };

      const result = await productsApi.create(productData);
      const productId = result.id;

      for (const material of tempBomMaterials) {
        await productsApi.addMaterialToBOM(productId, {
          materialId: material.materialId,
          quantity: material.quantity,
        });
      }

      showToastMessage('Product created successfully', 'success');
      navigate('/products');
    } catch (error) {
      console.error('Error saving product:', error);
      showToastMessage('Failed to save product', 'error');
    } finally {
      setSaving(false);
    }
  }

  function renderPanelNav(options: { showBack: boolean; showNext: boolean; onSave?: () => void }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, height: '52px', marginTop: 'auto', paddingTop: '8px' }}>
        {options.showBack ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={handleBack}>
            Back
          </button>
        ) : (
          <div />
        )}
        {options.showNext ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        )}
      </div>
    );
  }

  function renderPanel1() {
    return (
      <div style={panelContainerStyle}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 className="app-form-section-title" style={{ marginTop: 0 }}>Product Details</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={fieldLabelStyle}>Product Name *</label>
              <input
                className="app-input"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={fieldInputStyle}
              />
              {panelErrors.name ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{panelErrors.name}</div> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>SKU</label>
                <input
                  className="app-input"
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Category *</label>
                <select
                  className="app-input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  style={fieldInputStyle}
                >
                  <option value="" disabled>Select category</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                  <option value="__custom__">+ Add new category...</option>
                </select>
                {formData.category === '__custom__' ? (
                  <input
                    className="app-input"
                    value={newCategoryValue}
                    onChange={(e) => setNewCategoryValue(e.target.value)}
                    placeholder="Enter new category"
                    style={{ ...fieldInputStyle, marginTop: '8px' }}
                  />
                ) : null}
                {panelErrors.category ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{panelErrors.category}</div> : null}
              </div>
            </div>
            <div>
              <label style={fieldLabelStyle}>Description</label>
              <textarea
                className="app-input"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ ...fieldInputStyle, minHeight: '80px', resize: 'none' }}
              />
            </div>
          </div>
        </div>
        {renderPanelNav({ showBack: false, showNext: true })}
      </div>
    );
  }

  function renderPanel2() {
    return (
      <div style={panelContainerStyle}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 className="app-form-section-title" style={{ marginTop: 0 }}>Production and Pricing</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={fieldLabelStyle}>Production Mode</label>
              <div className="app-choice-tabs" role="tablist" aria-label="Production mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={formData.productionMode === 'single'}
                  className={`app-choice-tab ${formData.productionMode === 'single' ? 'is-active' : ''}`}
                  onClick={() => setFormData({ ...formData, productionMode: 'single', batchYield: '1' })}
                >
                  Single
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={formData.productionMode === 'batch'}
                  className={`app-choice-tab ${formData.productionMode === 'batch' ? 'is-active' : ''}`}
                  onClick={() => setFormData({ ...formData, productionMode: 'batch', batchYield: formData.batchYield || '1' })}
                >
                  Batch
                </button>
              </div>
            </div>
            {formData.productionMode === 'batch' ? (
              <div>
                <label style={fieldLabelStyle}>Batch Yield *</label>
                <input
                  className="app-input"
                  type="number"
                  min="0.001"
                  step="any"
                  value={formData.batchYield}
                  onChange={(e) => setFormData({ ...formData, batchYield: e.target.value })}
                  style={fieldInputStyle}
                />
                {panelErrors.batchYield ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{panelErrors.batchYield}</div> : null}
              </div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>Overhead % *</label>
                <input
                  className="app-input"
                  type="number"
                  step="0.1"
                  value={formData.overheadPercentage}
                  onChange={(e) => setFormData({ ...formData, overheadPercentage: e.target.value })}
                  style={fieldInputStyle}
                />
                {panelErrors.overheadPercentage ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{panelErrors.overheadPercentage}</div> : null}
              </div>
              <div>
                <label style={{ ...fieldLabelStyle, display: 'inline-flex', alignItems: 'center' }}>
                  Markup % *
                  <MarkupInfoTooltip />
                </label>
                <input
                  className="app-input"
                  type="number"
                  step="0.1"
                  placeholder="e.g. 20"
                  value={formData.profitMargin}
                  onChange={(e) => setFormData({ ...formData, profitMargin: e.target.value })}
                  style={fieldInputStyle}
                />
                {panelErrors.profitMargin ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{panelErrors.profitMargin}</div> : null}
              </div>
            </div>
            <div>
              <label style={fieldLabelStyle}>Approved base price</label>
              <input
                className="app-input"
                type="number"
                step="0.01"
                value={formData.currentSellingPrice}
                onChange={(e) => setFormData({ ...formData, currentSellingPrice: e.target.value })}
                style={fieldInputStyle}
              />
            </div>
          </div>
        </div>
        {renderPanelNav({ showBack: true, showNext: true })}
      </div>
    );
  }

  function renderPanel3() {
    return (
      <div style={panelContainerStyle}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flexShrink: 0, height: '120px', marginBottom: '8px' }}>
            <h3 className="app-form-section-title" style={{ marginTop: 0, marginBottom: '8px' }}>Bill of Materials</h3>
            <label style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Select Material</label>
            <div style={{ position: 'relative' }}>
              <input
                ref={materialInputRef}
                className="app-input"
                type="text"
                placeholder="Search and select material..."
                value={materialSearchTerm}
                onChange={(e) => {
                  setMaterialSearchTerm(e.target.value);
                  setMaterialDropdownOpen(true);
                  setMaterialHighlightedIndex(0);
                }}
                onFocus={() => setMaterialDropdownOpen(true)}
                onBlur={() => setTimeout(() => setMaterialDropdownOpen(false), 200)}
                onKeyDown={handleMaterialKeyDown}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${materialDropdownOpen ? '#0F2847' : '#e2e8f0'}`,
                  boxShadow: materialDropdownOpen ? '0 0 0 3px rgba(15, 40, 71, 0.08)' : 'none',
                }}
              />
              {materialDropdownOpen && filteredMaterials.length > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 10,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
                  }}
                >
                  {filteredMaterials.map((material, index) => (
                    <div
                      key={material.id}
                      onMouseDown={() => handleSelectMaterialFromDropdown(material)}
                      onMouseEnter={() => setMaterialHighlightedIndex(index)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        backgroundColor: index === materialHighlightedIndex ? 'rgba(15, 40, 71, 0.05)' : 'white',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>{material.name}</span>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>
                        {baseCurrency} {parseFloat(material.unitPrice).toFixed(2)}/{material.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            {tempBomMaterials.length > 0 ? (
              <table className="app-table app-table-compact" style={{ width: '100%' }}>
                <thead style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Material</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                    <th style={{ textAlign: 'right' }}>Unit Price</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tempBomMaterials.map((item) => {
                    const totalCost = item.quantity * parseFloat(item.unitPrice);
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'left' }}>{item.materialName}</td>
                        <td style={{ textAlign: 'right' }}>
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
                            `${item.quantity.toFixed(3)} ${item.unit}`
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>{baseCurrency} {parseFloat(item.unitPrice).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>{baseCurrency} {totalCost.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {editingBomId === item.id ? (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button type="button" onClick={() => handleSaveBomEdit(item.id)} className="btn btn-success btn-sm">Save</button>
                              <button type="button" onClick={handleCancelBomEdit} className="btn btn-ghost btn-sm">Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button type="button" onClick={() => handleEditBomItem(item.id, item.quantity.toString())} className="btn btn-secondary btn-sm">Edit</button>
                              <button type="button" onClick={() => handleRemoveMaterialFromTemp(item.id)} className="btn btn-danger btn-sm">Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '14px' }}>
                No materials added yet
              </div>
            )}
          </div>

          <div style={{ flexShrink: 0, height: '200px', marginTop: '12px', padding: '12px', background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: '8px', overflow: 'hidden' }}>
            <h3 className="app-form-section-title" style={{ marginTop: 0, marginBottom: '8px' }}>Cost Summary (per unit)</h3>
            <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Material Cost</span>
                <span style={{ fontWeight: '600' }}>{baseCurrency} {liveCost.materialCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Overhead ({formData.overheadPercentage}%)</span>
                <span style={{ fontWeight: '600' }}>{baseCurrency} {liveCost.overheadCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Total Production Cost</span>
                <span style={{ fontWeight: '700' }}>{baseCurrency} {liveCost.totalCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
                  Markup ({formData.profitMargin}%)
                  <MarkupInfoTooltip />
                </span>
                <span style={{ fontWeight: '600' }}>{baseCurrency} {liveCost.profitAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#0F2847', fontWeight: '700' }}>Optimal Price</span>
                <span style={{ fontWeight: '700', color: '#16a34a', fontSize: '16px' }}>{baseCurrency} {liveCost.optimalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        {renderPanelNav({ showBack: true, showNext: false })}
      </div>
    );
  }

  return (
    <div className="app-page" style={{ backgroundColor: '#ffffff', overflow: 'hidden', height: '100vh' }}>
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      <div className="app-page-content" style={{ padding: '24px', overflow: 'hidden', height: '100%' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/products')}
            style={{ marginBottom: '16px', paddingLeft: 0, flexShrink: 0 }}
          >
            ← Back to Products
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#0F2847', margin: '0 0 16px', flexShrink: 0 }}>
            New Product
          </h1>

          {loading ? (
            <div style={{ color: '#64748b' }}>Loading form...</div>
          ) : (
            <>
              <StepIndicator
                steps={STEPS}
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={handleStepClick}
              />
              {currentStep === 1 ? renderPanel1() : null}
              {currentStep === 2 ? renderPanel2() : null}
              {currentStep === 3 ? renderPanel3() : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
