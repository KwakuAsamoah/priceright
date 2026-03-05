import { useState, useEffect } from 'react';
import { BarChart3, ClipboardList, FileSpreadsheet, Loader2, Package, RefreshCw, ShoppingBasket, Sigma } from 'lucide-react';
import { productsApi, priceLevelRulesApi } from '../api';
import * as XLSX from 'xlsx';

interface Product {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  overheadPercentage: number;
  profitMargin: number;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  currentSellingPrice?: number;
}

interface ProductCatalogItem extends Product {
  materialCount: number;
  totalMaterialCost: string;
  overheadCost: string;
  totalCost: string;
  profitAmount: string;
  recommendedPrice: string;
}

interface BulkCalculation {
  quantity: number;
  materialsNeeded: Array<{
    name: string;
    quantity: number;
    unit: string;
  }>;
  totalMaterialCost: number;
  totalOverhead: number;
  totalCost: number;
  totalProfit: number;
  totalRevenue: number;
}

export default function Catalog() {
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Bulk Calculator State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductCatalogItem | null>(null);
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkCalculation, setBulkCalculation] = useState<BulkCalculation | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    try {
      setLoading(true);
      const productsData = await productsApi.getAll();
      
      // Load cost calculations for each product
      const catalogItems = await Promise.all(
        productsData.map(async (product: Product) => {
          try {
            const bom = await productsApi.getBOM(product.id);
            const cost = await productsApi.calculateCost(product.id);
            
            // For batch products, convert to per-unit prices
            const batchYield = product.batchYield || 1;
            const isPerUnit = product.productionMode !== 'batch' || batchYield === 1;
            
            return {
              ...product,
              materialCount: bom.length,
              totalMaterialCost: isPerUnit ? cost.totalMaterialCost : (parseFloat(cost.totalMaterialCost) / batchYield).toFixed(2),
              overheadCost: isPerUnit ? cost.overheadCost : (parseFloat(cost.overheadCost) / batchYield).toFixed(2),
              totalCost: isPerUnit ? cost.totalCost : (parseFloat(cost.totalCost) / batchYield).toFixed(2),
              profitAmount: isPerUnit ? cost.profitAmount : (parseFloat(cost.profitAmount) / batchYield).toFixed(2),
              recommendedPrice: isPerUnit ? cost.recommendedPrice : (parseFloat(cost.recommendedPrice) / batchYield).toFixed(2),
            };
          } catch {
            return {
              ...product,
              materialCount: 0,
              totalMaterialCost: '0.00',
              overheadCost: '0.00',
              totalCost: '0.00',
              profitAmount: '0.00',
              recommendedPrice: '0.00',
            };
          }
        })
      );
      
      setProducts(catalogItems);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading catalog:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadCatalog();
    setRefreshing(false);
  }

  async function handleOpenBulkCalculator(product: ProductCatalogItem) {
    setSelectedProduct(product);
    setBulkQuantity('');
    setBulkCalculation(null);
    setShowBulkModal(true);
  }

  async function calculateBulkProduction() {
    if (!selectedProduct || !bulkQuantity) return;

    try {
      const quantity = parseInt(bulkQuantity);
      if (quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
      }

      // Get BOM
      const bom = await productsApi.getBOM(selectedProduct.id);

      // Calculate materials needed
      const materialsNeeded = bom.map((item: any) => ({
        name: item.materialName,
        quantity: parseFloat(item.quantity) * quantity,
        unit: item.unit,
      }));

      // Calculate costs
      const unitCost = parseFloat(selectedProduct.totalCost);
      const unitPrice = parseFloat(selectedProduct.recommendedPrice);
      const unitProfit = parseFloat(selectedProduct.profitAmount);
      const unitMaterialCost = parseFloat(selectedProduct.totalMaterialCost);
      const unitOverhead = parseFloat(selectedProduct.overheadCost);

      const totalMaterialCost = unitMaterialCost * quantity;
      const totalOverhead = unitOverhead * quantity;
      const totalCost = unitCost * quantity;
      const totalProfit = unitProfit * quantity;
      const totalRevenue = unitPrice * quantity;

      setBulkCalculation({
        quantity,
        materialsNeeded,
        totalMaterialCost,
        totalOverhead,
        totalCost,
        totalProfit,
        totalRevenue,
      });
    } catch (error) {
      console.error('Error calculating bulk production:', error);
      alert('Failed to calculate bulk production');
    }
  }

  function calculatePricingAnalysis(product: ProductCatalogItem) {
    const optimalPrice = parseFloat(product.recommendedPrice);
    const currentPrice = product.currentSellingPrice || 0;
    
    if (currentPrice === 0) {
      return {
        variance: 0,
        variancePercent: 0,
        status: 'not-set' as const,
        statusColor: '#64748b',
        statusBg: '#f1f5f9',
      };
    }

    const variance = currentPrice - optimalPrice;
    const variancePercent = (variance / optimalPrice) * 100;

    let status: 'underpriced' | 'optimal' | 'overpriced' = 'optimal';
    let statusColor = '#10b981';
    let statusBg = '#d1fae5';

    if (variancePercent < -5) {
      status = 'underpriced';
      statusColor = '#ef4444';
      statusBg = '#fee2e2';
    } else if (variancePercent > 5) {
      status = 'overpriced';
      statusColor = '#f59e0b';
      statusBg = '#fef3c7';
    }

    return { variance, variancePercent, status, statusColor, statusBg };
  }

  function calculateTotalProfitGap() {
    return products.reduce((total, product) => {
      if (!product.currentSellingPrice || product.currentSellingPrice === 0) return total;
      const optimal = parseFloat(product.recommendedPrice);
      const current = product.currentSellingPrice;
      const gap = current - optimal;
      return total + gap;
    }, 0);
  }

  function handleExportToExcel() {
    // Prepare data for export
    const exportData = products.map(product => {
      const analysis = calculatePricingAnalysis(product);
      
      const currentPrice = product.currentSellingPrice || 0;
      
      return {
        'Product Name': product.name,
        'SKU': product.sku || '-',
        'Category': product.category || '-',
        'Production Mode': product.productionMode === 'batch' ? `Batch (${product.batchYield} units)` : 'Single Unit',
        'Material Cost': `₵${product.totalMaterialCost}`,
        'Overhead Cost': `₵${product.overheadCost}`,
        'Total Cost': `₵${product.totalCost}`,
        'Optimal Price': `₵${product.recommendedPrice}`,
        'Current Selling Price': currentPrice > 0 ? `₵${currentPrice.toFixed(2)}` : 'Not Set',
        'Variance (₵)': currentPrice > 0 ? `₵${analysis.variance.toFixed(2)}` : '-',
        'Variance (%)': currentPrice > 0 ? `${analysis.variancePercent.toFixed(1)}%` : '-',
        'Status': analysis.status === 'underpriced' ? 'Underpriced' : 
                  analysis.status === 'overpriced' ? 'Overpriced' : 
                  analysis.status === 'optimal' ? 'Optimal' : 'Not Set',
      };
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const colWidths = [
      { wch: 30 }, // Product Name
      { wch: 15 }, // SKU
      { wch: 15 }, // Category
      { wch: 20 }, // Production Mode
      { wch: 15 }, // Material Cost
      { wch: 15 }, // Overhead Cost
      { wch: 15 }, // Total Cost
      { wch: 15 }, // Optimal Price
      { wch: 20 }, // Current Selling Price
      { wch: 15 }, // Variance (₵)
      { wch: 15 }, // Variance (%)
      { wch: 15 }, // Status
    ];
    ws['!cols'] = colWidths;

    // Create workbook and add worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Catalog');

    // Generate filename with current date
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const filename = `Product_Catalog_${dateStr}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  }

  async function handleGeneratePriceList() {
    try {
      // Load pricing rules
      const rules = await priceLevelRulesApi.getAll();
      
      if (rules.length === 0) {
        alert('No price level rules defined. Please add price level rules in Settings first.');
        return;
      }

      // Prepare data for price list
      const priceListData = products.map(product => {
        const basePrice = parseFloat(product.recommendedPrice);
        
        const row: any = {
          'Product Name': product.name,
          'SKU': product.sku || '-',
          'Category': product.category || '-',
          'Production Mode': product.productionMode === 'batch' ? `Batch (${product.batchYield} units)` : 'Single Unit',
          'Unit Cost': `₵${product.totalCost}`,
        };

        // Add price for each customer type
        rules.forEach((rule: any) => {
          const customerPrice = basePrice * rule.multiplier;
          row[`${rule.name} Price`] = `₵${customerPrice.toFixed(2)}`;
        });

        return row;
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(priceListData);
      
      // Set column widths
      const colWidths = [
        { wch: 30 }, // Product Name
        { wch: 15 }, // SKU
        { wch: 15 }, // Category
        { wch: 20 }, // Production Mode
        { wch: 15 }, // Unit Cost
      ];
      
      // Add width for each customer type column
      rules.forEach(() => {
        colWidths.push({ wch: 15 });
      });
      
      ws['!cols'] = colWidths;

      // Create workbook and add worksheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Price List');

      // Generate filename with current date
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const filename = `Customer_Price_List_${dateStr}.xlsx`;

      // Download file
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Error generating price list:', error);
      alert('Failed to generate price list');
    }
  }

  function getProductsWithPricingIssues() {
    return {
      underpriced: products.filter(p => {
        const analysis = calculatePricingAnalysis(p);
        return analysis.status === 'underpriced';
      }).length,
      overpriced: products.filter(p => {
        const analysis = calculatePricingAnalysis(p);
        return analysis.status === 'overpriced';
      }).length,
      notSet: products.filter(p => !p.currentSellingPrice || p.currentSellingPrice === 0).length,
    };
  }

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      searchTerm === '' ||
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'All Categories' || product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  function formatLastUpdated() {
    if (!lastUpdated) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return lastUpdated.toLocaleString();
  }

  const issues = getProductsWithPricingIssues();
  const totalGap = calculateTotalProfitGap();

  if (loading) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
        <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '2px' }}>Product Catalog</h1>
              <p style={{ color: '#64748b', fontSize: '13px' }}>
                Complete pricing catalog with optimal vs current price analysis
              </p>
            </div>
          </div>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Loader2 size={42} strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite' }} /></div>
          <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Loading catalog...</div>
          <div style={{ fontSize: '14px', color: '#64748b' }}>Calculating costs for all products</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '2px' }}>Product Catalog</h1>
            <p style={{ color: '#64748b', fontSize: '13px' }}>
              Complete pricing catalog with optimal vs current price analysis
              {lastUpdated && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8' }}>
                  • Updated {formatLastUpdated()}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}
            >
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                backgroundColor: refreshing ? '#f1f5f9' : '#10b981',
                color: refreshing ? '#94a3b8' : 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: 'none',
                cursor: refreshing ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              {refreshing ? <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} strokeWidth={2} />}
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={handleExportToExcel}
              style={{
                backgroundColor: '#ffffff',
                color: '#1a202c',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <FileSpreadsheet size={16} strokeWidth={2} />
              Export
            </button>

            <button
              onClick={handleGeneratePriceList}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <ClipboardList size={16} strokeWidth={2} />
              Price List
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Analysis Summary */}
      {products.length > 0 && (
        <div style={{ padding: '16px 40px 0 40px' }}>
          <div
            style={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}><BarChart3 size={16} strokeWidth={2} /> Pricing Analysis Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: '#fee2e2', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: '600', marginBottom: '2px' }}>UNDERPRICED</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#dc2626' }}>{issues.underpriced}</div>
                <div style={{ fontSize: '10px', color: '#991b1b' }}>below optimal</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', marginBottom: '2px' }}>OVERPRICED</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>{issues.overpriced}</div>
                <div style={{ fontSize: '10px', color: '#92400e' }}>above optimal</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: '600', marginBottom: '2px' }}>NOT SET</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#64748b' }}>{issues.notSet}</div>
                <div style={{ fontSize: '10px', color: '#475569' }}>no price set</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: totalGap < 0 ? '#fee2e2' : '#d1fae5', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: totalGap < 0 ? '#991b1b' : '#065f46', fontWeight: '600', marginBottom: '2px' }}>
                  PROFIT GAP
                </div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: totalGap < 0 ? '#dc2626' : '#10b981' }}>
                  {totalGap < 0 ? '-' : '+'}<span className="money-value">₵{Math.abs(totalGap).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '10px', color: totalGap < 0 ? '#991b1b' : '#065f46' }}>
                  {totalGap < 0 ? 'at risk' : 'premium'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div style={{ padding: '16px 40px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="Search products by name, SKU, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                }}
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                minWidth: '140px',
              }}
            >
              <option>All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Products Catalog */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
            Products ({filteredProducts.length})
          </h2>

          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Package size={42} strokeWidth={1.8} /></div>
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No products in catalog</div>
              <div style={{ fontSize: '14px' }}>Build product formulas in Product Builder first</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Product</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', fontSize: '13px' }}>Total Cost</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', fontSize: '13px' }}>Optimal Price</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', fontSize: '13px' }}>Current Price</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>Variance</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const analysis = calculatePricingAnalysis(product);
                    return (
                      <tr key={product.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '13px' }}>{product.name}</div>
                            {product.sku && (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {product.sku}</div>
                            )}
                            {product.category && (
                              <div style={{ fontSize: '11px', marginTop: '2px' }}>
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    fontSize: '10px',
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                  }}
                                >
                                  {product.category}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>
                          <span className="money-value">₵{product.totalCost}</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div className="money-value" style={{ fontSize: '15px', fontWeight: '700', color: '#10b981' }}>
                            ₵{product.recommendedPrice}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {product.currentSellingPrice && product.currentSellingPrice > 0 ? (
                            <div className="money-value" style={{ fontSize: '15px', fontWeight: '700' }}>
                              ₵{product.currentSellingPrice.toFixed(2)}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Not set</div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {analysis.status !== 'not-set' && (
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: analysis.statusColor }}>
                                {analysis.variance >= 0 ? '+' : ''}₵{analysis.variance.toFixed(2)}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                ({analysis.variancePercent >= 0 ? '+' : ''}{analysis.variancePercent.toFixed(1)}%)
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleOpenBulkCalculator(product)}
                            disabled={product.materialCount === 0}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              backgroundColor: product.materialCount === 0 ? '#f1f5f9' : '#eff6ff',
                              color: product.materialCount === 0 ? '#94a3b8' : '#3b82f6',
                              borderRadius: '5px',
                              border: 'none',
                              cursor: product.materialCount === 0 ? 'not-allowed' : 'pointer',
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <BarChart3 size={13} strokeWidth={2} />
                            Calc
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Calculator Modal */}
      {showBulkModal && selectedProduct && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setShowBulkModal(false);
            setSelectedProduct(null);
            setBulkQuantity('');
            setBulkCalculation(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><BarChart3 size={22} strokeWidth={2} /> Bulk Production Calculator</span>
            </h2>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>
              {selectedProduct.name}
            </p>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Unit Cost: <span className="money-value">₵{selectedProduct.totalCost}</span> • Unit Price: <span className="money-value">₵{selectedProduct.recommendedPrice}</span>
            </p>

            {/* Input Section */}
            <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                How many units do you want to produce?
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="number"
                  min="1"
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(e.target.value)}
                  placeholder="e.g., 5000"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '16px',
                  }}
                />
                <button
                  onClick={calculateBulkProduction}
                  disabled={!bulkQuantity}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '8px',
                    backgroundColor: bulkQuantity ? '#3b82f6' : '#e2e8f0',
                    color: bulkQuantity ? 'white' : '#94a3b8',
                    fontWeight: '600',
                    border: 'none',
                    cursor: bulkQuantity ? 'pointer' : 'not-allowed',
                  }}
                >
                  Calculate
                </button>
              </div>
            </div>

            {/* Results */}
            {bulkCalculation && (
              <>
                {/* Materials Needed */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1e40af' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><ShoppingBasket size={16} strokeWidth={2} /> Materials Needed for {bulkCalculation.quantity.toLocaleString()} units:</span>
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                    {bulkCalculation.materialsNeeded.map((material, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: index < bulkCalculation.materialsNeeded.length - 1 ? '1px solid #e2e8f0' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#475569' }}>{material.name}</span>
                        <span style={{ fontSize: '14px', fontWeight: '600' }}>
                          {material.quantity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {material.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Summary */}
                <div
                  style={{
                    backgroundColor: '#f0fdf4',
                    border: '2px solid #10b981',
                    borderRadius: '8px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#166534' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><Sigma size={18} strokeWidth={2} /> Production Summary</span>
                  </h3>
                  <div style={{ display: 'grid', gap: '12px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Total Material Cost:</span>
                      <span style={{ fontWeight: '600' }}>
                        ₵{bulkCalculation.totalMaterialCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Total Overhead:</span>
                      <span style={{ fontWeight: '600' }}>
                        ₵{bulkCalculation.totalOverhead.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div
                      style={{
                        borderTop: '1px solid #d1fae5',
                        paddingTop: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: '700',
                      }}
                    >
                      <span style={{ color: '#166534' }}>Total Production Cost:</span>
                      <span style={{ fontSize: '18px', color: '#166534' }}>
                        ₵{bulkCalculation.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                      <span style={{ color: '#64748b' }}>Total Revenue (if sold):</span>
                      <span style={{ fontWeight: '600', color: '#10b981' }}>
                        ₵{bulkCalculation.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        padding: '16px',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '8px',
                      }}
                    >
                      <span style={{ fontSize: '16px', fontWeight: '600' }}>Total Profit:</span>
                      <span style={{ fontSize: '24px', fontWeight: '700' }}>
                        ₵{bulkCalculation.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Close Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setSelectedProduct(null);
                  setBulkQuantity('');
                  setBulkCalculation(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}