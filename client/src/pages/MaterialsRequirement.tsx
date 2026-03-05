import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AlertTriangle, ClipboardList, FileSpreadsheet, Package, Printer, Search, X } from 'lucide-react';
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

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
}

interface CostCalculation {
  totalMaterialCost: string;
  overheadCost: string;
  totalCost: string;
  profitAmount: string;
  recommendedPrice: string;
}

interface ProductPricing extends Product {
  materialCost: number;
  overheadCost: number;
  totalCost: number;
  profitAmount: number;
  optimalPrice: number;
}

interface ProductPlan {
  id: string;
  product: ProductPricing;
  bom: BOMMaterial[];
  unitsInput: string;
  batchesInput: string;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toPerUnitCost(cost: CostCalculation, product: Product) {
  const batchYield = product.productionMode === 'batch' ? Math.max(1, product.batchYield || 1) : 1;
  return {
    materialCost: toNumber(cost.totalMaterialCost) / batchYield,
    overheadCost: toNumber(cost.overheadCost) / batchYield,
    totalCost: toNumber(cost.totalCost) / batchYield,
    profitAmount: toNumber(cost.profitAmount) / batchYield,
    optimalPrice: toNumber(cost.recommendedPrice) / batchYield,
  };
}

function formatNumber(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return value.toFixed(2);
}

function formatQuantity(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatInputNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

export default function MaterialsRequirement() {
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pendingProduct, setPendingProduct] = useState<ProductPricing | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [productsInPlan, setProductsInPlan] = useState<ProductPlan[]>([]);
  const [loadingProductIds, setLoadingProductIds] = useState<Set<number>>(new Set());
  const [debouncedPlan, setDebouncedPlan] = useState<ProductPlan[]>([]);

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      const productsData = await productsApi.getAll();

      const costEntries = await Promise.all(
        productsData.map(async (product: Product) => {
          try {
            const cost = await productsApi.calculateCost(product.id);
            return { productId: product.id, cost };
          } catch (error) {
            console.error('Error calculating cost for product:', product.id, error);
            return { productId: product.id, cost: null };
          }
        })
      );

      const productsWithPricing: ProductPricing[] = productsData.map((product: Product) => {
        const cost = costEntries.find((entry) => entry.productId === product.id)?.cost || null;
        const perUnit = cost
          ? toPerUnitCost(cost, product)
          : {
              materialCost: 0,
              overheadCost: 0,
              totalCost: 0,
              profitAmount: 0,
              optimalPrice: 0,
            };
        return {
          ...product,
          ...perUnit,
        };
      });

      setProducts(productsWithPricing);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPlan(productsInPlan);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [productsInPlan]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter((product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [products, searchTerm]);

  function showToastMessage(message: string) {
    setToastMessage(message);
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 2000);
  }

  function handleSelectProduct(product: ProductPricing) {
    setPendingProduct(product);
    setSearchTerm(product.name);
    setDropdownOpen(false);
    setHighlightedIndex(0);
  }

  async function handleAddProduct(product: ProductPricing) {
    if (productsInPlan.some((item) => item.product.id === product.id)) {
      showToastMessage('Product already in plan');
      return;
    }

    setLoadingProductIds((prev) => new Set(prev).add(product.id));
    try {
      const bomData = await productsApi.getBOM(product.id);
      const batchYield = Math.max(1, product.batchYield || 1);
      const planItem: ProductPlan = {
        id: `${product.id}-${Date.now()}`,
        product,
        bom: bomData,
        unitsInput: formatInputNumber(batchYield, 0),
        batchesInput: '1',
      };
      setProductsInPlan((prev) => [...prev, planItem]);
      setPendingProduct(null);
      setSearchTerm('');
      setDropdownOpen(false);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error loading BOM:', error);
      showToastMessage('Failed to add product');
    } finally {
      setLoadingProductIds((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  }

  function handleRemoveProduct(planId: string) {
    setProductsInPlan((prev) => prev.filter((item) => item.id !== planId));
  }

  function handleClearAll() {
    if (productsInPlan.length === 0) return;
    const confirmed = window.confirm(`Remove all ${productsInPlan.length} products from plan?`);
    if (!confirmed) return;
    setProductsInPlan([]);
  }

  function updatePlanItem(planId: string, updates: Partial<ProductPlan>) {
    setProductsInPlan((prev) =>
      prev.map((item) => (item.id === planId ? { ...item, ...updates } : item))
    );
  }

  function handleUnitsChange(planId: string, value: string) {
    const target = productsInPlan.find((item) => item.id === planId);
    if (!target) return;
    const batchYield = Math.max(1, target.product.batchYield || 1);
    const unitsValue = parseFloat(value);
    const batchesValue = !Number.isNaN(unitsValue) && unitsValue > 0 ? unitsValue / batchYield : 0;
    const nextBatches = value ? formatInputNumber(batchesValue, 4) : '';
    updatePlanItem(planId, { unitsInput: value, batchesInput: nextBatches });
  }

  function handleBatchesChange(planId: string, value: string) {
    const target = productsInPlan.find((item) => item.id === planId);
    if (!target) return;
    const batchYield = Math.max(1, target.product.batchYield || 1);
    const batchesValue = parseFloat(value);
    const unitsValue = !Number.isNaN(batchesValue) && batchesValue > 0 ? batchesValue * batchYield : 0;
    const nextUnits = value ? formatInputNumber(unitsValue, 2) : '';
    updatePlanItem(planId, { batchesInput: value, unitsInput: nextUnits });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredProducts[highlightedIndex];
      if (selected) {
        handleAddProduct(selected);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  }

  function formatUsedIn(usedIn: string[]) {
    if (usedIn.length === 1) return usedIn[0];
    const names = usedIn.slice(0, 2).join(', ');
    const suffix = usedIn.length > 2 ? ', ...' : '';
    return `${names}${suffix} (${usedIn.length})`;
  }

  const planMetrics = useMemo(() => {
    const consolidatedMap = new Map<number, {
      materialId: number;
      materialName: string;
      unit: string;
      unitPrice: number;
      totalQtyNeeded: number;
      totalCost: number;
      usedInProducts: Set<string>;
    }>();

    const perProductCosts: Array<{
      productName: string;
      units: number;
      batches: number;
      materialCost: number;
      overhead: number;
      totalCost: number;
      revenue: number;
      profit: number;
    }> = [];

    let totalMaterialCost = 0;
    let totalOverhead = 0;
    let totalRevenue = 0;
    let totalUnits = 0;
    let productsWithUnits = 0;

    debouncedPlan.forEach((planItem) => {
      const unitsValue = parseFloat(planItem.unitsInput) || 0;
      if (unitsValue <= 0) {
        return;
      }
      const batchYield = Math.max(1, planItem.product.batchYield || 1);
      const batchesNeeded = unitsValue / batchYield;

      totalUnits += unitsValue;
      productsWithUnits += 1;

      let productMaterialCost = 0;
      planItem.bom.forEach((bomItem) => {
        const qtyNeeded = batchesNeeded * bomItem.quantity;
        const unitCost = toNumber(bomItem.unitPrice);
        const itemCost = qtyNeeded * unitCost;
        productMaterialCost += itemCost;

        const existing = consolidatedMap.get(bomItem.materialId);
        if (existing) {
          existing.totalQtyNeeded += qtyNeeded;
          existing.totalCost += itemCost;
          existing.usedInProducts.add(planItem.product.name);
        } else {
          consolidatedMap.set(bomItem.materialId, {
            materialId: bomItem.materialId,
            materialName: bomItem.materialName,
            unit: bomItem.unit,
            unitPrice: unitCost,
            totalQtyNeeded: qtyNeeded,
            totalCost: itemCost,
            usedInProducts: new Set([planItem.product.name]),
          });
        }
      });

      const productOverhead = productMaterialCost * (planItem.product.overheadPercentage / 100);
      const productTotalCost = productMaterialCost + productOverhead;
      const perUnitCost = unitsValue > 0 ? productTotalCost / unitsValue : 0;
      const optimalPricePerUnit = perUnitCost * (1 + planItem.product.profitMargin / 100);
      const revenue = unitsValue * optimalPricePerUnit;
      const profit = revenue - productTotalCost;

      totalMaterialCost += productMaterialCost;
      totalOverhead += productOverhead;
      totalRevenue += revenue;

      perProductCosts.push({
        productName: planItem.product.name,
        units: unitsValue,
        batches: batchesNeeded,
        materialCost: productMaterialCost,
        overhead: productOverhead,
        totalCost: productTotalCost,
        revenue,
        profit,
      });
    });

    const totalProductionCost = totalMaterialCost + totalOverhead;
    const totalProfit = totalRevenue - totalProductionCost;
    const averageMargin = totalProductionCost > 0 ? (totalProfit / totalProductionCost) * 100 : 0;

    const consolidatedMaterials = Array.from(consolidatedMap.values()).map((item) => ({
      ...item,
      usedInProducts: Array.from(item.usedInProducts),
    }));

    return {
      consolidatedMaterials,
      perProductCosts,
      totalMaterialCost,
      totalOverhead,
      totalProductionCost,
      totalRevenue,
      totalProfit,
      averageMargin,
      totalUnits,
      productsWithUnits,
    };
  }, [debouncedPlan]);

  const hasPlanCalculations = planMetrics.productsWithUnits > 0;

  function handleCopyShoppingList() {
    if (!hasPlanCalculations) return;

    const lines = [
      'MATERIALS SHOPPING LIST',
      `Production Plan: ${productsInPlan.length} products, ${formatNumber(planMetrics.totalUnits)} total units`,
      `Generated: ${new Date().toLocaleDateString()}`,
      '────────────────────────────────────────',
      'MATERIALS NEEDED:',
      ...planMetrics.consolidatedMaterials.map(
        (m) => `${m.materialName}: ${formatQuantity(m.totalQtyNeeded, 2)} ${m.unit}`
      ),
      '────────────────────────────────────────',
      'PRODUCTION SUMMARY:',
      ...planMetrics.perProductCosts.map(
        (item) => `${item.productName}: ${formatNumber(item.units)} units (${formatQuantity(item.batches, 2)} batches)`
      ),
      '────────────────────────────────────────',
      `Total Production Cost: GHS ${formatNumber(planMetrics.totalProductionCost)}`,
      `Total Material Cost: GHS ${formatNumber(planMetrics.totalMaterialCost)}`,
      `Total Overhead: GHS ${formatNumber(planMetrics.totalOverhead)}`,
    ];

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToastMessage('Shopping list copied!');
    });
  }

  function handleExportToExcel() {
    if (!hasPlanCalculations) return;
    const wb = XLSX.utils.book_new();

    const planData = planMetrics.perProductCosts.map((item) => ({
      Product: item.productName,
      Units: parseFloat(formatNumber(item.units)),
      Batches: parseFloat(formatQuantity(item.batches, 2)),
      'Material Cost (GHS)': item.materialCost.toFixed(2),
      'Overhead (GHS)': item.overhead.toFixed(2),
      'Total Cost (GHS)': item.totalCost.toFixed(2),
      'Revenue (GHS)': item.revenue.toFixed(2),
      'Profit (GHS)': item.profit.toFixed(2),
    }));

    const planSheet = XLSX.utils.json_to_sheet(planData);
    planSheet['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, planSheet, 'Production Plan');

    const materialsData = planMetrics.consolidatedMaterials.map((m) => ({
      'Material Name': m.materialName,
      'Total Qty Needed': parseFloat(formatQuantity(m.totalQtyNeeded, 4)),
      'Used In': formatUsedIn(m.usedInProducts),
      'Unit Cost (GHS)': m.unitPrice.toFixed(2),
      'Total Cost (GHS)': m.totalCost.toFixed(2),
    }));

    const materialsSheet = XLSX.utils.json_to_sheet(materialsData);
    materialsSheet['!cols'] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, materialsSheet, 'Consolidated Materials');

    const summaryData = [
      { Item: 'Total Material Cost', Amount: planMetrics.totalMaterialCost.toFixed(2) },
      { Item: 'Total Overhead', Amount: planMetrics.totalOverhead.toFixed(2) },
      { Item: 'Total Production Cost', Amount: planMetrics.totalProductionCost.toFixed(2) },
      { Item: '', Amount: '' },
      { Item: 'Total Revenue @ Optimal', Amount: planMetrics.totalRevenue.toFixed(2) },
      { Item: 'Total Profit', Amount: planMetrics.totalProfit.toFixed(2) },
      { Item: 'Average Margin', Amount: `${planMetrics.averageMargin.toFixed(1)}%` },
    ];

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Cost Summary');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(
      wb,
      `MaterialsReq_Plan_${formatNumber(planMetrics.totalUnits)}units_${date}.xlsx`
    );
  }

  function handlePrint() {
    if (!hasPlanCalculations) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Materials Requirement</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 20px; }
          h1 { font-size: 22px; margin: 0 0 8px 0; }
          h2 { font-size: 14px; margin: 16px 0 8px 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 12px; }
          th { background-color: #f1f5f9; font-weight: 700; }
          .summary { margin: 12px 0; font-size: 12px; }
          .summary-row { display: flex; justify-content: space-between; margin: 4px 0; }
          .highlight { font-weight: 700; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <h1>Materials Requirement</h1>
        <div class="summary">
          <div class="summary-row"><span>Total Products:</span><span class="highlight">${productsInPlan.length}</span></div>
          <div class="summary-row"><span>Total Units:</span><span>${formatNumber(planMetrics.totalUnits)}</span></div>
        </div>

        <h2>Production Plan</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Units</th>
              <th>Batches</th>
              <th>Material Cost</th>
              <th>Overhead</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${planMetrics.perProductCosts
              .map(
                (item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${formatNumber(item.units)}</td>
                <td>${formatQuantity(item.batches, 2)}</td>
                <td>GHS ${item.materialCost.toFixed(2)}</td>
                <td>GHS ${item.overhead.toFixed(2)}</td>
                <td>GHS ${item.totalCost.toFixed(2)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <h2>Consolidated Materials</h2>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Total Qty</th>
              <th>Used In</th>
              <th>Unit Cost</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${planMetrics.consolidatedMaterials
              .map(
                (item) => `
              <tr>
                <td>${item.materialName}</td>
                <td>${formatQuantity(item.totalQtyNeeded, 2)} ${item.unit}</td>
                <td>${formatUsedIn(item.usedInProducts)}</td>
                <td>GHS ${item.unitPrice.toFixed(2)}</td>
                <td>GHS ${item.totalCost.toFixed(2)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <h2>Total Cost & Profit Analysis</h2>
        <div class="summary">
          <div class="summary-row"><span>Total Material Cost:</span><span>GHS ${formatNumber(planMetrics.totalMaterialCost)}</span></div>
          <div class="summary-row"><span>Total Overhead:</span><span>GHS ${formatNumber(planMetrics.totalOverhead)}</span></div>
          <div class="summary-row"><span>Total Production Cost:</span><span>GHS ${formatNumber(planMetrics.totalProductionCost)}</span></div>
          <div class="summary-row"><span>Total Revenue @ Optimal:</span><span>GHS ${formatNumber(planMetrics.totalRevenue)}</span></div>
          <div class="summary-row"><span>Total Profit:</span><span class="highlight">GHS ${formatNumber(planMetrics.totalProfit)}</span></div>
          <div class="summary-row"><span>Average Margin:</span><span>${planMetrics.averageMargin.toFixed(1)}%</span></div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div className="app-header-row">
          <div>
            <h1 className="app-page-title">Materials Requirement</h1>
            <p className="app-page-subtitle">Plan production quantities and consolidate material demand</p>
          </div>
          <div className="app-header-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleExportToExcel}
            disabled={!hasPlanCalculations}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: hasPlanCalculations ? 1 : 0.6,
            }}
          >
            <FileSpreadsheet size={14} strokeWidth={2} />
            Export Excel
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={handlePrint}
            disabled={!hasPlanCalculations}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: hasPlanCalculations ? 1 : 0.6,
            }}
          >
            <Printer size={14} strokeWidth={2} />
            Print
          </button>
        </div>
      </div>
      </div>

      <div className="app-page-content" style={{ paddingTop: '20px' }}>
      <div className="app-card app-mr-add-card">
        <div className="app-mr-card-title">ADD PRODUCTS TO PLAN</div>
        <div className="app-mr-add-row">
          <div className="app-mr-search-wrap">
            <input
              className="app-control"
              ref={inputRef}
              type="text"
              placeholder={loading ? 'Loading products...' : 'Search products...'}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPendingProduct(null);
                setDropdownOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              onKeyDown={handleSearchKeyDown}
            />
            <span className="app-mr-search-icon"><Search size={16} strokeWidth={2} /></span>

            {dropdownOpen && filteredProducts.length > 0 && (
              <div className="app-mr-dropdown">
                {filteredProducts.slice(0, 10).map((product, index) => (
                  <div
                    key={product.id}
                    onMouseDown={() => handleSelectProduct(product)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: highlightedIndex === index ? '#f0f9ff' : 'white',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>{product.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      {(product.category || 'Uncategorized')} | {product.productionMode === 'batch' ? `Batch (${product.batchYield || 1})` : 'Single'} | GHS {product.optimalPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => pendingProduct && handleAddProduct(pendingProduct)}
            disabled={!pendingProduct}
            style={{
              backgroundColor: pendingProduct ? '#1e40af' : '#cbd5f5',
              cursor: pendingProduct ? 'pointer' : 'not-allowed',
            }}
          >
            Add to Plan
          </button>
        </div>
      </div>

      {productsInPlan.length === 0 && (
        <div className="app-card app-empty-state" style={{ padding: '32px' }}>
          <div style={{ marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '20px' }}><Package size={20} strokeWidth={2} /> Materials Requirement</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            Add products to your plan to calculate consolidated material requirements.
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>[Search products above ↑]</div>
        </div>
      )}

      {productsInPlan.length > 0 && (
        <>
          <div className="app-card" style={{ padding: 0, marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: '700' }}>PRODUCTION PLAN ({productsInPlan.length} products)</div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              {productsInPlan.map((item, index) => {
                const batchYield = Math.max(1, item.product.batchYield || 1);
                const isLoadingBom = loadingProductIds.has(item.product.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '14px',
                      marginBottom: '12px',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                          {index + 1}. {item.product.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          {(item.product.category || 'Uncategorized')} | Mode: {item.product.productionMode === 'batch' ? `Batch (${batchYield} units)` : 'Single'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#1e293b', marginTop: '4px' }}>
                          Per Unit Cost: GHS {item.product.totalCost.toFixed(2)} | Optimal Price: GHS {item.product.optimalPrice.toFixed(2)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(item.id)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '16px',
                          cursor: 'pointer',
                        }}
                        aria-label="Remove product"
                      >
                        <X size={16} strokeWidth={2.2} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          value={item.unitsInput}
                          onChange={(e) => handleUnitsChange(item.id, e.target.value)}
                          step="1"
                          min="0"
                          style={{ width: '120px', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>units</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          value={item.batchesInput}
                          onChange={(e) => handleBatchesChange(item.id, e.target.value)}
                          step="0.001"
                          min="0"
                          style={{ width: '120px', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>batches</span>
                      </div>
                    </div>

                    {isLoadingBom && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>Loading BOM...</div>
                    )}

                    {!isLoadingBom && item.bom.length === 0 && (
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} strokeWidth={2} />
                        <span>No materials in BOM. <Link to="/products" style={{ color: '#1e40af', textDecoration: 'none' }}>Edit Product →</Link></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hasPlanCalculations && (
            <>
              <div className="app-card" style={{ padding: 0, marginBottom: '20px' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>CONSOLIDATED MATERIALS FOR ALL PRODUCTS</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Total: {planMetrics.consolidatedMaterials.length} unique materials across {planMetrics.productsWithUnits} products
                  </div>
                </div>
                <div style={{ padding: '16px' }}>
                  <div className="app-table-wrap">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Material Name</th>
                        <th style={{ textAlign: 'right' }}>Total Qty Needed</th>
                        <th style={{ textAlign: 'left' }}>Used In</th>
                        <th style={{ textAlign: 'right' }}>Unit Cost</th>
                        <th style={{ textAlign: 'right' }}>Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planMetrics.consolidatedMaterials.map((item) => (
                        <tr key={item.materialId}>
                          <td>{item.materialName}</td>
                          <td style={{ textAlign: 'right' }}>
                            {formatQuantity(item.totalQtyNeeded, 2)} {item.unit}
                          </td>
                          <td style={{ color: '#475569' }}>
                            {formatUsedIn(item.usedInProducts)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            GHS {item.unitPrice.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>
                            GHS {item.totalCost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={handleCopyShoppingList}
                      style={{ color: '#1e293b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ClipboardList size={14} strokeWidth={2} />
                      Copy Shopping List
                    </button>
                  </div>
                </div>
              </div>

              <div className="app-card" style={{ padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px' }}>COST BY PRODUCT</div>
                <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Product</th>
                      <th style={{ textAlign: 'right' }}>Material Cost</th>
                      <th style={{ textAlign: 'right' }}>Overhead</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planMetrics.perProductCosts.map((item) => (
                      <tr key={item.productName}>
                        <td>{item.productName}</td>
                        <td style={{ textAlign: 'right' }}>GHS {formatNumber(item.materialCost)}</td>
                        <td style={{ textAlign: 'right' }}>GHS {formatNumber(item.overhead)}</td>
                        <td style={{ textAlign: 'right' }}>GHS {formatNumber(item.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="app-card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px' }}>TOTAL COST & PROFIT ANALYSIS</div>
                <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Total Material Cost:</span>
                    <span style={{ fontWeight: '600' }}>GHS {formatNumber(planMetrics.totalMaterialCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Total Overhead:</span>
                    <span style={{ fontWeight: '600' }}>GHS {formatNumber(planMetrics.totalOverhead)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e2e8f0', marginTop: '8px' }}>
                    <span style={{ color: '#1e293b', fontWeight: '700' }}>Total Production Cost:</span>
                    <span style={{ fontWeight: '700' }}>GHS {formatNumber(planMetrics.totalProductionCost)}</span>
                  </div>
                  <div style={{ height: '8px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Total Revenue @ Optimal:</span>
                    <span style={{ fontWeight: '600' }}>GHS {formatNumber(planMetrics.totalRevenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '2px solid #16a34a', marginTop: '8px' }}>
                    <span style={{ color: '#166534', fontWeight: '700' }}>TOTAL PROFIT:</span>
                    <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '15px' }}>
                      GHS {formatNumber(planMetrics.totalProfit)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>Average Margin:</span>
                    <span style={{ fontWeight: '600', fontSize: '12px' }}>{planMetrics.averageMargin.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {showToast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#16a34a',
          color: 'white',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: '600',
          boxShadow: '0 6px 12px rgba(0, 0, 0, 0.1)',
          zIndex: 50,
        }}>
          {toastMessage}
        </div>
      )}
      </div>
    </div>
  );
}
