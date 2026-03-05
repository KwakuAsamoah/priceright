import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { customersApi, productsApi } from '../api';

interface Customer {
  id: number;
  name: string;
  priceLevelId: number;
  priceLevelName?: string;
  allowSpecialPricing: boolean;
}

interface Product {
  id: number;
  name: string;
  sku?: string;
  approvalStatus?: string;
  approvedPrice?: number | null;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
}

interface CostCalculation {
  totalCost: string;
}

interface CustomPrice {
  id: number;
  customerId: number;
  productId: number;
  productName: string;
  customPrice: number;
  overrideType?: 'custom' | 'discount' | 'markup';
  discountPercentage?: number | null;
  markupPercentage?: number | null;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string | null;
  approvedAt?: number | null;
  justification?: string | null;
  productionCost?: number | null;
  marginImpactPercentage?: number | null;
  oldMarginPercentage?: number | null;
}

interface RowInput {
  overrideType: 'custom' | 'discount' | 'markup';
  value: string;
  justification: string;
}

interface ApiErrorPayload {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function statusBadge(status?: string) {
  if (status === 'approved') {
    return { label: 'Approved', className: 'status-badge status-approved' };
  }
  if (status === 'rejected') {
    return { label: 'Rejected', className: 'status-badge status-rejected' };
  }
  if (status === 'pending') {
    return { label: 'Pending', className: 'status-badge status-pending' };
  }
  return { label: '—', className: 'status-badge status-info' };
}

function marginColor(margin: number) {
  if (margin > 15) return { color: '#166534', bg: '#dcfce7' };
  if (margin >= 10) return { color: '#92400e', bg: '#fef3c7' };
  return { color: '#991b1b', bg: '#fee2e2' };
}

function formatCurrency(value: number) {
  return `GHS ${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function readNumber(details: Record<string, unknown> | undefined, key: string, fallback = 0) {
  const value = Number(details?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function parseApiError(error: unknown): ApiErrorPayload {
  const apiError = error as Error & { code?: string; details?: Record<string, unknown> };
  return {
    message: apiError?.message || 'Failed to save special pricing row',
    code: apiError?.code,
    details: apiError?.details,
  };
}

export default function SpecialPricing() {
  const { customerId } = useParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customPrices, setCustomPrices] = useState<CustomPrice[]>([]);
  const [costByProductId, setCostByProductId] = useState<Record<number, number>>({});
  const [rowInputs, setRowInputs] = useState<Record<number, RowInput>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, ApiErrorPayload>>({});
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());
  const [actionLoadingRows, setActionLoadingRows] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(() => {
    if (!customerId) return null;
    const parsed = Number(customerId);
    return Number.isInteger(parsed) ? parsed : null;
  });

  const selectedCustomer = useMemo(
    () => customers.find((entry) => entry.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const approvedProducts = useMemo(
    () => products.filter((product) => product.approvalStatus === 'approved' && product.approvedPrice != null),
    [products],
  );

  const customPriceByProductId = useMemo(() => {
    const map: Record<number, CustomPrice> = {};
    customPrices.forEach((entry) => {
      map[entry.productId] = entry;
    });
    return map;
  }, [customPrices]);

  const pendingItems = useMemo(
    () => customPrices.filter((entry) => entry.status === 'pending'),
    [customPrices],
  );

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomPrices([]);
      return;
    }
    loadCustomPrices(selectedCustomerId);
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      const firstAllowed = customers.find((entry) => entry.allowSpecialPricing) || customers[0];
      setSelectedCustomerId(firstAllowed.id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    const nextInputs: Record<number, RowInput> = {};
    approvedProducts.forEach((product) => {
      const existing = customPriceByProductId[product.id];
      if (existing) {
        const fallback = existing.customPrice != null ? String(Number(existing.customPrice).toFixed(2)) : '';
        const value = existing.overrideType === 'discount'
          ? String(Number(existing.discountPercentage || 0))
          : existing.overrideType === 'markup'
            ? String(Number(existing.markupPercentage || 0))
            : fallback;

        nextInputs[product.id] = {
          overrideType: (existing.overrideType || 'custom') as 'custom' | 'discount' | 'markup',
          value,
          justification: existing.justification || '',
        };
      } else {
        nextInputs[product.id] = {
          overrideType: 'custom',
          value: '',
          justification: '',
        };
      }
    });
    setRowInputs(nextInputs);
  }, [approvedProducts, customPriceByProductId]);

  async function loadBaseData() {
    try {
      setIsLoading(true);
      const [customersData, productsData] = await Promise.all([
        customersApi.getAll(),
        productsApi.getAll(),
      ]);

      setCustomers(customersData);
      setProducts(productsData);

      const approved = (productsData as Product[]).filter(
        (product) => product.approvalStatus === 'approved' && product.approvedPrice != null,
      );

      const costEntries = await Promise.all(
        approved.map(async (product) => {
          try {
            const cost = (await productsApi.calculateCost(product.id)) as CostCalculation;
            const totalCost = toNumber(cost.totalCost);
            const divisor = product.productionMode === 'batch' ? Math.max(1, product.batchYield || 1) : 1;
            return { productId: product.id, costPerUnit: totalCost / divisor };
          } catch {
            return { productId: product.id, costPerUnit: 0 };
          }
        }),
      );

      const costMap: Record<number, number> = {};
      costEntries.forEach((entry) => {
        costMap[entry.productId] = entry.costPerUnit;
      });
      setCostByProductId(costMap);
    } catch (error) {
      console.error('Failed to load special pricing data:', error);
      alert('Failed to load special pricing data');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCustomPrices(id: number) {
    try {
      const data = await customersApi.getCustomPrices(id);
      setCustomPrices(data as CustomPrice[]);
    } catch (error) {
      console.error('Failed to load custom prices:', error);
      alert('Failed to load custom prices');
    }
  }

  function updateRowInput(productId: number, patch: Partial<RowInput>) {
    setRowInputs((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { overrideType: 'custom', value: '', justification: '' }),
        ...patch,
      },
    }));
    setRowErrors((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function getPricingPreview(product: Product) {
    const input = rowInputs[product.id] || { overrideType: 'custom', value: '', justification: '' };
    const basePrice = Number(product.approvedPrice || 0);
    const productionCost = Number(costByProductId[product.id] || 0);
    const numericValue = Number(input.value || '0');

    if (Number.isNaN(numericValue) || numericValue < 0) {
      return {
        finalPrice: null as number | null,
        newMargin: null as number | null,
        currentMargin: basePrice > 0 ? ((basePrice - productionCost) / basePrice) * 100 : 0,
        isBelowCost: false,
        isLowMargin: false,
      };
    }

    let finalPrice = basePrice;
    if (input.overrideType === 'custom') {
      finalPrice = numericValue;
    } else if (input.overrideType === 'discount') {
      finalPrice = basePrice * (1 - numericValue / 100);
    } else {
      finalPrice = basePrice * (1 + numericValue / 100);
    }

    finalPrice = Math.max(0, Math.round(finalPrice * 100) / 100);
    const currentMargin = basePrice > 0 ? ((basePrice - productionCost) / basePrice) * 100 : 0;
    const newMargin = finalPrice > 0 ? ((finalPrice - productionCost) / finalPrice) * 100 : -100;

    return {
      finalPrice,
      newMargin,
      currentMargin,
      isBelowCost: finalPrice < productionCost,
      isLowMargin: newMargin < 15,
    };
  }

  async function saveRow(product: Product) {
    if (!selectedCustomer) {
      alert('Select a customer first');
      return;
    }
    if (!selectedCustomer.allowSpecialPricing) {
      alert('Selected customer does not allow special pricing');
      return;
    }

    const input = rowInputs[product.id];
    if (!input) return;

    const numericValue = Number(input.value || '');
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setRowErrors((prev) => ({
        ...prev,
        [product.id]: { message: 'Enter a valid non-negative override value.' },
      }));
      return;
    }
    if (input.overrideType === 'discount' && numericValue > 100) {
      setRowErrors((prev) => ({
        ...prev,
        [product.id]: { message: 'Discount must be between 0 and 100.' },
      }));
      return;
    }

    const preview = getPricingPreview(product);
    if (preview.finalPrice == null) {
      setRowErrors((prev) => ({
        ...prev,
        [product.id]: { message: 'Final price could not be calculated.' },
      }));
      return;
    }

    setSavingRows((prev) => new Set(prev).add(product.id));
    try {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      await customersApi.setCustomPrice(selectedCustomer.id, {
        productId: product.id,
        customPrice: preview.finalPrice,
        overrideType: input.overrideType,
        discountPercentage: input.overrideType === 'discount' ? numericValue : undefined,
        markupPercentage: input.overrideType === 'markup' ? numericValue : undefined,
        justification: input.justification || undefined,
      });
      await loadCustomPrices(selectedCustomer.id);
    } catch (error) {
      console.error('Failed to save special price row:', error);
      const parsed = parseApiError(error);
      setRowErrors((prev) => ({ ...prev, [product.id]: parsed }));
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  }

  async function approveRow(productId: number) {
    if (!selectedCustomer) return;
    setActionLoadingRows((prev) => new Set(prev).add(productId));
    try {
      await customersApi.approveCustomPrice(selectedCustomer.id, productId, { approvedBy: 'pricing_manager' });
      await loadCustomPrices(selectedCustomer.id);
    } catch (error) {
      console.error('Failed to approve special price:', error);
      alert('Failed to approve special pricing');
    } finally {
      setActionLoadingRows((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }

  async function rejectRow(productId: number) {
    if (!selectedCustomer) return;
    const justification = window.prompt('Rejection reason/justification (optional):', '') || undefined;
    setActionLoadingRows((prev) => new Set(prev).add(productId));
    try {
      await customersApi.rejectCustomPrice(selectedCustomer.id, productId, {
        approvedBy: 'pricing_manager',
        justification,
      });
      await loadCustomPrices(selectedCustomer.id);
    } catch (error) {
      console.error('Failed to reject special price:', error);
      alert('Failed to reject special pricing');
    } finally {
      setActionLoadingRows((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }

  function escapeCsvCell(value: unknown) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
    const csv = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportApprovedCsv() {
    if (approvedProducts.length === 0) {
      alert('No approved products to export');
      return;
    }

    downloadCsv(
      `special-pricing-approved-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Product', 'SKU', 'Approved Base Price', 'Override Type', 'Override Value', 'Final Price', 'Status'],
      approvedProducts.map((product) => {
        const input = rowInputs[product.id] || { overrideType: 'custom', value: '', justification: '' };
        const preview = getPricingPreview(product);
        const existing = customPriceByProductId[product.id];
        const overrideValue = input.overrideType === 'custom'
          ? input.value || ''
          : `${input.value || 0}%`;

        return [
          product.name,
          product.sku || '-',
          Number(product.approvedPrice || 0).toFixed(2),
          input.overrideType,
          overrideValue,
          preview.finalPrice == null ? '-' : preview.finalPrice.toFixed(2),
          existing?.status || 'none',
        ];
      })
    );
  }

  function handleExportPendingCsv() {
    if (pendingItems.length === 0) {
      alert('No pending items to export');
      return;
    }

    downloadCsv(
      `special-pricing-pending-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Product', 'Final Price', 'Override', 'Justification', 'Status'],
      pendingItems.map((item) => [
        item.productName,
        Number(item.customPrice).toFixed(2),
        item.overrideType === 'discount'
          ? `Discount ${Number(item.discountPercentage || 0).toFixed(2)}%`
          : item.overrideType === 'markup'
            ? `Markup ${Number(item.markupPercentage || 0).toFixed(2)}%`
            : 'Exact Price',
        item.justification || '-',
        item.status,
      ])
    );
  }

  function handlePrintSpecialPricingReport() {
    if (!selectedCustomer) {
      alert('Select a customer first');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const approvedRows = approvedProducts
      .map((product) => {
        const preview = getPricingPreview(product);
        const existing = customPriceByProductId[product.id];
        return `
          <tr>
            <td>${product.name}</td>
            <td style="text-align:right;">${Number(product.approvedPrice || 0).toFixed(2)}</td>
            <td style="text-align:right;">${preview.finalPrice == null ? '-' : preview.finalPrice.toFixed(2)}</td>
            <td>${existing?.status || 'none'}</td>
          </tr>
        `;
      })
      .join('');

    const pendingRows = pendingItems
      .map(
        (item) => `
          <tr>
            <td>${item.productName}</td>
            <td style="text-align:right;">${Number(item.customPrice).toFixed(2)}</td>
            <td>${item.overrideType || 'custom'}</td>
            <td>${item.justification || '-'}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Special Pricing Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            h2 { margin: 16px 0 6px; font-size: 16px; }
            .meta { margin-bottom: 12px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Special Pricing Report</h1>
          <div class="meta">Customer: ${selectedCustomer.name} • Generated ${new Date().toLocaleString()}</div>
          <h2>Approved Products</h2>
          <table>
            <thead>
              <tr><th>Product</th><th>Base Price</th><th>Final Price</th><th>Status</th></tr>
            </thead>
            <tbody>${approvedRows || '<tr><td colspan="4">No approved products</td></tr>'}</tbody>
          </table>
          <h2>Pending Approvals</h2>
          <table>
            <thead>
              <tr><th>Product</th><th>Final Price</th><th>Override</th><th>Justification</th></tr>
            </thead>
            <tbody>${pendingRows || '<tr><td colspan="4">No pending items</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  if (isLoading) {
    return <div className="app-page" style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <h1 className="app-page-title">Manage Special Pricing</h1>
        <p className="app-page-subtitle">
          Configure customer-specific overrides with margin protection and approval workflow
        </p>
      </div>

      <div className="app-page-content" style={{ gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', fontWeight: 600 }}>Customer</label>
            <select
              value={selectedCustomerId ?? ''}
              onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '320px' }}
            >
              <option value="">Select customer</option>
              {customers
                .filter((customer) => customer.allowSpecialPricing)
                .map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.priceLevelName || '-'})
                  </option>
                ))}
            </select>
          </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleExportApprovedCsv}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 10px' }}
              >
                <FileSpreadsheet size={14} strokeWidth={2} />
                Approved CSV
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleExportPendingCsv}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 10px' }}
              >
                <FileSpreadsheet size={14} strokeWidth={2} />
                Pending CSV
              </button>
              <button
                className="btn btn-secondary"
                onClick={handlePrintSpecialPricingReport}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 10px' }}
              >
                <Printer size={14} strokeWidth={2} />
                Print
              </button>
              <Link to="/customers" style={{ fontSize: '13px', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                ← Back to Customers
              </Link>
            </div>
        </div>

        {!selectedCustomer ? (
          <div className="app-card" style={{ color: '#64748b' }}>
            Select a customer to manage special pricing.
          </div>
        ) : !selectedCustomer.allowSpecialPricing ? (
          <div className="app-card status-pending" style={{ fontSize: '13px' }}>
            This customer is not enabled for special pricing.
          </div>
        ) : (
          <>
            <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Approved Products</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="app-table" style={{ minWidth: '1280px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Product</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Approved Base Price</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Production Cost</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Current Margin %</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Override Type</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Override Value</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Final Price</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>New Margin %</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Justification</th>
                      <th style={{ textAlign: 'center', padding: '10px', fontSize: '12px' }}>Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedProducts.map((product) => {
                      const input = rowInputs[product.id] || { overrideType: 'custom', value: '', justification: '' };
                      const existing = customPriceByProductId[product.id];
                      const preview = getPricingPreview(product);
                      const rowError = rowErrors[product.id];
                      const productionCost = Number(costByProductId[product.id] || 0);
                      const basePrice = Number(product.approvedPrice || 0);
                      const badge = statusBadge(existing?.status);
                      const marginStyle = preview.newMargin == null ? marginColor(-100) : marginColor(preview.newMargin);
                      const requiresJustification = !preview.isBelowCost && preview.newMargin != null && preview.newMargin < 15;
                      const highlightJustification = requiresJustification && !input.justification.trim();

                      let errorLines: string[] = [];
                      if (rowError?.code === 'PRICE_BELOW_COST') {
                        const details = rowError.details;
                        const productionCostValue = readNumber(details, 'productionCost', productionCost);
                        const proposedPriceValue = readNumber(details, 'proposedPrice', preview.finalPrice || 0);
                        const minimumAt15Margin = productionCostValue / 0.85;
                        errorLines = [
                          'Cannot set price below production cost',
                          `Production Cost: ${formatCurrency(productionCostValue)}`,
                          `Proposed Price: ${formatCurrency(proposedPriceValue)}`,
                          `Minimum Safe Price: ${formatCurrency(minimumAt15Margin)} (15% margin)`,
                        ];
                      } else if (rowError?.code === 'LOW_MARGIN_JUSTIFICATION_REQUIRED') {
                        const details = rowError.details;
                        const proposedPriceValue = readNumber(details, 'proposedPrice', preview.finalPrice || 0);
                        const newMarginValue = readNumber(details, 'resultingMarginPercentage', preview.newMargin || 0);
                        errorLines = [
                          'Low margin detected - justification required',
                          `Current Margin: ${formatPercent(preview.currentMargin)}`,
                          `New Margin: ${formatPercent(newMarginValue)}`,
                          `Proposed Price: ${formatCurrency(proposedPriceValue)}`,
                          'Please provide business justification for this pricing.',
                        ];
                      } else if (rowError?.message) {
                        errorLines = [rowError.message];
                      } else if (preview.isBelowCost) {
                        errorLines = [
                          'Cannot set price below production cost',
                          `Production Cost: ${formatCurrency(productionCost)}`,
                          `Proposed Price: ${formatCurrency(preview.finalPrice || 0)}`,
                          `Minimum Safe Price: ${formatCurrency(productionCost / 0.85)} (15% margin)`,
                        ];
                      } else if (requiresJustification && !input.justification.trim()) {
                        errorLines = [
                          'Low margin detected - justification required',
                          `Current Margin: ${formatPercent(preview.currentMargin)}`,
                          `New Margin: ${formatPercent(preview.newMargin || 0)}`,
                          `Proposed Price: ${formatCurrency(preview.finalPrice || 0)}`,
                          'Please provide business justification for this pricing.',
                        ];
                      }

                      return (
                        <tr key={product.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: 600 }}>
                            {product.name}
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{product.sku || 'N/A'}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px' }}>GHS {basePrice.toFixed(2)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px' }}>GHS {productionCost.toFixed(2)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px' }}>{preview.currentMargin.toFixed(2)}%</td>
                          <td style={{ padding: '10px' }}>
                            <select
                              value={input.overrideType}
                              onChange={(e) => updateRowInput(product.id, { overrideType: e.target.value as 'custom' | 'discount' | 'markup' })}
                              style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', minWidth: '140px' }}
                            >
                              <option value="custom">Exact Price</option>
                              <option value="discount">Discount</option>
                              <option value="markup">Markup</option>
                            </select>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={input.value}
                              onChange={(e) => updateRowInput(product.id, { value: e.target.value })}
                              placeholder={input.overrideType === 'custom' ? 'Price' : '%'}
                              style={{ width: '100px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>
                            {preview.finalPrice == null ? '—' : `GHS ${preview.finalPrice.toFixed(2)}`}
                            {preview.isBelowCost && (
                              <div style={{ color: '#991b1b', fontSize: '11px' }}>Below cost (blocked)</div>
                            )}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            {preview.newMargin == null ? '—' : (
                              <>
                                <span
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '999px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: marginStyle.color,
                                    backgroundColor: marginStyle.bg,
                                  }}
                                >
                                  {preview.newMargin.toFixed(2)}%
                                </span>
                                <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>
                                  Impact: {preview.newMargin >= preview.currentMargin ? '+' : ''}
                                  {(preview.newMargin - preview.currentMargin).toFixed(2)} pts
                                </div>
                              </>
                            )}
                            {!preview.isBelowCost && preview.newMargin != null && preview.newMargin < 15 && (
                              <div style={{ color: '#92400e', fontSize: '11px' }}>Low margin warning</div>
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span className={badge.className}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div>
                              <input
                                value={input.justification}
                                onChange={(e) => updateRowInput(product.id, { justification: e.target.value })}
                                placeholder={preview.newMargin != null && preview.newMargin < 15 ? 'Required below 15% margin' : 'Optional'}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: highlightJustification ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                  backgroundColor: highlightJustification ? '#fef2f2' : 'white',
                                }}
                              />
                              {highlightJustification && (
                                <div style={{ marginTop: '4px', color: '#b91c1c', fontSize: '11px', fontWeight: 600 }}>
                                  Justification required for margins below 15%.
                                </div>
                              )}
                              {errorLines.length > 0 && (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    border: '1px solid #fecaca',
                                    backgroundColor: '#fef2f2',
                                    color: '#991b1b',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    fontSize: '11px',
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {errorLines.map((line) => (
                                    <div key={`${product.id}-${line}`}>{line}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => saveRow(product)}
                              disabled={savingRows.has(product.id)}
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                            >
                              {savingRows.has(product.id) ? 'Saving...' : 'Save Pending'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {approvedProducts.length === 0 && (
                      <tr>
                        <td colSpan={11} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                          No approved products available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                Pricing Manager Approval ({pendingItems.length} pending)
              </div>
              <table className="app-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px' }}>Final Price</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Override</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px' }}>Justification</th>
                    <th style={{ textAlign: 'center', padding: '10px', fontSize: '12px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item) => (
                    <tr key={`${item.customerId}-${item.productId}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontSize: '13px' }}>{item.productName}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>
                        GHS {Number(item.customPrice).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px' }}>
                        {item.overrideType === 'discount'
                          ? `Discount ${Number(item.discountPercentage || 0).toFixed(2)}%`
                          : item.overrideType === 'markup'
                            ? `Markup ${Number(item.markupPercentage || 0).toFixed(2)}%`
                            : 'Exact Price'}
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px', color: '#475569' }}>{item.justification || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className="btn btn-success"
                            onClick={() => approveRow(item.productId)}
                            disabled={actionLoadingRows.has(item.productId)}
                            style={{ padding: '6px 10px' }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => rejectRow(item.productId)}
                            disabled={actionLoadingRows.has(item.productId)}
                            style={{ padding: '6px 10px' }}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        No pending special pricing requests.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
