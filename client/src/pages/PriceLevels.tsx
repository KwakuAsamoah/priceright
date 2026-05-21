import * as XLSX from 'xlsx';
import { useEffect, useMemo, useState } from 'react';
import { useFormState } from '../context/FormStateContext';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronRight, Download, Pencil, Plus, Tag, Trash2, X, XCircle, Clock3, CheckCircle2 } from 'lucide-react';
import {
  activityLogApi,
  priceLevelItemsApi,
  priceLevelRulesApi,
  productsApi,
  type ActivityEntry,
  type PriceLevelItemResponse,
  type ProductRecord,
} from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import OverflowMenu from '../components/OverflowMenu';
import { useDemoMode } from '../context/DemoModeContext';
import useAppToast from '../hooks/useAppToast';

type PriceLevelRule = {
  id: number;
  name: string;
  adjustmentType?: 'discount' | 'markup';
  adjustmentPercentage?: number;
  description?: string | null;
  isActive?: boolean;
};

type OverrideType = 'rule_discount' | 'rule_markup' | 'custom_price';

type RowDraft = {
  overrideType: OverrideType;
  value: string;
  justification: string;
};

type WizardRuleDraft = {
  overrideType: OverrideType;
  value: string;
  justification: string;
};

type WizardStep = 1 | 2 | 3 | 4;

type ExportRow = {
  productId: number;
  productName: string;
  category: string;
  approvedBasePrice: number;
  finalPrice: number;
  marginPercent: number;
  adjustmentLabel: string;
};

const MIN_MARGIN_WARNING = 15;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return `GHS ${toNumber(value).toFixed(2)}`;
}

