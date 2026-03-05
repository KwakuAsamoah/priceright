import { useMemo, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, ClipboardList, FileSpreadsheet, Printer } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  overheadPercentage: number;
  profitMargin: number;
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

interface BatchCalculatorProps {
  product: Product;
  bom: BOMMaterial[];
  onClose?: () => void;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatNumber(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  }
  return value.toFixed(2);
}

function formatQuantity(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

export default function BatchCalculator({ product, bom, onClose }: BatchCalculatorProps) {
  const batchYield = Math.max(1, product.batchYield || 1);
  
  const [units, setUnits] = useState<string>(String(batchYield));
  const [batches, setBatches] = useState<string>('1');

  // Handle units input change
  const handleUnitsChange = useCallback((value: string) => {
    setUnits(value);
    if (value && !isNaN(parseFloat(value))) {
      const numUnits = parseFloat(value);
      const batchesCalc = numUnits / batchYield;
      setBatches(formatQuantity(batchesCalc, 4));
    }
  }, [batchYield]);

  // Handle batches input change
  const handleBatchesChange = useCallback((value: string) => {
    setBatches(value);
    if (value && !isNaN(parseFloat(value))) {
      const numBatches = parseFloat(value);
      const unitsCalc = numBatches * batchYield;
      setUnits(unitsCalc.toString());
    }
  }, [batchYield]);

  // Calculate materials needed
  const { materialsNeeded, totalMaterialCost } = useMemo(() => {
    const numUnits = parseFloat(units) || 0;
    if (numUnits <= 0 || bom.length === 0) {
      return { materialsNeeded: [], totalMaterialCost: 0 };
    }

    const numBatches = numUnits / batchYield;
    const materials = bom.map((item) => {
      const qtyNeeded = numBatches * item.quantity;
      const unitCost = toNumber(item.unitPrice);
      const itemCost = qtyNeeded * unitCost;
      return {
        ...item,
        qtyNeeded,
        unitCost,
        itemCost,
      };
    });

    const totalCost = materials.reduce((sum, m) => sum + m.itemCost, 0);
    return { materialsNeeded: materials, totalMaterialCost: totalCost };
  }, [units, bom, batchYield]);

  // Calculate costs and profit
  const { overhead, totalProductionCost, revenue, profit, profitPerUnit, optimalPricePerUnit, perUnitCost } = useMemo(() => {
    const numUnits = parseFloat(units) || 0;
    if (numUnits <= 0) {
      return {
        overhead: 0,
        totalProductionCost: 0,
        revenue: 0,
        profit: 0,
        profitPerUnit: 0,
        optimalPricePerUnit: 0,
        perUnitCost: 0,
      };
    }

    const overheadAmount = totalMaterialCost * (product.overheadPercentage / 100);
    const totalCost = totalMaterialCost + overheadAmount;
    const perUnitCost = numUnits > 0 ? totalCost / numUnits : 0;
    const perUnitPrice = product.currentSellingPrice
      ? toNumber(product.currentSellingPrice)
      : perUnitCost * (1 + product.profitMargin / 100);

    const totalRev = numUnits * perUnitPrice;
    const totalProfit = totalRev - totalCost;
    const profitPerUnitCalc = numUnits > 0 ? totalProfit / numUnits : 0;

    return {
      overhead: overheadAmount,
      totalProductionCost: totalCost,
      revenue: totalRev,
      profit: totalProfit,
      profitPerUnit: profitPerUnitCalc,
      optimalPricePerUnit: perUnitPrice,
      perUnitCost,
    };
  }, [units, totalMaterialCost, product, batchYield]);

  const numUnits = parseFloat(units) || 0;
  const numBatches = numUnits / batchYield;
  const hasWarning = Math.abs(numBatches % 1) > 0.01;

  const handleCopyShoppingList = useCallback(() => {
    const lines = [
      `SHOPPING LIST - ${product.name}`,
      `Production: ${formatNumber(numUnits)} units (${formatQuantity(numBatches, 2)} batches)`,
      '─'.repeat(50),
      ...materialsNeeded.map(m => `${m.materialName}: ${formatQuantity(m.qtyNeeded, 2)} ${m.unit}`),
      '─'.repeat(50),
      `Total Material Cost: GHS ${formatNumber(totalMaterialCost)}`,
    ];

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('Shopping list copied to clipboard!');
    });
  }, [product.name, numUnits, numBatches, materialsNeeded, totalMaterialCost]);

  const handleExportToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Materials Needed
    const materialsData = materialsNeeded.map(m => ({
      'Material Name': m.materialName,
      'Quantity Needed': parseFloat(formatQuantity(m.qtyNeeded, 4)),
      'Per Batch': parseFloat(formatQuantity(m.quantity, 4)),
      'Unit': m.unit,
      'Unit Price (GHS)': m.unitCost.toFixed(2),
      'Total Cost (GHS)': m.itemCost.toFixed(2),
    }));

    const materialsSheet = XLSX.utils.json_to_sheet(materialsData);
    materialsSheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(wb, materialsSheet, 'Materials');

    // Sheet 2: Cost Breakdown
    const costBreakdownData = [
      { Item: 'Total Material Cost', Amount: totalMaterialCost.toFixed(2) },
      { Item: `Overhead (${product.overheadPercentage}%)`, Amount: overhead.toFixed(2) },
      { Item: 'Total Production Cost', Amount: totalProductionCost.toFixed(2) },
      { Item: '', Amount: '' },
      { Item: `Revenue @ ${optimalPricePerUnit.toFixed(2)}/unit`, Amount: revenue.toFixed(2) },
      { Item: 'Total Profit', Amount: profit.toFixed(2) },
      { Item: 'Per Unit Cost', Amount: perUnitCost.toFixed(2) },
      { Item: 'Profit Per Unit', Amount: profitPerUnit.toFixed(2) },
    ];

    const costSheet = XLSX.utils.json_to_sheet(costBreakdownData);
    costSheet['!cols'] = [{ wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, costSheet, 'Cost Breakdown');

    // Set file name and download
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `BatchCalc_${product.name.replace(/[^a-z0-9]/gi, '_')}_${numUnits}units_${date}.xlsx`);
  }, [materialsNeeded, product, totalMaterialCost, overhead, totalProductionCost, revenue, profit, profitPerUnit, optimalPricePerUnit, perUnitCost, numUnits]);

  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch Calculator - ${product.name}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #333; margin: 20px; }
          h1 { font-size: 24px; margin: 10px 0; }
          h2 { font-size: 16px; margin: 20px 0 10px 0; border-bottom: 2px solid #000; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .summary { margin: 15px 0; line-height: 1.8; }
          .final { font-weight: bold; font-size: 18px; color: #16a34a; margin-top: 20px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <h1>Batch Calculator Report</h1>
        <p><strong>Product:</strong> ${product.name}</p>
        <p><strong>Production:</strong> ${formatNumber(numUnits)} units (${formatQuantity(numBatches, 2)} batches)</p>
        
        <h2>Materials Needed</h2>
        <table>
          <thead>
            <tr>
              <th>Material Name</th>
              <th>Quantity Needed</th>
              <th>Per Batch</th>
              <th>Unit Price</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${materialsNeeded.map(m => `
              <tr>
                <td>${m.materialName}</td>
                <td>${formatQuantity(m.qtyNeeded, 2)} ${m.unit}</td>
                <td>${formatQuantity(m.quantity, 2)} ${m.unit}</td>
                <td>GHS ${m.unitCost.toFixed(2)}</td>
                <td>GHS ${m.itemCost.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <h2>Cost Breakdown</h2>
        <div class="summary">
          <p>Total Material Cost: <strong>GHS ${formatNumber(totalMaterialCost)}</strong></p>
          <p>Overhead (${product.overheadPercentage}%): <strong>GHS ${formatNumber(overhead)}</strong></p>
          <p>Total Production Cost: <strong>GHS ${formatNumber(totalProductionCost)}</strong></p>
          <p>&nbsp;</p>
          <p>Revenue @ GHS ${optimalPricePerUnit.toFixed(2)}/unit: <strong>GHS ${formatNumber(revenue)}</strong></p>
          <p class="final">TOTAL PROFIT: GHS ${formatNumber(profit)}</p>
          <p>Profit Per Unit: <strong>GHS ${profitPerUnit.toFixed(2)}</strong></p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }, [product, numUnits, numBatches, materialsNeeded, totalMaterialCost, overhead, totalProductionCost, revenue, profit, profitPerUnit, optimalPricePerUnit]);

  const isValidInput = numUnits > 0;
  
  if (bom.length === 0) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        backgroundColor: '#fef3c7',
        borderRadius: '8px',
        border: '1px solid #fcd34d',
      }}>
        <div style={{ fontSize: '20px', marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={20} strokeWidth={2} /> No BOM Materials</div>
        <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '12px' }}>
          Add materials to this product's BOM to use the batch calculator.
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          Edit Product
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {/* Input Section */}
      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ marginBottom: '12px', color: '#3f4045', fontSize: '13px' }}>
          Production Planning for: <strong>{product.name}</strong>
          {product.batchYield && <span> • {product.batchYield} units per batch</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
          {/* Units Input */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              How many units do you want to produce?
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                value={units}
                onChange={(e) => handleUnitsChange(e.target.value)}
                step="1"
                min="0"
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>units</span>
            </div>
          </div>

          {/* Batches Input */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              How many batches do you want to run?
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={batches}
                onChange={(e) => handleBatchesChange(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>batches</span>
            </div>
          </div>
        </div>

        {hasWarning && numUnits > 0 && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#92400e',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <AlertTriangle size={13} strokeWidth={2} />
            {formatQuantity(numBatches, 2)} batches - you'll have partial batch materials
          </div>
        )}
      </div>

      {isValidInput ? (
        <>
          {/* Materials Needed */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: '#1e293b' }}>
              MATERIALS NEEDED FOR {formatNumber(numUnits)} UNITS ({formatQuantity(numBatches, 2)} batches)
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>
              Per Batch shows raw BOM quantity for one full batch.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e2e8f0' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Material Name</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Qty Needed</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Per Batch</th>
                </tr>
              </thead>
              <tbody>
                {materialsNeeded.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontSize: '12px' }}>{item.materialName}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>
                      {formatQuantity(item.qtyNeeded, 2)} {item.unit}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                      {formatQuantity(item.quantity, 3)} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={handleCopyShoppingList}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                color: '#1e293b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ClipboardList size={13} strokeWidth={2} />
              Copy Shopping List
            </button>
          </div>

          {/* Cost Breakdown */}
          <div style={{ padding: '16px', backgroundColor: '#f8fafc' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', color: '#1e293b' }}>
              COST BREAKDOWN FOR {formatNumber(numUnits)} UNITS
            </div>
            <div style={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Total Material Cost:</span>
                  <span style={{ fontWeight: '600' }}>GHS {formatNumber(totalMaterialCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Overhead ({product.overheadPercentage}%):</span>
                  <span style={{ fontWeight: '600' }}>GHS {formatNumber(overhead)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1px solid #e2e8f0',
                  marginTop: '8px',
                }}>
                  <span style={{ color: '#1e293b', fontWeight: '700' }}>Total Production Cost:</span>
                  <span style={{ fontWeight: '700' }}>GHS {formatNumber(totalProductionCost)}</span>
                </div>
                <div style={{ height: '8px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Revenue @ GHS {optimalPricePerUnit.toFixed(2)}/unit:</span>
                  <span style={{ fontWeight: '600' }}>GHS {formatNumber(revenue)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '2px solid #16a34a',
                  marginTop: '8px',
                }}>
                  <span style={{ color: '#166534', fontWeight: '700' }}>TOTAL PROFIT:</span>
                  <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '15px' }}>
                    GHS {formatNumber(profit)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Per Unit Cost:</span>
                  <span style={{ fontWeight: '600', fontSize: '12px' }}>GHS {perUnitCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Per Unit Profit:</span>
                  <span style={{ fontWeight: '600', fontSize: '12px' }}>GHS {profitPerUnit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleExportToExcel}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#1e40af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FileSpreadsheet size={13} strokeWidth={2} />
                Export to Excel
              </button>
              <button
                onClick={handlePrint}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#64748b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Printer size={13} strokeWidth={2} />
                Print Calculation
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: '#64748b',
          backgroundColor: '#f1f5f9',
        }}>
          {units !== '0' && units ? 'Enter a positive number to see calculations' : 'Enter units or batches to calculate'}
        </div>
      )}
    </div>
  );
}
