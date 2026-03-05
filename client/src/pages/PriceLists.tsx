import * as XLSX from 'xlsx';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileSpreadsheet, Lightbulb, Plus, Printer } from 'lucide-react';
import { customersApi, priceLevelRulesApi, priceListsApi, productsApi } from '../api';

interface PriceListItem {
  id: number;
  productId: number;
  productName: string;
  basePrice: number;
  discountPercentage: number;
  finalPrice: number;
  priceSource?: 'base' | 'level_rule' | 'special';
  notes?: string;
}

interface PriceList {
  id: number;
  name: string;
  customerId?: number | null;
  priceLevelId: number;
  priceLevelName?: string;
  createdBy?: string;
  validFrom: number | string;
  validUntil: number | string | null;
  status: 'draft' | 'active' | 'expired' | 'archived';
  createdAt: number;
  items?: PriceListItem[];
}

interface Product {
  id: number;
  name: string;
  sku: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  approvedPrice?: number | null;
}

interface PriceRule {
  id: number;
  name: string;
  adjustmentType: 'discount' | 'markup';
  adjustmentPercentage: number;
  isActive?: boolean;
}

interface Customer {
  id: number;
  name: string;
  priceLevelId: number;
  priceLevelName?: string;
  allowSpecialPricing: boolean;
}

interface ExpiryReminderItem {
  id: number;
  name: string;
  status: PriceList['status'];
  customerId?: number | null;
  priceLevelName?: string;
  validFrom: number | string;
  validUntil: number | string | null;
  daysRemaining: number;
  severity: 'expired' | 'critical' | 'warning';
}

interface ExpiryMonitorData {
  thresholdDays: number;
  total: number;
  expiredCount: number;
  criticalCount: number;
  warningCount: number;
  reminders: ExpiryReminderItem[];
}