function parseDraftValue(raw: string): number | null {
  if (!raw.trim()) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeFinalPrice(overrideType: OverrideType, value: number, approvedBasePrice: number): number {
  if (overrideType === 'custom_price') {
    return roundToTwo(value);
  }
  if (overrideType === 'rule_discount') {
    return roundToTwo(approvedBasePrice * (1 - (value / 100)));
  }
  return roundToTwo(approvedBasePrice * (1 + (value / 100)));
}

function computeMarginPercent(finalPrice: number, productionCost: number): number {
  if (finalPrice <= 0) {
    return 0;
  }
  return ((finalPrice - productionCost) / finalPrice) * 100;
}

function marginTone(margin: number): 'success' | 'warning' | 'danger' {
  if (margin >= 15) return 'success';
  if (margin >= 10) return 'warning';
  return 'danger';
}

function itemStatusVariant(status: PriceLevelItemResponse['status']): 'pending' | 'approved' | 'rejected' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function levelStatus(items: PriceLevelItemResponse[]): { label: string; variant: 'success' | 'warning' | 'muted' } {
  if (items.length === 0) {
    return { label: 'No products', variant: 'muted' };
  }
  if (items.some((item) => item.status === 'pending')) {
    return { label: 'Pending approval', variant: 'warning' };
  }
  return { label: 'Active', variant: 'success' };
}

function pricingRuleLabel(item: PriceLevelItemResponse): string {
  if (item.overrideType === 'custom_price') {
    return `${formatMoney(item.customPrice ?? 0)} (fixed)`;
  }
  if (item.overrideType === 'rule_markup') {
    return `Markup ${toNumber(item.adjustmentPercentage).toFixed(2)}%`;
  }
  return `Discount ${toNumber(item.adjustmentPercentage).toFixed(2)}%`;
}

function draftFromItem(item: PriceLevelItemResponse): RowDraft {
  if (item.overrideType === 'custom_price') {
    return {
      overrideType: 'custom_price',
      value: String(toNumber(item.customPrice, 0)),
      justification: item.justification || '',
    };
  }
  return {
    overrideType: item.overrideType,
    value: String(toNumber(item.adjustmentPercentage, 0)),
    justification: item.justification || '',
  };
}

function findProductionCost(product: ProductRecord): number {
  const record = product as ProductRecord & {
    totalCost?: number;
    materialCost?: number;
    overheadCost?: number;
    optimalPrice?: number;
  };
  const candidate = toNumber(record.totalCost, NaN);
  if (Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  return toNumber(record.materialCost, 0) + toNumber(record.overheadCost, 0);
}

function formatDateForMeta(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateForFilename(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getAdjustmentLabel(item: PriceLevelItemResponse) {
  if (item.overrideType === 'custom_price') {
    return 'Custom';
  }

  const percentage = toNumber(item.adjustmentPercentage, 0).toFixed(2);
  return item.overrideType === 'rule_markup' ? `+${percentage}%` : `-${percentage}%`;
}

function sanitizeExportFilename(levelName: string, date: Date) {
  const safeLevelName = levelName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
  return `${safeLevelName || 'price-level'}-price-list-${formatDateForFilename(date)}.xlsx`;
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - unixSeconds;

  if (delta < 60) return 'just now';
  if (delta < 3600) {
    const minutes = Math.floor(delta / 60);
    return `${minutes}m ago`;
  }
  if (delta < 86400) {
    const hours = Math.floor(delta / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(delta / 86400);
  return `${days}d ago`;
}

function describeLevelActivity(entry: ActivityEntry): string {
  const details = (entry.details || {}) as Record<string, unknown>;

  if (entry.action === 'price_level.created') {
    return `Price level ${entry.entityName || details.levelName || ''} created`;
  }
  if (entry.action === 'price_level.deleted') {
    return `Price level ${entry.entityName || details.levelName || ''} deleted`;
  }
  if (entry.action === 'price_level_item.approved') {
    return `${String(details.productName || entry.entityName || 'Item')} approved (${String(details.levelName || 'Level')})`;
  }
  if (entry.action === 'price_level_item.rejected') {
    return `${String(details.productName || entry.entityName || 'Item')} rejected (${String(details.levelName || 'Level')})`;
  }
  if (entry.action === 'price_level_item.bulk_approved') {
    return `${Number(details.count || 0)} items bulk approved (${String(details.levelName || 'Level')})`;
  }

  return entry.action;
}

function levelActivityIcon(action: string) {
  if (action.endsWith('approved')) return { Icon: CheckCircle2, color: '#16a34a' };
  if (action.endsWith('rejected') || action.endsWith('deleted')) return { Icon: XCircle, color: '#dc2626' };
  return { Icon: Clock3, color: '#64748b' };
}

export default function PriceLevels() {
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { isDemoMode } = useDemoMode();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [levels, setLevels] = useState<PriceLevelRule[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [itemsByLevel, setItemsByLevel] = useState<Record<number, PriceLevelItemResponse[]>>({});

  const [searchLevels, setSearchLevels] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);

  const [editingLevelName, setEditingLevelName] = useState(false);
  const [levelNameDraft, setLevelNameDraft] = useState('');

  const [editingItemProductId, setEditingItemProductId] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState<RowDraft>({
    overrideType: 'rule_discount',
    value: '0',
    justification: '',
  });

  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<number>>(new Set());

  const [showAddProductsModal, setShowAddProductsModal] = useState(false);
  const [addProductsSearch, setAddProductsSearch] = useState('');
  const [selectedAddProductIds, setSelectedAddProductIds] = useState<Set<number>>(new Set());

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardSearchProducts, setWizardSearchProducts] = useState('');
  const [wizardSelectedProductIds, setWizardSelectedProductIds] = useState<Set<number>>(new Set());
  const [wizardRules, setWizardRules] = useState<Record<number, WizardRuleDraft>>({});
  const [wizardApplyAllType, setWizardApplyAllType] = useState<OverrideType>('rule_discount');
  const [wizardApplyAllValue, setWizardApplyAllValue] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const { setHasOpenForm } = useFormState();

  useEffect(() => {
    setHasOpenForm(showAddProductsModal || showWizard || showExportModal);
  }, [showAddProductsModal, showWizard, showExportModal, setHasOpenForm]);

  useEffect(() => {
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  const [selectedExportProductIds, setSelectedExportProductIds] = useState<Set<number>>(new Set());
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
  const [recentActivityOpen, setRecentActivityOpen] = useState(false);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(false);
  const [includeCompanyName, setIncludeCompanyName] = useState(true);
  const [exportCompanyName, setExportCompanyName] = useState('');
  const [includeGeneratedDate, setIncludeGeneratedDate] = useState(true);
  const [includeValidUntil, setIncludeValidUntil] = useState(true);
  const [exportValidUntil, setExportValidUntil] = useState('');

  const selectedLevel = useMemo(
    () => levels.find((level) => level.id === selectedLevelId) ?? null,
    [levels, selectedLevelId]
  );

  const selectedLevelItems = useMemo(
    () => (selectedLevelId == null ? [] : (itemsByLevel[selectedLevelId] ?? [])),
    [itemsByLevel, selectedLevelId]
  );

  const approvedSelectedLevelItems = useMemo(
    () => selectedLevelItems.filter((item) => item.status === 'approved'),
    [selectedLevelItems]
  );

  const exportRows = useMemo<ExportRow[]>(() => {
    return approvedSelectedLevelItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      category: item.productCategory || '-',
      approvedBasePrice: toNumber(item.productApprovedPrice, 0),
      finalPrice: toNumber(item.finalPrice, 0),
      marginPercent: computeMarginPercent(toNumber(item.finalPrice, 0), toNumber(item.productProductionCost, 0)),
      adjustmentLabel: getAdjustmentLabel(item),
    }));
  }, [approvedSelectedLevelItems]);

  const selectedExportRows = useMemo(
    () => exportRows.filter((row) => selectedExportProductIds.has(row.productId)),
    [exportRows, selectedExportProductIds]
  );

  const approvedProducts = useMemo(
    () => products.filter((product) => product.approvalStatus === 'approved'),
    [products]
  );

  const filteredLevels = useMemo(() => {
    const query = searchLevels.trim().toLowerCase();
    if (!query) {
      return levels;
    }
    return levels.filter((level) => level.name.toLowerCase().includes(query));
  }, [levels, searchLevels]);

  const addProductsRows = useMemo(() => {
    const query = addProductsSearch.trim().toLowerCase();
    const existing = new Set(selectedLevelItems.map((item) => item.productId));
    return approvedProducts
      .filter((product) => {
        if (!query) return true;
        return (
          product.name.toLowerCase().includes(query)
          || String(product.category || '').toLowerCase().includes(query)
        );
      })
      .map((product) => ({ product, alreadyAdded: existing.has(product.id) }));
  }, [approvedProducts, addProductsSearch, selectedLevelItems]);

  const wizardProducts = useMemo(() => {
    const query = wizardSearchProducts.trim().toLowerCase();
    return approvedProducts.filter((product) => {
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query)
        || String(product.category || '').toLowerCase().includes(query)
      );
    });
  }, [approvedProducts, wizardSearchProducts]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [levelsResponse, productsResponse] = await Promise.all([
        priceLevelRulesApi.getAll() as Promise<PriceLevelRule[]>,
        productsApi.getAll('all') as Promise<ProductRecord[]>,
      ]);

      const safeLevels = Array.isArray(levelsResponse) ? levelsResponse : [];
      setLevels(safeLevels);
      setProducts(Array.isArray(productsResponse) ? productsResponse : []);

      const summaryPairs = await Promise.all(
        safeLevels.map(async (level) => {
          try {
            const items = await priceLevelItemsApi.getAll(level.id);
            return [level.id, items] as [number, PriceLevelItemResponse[]];
          } catch {
            return [level.id, [] as PriceLevelItemResponse[]] as [number, PriceLevelItemResponse[]];
          }
        })
      );

      const nextItems: Record<number, PriceLevelItemResponse[]> = {};
      for (const [id, items] of summaryPairs) {
        nextItems[id] = items;
      }
      setItemsByLevel(nextItems);

      setSelectedLevelId((current) => {
        if (current != null && safeLevels.some((level) => level.id === current)) {
          return current;
        }
        return safeLevels.length > 0 ? safeLevels[0].id : null;
      });
    } catch (error) {
      console.error('Failed to load price level data:', error);
      showToastMessage('Failed to load price levels data.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshLevelItems(levelId: number) {
    try {
      const items = await priceLevelItemsApi.getAll(levelId);
      setItemsByLevel((prev) => ({ ...prev, [levelId]: items }));
      setSelectedRows(new Set());
      return items;
    } catch (error) {
      console.error('Failed to load level items:', error);
      showToastMessage('Failed to refresh price level items.', 'error');
      return [];
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedLevel) {
      setLevelNameDraft(selectedLevel.name);
      setEditingLevelName(false);
      setEditingItemProductId(null);
      setSelectedRows(new Set());
      setRecentActivityOpen(false);
    }
  }, [selectedLevelId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentActivity() {
      if (!selectedLevel) {
        setRecentActivity([]);
        return;
      }

      setRecentActivityLoading(true);
      try {
        const [levelResponse, itemResponse] = await Promise.all([
          activityLogApi.getAll({ entityType: 'price_level', limit: 10, offset: 0 }),
          activityLogApi.getAll({ entityType: 'price_level_item', limit: 10, offset: 0 }),
        ]);

        if (cancelled) return;

        const selectedName = selectedLevel.name.toLowerCase();
        const levelRows = (levelResponse.entries || []).filter((entry) => (
          Number(entry.entityId) === selectedLevel.id || String(entry.entityName || '').toLowerCase() === selectedName
        ));

        const itemRows = (itemResponse.entries || []).filter((entry) => {
          const details = (entry.details || {}) as Record<string, unknown>;
          const detailLevelName = String(details.levelName || '').toLowerCase();
          const entryEntityName = String(entry.entityName || '').toLowerCase();

          return detailLevelName === selectedName
            || (entry.action === 'price_level_item.bulk_approved' && Number(entry.entityId) === selectedLevel.id)
            || entryEntityName === selectedName;
        });

        const merged = [...levelRows, ...itemRows]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5);

        setRecentActivity(merged);
      } catch {
        if (!cancelled) {
          setRecentActivity([]);
        }
      } finally {
        if (!cancelled) {
          setRecentActivityLoading(false);
        }
      }
    }

    loadRecentActivity();

    return () => {
      cancelled = true;
    };
  }, [selectedLevel]);

  function openInlineEdit(item: PriceLevelItemResponse) {
    setEditingItemProductId(item.productId);
    setRowDraft(draftFromItem(item));
  }

  function closeInlineEdit() {
    setEditingItemProductId(null);
    setRowDraft({ overrideType: 'rule_discount', value: '0', justification: '' });
  }

  async function saveInlineEdit(item: PriceLevelItemResponse) {
    if (!selectedLevel) return;

    const numericValue = parseDraftValue(rowDraft.value);
    if (numericValue == null || numericValue < 0) {
      showToastMessage('Enter a valid non-negative value.', 'error');
      return;
    }

    const approvedBasePrice = toNumber(item.productApprovedPrice);
    const productionCost = toNumber(item.productProductionCost);
    const finalPrice = computeFinalPrice(rowDraft.overrideType, numericValue, approvedBasePrice);

    if (finalPrice <= productionCost) {
      showToastMessage('Final price is below production cost. Save blocked.', 'error');
      return;
    }

    const margin = computeMarginPercent(finalPrice, productionCost);
    if (margin < MIN_MARGIN_WARNING && !rowDraft.justification.trim()) {
      showToastMessage('Justification is required when margin is below 15%.', 'error');
      return;
    }

    setSaving(true);
    try {
      await priceLevelItemsApi.upsert(selectedLevel.id, {
        productId: item.productId,
        overrideType: rowDraft.overrideType,
        adjustmentPercentage: rowDraft.overrideType === 'custom_price' ? undefined : numericValue,
        customPrice: rowDraft.overrideType === 'custom_price' ? numericValue : undefined,
        justification: rowDraft.justification.trim() || undefined,
      });
      await refreshLevelItems(selectedLevel.id);
      closeInlineEdit();
      showToastMessage('Price rule saved. Status reset to pending.', 'success');
    } catch (error) {
      console.error('Failed to save item:', error);
      showToastMessage((error as Error).message || 'Failed to save price rule.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveItem(productId: number) {
    if (!selectedLevel) return;
    setSaving(true);
    try {
      await priceLevelItemsApi.approve(selectedLevel.id, productId, 'user');
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Item approved.', 'success');
    } catch (error) {
      console.error('Failed to approve item:', error);
      showToastMessage((error as Error).message || 'Failed to approve item.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rejectItem(productId: number) {
    if (!selectedLevel) return;
    const reason = window.prompt('Enter rejection reason');
    if (!reason || !reason.trim()) {
      return;
    }
    setSaving(true);
    try {
      await priceLevelItemsApi.reject(selectedLevel.id, productId, {
        approvedBy: 'user',
        justification: reason.trim(),
      });
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Item rejected.', 'success');
    } catch (error) {
      console.error('Failed to reject item:', error);
      showToastMessage((error as Error).message || 'Failed to reject item.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(productId: number) {
    if (!selectedLevel) return;
    if (!window.confirm('Remove this product from the price level?')) {
      return;
    }
    setSaving(true);
    try {
      await priceLevelItemsApi.delete(selectedLevel.id, productId);
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Product removed from price level.', 'success');
    } catch (error) {
      console.error('Failed to remove item:', error);
      showToastMessage((error as Error).message || 'Failed to remove item.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveSelected() {
    if (!selectedLevel || selectedRows.size === 0) return;

    setSaving(true);
    try {
      await Promise.all(
        selectedLevelItems
          .filter((item) => selectedRows.has(item.productId) && item.status === 'pending')
          .map((item) => priceLevelItemsApi.approve(selectedLevel.id, item.productId, 'user'))
      );
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Selected pending rows approved.', 'success');
    } catch (error) {
      console.error('Failed to approve selected:', error);
      showToastMessage((error as Error).message || 'Failed to approve selected rows.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveAllPending() {
    if (!selectedLevel) return;
    setSaving(true);
    try {
      const result = await priceLevelItemsApi.bulkApprove(selectedLevel.id, 'user');
      await refreshLevelItems(selectedLevel.id);
      showToastMessage(`Approved ${toNumber(result.approved)} pending items.`, 'success');
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      showToastMessage((error as Error).message || 'Failed to approve pending items.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleRowSelection(productId: number, checked: boolean) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }

  function toggleSelectAllRows(checked: boolean) {
    if (!checked) {
      setSelectedRows(new Set());
      return;
    }
    const next = new Set(selectedLevelItems.map((item) => item.productId));
    setSelectedRows(next);
  }

  async function saveLevelName() {
    if (!selectedLevel) return;
    const nextName = levelNameDraft.trim();
    if (!nextName) return;

    setSaving(true);
    try {
      await priceLevelRulesApi.update(selectedLevel.id, {
        name: nextName,
        adjustmentType: selectedLevel.adjustmentType || 'discount',
        adjustmentPercentage: toNumber(selectedLevel.adjustmentPercentage, 0),
        description: selectedLevel.description || undefined,
      });
      setLevels((prev) => prev.map((level) => (level.id === selectedLevel.id ? { ...level, name: nextName } : level)));
      setEditingLevelName(false);
      showToastMessage('Price level name updated.', 'success');
    } catch (error) {
      console.error('Failed to rename price level:', error);
      showToastMessage((error as Error).message || 'Failed to update name.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLevel() {
    if (!selectedLevel) return;
    if (!window.confirm(`Delete price level "${selectedLevel.name}"?`)) {
      return;
    }

    setSaving(true);
    try {
      await priceLevelRulesApi.delete(selectedLevel.id);
      setLevels((prev) => prev.filter((level) => level.id !== selectedLevel.id));
      setItemsByLevel((prev) => {
        const { [selectedLevel.id]: _removed, ...rest } = prev;
        return rest;
      });
      const remaining = levels.filter((level) => level.id !== selectedLevel.id);
      setSelectedLevelId(remaining.length > 0 ? remaining[0].id : null);
      setSelectedLevelIds((prev) => { const next = new Set(prev); next.delete(selectedLevel.id); return next; });
      showToastMessage('Price level deleted.', 'success');
    } catch (error) {
      console.error('Failed to delete level:', error);
      showToastMessage((error as Error).message || 'Failed to delete level.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleSelectAllLevels() {
    if (selectedLevelIds.size === filteredLevels.length && filteredLevels.length > 0) {
      setSelectedLevelIds(new Set());
    } else {
      setSelectedLevelIds(new Set(filteredLevels.map((l) => l.id)));
    }
  }

  function handleToggleLevelSelection(id: number) {
    setSelectedLevelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBulkDeleteLevels() {
    if (selectedLevelIds.size === 0) return;
    const count = selectedLevelIds.size;
    if (!window.confirm(`Delete ${count} price level${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    setSaving(true);
    try {
      await Promise.all([...selectedLevelIds].map((id) => priceLevelRulesApi.delete(id)));
      setLevels((prev) => prev.filter((l) => !selectedLevelIds.has(l.id)));
      setItemsByLevel((prev) => {
        const next = { ...prev };
        for (const id of selectedLevelIds) {
          delete next[id];
        }
        return next;
      });
      if (selectedLevelId !== null && selectedLevelIds.has(selectedLevelId)) {
        const remaining = levels.filter((l) => !selectedLevelIds.has(l.id));
        setSelectedLevelId(remaining.length > 0 ? remaining[0].id : null);
      }
      setSelectedLevelIds(new Set());
      showToastMessage(`Deleted ${count} price level${count !== 1 ? 's' : ''}.`, 'success');
    } catch (error) {
      console.error('Failed to bulk delete levels:', error);
      showToastMessage((error as Error).message || 'Failed to delete selected price levels.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openAddProductsModal() {
    setSelectedAddProductIds(new Set());
    setAddProductsSearch('');
    setShowAddProductsModal(true);
  }

  function toggleSelectAllProductsForAdd(checked: boolean) {
    if (!checked) {
      setSelectedAddProductIds(new Set());
      return;
    }
    const allSelectable = addProductsRows
      .filter((row) => !row.alreadyAdded)
      .map((row) => row.product.id);
    setSelectedAddProductIds(new Set(allSelectable));
  }

  async function addSelectedProducts() {
    if (!selectedLevel || selectedAddProductIds.size === 0) return;

    setSaving(true);
    try {
      await Promise.all(
        [...selectedAddProductIds].map((productId) => priceLevelItemsApi.upsert(selectedLevel.id, {
          productId,
          overrideType: 'rule_discount',
          adjustmentPercentage: 0,
        }))
      );
      await refreshLevelItems(selectedLevel.id);
      setShowAddProductsModal(false);
      showToastMessage(`Added ${selectedAddProductIds.size} products.`, 'success');
    } catch (error) {
      console.error('Failed to add products:', error);
      showToastMessage((error as Error).message || 'Failed to add products.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetWizardState() {
    setWizardStep(1);
    setWizardName('');
    setWizardSearchProducts('');
    setWizardSelectedProductIds(new Set());
    setWizardRules({});
    setWizardApplyAllType('rule_discount');
    setWizardApplyAllValue('');
  }

  function openWizard() {
    resetWizardState();
    setShowWizard(true);
  }

  function cancelWizard() {
    const hasData = wizardName.trim() || wizardSelectedProductIds.size > 0 || Object.keys(wizardRules).length > 0;
    if (hasData && !window.confirm('Discard current wizard progress?')) {
      return;
    }
    setShowWizard(false);
    resetWizardState();
  }

  function ensureWizardRule(productId: number) {
    setWizardRules((prev) => {
      if (prev[productId]) {
        return prev;
      }
      return {
        ...prev,
        [productId]: {
          overrideType: 'rule_discount',
          value: '',
          justification: '',
        },
      };
    });
  }

  function updateWizardRule(productId: number, patch: Partial<WizardRuleDraft>) {
    setWizardRules((prev) => ({
      ...prev,
      [productId]: {
        overrideType: prev[productId]?.overrideType || 'rule_discount',
        value: prev[productId]?.value || '',
        justification: prev[productId]?.justification || '',
        ...patch,
      },
    }));
  }

  function toggleWizardProduct(productId: number, checked: boolean) {
    setWizardSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
    if (checked) {
      ensureWizardRule(productId);
    }
  }

  function toggleWizardSelectAll(checked: boolean) {
    if (!checked) {
      setWizardSelectedProductIds(new Set());
      return;
    }
    const allIds = wizardProducts.map((product) => product.id);
    setWizardSelectedProductIds(new Set(allIds));
    for (const id of allIds) {
      ensureWizardRule(id);
    }
  }

  function applySameRuleToAll() {
    const value = parseDraftValue(wizardApplyAllValue);
    if (value == null || value < 0) {
      showToastMessage('Enter a valid value before applying to all.', 'error');
      return;
    }

    setWizardRules((prev) => {
      const next: Record<number, WizardRuleDraft> = { ...prev };
      for (const productId of wizardSelectedProductIds) {
        next[productId] = {
          overrideType: wizardApplyAllType,
          value: String(value),
          justification: next[productId]?.justification || '',
        };
      }
      return next;
    });
  }

  const wizardSelectedProducts = useMemo(
    () => products.filter((product) => wizardSelectedProductIds.has(product.id)),
    [products, wizardSelectedProductIds]
  );

  const wizardStep3Validation = useMemo(() => {
    let hasMissingValue = false;
    let hasBelowCost = false;

    for (const product of wizardSelectedProducts) {
      const rule = wizardRules[product.id];
      const numericValue = parseDraftValue(rule?.value || '');
      if (numericValue == null || numericValue < 0) {
        hasMissingValue = true;
        continue;
      }

      const approvedBase = toNumber(product.approvedPrice, 0);
      const productionCost = findProductionCost(product);
      const overrideType = rule?.overrideType || 'rule_discount';
      const finalPrice = computeFinalPrice(overrideType, numericValue, approvedBase);
      if (finalPrice <= productionCost) {
        hasBelowCost = true;
      }
    }

    return {
      hasMissingValue,
      hasBelowCost,
      isValid: !hasMissingValue && !hasBelowCost,
    };
  }, [wizardSelectedProducts, wizardRules]);

  const wizardLowMarginCount = useMemo(() => {
    let count = 0;
    for (const product of wizardSelectedProducts) {
      const rule = wizardRules[product.id];
      const numericValue = parseDraftValue(rule?.value || '');
      if (numericValue == null || numericValue < 0) {
        continue;
      }
      const approvedBase = toNumber(product.approvedPrice, 0);
      const productionCost = findProductionCost(product);
      const overrideType = rule?.overrideType || 'rule_discount';
      const finalPrice = computeFinalPrice(overrideType, numericValue, approvedBase);
      const margin = computeMarginPercent(finalPrice, productionCost);
      if (margin < MIN_MARGIN_WARNING) {
        count += 1;
      }
    }
    return count;
  }, [wizardSelectedProducts, wizardRules]);

  async function createPriceLevelFromWizard() {
    const name = wizardName.trim();
    if (!name) {
      showToastMessage('Price level name is required.', 'error');
      return;
    }
    if (wizardSelectedProducts.length === 0) {
      showToastMessage('Select at least one product.', 'error');
      return;
    }

    for (const product of wizardSelectedProducts) {
      const rule = wizardRules[product.id];
      const numericValue = parseDraftValue(rule?.value || '');
      if (numericValue == null || numericValue < 0) {
        showToastMessage(`Missing value for ${product.name}.`, 'error');
        return;
      }

      const approvedBase = toNumber(product.approvedPrice, 0);
      const productionCost = findProductionCost(product);
      const finalPrice = computeFinalPrice(rule.overrideType, numericValue, approvedBase);
      const margin = computeMarginPercent(finalPrice, productionCost);

      if (finalPrice <= productionCost) {
        showToastMessage(`Final price for ${product.name} is below cost.`, 'error');
        return;
      }

      if (margin < MIN_MARGIN_WARNING && !rule.justification.trim()) {
        showToastMessage(`Justification is required for ${product.name} because margin is below 15%.`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const created = await priceLevelRulesApi.create({
        name,
        adjustmentType: 'discount',
        adjustmentPercentage: 0,
      }) as PriceLevelRule;

      const newLevelId = toNumber((created as PriceLevelRule).id, 0);
      if (!newLevelId) {
        throw new Error('Failed to read created price level id.');
      }

      await Promise.all(
        wizardSelectedProducts.map((product) => {
          const rule = wizardRules[product.id];
          const numericValue = parseDraftValue(rule.value)!;
          return priceLevelItemsApi.upsert(newLevelId, {
            productId: product.id,
            overrideType: rule.overrideType,
            adjustmentPercentage: rule.overrideType === 'custom_price' ? undefined : numericValue,
            customPrice: rule.overrideType === 'custom_price' ? numericValue : undefined,
            justification: rule.justification.trim() || undefined,
          });
        })
      );

      setShowWizard(false);
      resetWizardState();
      await loadInitialData();
      setSelectedLevelId(newLevelId);
      showToastMessage(`Price level created. ${wizardSelectedProducts.length} prices pending approval.`, 'success');
    } catch (error) {
      console.error('Failed to create price level:', error);
      showToastMessage((error as Error).message || 'Failed to create price level.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openExportModal() {
    const approvedIds = approvedSelectedLevelItems.map((item) => item.productId);
    setSelectedExportProductIds(new Set(approvedIds));
    setIncludeCompanyName(true);
    setExportCompanyName(isDemoMode ? 'Savanna' : '');
    setIncludeGeneratedDate(true);
    setIncludeValidUntil(true);
    setExportValidUntil('');
    setShowExportModal(true);
  }

  function toggleExportProduct(productId: number, checked: boolean) {
    setSelectedExportProductIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }

  function toggleExportSelectAll(selectAll: boolean) {
    if (!selectAll) {
      setSelectedExportProductIds(new Set());
      return;
    }
    setSelectedExportProductIds(new Set(exportRows.map((row) => row.productId)));
  }

  function exportSelectedRowsToExcel() {
    if (!selectedLevel || selectedExportRows.length === 0) {
      return;
    }

    const now = new Date();
    const metadataLine = [
      includeGeneratedDate ? `Generated on: ${formatDateForMeta(now)}` : '',
      includeValidUntil && exportValidUntil ? `Valid until: ${exportValidUntil}` : '',
    ].filter(Boolean).join('   |   ');

    const worksheet = XLSX.utils.aoa_to_sheet([
      [includeCompanyName ? exportCompanyName.trim() : ''],
      [`Price List: ${selectedLevel.name}`],
      [metadataLine],
      [],
      ['#', 'Product Name', 'Category', 'Approved Base Price', 'Final Price', 'Margin %'],
      ...selectedExportRows.map((row, index) => ([
        index + 1,
        row.productName,
        row.category,
        row.approvedBasePrice,
        row.finalPrice,
        row.marginPercent / 100,
      ])),
      [],
      ['Prepared in PriceRight'],
    ]);

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 18 },
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
    ];

    const footerRowIndex = selectedExportRows.length + 7;
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      { s: { r: footerRowIndex, c: 0 }, e: { r: footerRowIndex, c: 5 } },
    ];

    const centerStyle = { alignment: { horizontal: 'center', vertical: 'center' } };
    const headerFill = { fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } }, font: { color: { rgb: 'FFFFFF' }, bold: true } };

    ['A1', 'A2', 'A3', `A${footerRowIndex + 1}`].forEach((cellRef) => {
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = centerStyle as any;
      }
    });

    if (worksheet.A1) {
      worksheet.A1.s = { ...centerStyle, font: { bold: true, sz: 16 } } as any;
    }
    if (worksheet.A2) {
      worksheet.A2.s = { ...centerStyle, font: { bold: true, sz: 12 } } as any;
    }
    if (worksheet.A3) {
      worksheet.A3.s = { ...centerStyle, font: { italic: true, color: { rgb: '475569' } } } as any;
    }
    if (worksheet[`A${footerRowIndex + 1}`]) {
      worksheet[`A${footerRowIndex + 1}`].s = { ...centerStyle, font: { italic: true, color: { rgb: '64748B' } } } as any;
    }

    for (let col = 0; col < 6; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: 4, c: col });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = headerFill as any;
      }
    }

    for (let rowIndex = 0; rowIndex < selectedExportRows.length; rowIndex += 1) {
      const excelRow = rowIndex + 6;
      const basePriceCell = `D${excelRow}`;
      const finalPriceCell = `E${excelRow}`;
      const marginCell = `F${excelRow}`;
      if (worksheet[basePriceCell]) worksheet[basePriceCell].z = '#,##0.00';
      if (worksheet[finalPriceCell]) worksheet[finalPriceCell].z = '#,##0.00';
      if (worksheet[marginCell]) worksheet[marginCell].z = '0.0%';
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Price List');
    XLSX.writeFile(workbook, sanitizeExportFilename(selectedLevel.name, now));
  }

  function exportSelectedRowsToPdf() {
    if (!selectedLevel || selectedExportRows.length === 0) {
      return;
    }

    const now = new Date();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToastMessage('Allow pop-ups to print the price list PDF.', 'error');
      return;
    }

    const metadata = [
      includeGeneratedDate ? `Generated on: ${formatDateForMeta(now)}` : '',
      includeValidUntil && exportValidUntil ? `Valid until: ${exportValidUntil}` : '',
    ].filter(Boolean).join(' | ');

    const rowsHtml = selectedExportRows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${row.productName}</td>
            <td>${row.category}</td>
            <td style="text-align:right;">${row.approvedBasePrice.toFixed(2)}</td>
            <td style="text-align:right;">${row.finalPrice.toFixed(2)}</td>
            <td style="text-align:right;">${row.marginPercent.toFixed(1)}%</td>
          </tr>
        `,
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${selectedLevel.name} Price List</title>
          <style>
            body { font-family: 'Open Sans', sans-serif; margin: 28px; color: #0f172a; }
            h1, h2, p { text-align: center; margin-left: auto; margin-right: auto; }
            h1 { margin: 0 0 8px; font-size: 25px; }
            h2 { margin: 0 0 6px; font-size: 17px; font-weight: 700; color: #1e293b; }
            p { margin: 0 0 20px; font-size: 13px; color: #475569; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 13px; text-align: left; }
            th { background: #0f172a; color: #ffffff; }
            tfoot td { padding-top: 16px; border: none; text-align: center; color: #64748b; font-style: italic; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>${includeCompanyName ? exportCompanyName.trim() : ''}</h1>
          <h2>Price List: ${selectedLevel.name}</h2>
          <p>${metadata}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th style="text-align:right;">Approved Base Price</th>
                <th style="text-align:right;">Final Price</th>
                <th style="text-align:right;">Margin %</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="6">Prepared in PriceRight</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  const allRowsSelected = selectedLevelItems.length > 0 && selectedRows.size === selectedLevelItems.length;

  if (loading) {
    return <div className="app-page" style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Price levels</h1>
          <div className="app-page-subtitle">Manage level-specific product pricing and approval workflow.</div>
        </div>
        <AppButton variant="primary" onClick={openWizard} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} strokeWidth={2} />
          New price level
        </AppButton>
      </div>

      <div className="app-page-content" style={{ gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: '16px', minHeight: '540px', alignItems: 'start' }}>
          <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={selectedLevelIds.size === filteredLevels.length && filteredLevels.length > 0}
                  ref={(el) => { if (el) el.indeterminate = selectedLevelIds.size > 0 && selectedLevelIds.size < filteredLevels.length; }}
                  onChange={handleSelectAllLevels}
                  style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                  title="Select all"
                />
                <input
                  value={searchLevels}
                  onChange={(e) => setSearchLevels(e.target.value)}
                  placeholder="Search price levels..."
                  style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px' }}
                />
              </div>
              {selectedLevelIds.size > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1a1a1a', borderRadius: '8px', padding: '8px 12px' }}>
                  <span style={{ fontSize: '15px', color: '#cbd5e1', flex: 1 }}>
                    {selectedLevelIds.size} level{selectedLevelIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDeleteLevels}
                    disabled={saving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLevelIds(new Set())}
                    style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                    title="Clear selection"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ maxHeight: '680px', overflowY: 'auto' }}>
              {filteredLevels.map((level) => {
                const items = itemsByLevel[level.id] || [];
                const status = levelStatus(items);
                const isSelected = selectedLevelId === level.id;
                const isChecked = selectedLevelIds.has(level.id);
                return (
                  <div
                    key={level.id}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: isSelected ? '3px solid #1a1a1a' : '3px solid transparent',
                      backgroundColor: isSelected ? '#f8f8f8' : isChecked ? '#f0f4ff' : '#ffffff',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', padding: '0 6px 0 12px', flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleLevelSelection(level.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLevelId(level.id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        padding: '12px 14px 12px 6px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 600, fontSize: '16px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {level.name}
                        </div>
                        <AppBadge variant={status.variant} size="sm">{status.label}</AppBadge>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '14px', color: '#64748b' }}>
                        {items.length} products
                      </div>
                    </button>
                  </div>
                );
              })}

              {filteredLevels.length === 0 && (
                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '15px', color: '#64748b' }}>
                  No price levels yet. Create your first one.
                </div>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            {!selectedLevel ? (
              <div className="app-card" style={{ minHeight: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                <Tag size={48} strokeWidth={1.4} style={{ color: '#cbd5e1', marginBottom: '14px' }} />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Select a price level to view its products and prices
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="app-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      {editingLevelName ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            value={levelNameDraft}
                            onChange={(e) => setLevelNameDraft(e.target.value)}
                            style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 700, fontSize: '22px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                          />
                          <AppButton variant="primary" size="sm" onClick={saveLevelName} disabled={saving}>Save</AppButton>
                          <AppButton variant="secondary" size="sm" onClick={() => { setEditingLevelName(false); setLevelNameDraft(selectedLevel.name); }}>Cancel</AppButton>
                        </div>
                      ) : (
                        <h2 style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 700, fontSize: '22px', margin: 0 }}>{selectedLevel.name}</h2>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <AppBadge variant={levelStatus(selectedLevelItems).variant}>{levelStatus(selectedLevelItems).label}</AppBadge>
                      <AppButton
                        variant="primary"
                        size="sm"
                        onClick={openExportModal}
                        disabled={approvedSelectedLevelItems.length === 0}
                        title={approvedSelectedLevelItems.length === 0 ? 'Approve at least one price before exporting.' : 'Export price list'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Download size={14} />
                        Export price list
                      </AppButton>
                      <OverflowMenu
                        ariaLabel="More actions for selected price level"
                        items={[
                          { label: 'Edit level name', icon: Pencil, onClick: () => setEditingLevelName(true) },
                          { type: 'divider' as const, key: 'detail-divider' },
                          { label: 'Delete level', icon: Trash2, onClick: deleteLevel, danger: true },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Products and prices</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <AppButton variant="primary" size="sm" onClick={openAddProductsModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} strokeWidth={2} />
                        Add products
                      </AppButton>
                      {selectedLevelItems.some((item) => item.status === 'pending') && (
                        <AppButton variant="secondary" size="sm" onClick={approveAllPending} disabled={saving}>
                          Approve all pending
                        </AppButton>
                      )}
                    </div>
                  </div>

                  {selectedRows.size > 0 && (
                    <div
                      style={{
                        backgroundColor: '#1a1a1a',
                        color: 'white',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        margin: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '15px', color: '#cbd5e1' }}>{selectedRows.size} items selected</span>
                      <button
                        type="button"
                        onClick={approveSelected}
                        disabled={saving}
                        className="btn btn-sm"
                        style={{ backgroundColor: '#ffffff', color: '#0f172a', border: 'none' }}
                      >
                        <CheckCheck size={14} />
                        Approve selected
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRows(new Set())}
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: 'auto', color: '#e2e8f0' }}
                      >
                        <X size={14} />
                        Clear
                      </button>
                    </div>
                  )}

                  {(() => {
                    const staleCount = selectedLevelItems.filter((item) => item.isCustomPriceStale).length;
                    if (staleCount === 0 || staleBannerDismissed) return null;
                    return (
                      <div style={{ position: 'relative', margin: '12px 16px 0', padding: '10px 44px 10px 14px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderLeft: '3px solid #e65100', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <button className="btn-close-x" type="button" onClick={() => setStaleBannerDismissed(true)} aria-label="Dismiss">
                          &times;
                        </button>
                        <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ flex: 1, fontSize: '14px', color: '#bf360c' }}>
                          <strong>{staleCount} custom {staleCount === 1 ? 'price' : 'prices'} may need review.</strong> The approved base price changed after these prices were set.
                        </div>
                      </div>
                    );
                  })()}

                  <div className="app-table-wrap">
                    <table className="app-table app-table-compact app-table-uniform-numbers">
                      <thead>
                        <tr>
                          <th style={{ width: '34px' }}>
                            <input type="checkbox" checked={allRowsSelected} onChange={(e) => toggleSelectAllRows(e.target.checked)} />
                          </th>
                          <th>Product name</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'right' }}>Approved base price</th>
                          <th>Pricing rule</th>
                          <th style={{ textAlign: 'right' }}>Final price</th>
                          <th style={{ textAlign: 'right' }}>Margin %</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLevelItems.map((item) => {
                          const isEditing = editingItemProductId === item.productId;
                          const isSelected = selectedRows.has(item.productId);
                          const margin = computeMarginPercent(toNumber(item.finalPrice, 0), toNumber(item.productProductionCost, 0));
                          const variant = marginTone(margin);

                          const draftValue = parseDraftValue(rowDraft.value) ?? 0;
                          const draftFinal = computeFinalPrice(rowDraft.overrideType, draftValue, toNumber(item.productApprovedPrice, 0));
                          const draftMargin = computeMarginPercent(draftFinal, toNumber(item.productProductionCost, 0));
                          const belowCost = draftFinal <= toNumber(item.productProductionCost, 0);

                          return (
                            <>
                              <tr key={item.productId}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => toggleRowSelection(item.productId, e.target.checked)}
                                  />
                                </td>
                                <td>{item.productName}</td>
                                <td>{item.productCategory || '-'}</td>
                                <td style={{ textAlign: 'right' }}>{formatMoney(item.productApprovedPrice)}</td>
                                <td>{pricingRuleLabel(item)}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'Open Sans, sans-serif', fontWeight: 600, fontSize: '16px' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    {formatMoney(item.finalPrice)}
                                    {item.isCustomPriceStale && (
                                      <span title="Base price was updated after this custom price was set. Review to confirm this price is still appropriate.">
                                        <AlertTriangle size={13} style={{ color: '#e65100' }} />
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <AppBadge variant={variant}>{margin.toFixed(1)}%</AppBadge>
                                </td>
                                <td>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <AppBadge variant={itemStatusVariant(item.status)}>{item.status}</AppBadge>
                                    {item.isCustomPriceStale && (
                                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#e65100', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>Review custom price</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    {item.status === 'pending' ? (
                                      <AppButton
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => approveItem(item.productId)}
                                        ariaLabel="Approve"
                                        title="Approve"
                                        style={{ color: '#16a34a' }}
                                      >
                                        <Check size={14} />
                                      </AppButton>
                                    ) : (
                                      <AppButton
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openInlineEdit(item)}
                                        ariaLabel="Edit price"
                                        title="Edit price"
                                      >
                                        <Pencil size={14} />
                                      </AppButton>
                                    )}

                                    <OverflowMenu
                                      ariaLabel={`More actions for ${item.productName}`}
                                      items={[
                                        ...(item.status === 'pending'
                                          ? [
                                            { label: 'Edit price', icon: Pencil, onClick: () => openInlineEdit(item) },
                                            { type: 'divider' as const, key: `pending-divider-${item.productId}` },
                                            {
                                              label: 'Reject',
                                              icon: XCircle,
                                              onClick: () => {
                                                if (window.confirm(`Reject ${item.productName}?`)) {
                                                  void rejectItem(item.productId);
                                                }
                                              },
                                              danger: true,
                                            },
                                            {
                                              label: 'Delete',
                                              icon: Trash2,
                                              onClick: () => removeItem(item.productId),
                                              danger: true,
                                            },
                                          ]
                                          : item.status === 'approved'
                                            ? [
                                              { label: 'Re-approve at optimal', icon: Check, onClick: () => approveItem(item.productId) },
                                              { type: 'divider' as const, key: `approved-divider-${item.productId}` },
                                              {
                                                label: 'Reject',
                                                icon: XCircle,
                                                onClick: () => {
                                                  if (window.confirm(`Reject ${item.productName}?`)) {
                                                    void rejectItem(item.productId);
                                                  }
                                                },
                                                danger: true,
                                              },
                                              {
                                                label: 'Delete',
                                                icon: Trash2,
                                                onClick: () => removeItem(item.productId),
                                                danger: true,
                                              },
                                            ]
                                            : [
                                              { label: 'Edit and re-submit', icon: Pencil, onClick: () => openInlineEdit(item) },
                                              { type: 'divider' as const, key: `rejected-divider-${item.productId}` },
                                              {
                                                label: 'Delete',
                                                icon: Trash2,
                                                onClick: () => removeItem(item.productId),
                                                danger: true,
                                              },
                                            ]),
                                      ]}
                                    />
                                  </div>
                                </td>
                              </tr>

                              {isEditing && (
                                <tr key={`${item.productId}-edit`}>
                                  <td colSpan={9} style={{ backgroundColor: '#fcfcfd' }}>
                                    <div style={{ display: 'grid', gap: '10px', padding: '8px 0' }}>
                                      {item.isCustomPriceStale && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', fontSize: '14px', color: '#bf360c' }}>
                                          <AlertTriangle size={13} style={{ color: '#e65100', flexShrink: 0, marginTop: '1px' }} />
                                          <span>The approved base price changed since this custom price was set. Current base price: <strong>{formatMoney(item.productApprovedPrice)}</strong>. Your custom price: <strong>{formatMoney(item.customPrice ?? 0)}</strong>.</span>
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        <AppButton variant={rowDraft.overrideType === 'rule_discount' ? 'primary' : 'secondary'} size="sm" onClick={() => setRowDraft((prev) => ({ ...prev, overrideType: 'rule_discount' }))}>Discount %</AppButton>
                                        <AppButton variant={rowDraft.overrideType === 'rule_markup' ? 'primary' : 'secondary'} size="sm" onClick={() => setRowDraft((prev) => ({ ...prev, overrideType: 'rule_markup' }))}>Markup %</AppButton>
                                        <AppButton variant={rowDraft.overrideType === 'custom_price' ? 'primary' : 'secondary'} size="sm" onClick={() => setRowDraft((prev) => ({ ...prev, overrideType: 'custom_price' }))}>Fixed price</AppButton>
                                        <input
                                          value={rowDraft.value}
                                          onChange={(e) => setRowDraft((prev) => ({ ...prev, value: e.target.value }))}
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          placeholder={rowDraft.overrideType === 'custom_price' ? 'Enter fixed price' : 'Enter percentage'}
                                          style={{ maxWidth: '180px', padding: '7px 9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                                        />
                                      </div>

                                      <div style={{ fontSize: '15px', color: '#475569' }}>
                                        Final price: <strong>{formatMoney(draftFinal)}</strong> | Margin: <strong>{draftMargin.toFixed(1)}%</strong>
                                      </div>

                                      {!belowCost && draftMargin < MIN_MARGIN_WARNING && (
                                        <div style={{ fontSize: '14px', color: '#b45309' }}>Warning: margin is below 15%. Justification is required.</div>
                                      )}
                                      {belowCost && (
                                        <div style={{ fontSize: '14px', color: '#b91c1c' }}>Final price is below production cost. Save is blocked.</div>
                                      )}

                                      <textarea
                                        value={rowDraft.justification}
                                        onChange={(e) => setRowDraft((prev) => ({ ...prev, justification: e.target.value }))}
                                        rows={3}
                                        placeholder="Add justification (required if margin is below 15%)"
                                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                                      />

                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <AppButton variant="primary" size="sm" onClick={() => saveInlineEdit(item)} disabled={saving || belowCost}>Save</AppButton>
                                        <AppButton variant="secondary" size="sm" onClick={closeInlineEdit}>Cancel</AppButton>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selectedLevelItems.length === 0 && (
                    <div style={{ padding: '22px 16px', textAlign: 'center', color: '#64748b', fontSize: '15px' }}>
                      No products added to this level yet.
                    </div>
                  )}

                </div>

                <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setRecentActivityOpen((current) => !current)}
                    style={{
                      width: '100%',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Recent activity</span>
                    {recentActivityOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {recentActivityOpen && (
                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 16px' }}>
                      {recentActivityLoading ? (
                        <div style={{ fontSize: '14px', color: '#64748b' }}>Loading activity...</div>
                      ) : recentActivity.length === 0 ? (
                        <div style={{ fontSize: '14px', color: '#64748b' }}>No recent activity for this price level.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
                          {recentActivity.map((entry) => {
                            const visual = levelActivityIcon(entry.action);
                            return (
                              <div key={`level-activity-${entry.id}`} style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                                <visual.Icon size={13} style={{ color: visual.color }} />
                                <div style={{ fontSize: '14px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={describeLevelActivity(entry)}>
                                  {describeLevelActivity(entry)}
                                </div>
                                <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right' }}>{formatRelativeTime(entry.createdAt)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <a href="/activity?entityType=price_level_item" style={{ fontSize: '14px', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                        View full activity log
                      </a>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {showAddProductsModal && selectedLevel && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowAddProductsModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Add products to {selectedLevel.name}</h2>

            <div style={{ marginBottom: '10px' }}>
              <input
                value={addProductsSearch}
                onChange={(e) => setAddProductsSearch(e.target.value)}
                placeholder="Search products..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
              />
            </div>

            <div className="app-table-wrap" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="app-table app-table-compact">
                <thead>
                  <tr>
                    <th style={{ width: '32px' }}>
                      <input
                        type="checkbox"
                        checked={addProductsRows.filter((row) => !row.alreadyAdded).length > 0 && selectedAddProductIds.size === addProductsRows.filter((row) => !row.alreadyAdded).length}
                        onChange={(e) => toggleSelectAllProductsForAdd(e.target.checked)}
                      />
                    </th>
                    <th>Product name</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Approved base price</th>
                  </tr>
                </thead>
                <tbody>
                  {addProductsRows.map(({ product, alreadyAdded }) => (
                    <tr
                      key={product.id}
                      style={alreadyAdded ? { backgroundColor: '#f8fafc', color: '#94a3b8' } : { cursor: 'pointer' }}
                      onClick={alreadyAdded ? undefined : () => {
                        const next = new Set(selectedAddProductIds);
                        if (next.has(product.id)) {
                          next.delete(product.id);
                        } else {
                          next.add(product.id);
                        }
                        setSelectedAddProductIds(next);
                      }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          disabled={alreadyAdded}
                          checked={selectedAddProductIds.has(product.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedAddProductIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(product.id);
                              else next.delete(product.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{product.name} {alreadyAdded ? <span style={{ fontSize: '13px' }}>(Already added)</span> : null}</td>
                      <td>{product.category || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(toNumber(product.approvedPrice, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="app-modal-actions">
              <AppButton variant="secondary" onClick={() => setShowAddProductsModal(false)}>Cancel</AppButton>
              <AppButton variant="primary" onClick={addSelectedProducts} disabled={selectedAddProductIds.size === 0 || saving}>
                Add {selectedAddProductIds.size} products
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showExportModal && selectedLevel && createPortal(
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '920px', width: '100%', padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h2 className="app-modal-title" style={{ marginBottom: '4px' }}>Export price list</h2>
                <div className="app-modal-subtitle">{selectedLevel.name} · {approvedSelectedLevelItems.length} approved product{approvedSelectedLevelItems.length === 1 ? '' : 's'} available</div>
              </div>
              <button className="btn-close-x" onClick={() => setShowExportModal(false)} aria-label="Close export modal">
                &times;
              </button>
            </div>

            <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '18px 20px', display: 'grid', gap: '18px' }}>
              {(() => {
                const staleExportCount = approvedSelectedLevelItems.filter((item) => item.isCustomPriceStale).length;
                if (staleExportCount === 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px' }}>
                    <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '14px', color: '#bf360c' }}>
                      <div style={{ fontWeight: 700, marginBottom: '3px' }}>{staleExportCount} product{staleExportCount === 1 ? '' : 's'} have custom prices that may be outdated.</div>
                      <div>This export uses the latest approved base prices for rule-based prices, but custom prices are exported as set.</div>
                      <div style={{ color: '#78350f', marginTop: '4px' }}>Review custom prices before exporting if base prices have changed recently.</div>
                    </div>
                  </div>
                );
              })()}
              <div className="app-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 700, fontSize: '17px' }}>Approved products</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => toggleExportSelectAll(true)}
                      style={{ border: 'none', background: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                    >
                      Select all
                    </button>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => toggleExportSelectAll(false)}
                      style={{ border: 'none', background: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                    >
                      Deselect all
                    </button>
                    <span style={{ fontSize: '14px', color: '#64748b' }}>{selectedExportRows.length} selected</span>
                  </div>
                </div>

                <div className="app-table-wrap" style={{ maxHeight: '320px' }}>
                  <table className="app-table app-table-compact app-table-uniform-numbers">
                    <thead>
                      <tr>
                        <th style={{ width: '34px' }} />
                        <th>Product</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Approved base price</th>
                        <th>Adjustment</th>
                        <th style={{ textAlign: 'right' }}>Final price</th>
                        <th style={{ textAlign: 'right' }}>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedSelectedLevelItems.map((item) => {
                        const row = exportRows.find((entry) => entry.productId === item.productId);
                        if (!row) {
                          return null;
                        }

                        return (
                          <tr key={`export-${item.productId}`}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedExportProductIds.has(item.productId)}
                                onChange={(e) => toggleExportProduct(item.productId, e.target.checked)}
                              />
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                {row.productName}
                                {item.isCustomPriceStale && (
                                  <span style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: '#e65100', display: 'inline-block', flexShrink: 0 }} title="Custom price may be outdated" />
                                )}
                              </span>
                            </td>
                            <td>{row.category}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(row.approvedBasePrice)}</td>
                            <td>{row.adjustmentLabel}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(row.finalPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{row.marginPercent.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="app-card" style={{ padding: '14px 16px', display: 'grid', gap: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '17px' }}>Optional header details</div>

                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#0f172a' }}>
                    <input type="checkbox" checked={includeCompanyName} onChange={(e) => setIncludeCompanyName(e.target.checked)} />
                    Company name
                  </span>
                  {includeCompanyName && (
                    <input
                      value={exportCompanyName}
                      onChange={(e) => setExportCompanyName(e.target.value)}
                      placeholder="Company name"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                    />
                  )}
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#0f172a' }}>
                  <input type="checkbox" checked={includeGeneratedDate} onChange={(e) => setIncludeGeneratedDate(e.target.checked)} />
                  Generated date
                </label>

                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#0f172a' }}>
                    <input type="checkbox" checked={includeValidUntil} onChange={(e) => setIncludeValidUntil(e.target.checked)} />
                    Valid until
                  </span>
                  {includeValidUntil && (
                    <input
                      type="date"
                      value={exportValidUntil}
                      onChange={(e) => setExportValidUntil(e.target.value)}
                      style={{ width: '220px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                    />
                  )}
                </label>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: '#ffffff', position: 'sticky', bottom: 0 }}>
              <div style={{ fontSize: '14px', color: '#64748b' }}>
                Choose the approved products you want to include, then download Excel or PDF.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <AppButton variant="secondary" onClick={() => setShowExportModal(false)}>Cancel</AppButton>
                <AppButton variant="secondary" onClick={exportSelectedRowsToPdf} disabled={selectedExportRows.length === 0}>Download PDF</AppButton>
                <AppButton variant="primary" onClick={exportSelectedRowsToExcel} disabled={selectedExportRows.length === 0}>Download Excel</AppButton>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showWizard && createPortal(
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '680px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', color: '#64748b' }}>Step {wizardStep} of 4</div>
              <button className="btn-close-x" onClick={cancelWizard} aria-label="Close wizard">
                &times;
              </button>
            </div>

            {wizardStep === 1 && (
              <div>
                <h2 className="app-modal-title">Name your price level</h2>
                <input
                  value={wizardName}
                  onChange={(e) => setWizardName(e.target.value)}
                  placeholder="e.g. Wholesale, Retail, Export"
                  style={{ width: '100%', fontSize: '18px', fontWeight: 600, padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                />
                <p className="app-modal-subtitle" style={{ marginTop: '10px' }}>
                  Use a descriptive name for the tier or export sheet you want to manage.
                </p>
                <div className="app-modal-actions">
                  <AppButton variant="ghost" onClick={cancelWizard}>Cancel</AppButton>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <AppButton variant="primary" onClick={() => setWizardStep(2)} disabled={!wizardName.trim()}>Next</AppButton>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h2 className="app-modal-title">Select products</h2>
                <p className="app-modal-subtitle">Choose which products this price level covers.</p>
                <input
                  value={wizardSearchProducts}
                  onChange={(e) => setWizardSearchProducts(e.target.value)}
                  placeholder="Search products..."
                  style={{ width: '100%', marginBottom: '10px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                />

                <div className="app-table-wrap" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  <table className="app-table app-table-compact">
                    <thead>
                      <tr>
                        <th style={{ width: '32px' }}>
                          <input
                            type="checkbox"
                            checked={wizardProducts.length > 0 && wizardProducts.every((product) => wizardSelectedProductIds.has(product.id))}
                            onChange={(e) => toggleWizardSelectAll(e.target.checked)}
                          />
                        </th>
                        <th>Product name</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Approved base price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wizardProducts.map((product) => (
                        <tr
                          key={product.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleWizardProduct(product.id, !wizardSelectedProductIds.has(product.id))}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={wizardSelectedProductIds.has(product.id)}
                              onChange={(e) => toggleWizardProduct(product.id, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td>{product.name}</td>
                          <td>{product.category || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{formatMoney(toNumber(product.approvedPrice, 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="app-modal-actions">
                  <AppButton variant="ghost" onClick={cancelWizard}>Cancel</AppButton>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <AppButton variant="ghost" onClick={() => setWizardStep(1)}>Back</AppButton>
                    <AppButton variant="primary" onClick={() => setWizardStep(3)} disabled={wizardSelectedProductIds.size === 0}>
                      Continue with {wizardSelectedProductIds.size} products selected
                    </AppButton>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <h2 className="app-modal-title">Set prices</h2>
                <p className="app-modal-subtitle">Set a pricing rule for each selected product.</p>

                <div className="app-card" style={{ marginBottom: '10px', padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b', marginRight: '4px' }}>Apply same rule to all</span>
                  <select
                    value={wizardApplyAllType}
                    onChange={(e) => setWizardApplyAllType(e.target.value as OverrideType)}
                    style={{ padding: '7px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  >
                    <option value="rule_discount">Discount %</option>
                    <option value="rule_markup">Markup %</option>
                    <option value="custom_price">Fixed price</option>
                  </select>
                  <input
                    value={wizardApplyAllValue}
                    onChange={(e) => setWizardApplyAllValue(e.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={wizardApplyAllType === 'custom_price' ? 'Fixed price' : 'Percent'}
                    style={{ width: '120px', padding: '7px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <AppButton variant="ghost" size="sm" onClick={applySameRuleToAll}>Apply to all</AppButton>
                </div>

                <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'grid', gap: '10px', paddingRight: '2px' }}>
                  {wizardSelectedProducts.map((product) => {
                    const rule = wizardRules[product.id] || { overrideType: 'rule_discount', value: '', justification: '' };
                    const numericValue = parseDraftValue(rule.value) ?? 0;
                    const approvedBase = toNumber(product.approvedPrice, 0);
                    const productionCost = findProductionCost(product);
                    const optimalPrice = toNumber((product as ProductRecord & { optimalPrice?: number }).optimalPrice, 0);
                    const finalPrice = computeFinalPrice(rule.overrideType, numericValue, approvedBase);
                    const margin = computeMarginPercent(finalPrice, productionCost);
                    const belowCost = finalPrice <= productionCost;

                    return (
                      <div key={product.id} className="app-card" style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                          <div style={{ fontWeight: 700 }}>{product.name}</div>
                          <div style={{ fontSize: '14px', color: '#64748b' }}>{product.category || '-'}</div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>
                          Approved base price {formatMoney(approvedBase)} | Optimal {formatMoney(optimalPrice)}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                          <AppButton variant={rule.overrideType === 'rule_discount' ? 'primary' : 'secondary'} size="sm" onClick={() => updateWizardRule(product.id, { overrideType: 'rule_discount' })}>Discount %</AppButton>
                          <AppButton variant={rule.overrideType === 'rule_markup' ? 'primary' : 'secondary'} size="sm" onClick={() => updateWizardRule(product.id, { overrideType: 'rule_markup' })}>Markup %</AppButton>
                          <AppButton variant={rule.overrideType === 'custom_price' ? 'primary' : 'secondary'} size="sm" onClick={() => updateWizardRule(product.id, { overrideType: 'custom_price' })}>Fixed price</AppButton>
                          <input
                            value={rule.value}
                            onChange={(e) => updateWizardRule(product.id, { value: e.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={rule.overrideType === 'custom_price' ? 'Fixed price' : 'Percent'}
                            style={{ width: '140px', padding: '7px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                          />
                        </div>

                        <div style={{ marginTop: '8px', fontSize: '15px', color: '#475569' }}>
                          Final price: <strong>{formatMoney(finalPrice)}</strong> | Margin: <strong>{margin.toFixed(1)}%</strong>
                        </div>

                        {!belowCost && margin < MIN_MARGIN_WARNING && (
                          <div style={{ marginTop: '4px', fontSize: '14px', color: '#b45309' }}>
                            Margin is below 15%. Justification is required.
                          </div>
                        )}
                        {belowCost && (
                          <div style={{ marginTop: '4px', fontSize: '14px', color: '#b91c1c' }}>
                            Price is below production cost and cannot be saved.
                          </div>
                        )}

                        <textarea
                          value={rule.justification}
                          onChange={(e) => updateWizardRule(product.id, { justification: e.target.value })}
                          rows={2}
                          placeholder="Justification (required when margin < 15%)"
                          style={{ marginTop: '8px', width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="app-modal-actions">
                  <AppButton variant="ghost" onClick={cancelWizard}>Cancel</AppButton>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <AppButton variant="ghost" onClick={() => setWizardStep(2)}>Back</AppButton>
                    <AppButton variant="primary" onClick={() => setWizardStep(4)} disabled={!wizardStep3Validation.isValid}>
                      Review {wizardSelectedProductIds.size} prices
                    </AppButton>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div>
                <h2 className="app-modal-title">Review and save</h2>

                <div style={{ marginBottom: '10px' }}>
                  <label className="app-settings-label" style={{ marginBottom: '6px' }}>Price level name</label>
                  <input
                    value={wizardName}
                    onChange={(e) => setWizardName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                  />
                </div>

                <div className="app-table-wrap" style={{ maxHeight: '320px' }}>
                  <table className="app-table app-table-compact app-table-uniform-numbers">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Rule</th>
                        <th style={{ textAlign: 'right' }}>Final price</th>
                        <th style={{ textAlign: 'right' }}>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wizardSelectedProducts.map((product) => {
                        const rule = wizardRules[product.id];
                        const numericValue = parseDraftValue(rule?.value || '') ?? 0;
                        const approvedBase = toNumber(product.approvedPrice, 0);
                        const productionCost = findProductionCost(product);
                        const finalPrice = computeFinalPrice(rule.overrideType, numericValue, approvedBase);
                        const margin = computeMarginPercent(finalPrice, productionCost);
                        const variant = marginTone(margin);
                        return (
                          <tr key={product.id}>
                            <td>{product.name}</td>
                            <td>
                              {rule.overrideType === 'custom_price'
                                ? `${formatMoney(numericValue)} (fixed)`
                                : `${rule.overrideType === 'rule_markup' ? 'Markup' : 'Discount'} ${numericValue.toFixed(2)}%`}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(finalPrice)}</td>
                            <td style={{ textAlign: 'right' }}><AppBadge variant={variant}>{margin.toFixed(1)}%</AppBadge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {wizardLowMarginCount > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '14px', color: '#b45309' }}>
                    {wizardLowMarginCount} products have margins below 15% - justification required
                  </div>
                )}

                <div className="app-modal-actions">
                  <AppButton variant="ghost" onClick={cancelWizard}>Cancel</AppButton>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <AppButton variant="ghost" onClick={() => setWizardStep(3)}>Back</AppButton>
                    <AppButton variant="primary" onClick={createPriceLevelFromWizard} disabled={saving || !wizardName.trim()}>
                      Create price level
                    </AppButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
    </div>
  );
}
