import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { priceLevelRulesApi, customersApi } from '../api';

interface Customer {
  id: number;
  name: string;
  priceLevelId: number;
  priceLevelName?: string;
  allowSpecialPricing: boolean;
  specialPricingCount?: number;
}

interface PriceRule {
  id: number;
  name: string;
  isActive?: boolean;
}

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [specialFilter, setSpecialFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const [name, setName] = useState('');
  const [selectedPriceLevelId, setSelectedPriceLevelId] = useState<number | null>(null);
  const [allowSpecialPricing, setAllowSpecialPricing] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPriceLevelId, setBulkPriceLevelId] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState<'enable' | 'disable' | 'assignLevel' | 'delete'>('enable');

  const activePriceLevels = useMemo(
    () => priceRules.filter((rule) => rule.isActive !== false),
    [priceRules],
  );

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        query.length === 0 ||
        customer.name.toLowerCase().includes(query) ||
        (customer.priceLevelName || '').toLowerCase().includes(query);

      const matchesSpecial =
        specialFilter === 'all' ||
        (specialFilter === 'enabled' && customer.allowSpecialPricing) ||
        (specialFilter === 'disabled' && !customer.allowSpecialPricing);

      return matchesSearch && matchesSpecial;
    });
  }, [customers, searchTerm, specialFilter]);

  const hasActiveFilters = searchTerm.trim().length > 0 || specialFilter !== 'all';

  const allVisibleSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((customer) => selectedIds.has(customer.id));

  const selectedCount = selectedIds.size;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activePriceLevels.length > 0 && selectedPriceLevelId == null) {
      setSelectedPriceLevelId(activePriceLevels[0].id);
    }
    if (activePriceLevels.length > 0 && bulkPriceLevelId == null) {
      setBulkPriceLevelId(activePriceLevels[0].id);
    }
  }, [activePriceLevels, selectedPriceLevelId, bulkPriceLevelId]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(filteredCustomers.map((customer) => customer.id));
      let changed = false;
      const next = new Set<number>();

      prev.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [filteredCustomers]);

  async function loadData() {
    try {
      setIsLoading(true);
      const [customersData, rulesData] = await Promise.all([
        customersApi.getAll(),
        priceLevelRulesApi.getAll(),
      ]);
      setCustomers(customersData);
      setPriceRules(rulesData);
    } catch (error) {
      console.error('Failed to load customers:', error);
      alert('Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setAllowSpecialPricing(false);
    setEditingCustomerId(null);
    if (activePriceLevels.length > 0) {
      setSelectedPriceLevelId(activePriceLevels[0].id);
    }
  }

  async function saveCustomer() {
    if (!name.trim() || selectedPriceLevelId == null) {
      alert('Name and price level are required');
      return;
    }

    try {
      setSaving(true);
      if (editingCustomerId == null) {
        const created = await customersApi.create({
          name: name.trim(),
          priceLevelId: selectedPriceLevelId,
          allowSpecialPricing,
        });
        setCustomers((prev) => [created, ...prev]);
      } else {
        const updated = await customersApi.update(editingCustomerId, {
          name: name.trim(),
          priceLevelId: selectedPriceLevelId,
          allowSpecialPricing,
        });
        setCustomers((prev) => prev.map((customer) => (customer.id === updated.id ? updated : customer)));
      }
      resetForm();
    } catch (error) {
      console.error('Failed to save customer:', error);
      alert('Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  function editCustomer(customer: Customer) {
    setEditingCustomerId(customer.id);
    setName(customer.name);
    setSelectedPriceLevelId(customer.priceLevelId);
    setAllowSpecialPricing(customer.allowSpecialPricing);
  }

  async function deleteCustomer(customerId: number) {
    if (!confirm('Delete this customer and all their special prices?')) return;

    try {
      await customersApi.delete(customerId);
      setCustomers((prev) => prev.filter((customer) => customer.id !== customerId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(customerId);
        return next;
      });
      if (editingCustomerId === customerId) {
        resetForm();
      }
    } catch (error) {
      console.error('Failed to delete customer:', error);
      alert('Failed to delete customer');
    }
  }

  function toggleCustomerSelection(customerId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredCustomers.forEach((customer) => next.delete(customer.id));
      } else {
        filteredCustomers.forEach((customer) => next.add(customer.id));
      }
      return next;
    });
  }

  function resetFilters() {
    setSearchTerm('');
    setSpecialFilter('all');
  }

  async function runBulkUpdate(update: (customer: Customer) => { priceLevelId: number; allowSpecialPricing: boolean }) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      setSaving(true);
      const idSet = new Set(ids);
      const selectedCustomers = customers.filter((customer) => idSet.has(customer.id));

      const updatedCustomers = await Promise.all(
        selectedCustomers.map(async (customer) => {
          const next = update(customer);
          return customersApi.update(customer.id, {
            name: customer.name,
            priceLevelId: next.priceLevelId,
            allowSpecialPricing: next.allowSpecialPricing,
          });
        }),
      );

      const byId = new Map(updatedCustomers.map((customer) => [customer.id, customer]));
      setCustomers((prev) => prev.map((customer) => byId.get(customer.id) || customer));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk update failed:', error);
      alert('Bulk operation failed');
    } finally {
      setSaving(false);
    }
  }

  async function bulkEnableSpecialPricing() {
    await runBulkUpdate((customer) => ({
      priceLevelId: customer.priceLevelId,
      allowSpecialPricing: true,
    }));
  }

  async function bulkDisableSpecialPricing() {
    await runBulkUpdate((customer) => ({
      priceLevelId: customer.priceLevelId,
      allowSpecialPricing: false,
    }));
  }

  async function bulkAssignPriceLevel() {
    if (bulkPriceLevelId == null) {
      alert('Choose a price level for bulk assignment');
      return;
    }
    await runBulkUpdate((customer) => ({
      priceLevelId: bulkPriceLevelId,
      allowSpecialPricing: customer.allowSpecialPricing,
    }));
  }

  async function bulkDeleteCustomers() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected customer(s) and all their special prices?`)) return;

    try {
      setSaving(true);
      await Promise.all(ids.map((id) => customersApi.delete(id)));
      const idSet = new Set(ids);
      setCustomers((prev) => prev.filter((customer) => !idSet.has(customer.id)));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Failed to delete selected customers');
    } finally {
      setSaving(false);
    }
  }

  async function applyBulkAction() {
    if (selectedCount === 0) return;

    if (bulkAction === 'enable') {
      await bulkEnableSpecialPricing();
      return;
    }

    if (bulkAction === 'disable') {
      await bulkDisableSpecialPricing();
      return;
    }

    if (bulkAction === 'assignLevel') {
      await bulkAssignPriceLevel();
      return;
    }

    await bulkDeleteCustomers();
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

  function exportFilteredCustomersCsv() {
    if (filteredCustomers.length === 0) {
      alert('No customers to export');
      return;
    }

    downloadCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Customer', 'Price Level', 'Special Pricing', 'Overrides'],
      filteredCustomers.map((customer) => [
        customer.name,
        customer.priceLevelName || '-',
        customer.allowSpecialPricing ? 'Enabled' : 'Disabled',
        Number(customer.specialPricingCount || 0),
      ])
    );
  }

  function printFilteredCustomers() {
    if (filteredCustomers.length === 0) {
      alert('No customers to print');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredCustomers
      .map(
        (customer) => `
          <tr>
            <td>${customer.name}</td>
            <td>${customer.priceLevelName || '-'}</td>
            <td>${customer.allowSpecialPricing ? 'Enabled' : 'Disabled'}</td>
            <td style="text-align:right;">${Number(customer.specialPricingCount || 0)}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Customers Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            .meta { margin-bottom: 16px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
            th { background: #f8fafc; text-align: left; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Customers</h1>
          <div class="meta">Generated ${new Date().toLocaleString()} • ${filteredCustomers.length} record(s)</div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Price Level</th>
                <th>Special Pricing</th>
                <th>Overrides</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
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
        <div className="app-header-row">
          <div>
            <h1 className="app-page-title">Customers</h1>
            <p className="app-page-subtitle">
              Manage customers, assign price levels, and control special pricing eligibility
            </p>
          </div>
          <div className="app-header-actions">
            <button
              className="btn btn-secondary"
              onClick={exportFilteredCustomersCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={printFilteredCustomers}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
            >
              <Printer size={14} strokeWidth={2} />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="app-page-content" style={{ gap: '24px' }}>
        <div className="app-card">
          <h2>{editingCustomerId ? 'Edit Customer' : 'Add Customer'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
            <select
              value={selectedPriceLevelId ?? ''}
              onChange={(e) => setSelectedPriceLevelId(e.target.value ? Number(e.target.value) : null)}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            >
              {activePriceLevels.map((level) => (
                <option key={level.id} value={level.id}>{level.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={allowSpecialPricing}
                onChange={(e) => setAllowSpecialPricing(e.target.checked)}
              />
              Allow Special Pricing
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={saveCustomer}
                disabled={saving}
                style={{ padding: '10px 14px' }}
              >
                {editingCustomerId ? 'Update' : 'Create'}
              </button>
              {editingCustomerId && (
                <button
                  className="btn btn-secondary"
                  onClick={resetForm}
                  style={{ padding: '10px 14px' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="app-card">
          <div style={{ paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Customers ({filteredCustomers.length})</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customers"
              style={{ minWidth: '260px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
            <select
              value={specialFilter}
              onChange={(e) => setSpecialFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            >
              <option value="all">All Customers</option>
              <option value="enabled">Special Pricing Enabled</option>
              <option value="disabled">Special Pricing Disabled</option>
            </select>
            {hasActiveFilters && (
              <button
                className="btn btn-secondary"
                onClick={resetFilters}
                style={{ padding: '8px 12px' }}
              >
                Reset Filters
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#64748b', marginRight: '8px' }}>
              {selectedCount} selected
            </span>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as 'enable' | 'disable' | 'assignLevel' | 'delete')}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', minWidth: '190px' }}
            >
              <option value="enable">Enable Special Pricing</option>
              <option value="disable">Disable Special Pricing</option>
              <option value="assignLevel">Assign Price Level</option>
              <option value="delete">Delete Selected</option>
            </select>
            {bulkAction === 'assignLevel' && (
              <select
                value={bulkPriceLevelId ?? ''}
                onChange={(e) => setBulkPriceLevelId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              >
                {activePriceLevels.map((level) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
            )}
            <button
              className={bulkAction === 'delete' ? 'btn btn-danger' : 'btn btn-secondary'}
              onClick={applyBulkAction}
              disabled={selectedCount === 0 || saving || (bulkAction === 'assignLevel' && bulkPriceLevelId == null)}
              style={{ padding: '8px 12px' }}
            >
              Apply
            </button>
          </div>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ width: '44px', padding: '10px' }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px' }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px' }}>Price Level</th>
                  <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px' }}>Special Pricing</th>
                  <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px' }}>Overrides</th>
                  <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleCustomerSelection(customer.id)}
                      />
                    </td>
                    <td style={{ padding: '10px', fontSize: '14px', fontWeight: 600 }}>{customer.name}</td>
                    <td style={{ padding: '10px', fontSize: '14px' }}>{customer.priceLevelName || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span
                        className={customer.allowSpecialPricing ? 'status-badge status-active' : 'status-badge status-pending'}
                      >
                        {customer.allowSpecialPricing ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px', color: '#475569' }}>
                      {Number(customer.specialPricingCount || 0)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => navigate(`/special-pricing/${customer.id}`)}
                          style={{ padding: '6px 10px' }}
                        >
                          Special Pricing
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => editCustomer(customer)}
                          style={{ padding: '6px 10px' }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => deleteCustomer(customer.id)}
                          style={{ padding: '6px 10px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No customers match the current search/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