export default function PriceLists() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [approvalStats, setApprovalStats] = useState({ approved: 0, excluded: 0 });
  const [expiryMonitor, setExpiryMonitor] = useState<ExpiryMonitorData>({
    thresholdDays: 30,
    total: 0,
    expiredCount: 0,
    criticalCount: 0,
    warningCount: 0,
    reminders: [],
  });
  const [expiryThresholdDays, setExpiryThresholdDays] = useState(30);
  const [isExpiryLoading, setIsExpiryLoading] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PriceList['status']>('All');
  const [levelFilter, setLevelFilter] = useState('All');
  const [sortOption, setSortOption] = useState<'nameAsc' | 'nameDesc' | 'validFromDesc' | 'validFromAsc'>('validFromDesc');
  const [selectedPriceLists, setSelectedPriceLists] = useState<Set<number>>(new Set());
  const [bulkStatusValue, setBulkStatusValue] = useState<'' | PriceList['status']>('');
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [generationMode, setGenerationMode] = useState<'byPriceLevel' | 'byCustomer'>('byPriceLevel');
  const [selectedPriceLevelId, setSelectedPriceLevelId] = useState<number | null>(null);
  const [selectedPriceLevelIds, setSelectedPriceLevelIds] = useState<number[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);

  const [viewingList, setViewingList] = useState<PriceList | null>(null);
  const [viewingItems, setViewingItems] = useState<PriceListItem[]>([]);
  const [isViewLoading, setIsViewLoading] = useState(false);

  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [editName, setEditName] = useState('');
  const [editValidFrom, setEditValidFrom] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editStatus, setEditStatus] = useState<PriceList['status']>('draft');
  const [editSelectedPriceLevelIds, setEditSelectedPriceLevelIds] = useState<number[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const activePriceRules = priceRules.filter((rule) => rule.isActive !== false);
  const eligibleCustomers = customers.filter(
    (customer) => customer.allowSpecialPricing || Number.isInteger(customer.priceLevelId)
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadExpiryMonitorData(days: number) {
    setIsExpiryLoading(true);
    try {
      const monitor = await priceListsApi.getExpiryMonitor(days);
      setExpiryMonitor(monitor as ExpiryMonitorData);
    } catch (monitorError) {
      console.error('Error loading price list expiry monitor:', monitorError);
    } finally {
      setIsExpiryLoading(false);
    }
  }

  async function loadData() {
    try {
      const [listsData, productsData, rulesData, customersData] = await Promise.all([
        priceListsApi.getAll(),
        productsApi.getAll(),
        priceLevelRulesApi.getAll(),
        customersApi.getAll(),
      ]);

      const approvedProducts = (productsData as Product[]).filter(
        (product) => product.approvalStatus === 'approved' && product.approvedPrice != null
      );

      setPriceLists(listsData as PriceList[]);
      setProducts(approvedProducts);
      setPriceRules(rulesData as PriceRule[]);
      setCustomers(customersData as Customer[]);
      setApprovalStats({
        approved: approvedProducts.length,
        excluded: Math.max(0, (productsData as Product[]).length - approvedProducts.length),
      });

      await loadExpiryMonitorData(expiryThresholdDays);

      const firstActiveRule = (rulesData as PriceRule[]).find((rule) => rule.isActive !== false);
      setSelectedPriceLevelId((prev) => prev ?? firstActiveRule?.id ?? null);
      setSelectedPriceLevelIds((prev) => (prev.length > 0 ? prev : firstActiveRule ? [firstActiveRule.id] : []));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setName('');
    setGenerationMode('byPriceLevel');
    setSelectedPriceLevelId(activePriceRules[0]?.id ?? null);
    setSelectedPriceLevelIds(activePriceRules[0] ? [activePriceRules[0].id] : []);
    setSelectedCustomerId(null);
    setValidFrom('');
    setValidUntil('');
    setSelectedProducts([]);
    setIsCreating(false);
  }

  function findRuleById(id: number) {
    return priceRules.find((rule) => rule.id === id);
  }

  function getSelectedPriceLevelIdsForList(list: PriceList) {
    if (typeof list.createdBy === 'string' && list.createdBy.startsWith('user-multi-level:')) {
      const parsed = list.createdBy
        .slice('user-multi-level:'.length)
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((id) => Number.isInteger(id));

      const uniqueIds = [...new Set(parsed)];
      if (uniqueIds.length > 0) {
        return uniqueIds;
      }
    }

    return Number.isInteger(list.priceLevelId) ? [list.priceLevelId] : [];
  }

  function getPriceLevelNameById(id: number) {
    return findRuleById(id)?.name || `Level ${id}`;
  }

  function getPriceLevelDisplayForList(list: PriceList) {
    const ids = getSelectedPriceLevelIdsForList(list);
    if (ids.length === 0) {
      return list.priceLevelName || '-';
    }

    const names = ids.map((id) => getPriceLevelNameById(id));
    if (names.length === 1) {
      return names[0];
    }

    return `Multiple (${names.join(', ')})`;
  }

  function getSelectedLevelsSummaryForList(list: PriceList) {
    const ids = getSelectedPriceLevelIdsForList(list);
    if (ids.length === 0) return '-';
    return ids.map((id) => getPriceLevelNameById(id)).join(', ');
  }

  const availableLevelFilters = useMemo(() => {
    return Array.from(new Set(priceLists.map((list) => getPriceLevelDisplayForList(list)))).sort((a, b) => a.localeCompare(b));
  }, [priceLists, priceRules]);

  const filteredSortedPriceLists = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = priceLists.filter((list) => {
      const levelDisplay = getPriceLevelDisplayForList(list);
      const matchesSearch = normalizedSearch.length === 0
        || list.name.toLowerCase().includes(normalizedSearch)
        || levelDisplay.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === 'All' || list.status === statusFilter;
      const matchesLevel = levelFilter === 'All' || levelDisplay === levelFilter;

      return matchesSearch && matchesStatus && matchesLevel;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortOption === 'nameAsc') return a.name.localeCompare(b.name);
      if (sortOption === 'nameDesc') return b.name.localeCompare(a.name);

      const aFrom = toUnixSeconds(a.validFrom) ?? 0;
      const bFrom = toUnixSeconds(b.validFrom) ?? 0;
      return sortOption === 'validFromAsc' ? aFrom - bFrom : bFrom - aFrom;
    });

    return sorted;
  }, [priceLists, searchTerm, statusFilter, levelFilter, sortOption, priceRules]);

  useEffect(() => {
    const visibleIds = new Set(filteredSortedPriceLists.map((list) => list.id));
    setSelectedPriceLists((prev) => new Set(Array.from(prev).filter((id) => visibleIds.has(id))));
  }, [filteredSortedPriceLists]);

  function getItemLevelContext(item: PriceListItem) {
    if (!item.notes) return '-';
    if (item.notes.startsWith('Price Level:')) {
      return item.notes.replace('Price Level:', '').trim() || '-';
    }
    return item.notes;
  }

  function getFallbackViewingLevelName() {
    if (!viewingList) return 'Price';
    const selectedIds = getSelectedPriceLevelIdsForList(viewingList);
    if (selectedIds.length === 1) {
      return getPriceLevelNameById(selectedIds[0]);
    }
    return 'Price';
  }

  function getViewingLevelNames() {
    const fromItems = [...new Set(
      viewingItems
        .map((item) => getItemLevelContext(item))
        .filter((level) => level !== '-')
    )];

    if (fromItems.length > 0) {
      return fromItems;
    }

    return [getFallbackViewingLevelName()];
  }

  function getViewingRowsByProduct() {
    const levelNames = getViewingLevelNames();
    const rows = new Map<number, {
      productId: number;
      productName: string;
      basePrice: number;
      byLevel: Record<string, PriceListItem | undefined>;
    }>();

    for (const item of viewingItems) {
      const levelName = getItemLevelContext(item) === '-' ? levelNames[0] : getItemLevelContext(item);

      if (!rows.has(item.productId)) {
        rows.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          basePrice: Number(item.basePrice),
          byLevel: {},
        });
      }

      const row = rows.get(item.productId);
      if (row) {
        row.byLevel[levelName] = item;
      }
    }

    return Array.from(rows.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }

  function getSelectedProductsTotal() {
    return products.filter((product) => selectedProducts.includes(product.id)).length;
  }

  function toUnixSeconds(value: number | string | Date | null | undefined) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
    }

    if (value instanceof Date) {
      const time = value.getTime();
      if (Number.isNaN(time)) return null;
      return Math.floor(time / 1000);
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return Math.floor(parsed / 1000);
  }

  function formatDate(timestamp: number | string | Date | null | undefined) {
    const seconds = toUnixSeconds(timestamp);
    if (seconds === null) return '-';

    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function toDateInputValue(timestamp: number | string | Date | null | undefined) {
    const seconds = toUnixSeconds(timestamp);
    if (seconds === null) return '';

    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }

  function formatDaysRemaining(daysRemaining: number) {
    if (daysRemaining < 0) {
      const daysOverdue = Math.abs(daysRemaining);
      return `Expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago`;
    }
    if (daysRemaining === 0) return 'Expires today';
    if (daysRemaining === 1) return 'Expires in 1 day';
    return `Expires in ${daysRemaining} days`;
  }

  function getDaysToExpiryDisplay(validUntil: number | string | Date | null | undefined) {
    const validUntilSeconds = toUnixSeconds(validUntil);
    if (validUntilSeconds === null) return '-';

    const nowSeconds = Math.floor(Date.now() / 1000);
    const daysRemaining = Math.ceil((validUntilSeconds - nowSeconds) / (24 * 60 * 60));

    if (daysRemaining < 0) {
      const daysOverdue = Math.abs(daysRemaining);
      return `Expired ${daysOverdue}d ago`;
    }
    if (daysRemaining === 0) return 'Today';
    return `${daysRemaining}d`;
  }

  function getReminderStyles(severity: ExpiryReminderItem['severity']) {
    if (severity === 'expired') {
      return {
        border: '#fecaca',
        background: '#fef2f2',
        text: '#991b1b',
        badgeBg: '#dc2626',
      };
    }
    if (severity === 'critical') {
      return {
        border: '#fde68a',
        background: '#fffbeb',
        text: '#92400e',
        badgeBg: '#d97706',
      };
    }
    return {
      border: '#bfdbfe',
      background: '#eff6ff',
      text: '#1e3a8a',
      badgeBg: '#2563eb',
    };
  }

  function handleExpiryThresholdChange(days: number) {
    if (days === expiryThresholdDays) return;
    setExpiryThresholdDays(days);
    loadExpiryMonitorData(days);
  }

  function getStatusBadge(status: string) {
    let badgeClass = 'status-badge status-info';
    if (status === 'active') badgeClass = 'status-badge status-approved';
    else if (status === 'draft') badgeClass = 'status-badge status-pending';
    else if (status === 'expired') badgeClass = 'status-badge status-rejected';

    return (
      <span className={badgeClass} style={{ textTransform: 'capitalize' }}>
        {status}
      </span>
    );
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

  function printHtmlDocument(title: string, bodyHtml: string) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            .meta { margin-bottom: 16px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
            .num { text-align: right; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>${bodyHtml}</body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  function handleExportPriceListsCsv() {
    if (priceLists.length === 0) {
      alert('No price lists to export');
      return;
    }

    downloadCsv(
      `price-lists-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Price Level', 'Selected Levels', 'Valid From', 'Valid Until', 'Status'],
      priceLists.map((list) => [
        list.name,
        getPriceLevelDisplayForList(list),
        getSelectedLevelsSummaryForList(list),
        formatDate(list.validFrom),
        list.validUntil ? formatDate(list.validUntil) : '-',
        list.status,
      ])
    );
  }

  function handlePrintPriceLists() {
    if (priceLists.length === 0) {
      alert('No price lists to print');
      return;
    }

    const rowsHtml = priceLists
      .map(
        (list) => `
          <tr>
            <td>${list.name}</td>
            <td>${getPriceLevelDisplayForList(list)}</td>
            <td>${getSelectedLevelsSummaryForList(list)}</td>
            <td>${formatDate(list.validFrom)}</td>
            <td>${list.validUntil ? formatDate(list.validUntil) : '-'}</td>
            <td>${list.status}</td>
          </tr>
        `
      )
      .join('');

    printHtmlDocument(
      'Price Lists',
      `
        <h1>Price Lists</h1>
        <div class="meta">Generated ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Price Level</th>
              <th>Selected Levels</th>
              <th>Valid From</th>
              <th>Valid Until</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `
    );
  }

  function toggleSelectPriceList(listId: number) {
    setSelectedPriceLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }

  function toggleSelectAllVisiblePriceLists() {
    if (filteredSortedPriceLists.length === 0) return;

    const allVisibleSelected = filteredSortedPriceLists.every((list) => selectedPriceLists.has(list.id));
    if (allVisibleSelected) {
      setSelectedPriceLists(new Set());
      return;
    }

    setSelectedPriceLists(new Set(filteredSortedPriceLists.map((list) => list.id)));
  }

  function handleBulkExportSelectedPriceListsCsv() {
    const selectedRows = filteredSortedPriceLists.filter((list) => selectedPriceLists.has(list.id));
    if (selectedRows.length === 0) {
      alert('No selected price lists to export');
      return;
    }

    downloadCsv(
      `selected-price-lists-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Price Level', 'Selected Levels', 'Valid From', 'Valid Until', 'Status'],
      selectedRows.map((list) => [
        list.name,
        getPriceLevelDisplayForList(list),
        getSelectedLevelsSummaryForList(list),
        formatDate(list.validFrom),
        list.validUntil ? formatDate(list.validUntil) : '-',
        list.status,
      ])
    );
  }

  async function handleBulkDeleteSelectedPriceLists() {
    const ids = Array.from(selectedPriceLists);
    if (ids.length === 0) {
      alert('No selected price lists to delete');
      return;
    }

    if (!confirm(`Delete ${ids.length} selected price list${ids.length !== 1 ? 's' : ''}?`)) return;

    const outcomes = await Promise.all(
      ids.map(async (id) => {
        try {
          await priceListsApi.delete(id);
          return { id, ok: true as const };
        } catch (error: any) {
          return { id, ok: false as const, error: error?.message || 'Failed to delete' };
        }
      })
    );

    const deletedIds = outcomes.filter((entry) => entry.ok).map((entry) => entry.id);
    const failed = outcomes.filter((entry) => !entry.ok);

    if (deletedIds.length > 0) {
      setPriceLists((prev) => prev.filter((list) => !deletedIds.includes(list.id)));
    }

    setSelectedPriceLists(new Set(failed.map((entry) => entry.id)));

    if (failed.length === 0) {
      alert(`Deleted ${deletedIds.length} price list${deletedIds.length !== 1 ? 's' : ''}`);
      return;
    }

    if (deletedIds.length > 0) {
      alert(`Deleted ${deletedIds.length}. Could not delete ${failed.length} selected price list${failed.length !== 1 ? 's' : ''}.`);
      return;
    }

    alert(failed[0].error || 'Failed to delete selected price lists');
  }

  async function handleBulkStatusUpdateSelectedPriceLists() {
    const ids = Array.from(selectedPriceLists);
    if (ids.length === 0) {
      alert('No selected price lists');
      return;
    }

    if (!bulkStatusValue) {
      alert('Choose a status to apply');
      return;
    }

    const outcomes = await Promise.all(
      ids.map(async (id) => {
        try {
          const updated = await priceListsApi.update(id, { status: bulkStatusValue });
          return { id, ok: true as const, updated: updated as PriceList };
        } catch (error: any) {
          return { id, ok: false as const, error: error?.message || 'Failed to update status' };
        }
      })
    );

    const updatedRows = outcomes.filter((entry) => entry.ok).map((entry) => entry.updated);
    const failed = outcomes.filter((entry) => !entry.ok);

    if (updatedRows.length > 0) {
      const byId = new Map(updatedRows.map((item) => [item.id, item]));
      setPriceLists((prev) => prev.map((list) => byId.get(list.id) || list));
    }

    if (failed.length === 0) {
      setSelectedPriceLists(new Set());
      setBulkStatusValue('');
      alert(`Updated status for ${updatedRows.length} price list${updatedRows.length !== 1 ? 's' : ''}`);
      return;
    }

    setSelectedPriceLists(new Set(failed.map((entry) => entry.id)));
    if (updatedRows.length > 0) {
      alert(`Updated ${updatedRows.length}. Could not update ${failed.length} selected price list${failed.length !== 1 ? 's' : ''}.`);
      return;
    }

    alert(failed[0].error || 'Failed to update selected price lists');
  }

  function handleExportPriceListsExcel() {
    if (priceLists.length === 0) {
      alert('No price lists to export');
      return;
    }

    const exportRows = priceLists.map((list) => ({
      Name: list.name,
      'Price Level': getPriceLevelDisplayForList(list),
      'Selected Levels': getSelectedLevelsSummaryForList(list),
      'Valid From': formatDate(list.validFrom),
      'Valid Until': list.validUntil ? formatDate(list.validUntil) : '-',
      Status: list.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Price Lists');
    const filename = `PriceRight_PriceLists_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  function handleExportViewingItemsCsv() {
    if (!viewingList || viewingItems.length === 0) {
      alert('No viewed price list items to export');
      return;
    }

    const levelNames = getViewingLevelNames();
    const rowsByProduct = getViewingRowsByProduct();

    downloadCsv(
      `${viewingList.name.replace(/\s+/g, '-').toLowerCase()}-items.csv`,
      ['Product', 'Base Price', ...levelNames],
      rowsByProduct.map((row) => [
        row.productName,
        Number(row.basePrice).toFixed(2),
        ...levelNames.map((levelName) => {
          const item = row.byLevel[levelName];
          return item ? Number(item.finalPrice).toFixed(2) : '-';
        }),
      ])
    );
  }

  function handlePrintViewingList() {
    if (!viewingList || viewingItems.length === 0) {
      alert('No viewed price list items to print');
      return;
    }

    const levelNames = getViewingLevelNames();
    const rowsByProduct = getViewingRowsByProduct();
    const levelHeaders = levelNames.map((levelName) => `<th class="num">${levelName}</th>`).join('');

    const rowsHtml = rowsByProduct
      .map(
        (row) => `
          <tr>
            <td>${row.productName}</td>
            <td class="num">${Number(row.basePrice).toFixed(2)}</td>
            ${levelNames
              .map((levelName) => {
                const levelItem = row.byLevel[levelName];
                return `<td class="num">${levelItem ? Number(levelItem.finalPrice).toFixed(2) : '-'}</td>`;
              })
              .join('')}
          </tr>
        `
      )
      .join('');

    printHtmlDocument(
      `${viewingList.name} - Price List`,
      `
        <h1>${viewingList.name}</h1>
        <div class="meta">${getPriceLevelDisplayForList(viewingList)} • Valid ${formatDate(viewingList.validFrom)}${viewingList.validUntil ? ` - ${formatDate(viewingList.validUntil)}` : ''}</div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="num">Base Price</th>
              ${levelHeaders}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `
    );
  }

  function handleGenerationModeChange(mode: 'byPriceLevel' | 'byCustomer') {
    setGenerationMode(mode);
    if (mode === 'byPriceLevel') {
      setSelectedCustomerId(null);
      if (selectedPriceLevelIds.length === 0 && selectedPriceLevelId) {
        setSelectedPriceLevelIds([selectedPriceLevelId]);
      }
    }
  }

  function togglePriceLevelSelection(priceLevelId: number) {
    setSelectedPriceLevelIds((prev) =>
      prev.includes(priceLevelId)
        ? prev.filter((id) => id !== priceLevelId)
        : [...prev, priceLevelId]
    );
  }

  function selectAllPriceLevels() {
    setSelectedPriceLevelIds(activePriceRules.map((rule) => rule.id));
  }

  function clearAllPriceLevels() {
    setSelectedPriceLevelIds([]);
  }

  function handleCustomerSelection(value: string) {
    if (!value) {
      setSelectedCustomerId(null);
      return;
    }

    const customerId = Number(value);
    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    if (!selectedCustomer) {
      setSelectedCustomerId(null);
      return;
    }

    setSelectedCustomerId(selectedCustomer.id);
    setSelectedPriceLevelId(selectedCustomer.priceLevelId);
    setSelectedPriceLevelIds([selectedCustomer.priceLevelId]);
  }

  function toggleProductSelection(productId: number) {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }

  function selectAllProducts() {
    setSelectedProducts(products.map((product) => product.id));
  }

  function clearAllProducts() {
    setSelectedProducts([]);
  }

  async function handleCreatePriceList() {
    setIsSubmitting(true);
    try {
      const levelIdsToCreate = generationMode === 'byPriceLevel'
        ? selectedPriceLevelIds
        : (selectedPriceLevelId ? [selectedPriceLevelId] : []);

      if (levelIdsToCreate.length === 0) {
        alert('Select at least one price level');
        return;
      }
      if (generationMode === 'byCustomer' && !selectedCustomerId) {
        alert('Select a customer');
        return;
      }

      const selectedCustomer = selectedCustomerId
        ? customers.find((customer) => customer.id === selectedCustomerId)
        : null;

      const primaryPriceLevelId = levelIdsToCreate[0];
      const created = await priceListsApi.create({
        name:
          generationMode === 'byCustomer'
            ? `${name} - ${selectedCustomer?.name || 'Customer'}`
            : levelIdsToCreate.length > 1
              ? `${name} - Multiple Levels`
              : `${name} - ${findRuleById(primaryPriceLevelId)?.name || `Level ${primaryPriceLevelId}`}`,
        generationMode,
        priceLevelId: primaryPriceLevelId,
        selectedPriceLevelIds: generationMode === 'byPriceLevel' ? levelIdsToCreate : undefined,
        customerId: generationMode === 'byCustomer' ? selectedCustomerId || undefined : undefined,
        validFrom,
        validUntil,
        products: selectedProducts,
      });

      setPriceLists((prev) => [created as PriceList, ...prev]);
      resetWizard();
    } catch (error) {
      console.error('Error creating price list:', error);
      alert('Failed to create price list');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this price list?')) return;

    try {
      await priceListsApi.delete(id);
      setPriceLists((prev) => prev.filter((list) => list.id !== id));
    } catch (error) {
      console.error('Error deleting price list:', error);
      alert('Failed to delete price list');
    }
  }

  async function handleView(listId: number) {
    setIsViewLoading(true);
    try {
      const details = await priceListsApi.getById(listId);
      const items = (details.items || []) as PriceListItem[];
      setViewingList(details as PriceList);
      setViewingItems(items);
    } catch (error) {
      console.error('Error loading price list details:', error);
      alert('Failed to load price list details');
    } finally {
      setIsViewLoading(false);
    }
  }

  function handleOpenEdit(list: PriceList) {
    const selectedIds = getSelectedPriceLevelIdsForList(list);
    setEditingList(list);
    setEditName(list.name);
    setEditValidFrom(toDateInputValue(list.validFrom));
    setEditValidUntil(toDateInputValue(list.validUntil));
    setEditStatus(list.status);
    setEditSelectedPriceLevelIds(selectedIds);
  }

  function toggleEditPriceLevelSelection(priceLevelId: number) {
    setEditSelectedPriceLevelIds((prev) =>
      prev.includes(priceLevelId)
        ? prev.filter((id) => id !== priceLevelId)
        : [...prev, priceLevelId]
    );
  }

  function selectAllEditPriceLevels() {
    setEditSelectedPriceLevelIds(activePriceRules.map((rule) => rule.id));
  }

  function clearAllEditPriceLevels() {
    setEditSelectedPriceLevelIds([]);
  }

  async function handleSaveEdit() {
    if (!editingList) return;
    const isCustomerSpecific = editingList.customerId != null;

    if (!editName.trim()) {
      alert('Name is required');
      return;
    }

    if (!editValidFrom) {
      alert('Valid from date is required');
      return;
    }

    if (!isCustomerSpecific && editSelectedPriceLevelIds.length === 0) {
      alert('Select at least one price level');
      return;
    }

    setIsSavingEdit(true);
    try {
      const updated = await priceListsApi.update(editingList.id, {
        name: editName.trim(),
        validFrom: editValidFrom,
        validUntil: editValidUntil || null,
        status: editStatus,
        selectedPriceLevelIds: !isCustomerSpecific ? editSelectedPriceLevelIds : undefined,
      });

      setPriceLists((prev) => prev.map((list) => (list.id === editingList.id ? updated : list)));
      setEditingList(null);
    } catch (error) {
      console.error('Error updating price list:', error);
      alert('Failed to update price list');
    } finally {
      setIsSavingEdit(false);
    }
  }

  const viewingLevelNames = getViewingLevelNames();
  const viewingRowsByProduct = getViewingRowsByProduct();

  if (isLoading) {
    return <div className="app-page" style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  if (isCreating) {
    const selectedRule = selectedPriceLevelId ? findRuleById(selectedPriceLevelId) : undefined;
    const selectedRules = generationMode === 'byPriceLevel'
      ? activePriceRules.filter((rule) => selectedPriceLevelIds.includes(rule.id))
      : selectedRule
        ? [selectedRule]
        : [];
    const selectedListCount = selectedRules.length;
    const hasLevelSelection = generationMode === 'byPriceLevel' ? selectedPriceLevelIds.length > 0 : !!selectedPriceLevelId;

    return (
      <div className="app-page">
        <div className="app-page-header">
          <h1 className="app-page-title">
            Create Price List - Step {step} of 3
          </h1>
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: s <= step ? '#3b82f6' : '#e2e8f0',
                  color: s <= step ? 'white' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        <div className="app-page-content" style={{ maxWidth: '700px', margin: '0 auto' }}>
          {step === 1 && (
            <div className="app-card" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Basic Information</h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Price List Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Wholesale Q1 2026"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Generation Mode *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={generationMode === 'byPriceLevel'}
                      onChange={() => handleGenerationModeChange('byPriceLevel')}
                    />
                    <span style={{ fontSize: '14px' }}>By Price Level - Generate for all customers in a level</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={generationMode === 'byCustomer'}
                      onChange={() => handleGenerationModeChange('byCustomer')}
                    />
                    <span style={{ fontSize: '14px' }}>By Customer - Generate personalized list for specific customer</span>
                  </label>
                </div>
              </div>

              {generationMode === 'byPriceLevel' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Price Levels *
                  </label>
                  <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={selectAllPriceLevels}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAllPriceLevels}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {activePriceRules.map((rule) => {
                      const sign = rule.adjustmentType === 'markup' ? '+' : '-';
                      return (
                        <label
                          key={rule.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            backgroundColor: selectedPriceLevelIds.includes(rule.id) ? '#eff6ff' : 'white',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPriceLevelIds.includes(rule.id)}
                            onChange={() => togglePriceLevelSelection(rule.id)}
                          />
                          <span style={{ fontSize: '14px' }}>
                            {rule.name} ({rule.adjustmentType === 'markup' ? 'Markup' : 'Discount'} {sign}
                            {Number(rule.adjustmentPercentage || 0).toFixed(2)}%)
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155' }}>
                    {selectedPriceLevelIds.length} price level{selectedPriceLevelIds.length !== 1 ? 's' : ''} selected
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                    Uses level discount/markup rules only; no special pricing overrides are applied.
                  </div>
                </div>
              )}

              {generationMode === 'byCustomer' && (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                      Customer *
                    </label>
                    <select
                      value={selectedCustomerId ?? ''}
                      onChange={(e) => handleCustomerSelection(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select customer</option>
                      {eligibleCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} ({customer.priceLevelName || '-'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '20px', fontSize: '12px', color: '#64748b' }}>
                    Priority: 1) Special pricing override, 2) Price level rule, 3) Approved base price.
                  </div>

                  {selectedPriceLevelId && (
                    <div style={{ marginBottom: '20px', fontSize: '13px', color: '#334155' }}>
                      Selected customer price level: {findRuleById(selectedPriceLevelId)?.name || `Level ${selectedPriceLevelId}`}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Valid From *
                </label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Valid Until (optional)
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                <button
                  onClick={resetWizard}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#e2e8f0',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!name || !validFrom || !hasLevelSelection || (generationMode === 'byCustomer' && !selectedCustomerId)}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: !name || !validFrom || !hasLevelSelection || (generationMode === 'byCustomer' && !selectedCustomerId) ? '#cbd5e1' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: !name || !validFrom || !hasLevelSelection || (generationMode === 'byCustomer' && !selectedCustomerId) ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Next: Select Products
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>Select Products (Approved Only)</h2>

              <div
                style={{
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#0f172a',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Lightbulb size={14} strokeWidth={2} />
                <span>Only approved products can be added to price lists. {approvalStats.excluded} product{approvalStats.excluded !== 1 ? 's' : ''} pending approval.</span>
              </div>

              <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                <button
                  onClick={selectAllProducts}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={clearAllProducts}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                  }}
                >
                  Clear
                </button>
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  marginBottom: '20px',
                }}
              >
                {products.map((product) => (
                  <div
                    key={product.id}
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedProducts.includes(product.id) ? '#f0f9ff' : 'white',
                    }}
                    onClick={() => toggleProductSelection(product.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={() => {}}
                      style={{ cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', fontSize: '14px' }}>{product.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>SKU: {product.sku || 'N/A'}</div>
                    </div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e40af' }}>
                      GHS {(product.approvedPrice ?? 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '32px', fontSize: '14px', color: '#64748b' }}>
                <strong>{getSelectedProductsTotal()}</strong> product{getSelectedProductsTotal() !== 1 ? 's' : ''} selected
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#e2e8f0',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedProducts.length === 0}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: selectedProducts.length === 0 ? '#cbd5e1' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: selectedProducts.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Next: Review & Generate
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Review & Generate</h2>

              <div
                style={{
                  backgroundColor: '#f0f9ff',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  borderLeft: '4px solid #3b82f6',
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '16px' }}>{name}</strong>
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                  Mode: {generationMode === 'byCustomer' ? 'By Customer' : 'By Price Level'}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                  Valid Period: {formatDate(validFrom)}
                  {validUntil && ` - ${formatDate(validUntil)}`}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  <strong>{selectedProducts.length}</strong> products × <strong>{selectedListCount || 0}</strong> level{selectedListCount === 1 ? '' : 's'} =
                  <strong> {selectedProducts.length * (selectedListCount || 0)} total prices</strong> in <strong>1 list</strong>
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${420 + selectedRules.length * 220}px` }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '14px', borderRight: '1px solid #e2e8f0' }}>
                        Product
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '14px', borderRight: '1px solid #e2e8f0', backgroundColor: '#f1f5f9' }}>
                        Base Price
                      </th>
                      {selectedRules.map((rule) => (
                        <th
                          key={rule.id}
                          style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '14px', borderRight: '1px solid #e2e8f0' }}
                        >
                          {rule.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products
                      .filter((product) => selectedProducts.includes(product.id))
                      .map((product, idx) => {
                        const basePrice = Number(product.approvedPrice ?? 0);

                        return (
                          <tr key={product.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500', borderRight: '1px solid #e2e8f0' }}>
                              {product.name}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: '#64748b', borderRight: '1px solid #e2e8f0', backgroundColor: '#f1f5f9' }}>
                              GHS {basePrice.toFixed(2)}
                            </td>
                            {selectedRules.map((rule) => {
                              const adjustmentType = rule.adjustmentType || 'discount';
                              const adjustmentPercentage = Number(rule.adjustmentPercentage || 0);
                              const previewPrice = adjustmentType === 'markup'
                                ? Math.round(basePrice * (1 + adjustmentPercentage / 100) * 100) / 100
                                : Math.round(basePrice * (1 - adjustmentPercentage / 100) * 100) / 100;

                              return (
                                <td
                                  key={`${product.id}-${rule.id}`}
                                  style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '700', color: '#1e40af', borderRight: '1px solid #e2e8f0' }}
                                >
                                  GHS {previewPrice.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#e2e8f0',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleCreatePriceList}
                  disabled={isSubmitting}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: isSubmitting ? '#cbd5e1' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  {isSubmitting ? 'Creating...' : 'Create Price List'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="app-page-title">Price Lists</h1>
            <p className="app-page-subtitle">
              Create and manage approved-base price lists with level rules and customer overrides
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleExportPriceListsCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={handlePrintPriceLists}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} strokeWidth={2} />
              Print
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportPriceListsExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export Excel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsCreating(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} strokeWidth={2} />
              Create Price List
            </button>
          </div>
        </div>
      </div>

      <div className="app-page-content" style={{ paddingTop: '24px' }}>
        <div className="app-card" style={{ padding: '14px 16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <input
              className="app-control"
              type="text"
              placeholder="Search price lists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
            <select
              className="app-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | PriceList['status'])}
            >
              <option value="All">All Status</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
            <select
              className="app-control"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <option value="All">All Levels</option>
              {availableLevelFilters.map((levelName) => (
                <option key={levelName} value={levelName}>{levelName}</option>
              ))}
            </select>
            <select
              className="app-control"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as 'nameAsc' | 'nameDesc' | 'validFromDesc' | 'validFromAsc')}
            >
              <option value="validFromDesc">Valid From (Newest)</option>
              <option value="validFromAsc">Valid From (Oldest)</option>
              <option value="nameAsc">Name (A-Z)</option>
              <option value="nameDesc">Name (Z-A)</option>
            </select>
          </div>
        </div>

        {selectedPriceLists.size > 0 && (
          <div className="app-bulk-bar" style={{ marginBottom: '16px' }}>
            <div className="app-bulk-count-wrap">
              <span className="app-bulk-count">{selectedPriceLists.size} price list{selectedPriceLists.size !== 1 ? 's' : ''} selected</span>
            </div>
            <select
              className="app-control"
              value={bulkStatusValue}
              onChange={(e) => setBulkStatusValue(e.target.value as '' | PriceList['status'])}
              style={{ minWidth: '160px' }}
            >
              <option value="">Set Status...</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
            <button
              className="btn"
              onClick={handleBulkStatusUpdateSelectedPriceLists}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Update Status
            </button>
            <button
              className="btn btn-danger"
              onClick={handleBulkDeleteSelectedPriceLists}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Delete Selected
            </button>
            <button
              className="btn btn-success"
              onClick={handleBulkExportSelectedPriceListsCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export Selected CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedPriceLists(new Set())}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Clear
            </button>
          </div>
        )}

        <div
          className="app-card"
          style={{
            padding: '16px 18px',
            marginBottom: '16px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Expiry Reminders</h3>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Lists expiring within {expiryMonitor.thresholdDays} days
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[7, 14, 30, 60].map((days) => {
                const active = days === expiryThresholdDays;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleExpiryThresholdChange(days)}
                    disabled={isExpiryLoading}
                    style={{
                      border: '1px solid #cbd5e1',
                      backgroundColor: active ? '#2563eb' : 'white',
                      color: active ? 'white' : '#0f172a',
                      borderRadius: '9999px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isExpiryLoading ? 'not-allowed' : 'pointer',
                      opacity: isExpiryLoading ? 0.7 : 1,
                    }}
                  >
                    {days}d
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
              <span style={{ color: '#b91c1c' }}>Expired: {expiryMonitor.expiredCount}</span>
              <span style={{ color: '#b45309' }}>Critical: {expiryMonitor.criticalCount}</span>
              <span style={{ color: '#1d4ed8' }}>Upcoming: {expiryMonitor.warningCount}</span>
            </div>
          </div>

          {isExpiryLoading ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>Loading reminders...</div>
          ) : expiryMonitor.reminders.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              No price lists are expiring within {expiryMonitor.thresholdDays} days.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {expiryMonitor.reminders.slice(0, 6).map((reminder) => {
                const styles = getReminderStyles(reminder.severity);
                return (
                  <div
                    key={reminder.id}
                    style={{
                      border: `1px solid ${styles.border}`,
                      backgroundColor: styles.background,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            backgroundColor: styles.badgeBg,
                            color: 'white',
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {reminder.severity}
                        </span>
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>{reminder.name}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: styles.text, marginTop: '4px' }}>
                        {formatDaysRemaining(reminder.daysRemaining)} • {reminder.priceLevelName || '-'} • Valid until {formatDate(reminder.validUntil)}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleView(reminder.id)}
                      style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                    >
                      View List
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {priceLists.length === 0 ? (
          <div className="app-card" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><ClipboardList size={44} strokeWidth={1.8} /></div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No Price Lists Yet</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
              Create your first price list to generate customer-specific pricing
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setIsCreating(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} strokeWidth={2} />
              Create Price List
            </button>
          </div>
        ) : (
          <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700' }}>Saved Price Lists ({priceLists.length})</h2>
            </div>

            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'center', width: '48px' }}>
                    <input
                      type="checkbox"
                      checked={filteredSortedPriceLists.length > 0 && filteredSortedPriceLists.every((list) => selectedPriceLists.has(list.id))}
                      ref={(el) => {
                        if (el) {
                          const selectedVisible = filteredSortedPriceLists.filter((list) => selectedPriceLists.has(list.id)).length;
                          el.indeterminate = selectedVisible > 0 && selectedVisible < filteredSortedPriceLists.length;
                        }
                      }}
                      onChange={toggleSelectAllVisiblePriceLists}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Name</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Price Level</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Date Created</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Valid Until</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>Days to Expiry</th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>Status</th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSortedPriceLists.map((list) => (
                  <tr key={list.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedPriceLists.has(list.id)}
                        onChange={() => toggleSelectPriceList(list.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '500' }}>{list.name}</td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#64748b' }}>{getPriceLevelDisplayForList(list)}</td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#64748b' }}>{formatDate(list.createdAt)}</td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#64748b' }}>{list.validUntil ? formatDate(list.validUntil) : '-'}</td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#64748b' }}>{getDaysToExpiryDisplay(list.validUntil)}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>{getStatusBadge(list.status)}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleView(list.id)}
                          disabled={isViewLoading}
                          style={{ padding: '6px 12px', fontSize: '12px', opacity: isViewLoading ? 0.7 : 1 }}
                        >
                          View
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleOpenEdit(list)}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDelete(list.id)}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSortedPriceLists.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                      No price lists match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingList && (
        <div
          className="app-modal-overlay"
          onClick={() => setViewingList(null)}
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{viewingList.name}</h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {getPriceLevelDisplayForList(viewingList)} • {getStatusBadge(viewingList.status)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={handleExportViewingItemsCsv}
                  style={{
                    border: '1px solid #cbd5e1',
                    backgroundColor: 'white',
                    color: '#0f172a',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FileSpreadsheet size={13} strokeWidth={2} />
                  CSV
                </button>
                <button
                  onClick={handlePrintViewingList}
                  style={{
                    border: '1px solid #cbd5e1',
                    backgroundColor: 'white',
                    color: '#0f172a',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Printer size={13} strokeWidth={2} />
                  Print
                </button>
                <button
                  onClick={() => setViewingList(null)}
                  style={{
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ fontSize: '13px', color: '#475569', marginBottom: '10px' }}>
              Valid: {formatDate(viewingList.validFrom)}{viewingList.validUntil ? ` - ${formatDate(viewingList.validUntil)}` : ''}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px' }}>Product</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px' }}>Base Price</th>
                  {viewingLevelNames.map((levelName) => (
                    <th key={levelName} style={{ padding: '10px', textAlign: 'right', fontSize: '12px' }}>
                      {levelName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewingRowsByProduct.map((row) => (
                  <tr key={row.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontSize: '13px' }}>{row.productName}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px' }}>{Number(row.basePrice).toFixed(2)}</td>
                    {viewingLevelNames.map((levelName) => {
                      const levelItem = row.byLevel[levelName];
                      return (
                        <td key={`${row.productId}-${levelName}`} style={{ padding: '10px', textAlign: 'right', fontSize: '13px', fontWeight: 700 }}>
                          {levelItem ? (
                            <span>{Number(levelItem.finalPrice).toFixed(2)}</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {viewingItems.length === 0 && (
                  <tr>
                    <td colSpan={2 + viewingLevelNames.length} style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No price list items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingList && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '10px',
              width: 'min(560px, 96vw)',
              padding: '22px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '20px', fontWeight: 700 }}>Edit Price List</h2>

            {editingList.customerId == null && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Price Levels</label>
                <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={selectAllEditPriceLevels}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllEditPriceLevels}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}
                >
                  {activePriceRules.map((rule) => (
                    <label
                      key={rule.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        backgroundColor: editSelectedPriceLevelIds.includes(rule.id) ? '#eff6ff' : 'white',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={editSelectedPriceLevelIds.includes(rule.id)}
                        onChange={() => toggleEditPriceLevelSelection(rule.id)}
                      />
                      <span style={{ fontSize: '14px' }}>{rule.name}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155' }}>
                  {editSelectedPriceLevelIds.length} price level{editSelectedPriceLevelIds.length !== 1 ? 's' : ''} selected
                </div>
              </div>
            )}

            {editingList.customerId != null && (
              <div style={{ marginBottom: '14px', fontSize: '12px', color: '#64748b' }}>
                This customer-specific list uses the customer price level and cannot switch levels here.
              </div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Valid From</label>
                  <input
                    type="date"
                    value={editValidFrom}
                    onChange={(e) => setEditValidFrom(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Valid Until</label>
                  <input
                    type="date"
                    value={editValidUntil}
                    onChange={(e) => setEditValidUntil(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as PriceList['status'])}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                onClick={() => setEditingList(null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isSavingEdit ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  cursor: isSavingEdit ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
