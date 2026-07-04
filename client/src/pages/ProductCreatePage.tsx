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
  pointerEvents: 'none' as const,
};

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

const bomSearchWrapperStyle = {
  position: 'relative' as const,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
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
  display: 'flex',
  flexDirection: 'column' as const,
};

const bomTableStyle = {
  width: '100%',
  minWidth: '520px',
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
  minWidth: '120px',
};

const bomActionButtonsStyle = {
  display: 'flex',
  gap: '4px',
  justifyContent: 'center',
  flexWrap: 'nowrap' as const,
  flexShrink: 0,
};

export default function ProductCreatePage() {
  const navigate = useNavigate();
  const { setHasOpenForm } = useFormState();
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { baseCurrency } = useBaseCurrency();

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  function validateForm() {
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

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (saving) return;
    if (!validateForm()) return;

    const resolvedCategory = (formData.category === '__custom__' ? newCategoryValue : formData.category).trim();

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

  return (
    <>
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      <div style={pageOverlayStyle} aria-hidden="true" />
      <div style={pageContainerStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/products')}
            style={{ marginBottom: '8px', paddingLeft: 0 }}
          >
            ← Back to Products
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#0F2847', margin: 0 }}>
            New Product
          </h1>
        </div>

        {loading ? (
          <div style={{ padding: '16px 20px', color: '#64748b' }}>Loading form...</div>
        ) : (
          <div style={bodyRowStyle}>
              {/* Left panel — form fields */}
              <div style={leftPanelStyle}>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
                  <h3 style={panelTitleStyle}>Product Details</h3>
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
                      {fieldErrors.name ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{fieldErrors.name}</div> : null}
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
                        {fieldErrors.category ? <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>{fieldErrors.category}</div> : null}
                      </div>
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>Description</label>
                      <textarea
                        className="app-input"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        style={{ ...fieldInputStyle, minHeight: '72px', resize: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #E2E8F0', margin: '16px 0' }} />

                  <h3 style={panelTitleStyle}>Production and Pricing</h3>
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

                <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Product'}
                  </button>
                </div>
              </div>

              {/* Right panel — BOM + cost summary */}
              <div style={rightPanelStyle}>
                <div style={bomSectionStyle}>
                  <h3 style={panelTitleStyle}>Bill of Materials</h3>
                  <label style={{ ...fieldLabelStyle, marginBottom: '4px' }}>Select Material</label>
                  <div style={bomSearchWrapperStyle}>
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
                        boxSizing: 'border-box',
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
                              gap: '8px',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ fontSize: '14px', fontWeight: '500', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</span>
                            <span style={{ fontSize: '13px', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {baseCurrency} {parseFloat(material.unitPrice).toFixed(2)}/{material.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={bomTableContainerStyle}>
                  {tempBomMaterials.length > 0 ? (
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
                        {tempBomMaterials.map((item) => {
                          const totalCost = item.quantity * parseFloat(item.unitPrice);
                          return (
                            <tr key={item.id}>
                              <td style={{ textAlign: 'left', wordBreak: 'break-word', minWidth: '140px' }}>{item.materialName}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{baseCurrency} {parseFloat(item.unitPrice).toFixed(2)}</td>
                              <td style={{ textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>{baseCurrency} {totalCost.toFixed(2)}</td>
                              <td style={bomActionCellStyle}>
                                {editingBomId === item.id ? (
                                  <div style={bomActionButtonsStyle}>
                                    <button type="button" onClick={() => handleSaveBomEdit(item.id)} className="btn btn-success btn-sm">Save</button>
                                    <button type="button" onClick={handleCancelBomEdit} className="btn btn-ghost btn-sm">Cancel</button>
                                  </div>
                                ) : (
                                  <div style={bomActionButtonsStyle}>
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
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '14px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      No materials added yet — search and add materials on the left.
                    </div>
                  )}
                  {tempBomMaterials.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #f1f5f9' }}>
                      No materials added. You can add materials later from the product detail page.
                    </div>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, marginTop: '12px', padding: '12px', background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: '8px', boxSizing: 'border-box', minWidth: 0 }}>
                  <h3 className="app-form-section-title" style={{ marginTop: 0, marginBottom: '8px', fontSize: '14px' }}>Cost Summary (per unit)</h3>
                  <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
                    <div style={costSummaryRowStyle}>
                      <span style={{ color: '#64748b', minWidth: 0 }}>Material Cost</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{baseCurrency} {liveCost.materialCost.toFixed(2)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ color: '#64748b', minWidth: 0 }}>Overhead ({formData.overheadPercentage}%)</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{baseCurrency} {liveCost.overheadCost.toFixed(2)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ color: '#64748b', minWidth: 0 }}>Total Production Cost</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700' }}>{baseCurrency} {liveCost.totalCost.toFixed(2)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', minWidth: 0, flex: '1 1 auto' }}>
                        Markup ({formData.profitMargin}%)
                        <MarkupInfoTooltip />
                      </span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '600' }}>{baseCurrency} {liveCost.profitAmount.toFixed(2)}</span>
                    </div>
                    <div style={costSummaryRowStyle}>
                      <span style={{ color: '#0F2847', fontWeight: '700', minWidth: 0 }}>Optimal Price</span>
                      <span style={{ ...costSummaryValueStyle, fontWeight: '700', color: '#16a34a', fontSize: '16px' }}>{baseCurrency} {liveCost.optimalPrice.toFixed(2)}</span>
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
