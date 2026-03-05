import { useEffect, useMemo, useRef, useState } from 'react';
import { productsApi } from '../api';

interface Product {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  overheadPercentage: number;
  profitMargin: number;
  otherDirectCosts?: number;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  currentSellingPrice?: number;
}

interface Material {
  id: number;
  name: string;
  unit: string;
  unitPrice: string;
  baseCurrencySymbol: string;
}

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
}
interface ProductFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  materials: Material[];
  categoryOptions: string[];
  defaultOverhead: string;
  onSaved: () => void | Promise<void>;
}

export default function ProductFormDrawer({
  isOpen,
  onClose,
  product,
  materials,
  categoryOptions,
  defaultOverhead,
  onSaved,
}: ProductFormDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    overheadPercentage: defaultOverhead,
    profitMargin: '30',
    otherDirectCosts: '0',
    productionMode: 'single' as 'single' | 'batch',
    batchYield: '1',
    currentSellingPrice: '0',
  });

  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const [materialHighlightedIndex, setMaterialHighlightedIndex] = useState(0);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [tempBomMaterials, setTempBomMaterials] = useState<BOMMaterial[]>([]);
  const [editingBomId, setEditingBomId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      setFormData({
        name: product.name,
        sku: product.sku || '',
        description: product.description || '',
        category: product.category || '',
        overheadPercentage: product.overheadPercentage?.toString() || defaultOverhead,
        profitMargin: product.profitMargin?.toString() || '30',
        otherDirectCosts: product.otherDirectCosts?.toString() || '0',
        productionMode: product.productionMode || 'single',
        batchYield: product.batchYield?.toString() || '1',
        currentSellingPrice: product.currentSellingPrice?.toString() || '0',
      });
      loadExistingBOM(product.id);
    } else {
      resetForm();
    }
  }, [isOpen, product, defaultOverhead]);

  async function loadExistingBOM(productId: number) {
    try {
      const bom = await productsApi.getBOM(productId);
      setTempBomMaterials(bom);
    } catch (error) {
      console.error('Error loading BOM:', error);
      setTempBomMaterials([]);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '',
      overheadPercentage: defaultOverhead,
      profitMargin: '30',
      otherDirectCosts: '0',
      productionMode: 'single',
      batchYield: '1',
      currentSellingPrice: '0',
    });
    setTempBomMaterials([]);
    setMaterialSearchTerm('');
    setEditingBomId(null);
    setEditingQuantity('');
  }

  const filteredMaterials = useMemo(() => {
    if (!materialSearchTerm) return materials;
    return materials.filter((material) =>
      material.name.toLowerCase().includes(materialSearchTerm.toLowerCase())
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
    };

    setTempBomMaterials((prev) => [...prev, newMaterial]);
    setMaterialSearchTerm('');
    setMaterialDropdownOpen(false);
    setMaterialHighlightedIndex(0);
    materialInputRef.current?.focus();
  }

  function handleMaterialKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const filtered = materials.filter((m) =>
      m.name.toLowerCase().includes(materialSearchTerm.toLowerCase())
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
      alert('Please enter a valid quantity');
      return;
    }

    setTempBomMaterials((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
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

    const batchYield = formData.productionMode === 'batch' ? Math.max(1, parseInt(formData.batchYield || '1')) : 1;

    return {
      materialCost: totalMaterialCost / batchYield,
      overheadCost: overheadCost / batchYield,
      totalCost: totalCost / batchYield,
      profitAmount: profitAmount / batchYield,
      optimalPrice: totalPrice / batchYield,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      const productData = {
        ...formData,
        overheadPercentage: parseFloat(formData.overheadPercentage),
        profitMargin: parseFloat(formData.profitMargin),
        otherDirectCosts: parseFloat(formData.otherDirectCosts),
        productionMode: formData.productionMode,
        batchYield: parseInt(formData.batchYield),
        currentSellingPrice: parseFloat(formData.currentSellingPrice) || 0,
      };

      let productId: number;

      if (product) {
        await productsApi.update(product.id, productData);
        productId = product.id;
      } else {
        const result = await productsApi.create(productData);
        productId = result.id;
      }

      if (product) {
        const existingBom = await productsApi.getBOM(productId);
        for (const item of existingBom) {
          await productsApi.removeMaterialFromBOM(productId, item.id);
        }
      }

      for (const material of tempBomMaterials) {
        await productsApi.addMaterialToBOM(productId, {
          materialId: material.materialId,
          quantity: material.quantity,
        });
      }

      resetForm();
      await onSaved();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const liveCost = calculateLiveCost();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        zIndex: 1200,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          width: 'min(640px, 100%)',
          height: '100%',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '-12px 0 24px rgba(15, 23, 42, 0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>{product ? 'Edit Product' : 'Add Product'}</h2>
            <div style={{ color: '#64748b', fontSize: '13px' }}>Update product details and BOM inline</div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: 0, marginBottom: '12px', fontSize: '15px', fontWeight: '700' }}>Basic Info</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Category *</label>
                  <input
                    required
                    list="product-category-options"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Type or select category"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <datalist id="product-category-options">
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '60px' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: 0, marginBottom: '12px', fontSize: '15px', fontWeight: '700' }}>Production Settings</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Production Mode</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input
                      type="radio"
                      checked={formData.productionMode === 'single'}
                      onChange={() => setFormData({ ...formData, productionMode: 'single', batchYield: '1' })}
                    />
                    Single
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input
                      type="radio"
                      checked={formData.productionMode === 'batch'}
                      onChange={() => setFormData({ ...formData, productionMode: 'batch', batchYield: formData.batchYield || '1' })}
                    />
                    Batch
                  </label>
                </div>
              </div>
              {formData.productionMode === 'batch' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Batch Yield *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.batchYield}
                    onChange={(e) => setFormData({ ...formData, batchYield: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Overhead % *</label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    value={formData.overheadPercentage}
                    onChange={(e) => setFormData({ ...formData, overheadPercentage: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Profit Margin % *</label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    value={formData.profitMargin}
                    onChange={(e) => setFormData({ ...formData, profitMargin: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Current Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.currentSellingPrice}
                  onChange={(e) => setFormData({ ...formData, currentSellingPrice: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: 0, marginBottom: '12px', fontSize: '15px', fontWeight: '700' }}>Bill of Materials</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Select Material</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={materialInputRef}
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
                    border: '1px solid ' + (materialDropdownOpen ? '#3b82f6' : '#e2e8f0'),
                    fontSize: '14px',
                    transition: 'border-color 0.2s',
                  }}
                />
                {materialDropdownOpen && filteredMaterials.length > 0 && (
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
                      maxHeight: '280px',
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
                          backgroundColor: index === materialHighlightedIndex ? '#f0f9ff' : 'white',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>{material.name}</span>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                          GHS {parseFloat(material.unitPrice).toFixed(2)}/{material.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {materialDropdownOpen && filteredMaterials.length === 0 && materialSearchTerm && (
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
                      padding: '12px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: '#64748b',
                      zIndex: 10,
                    }}
                  >
                    No materials found
                  </div>
                )}
              </div>
            </div>

            {tempBomMaterials.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f1f5f9' }}>
                  <tr>
                    <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Material</th>
                    <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Quantity</th>
                    <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Unit Price</th>
                    <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Total</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontSize: '12px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tempBomMaterials.map((item) => {
                    const totalCost = item.quantity * parseFloat(item.unitPrice);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px', fontSize: '12px' }}>{item.materialName}</td>
                        <td style={{ padding: '8px', fontSize: '12px', textAlign: 'right' }}>
                          {editingBomId === item.id ? (
                            <input
                              type="number"
                              step="0.001"
                              value={editingQuantity}
                              onChange={(e) => setEditingQuantity(e.target.value)}
                              autoFocus
                              style={{ width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #1e40af' }}
                            />
                          ) : (
                            `${item.quantity.toFixed(3)} ${item.unit}`
                          )}
                        </td>
                        <td style={{ padding: '8px', fontSize: '12px', textAlign: 'right' }}>
                          GHS {parseFloat(item.unitPrice).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>
                          GHS {totalCost.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {editingBomId === item.id ? (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleSaveBomEdit(item.id)}
                                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelBomEdit}
                                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleEditBomItem(item.id, item.quantity.toString())}
                                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMaterialFromTemp(item.id)}
                                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                No materials added yet
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            <h3 style={{ margin: 0, marginBottom: '12px', fontSize: '15px', fontWeight: '700' }}>Cost Summary (per unit)</h3>
            <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Material Cost</span>
                <span style={{ fontWeight: '600' }}>GHS {liveCost.materialCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Overhead ({formData.overheadPercentage}%)</span>
                <span style={{ fontWeight: '600' }}>GHS {liveCost.overheadCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Total Production Cost</span>
                <span style={{ fontWeight: '700' }}>GHS {liveCost.totalCost.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Profit ({formData.profitMargin}%)</span>
                <span style={{ fontWeight: '600' }}>GHS {liveCost.profitAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#1e40af', fontWeight: '700' }}>Optimal Price</span>
                <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '16px' }}>GHS {liveCost.optimalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontWeight: '600', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', backgroundColor: saving ? '#94a3b8' : '#1e40af', color: 'white', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
