import * as XLSX from 'xlsx';
import { useEffect, useMemo, useState } from 'react';
import { useFormState } from '../context/FormStateContext';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronRight, Download, Package, Pencil, Plus, Printer, Tag, Trash2, X, XCircle, Clock3, CheckCircle2, Copy } from 'lucide-react';
import {
  activityLogApi,
  currenciesApi,
  priceLevelItemsApi,
  packSizesApi,
  priceLevelRulesApi,
  productsApi,
  settingsApi,
  type ActivityEntry,
  type PriceLevelItemResponse,
  type PriceLevelPackSize,
  type ProductRecord,
} from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import OverflowMenu from '../components/OverflowMenu';
import TableZoomControl from '../components/TableZoomControl';
import { useDemoMode } from '../context/DemoModeContext';
import useAppToast from '../hooks/useAppToast';
import useTableZoom from '../hooks/useTableZoom';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { formatCurrency } from '../utils/currency';

type PriceLevelRule = {
  id: number;
  name: string;
  adjustmentType?: 'discount' | 'markup';
  adjustmentPercentage?: number;
  description?: string | null;
  currencyId?: number | null;
  currencyCode?: string | null;
  isActive?: boolean;
};

type ActiveCurrency = {
  id: number;
  code: string;
  name: string;
  isActive?: boolean;
};

type OverrideType = 'rule_discount' | 'rule_markup' | 'fixed_amount_add' | 'fixed_amount_deduct';

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
  finalPriceBase: number;
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

function pricingRuleLabel(item: PriceLevelItemResponse, currencyCode: string): string {
  if (item.overrideType === 'fixed_amount_add') {
    return `+${formatCurrency(item.customPrice ?? 0, currencyCode)}`;
  }
  if (item.overrideType === 'fixed_amount_deduct') {
    return `-${formatCurrency(item.customPrice ?? 0, currencyCode)}`;
  }
  if (item.overrideType === 'rule_markup') {
    return `Markup ${toNumber(item.adjustmentPercentage).toFixed(2)}%`;
  }
  return `Discount ${toNumber(item.adjustmentPercentage).toFixed(2)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDraftValue(raw: string): number | null {
  if (!raw.trim()) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeFinalPrice(overrideType: OverrideType, value: number, approvedBasePrice: number): number {
  if (overrideType === 'fixed_amount_add') {
    return roundToTwo(approvedBasePrice + value);
  }
  if (overrideType === 'fixed_amount_deduct') {
    return roundToTwo(approvedBasePrice - value);
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

function itemStatusVariant(status: PriceLevelItemResponse['status']): 'pending' | 'approved' {
  if (status === 'approved') return 'approved';
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

function getAdjustmentLabel(item: PriceLevelItemResponse, currencyCode: string) {
  if (item.overrideType === 'fixed_amount_add') {
    return `+${formatCurrency(item.customPrice ?? 0, currencyCode)}`;
  }
  if (item.overrideType === 'fixed_amount_deduct') {
    return `-${formatCurrency(item.customPrice ?? 0, currencyCode)}`;
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
  if (entry.action === 'price_level_item.bulk_approved') {
    return `${Number(details.count || 0)} items bulk approved (${String(details.levelName || 'Level')})`;
  }

  return entry.action;
}

function levelActivityIcon(action: string) {
  if (action.endsWith('approved')) return { Icon: CheckCircle2, color: '#16a34a' };
  if (action.endsWith('deleted')) return { Icon: XCircle, color: '#dc2626' };
  return { Icon: Clock3, color: '#64748b' };
}

export default function PriceLevels() {
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const { isDemoMode } = useDemoMode();
  const { baseCurrency } = useBaseCurrency();
  const formatMoney = (value: number) => formatCurrency(toNumber(value), baseCurrency);

  const [levelCurrencyCode, setLevelCurrencyCode] = useState<string | null>(null);
  const [levelRateToBase, setLevelRateToBase] = useState(1);
  const [wizardCurrencyId, setWizardCurrencyId] = useState<number | null>(null);
  const [editLevelCurrencyId, setEditLevelCurrencyId] = useState<number | null>(null);
  const [activeCurrencies, setActiveCurrencies] = useState<ActiveCurrency[]>([]);

  function formatLevelMoney(baseValue: number, convertedValue?: number): string {
    if (levelCurrencyCode && convertedValue !== undefined) {
      return `${levelCurrencyCode} ${toNumber(convertedValue).toFixed(2)}`;
    }
    return formatMoney(baseValue);
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [levels, setLevels] = useState<PriceLevelRule[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [itemsByLevel, setItemsByLevel] = useState<Record<number, PriceLevelItemResponse[]>>({});

  const [searchLevels, setSearchLevels] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);

  const [editingLevelName, setEditingLevelName] = useState(false);
  const [levelNameDraft, setLevelNameDraft] = useState('');

  const [showRuleEditModal, setShowRuleEditModal] = useState(false);
  const [ruleEditItem, setRuleEditItem] = useState<PriceLevelItemResponse | null>(null);
  const [ruleEditOverrideType, setRuleEditOverrideType] = useState<string>('rule_discount');
  const [ruleEditAdjustment, setRuleEditAdjustment] = useState<string>('');
  const [ruleEditCustomPrice, setRuleEditCustomPrice] = useState<string>('');
  const [ruleEditJustification, setRuleEditJustification] = useState('');

  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedLevelIds, setSelectedLevelIds] = useState<Set<number>>(new Set());
  const { zoomPercent, increaseZoom, decreaseZoom } = useTableZoom();

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
  const [managePacksItem, setManagePacksItem] = useState<PriceLevelItemResponse | null>(null);
  const [managePacksNewQuantity, setManagePacksNewQuantity] = useState('');
  const { setHasOpenForm } = useFormState();

  useEffect(() => {
    setHasOpenForm(showAddProductsModal || showWizard || showExportModal || managePacksItem != null);
  }, [showAddProductsModal, showWizard, showExportModal, managePacksItem, setHasOpenForm]);

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
  const [removeProductTargetId, setRemoveProductTargetId] = useState<number | null>(null);
  const [showDeleteLevelModal, setShowDeleteLevelModal] = useState(false);
  const [showBulkDeleteLevelsModal, setShowBulkDeleteLevelsModal] = useState(false);
  const [showDiscardWizardModal, setShowDiscardWizardModal] = useState(false);

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
    return approvedSelectedLevelItems.map((item) => {
      const finalPriceBase = toNumber(item.finalPrice, 0);
      const displayFinalPrice = levelCurrencyCode
        ? toNumber(item.finalPriceConverted, finalPriceBase)
        : finalPriceBase;
      return {
        productId: item.productId,
        productName: item.productName,
        category: item.productCategory || '-',
        approvedBasePrice: toNumber(item.productApprovedPrice, 0),
        finalPrice: displayFinalPrice,
        finalPriceBase,
        marginPercent: computeMarginPercent(finalPriceBase, toNumber(item.productProductionCost, 0)),
        adjustmentLabel: getAdjustmentLabel(item, baseCurrency),
      };
    });
  }, [approvedSelectedLevelItems, baseCurrency, levelCurrencyCode]);

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
      if (levelId === selectedLevelId && items.length > 0) {
        setLevelRateToBase(toNumber(items[0].rateToBase, 1));
      }
      return items;
    } catch (error) {
      console.error('Failed to load level items:', error);
      showToastMessage('Failed to refresh price level items.', 'error');
      return [];
    }
  }

  async function addPackSize(itemId: number, rawQuantity: string) {
    if (!selectedLevel) return;
    const packQuantity = Number.parseInt(rawQuantity.trim(), 10);
    if (!Number.isInteger(packQuantity) || packQuantity <= 1) {
      showToastMessage('Pack quantity must be a whole number greater than 1.', 'error');
      return;
    }

    try {
      await packSizesApi.add(itemId, packQuantity);
      setManagePacksNewQuantity('');
      const items = await refreshLevelItems(selectedLevel.id);
      setManagePacksItem((current) => {
        if (current?.id !== itemId) return current;
        return items.find((entry) => entry.id === itemId) ?? current;
      });
      showToastMessage(`Pack of ${packQuantity} added.`, 'success');
    } catch (error) {
      console.error('Failed to add pack size:', error);
      showToastMessage((error as Error).message || 'Failed to add pack size.', 'error');
    }
  }

  async function removePackSize(packSizeId: number, itemId: number) {
    if (!selectedLevel) return;

    try {
      await packSizesApi.delete(packSizeId);
      const items = await refreshLevelItems(selectedLevel.id);
      setManagePacksItem((current) => {
        if (current?.id !== itemId) return current;
        return items.find((entry) => entry.id === itemId) ?? current;
      });
      showToastMessage('Pack size removed.', 'success');
    } catch (error) {
      console.error('Failed to remove pack size:', error);
      showToastMessage((error as Error).message || 'Failed to remove pack size.', 'error');
    }
  }

  function openManagePacks(item: PriceLevelItemResponse) {
    setManagePacksItem(item);
    setManagePacksNewQuantity('');
  }

  function packMenuItems(item: PriceLevelItemResponse) {
    return [
      { label: 'Manage packs', icon: Package, onClick: () => openManagePacks(item) },
      { type: 'divider' as const, key: `packs-divider-${item.productId}` },
    ];
  }

  function buildDuplicateLevelName(baseName: string, existingNames: Set<string>) {
    const base = `Copy of ${(baseName || 'Price Level').trim()}`;
    if (!existingNames.has(base.toLowerCase())) return base;
    let counter = 2;
    while (existingNames.has(`${base} (${counter})`.toLowerCase())) {
      counter += 1;
    }
    return `${base} (${counter})`;
  }

  async function handleDuplicateLevel(level: PriceLevelRule) {
    try {
      const existingNames = new Set(levels.map((l) => (l.name || '').trim().toLowerCase()));
      const newName = buildDuplicateLevelName(level.name, existingNames);

      const created = await priceLevelRulesApi.create({
        name: newName,
        adjustmentType: 'discount',
        adjustmentPercentage: 0,
        description: level.description || '',
        currencyId: level.currencyId ?? null,
      }) as PriceLevelRule;

      const items = await priceLevelItemsApi.getAll(level.id);
      const sourceItems = Array.isArray(items) ? items : [];

      for (const item of sourceItems) {
        await priceLevelItemsApi.upsert((created as any).id, {
          productId: item.productId,
          overrideType: item.overrideType as any,
          adjustmentPercentage: item.adjustmentPercentage ?? undefined,
          customPrice: item.customPrice ?? undefined,
          justification: item.justification ?? undefined,
        });
      }

      await loadInitialData();
      showToastMessage(`Price level duplicated: ${newName}`, 'success');
    } catch (error: any) {
      console.error('Error duplicating price level:', error);
      showToastMessage(error?.message || 'Failed to duplicate price level', 'error');
    }
  }

  useEffect(() => {
    void loadInitialData();
    void currenciesApi.getAll().then((all) => {
      setActiveCurrencies(
        (Array.isArray(all) ? all : []).filter((currency: ActiveCurrency) => currency.isActive !== false),
      );
    }).catch(() => {
      setActiveCurrencies([]);
    });
  }, []);

  useEffect(() => {
    if (selectedLevel) {
      setLevelNameDraft(selectedLevel.name);
      setLevelCurrencyCode(selectedLevel.currencyCode ?? null);
      setEditLevelCurrencyId(selectedLevel.currencyId ?? null);
      setEditingLevelName(false);
      setShowRuleEditModal(false);
      setRuleEditItem(null);
      setSelectedRows(new Set());
      setRecentActivityOpen(false);
    } else {
      setLevelCurrencyCode(null);
      setEditLevelCurrencyId(null);
      setLevelRateToBase(1);
    }
  }, [selectedLevelId, selectedLevel]);

  useEffect(() => {
    if (selectedLevelId == null) return;
    const items = itemsByLevel[selectedLevelId] ?? [];
    if (items.length > 0) {
      setLevelRateToBase(toNumber(items[0].rateToBase, 1));
    }
  }, [selectedLevelId, itemsByLevel]);

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

  function openRuleEditModal(item: PriceLevelItemResponse) {
    setRuleEditItem(item);
    setRuleEditOverrideType(item.overrideType);
    if (item.overrideType === 'fixed_amount_add' || item.overrideType === 'fixed_amount_deduct') {
      setRuleEditAdjustment(String(toNumber(item.customPrice, 0)));
      setRuleEditCustomPrice('');
    } else {
      setRuleEditAdjustment(String(toNumber(item.adjustmentPercentage, 0)));
      setRuleEditCustomPrice('');
    }
    setRuleEditJustification(item.justification || '');
    setShowRuleEditModal(true);
  }

  function closeRuleEditModal() {
    setShowRuleEditModal(false);
    setRuleEditItem(null);
    setRuleEditOverrideType('rule_discount');
    setRuleEditAdjustment('');
    setRuleEditCustomPrice('');
    setRuleEditJustification('');
  }

  async function saveRuleEdit() {
    if (!selectedLevel || !ruleEditItem) return;

    const isCustomPrice = ruleEditOverrideType === 'custom_price';
    const overrideType = (isCustomPrice ? 'custom_price' : ruleEditOverrideType) as OverrideType;
    const numericValue = isCustomPrice
      ? parseDraftValue(ruleEditCustomPrice)
      : parseDraftValue(ruleEditAdjustment);
    if (numericValue == null || numericValue < 0) {
      showToastMessage('Enter a valid non-negative value.', 'error');
      return;
    }

    const approvedBasePrice = toNumber(ruleEditItem.productApprovedPrice);
    const productionCost = toNumber(ruleEditItem.productProductionCost);
    const finalPrice = isCustomPrice
      ? roundToTwo(numericValue)
      : computeFinalPrice(overrideType, numericValue, approvedBasePrice);

    if (finalPrice <= productionCost) {
      showToastMessage('Final price is below production cost. Save blocked.', 'error');
      return;
    }

    const margin = computeMarginPercent(finalPrice, productionCost);
    if (margin < MIN_MARGIN_WARNING && !ruleEditJustification.trim()) {
      showToastMessage('Justification is required when margin is below 15%.', 'error');
      return;
    }

    setSaving(true);
    try {
      await priceLevelItemsApi.upsert(selectedLevel.id, {
        productId: ruleEditItem.productId,
        overrideType: isCustomPrice
          ? ('custom_price' as 'rule_discount')
          : overrideType,
        adjustmentPercentage: !isCustomPrice && (overrideType === 'rule_discount' || overrideType === 'rule_markup')
          ? numericValue
          : undefined,
        customPrice: isCustomPrice || overrideType === 'fixed_amount_add' || overrideType === 'fixed_amount_deduct'
          ? numericValue
          : undefined,
        justification: ruleEditJustification.trim() || undefined,
      });
      await refreshLevelItems(selectedLevel.id);
      closeRuleEditModal();
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

  async function removeItem(productId: number) {
    if (!selectedLevel) return;
    setRemoveProductTargetId(productId);
  }

  async function confirmRemoveItem() {
    if (!selectedLevel || removeProductTargetId === null) return;
    setSaving(true);
    try {
      await priceLevelItemsApi.delete(selectedLevel.id, removeProductTargetId);
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Product removed from price level.', 'success');
      setRemoveProductTargetId(null);
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

  async function saveLevelCurrency(nextCurrencyId: number | null) {
    if (!selectedLevel) return;

    setSaving(true);
    try {
      const updated = await priceLevelRulesApi.update(selectedLevel.id, {
        name: selectedLevel.name,
        adjustmentType: selectedLevel.adjustmentType || 'discount',
        adjustmentPercentage: toNumber(selectedLevel.adjustmentPercentage, 0),
        description: selectedLevel.description || undefined,
        currencyId: nextCurrencyId,
      }) as PriceLevelRule;

      setLevels((prev) => prev.map((level) => (
        level.id === selectedLevel.id
          ? {
            ...level,
            currencyId: updated.currencyId ?? null,
            currencyCode: updated.currencyCode ?? null,
          }
          : level
      )));
      setEditLevelCurrencyId(updated.currencyId ?? null);
      setLevelCurrencyCode(updated.currencyCode ?? null);
      await refreshLevelItems(selectedLevel.id);
      showToastMessage('Price list currency updated.', 'success');
    } catch (error) {
      console.error('Failed to update price level currency:', error);
      showToastMessage((error as Error).message || 'Failed to update currency.', 'error');
    } finally {
      setSaving(false);
    }
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

  function openDeleteLevelModal() {
    if (!selectedLevel) return;
    setShowDeleteLevelModal(true);
  }

  async function confirmDeleteLevel() {
    if (!selectedLevel) return;

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
      setShowDeleteLevelModal(false);
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

  function handleOpenBulkDeleteLevelsModal() {
    if (selectedLevelIds.size === 0) return;
    setShowBulkDeleteLevelsModal(true);
  }

  async function handleBulkDeleteLevels() {
    if (selectedLevelIds.size === 0) return;
    const count = selectedLevelIds.size;

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
      setShowBulkDeleteLevelsModal(false);
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
    setWizardCurrencyId(null);
  }

  function openWizard() {
    resetWizardState();
    setShowWizard(true);
    void currenciesApi.getAll().then((all) => {
      setActiveCurrencies(
        (Array.isArray(all) ? all : []).filter((currency: ActiveCurrency) => currency.isActive !== false),
      );
    }).catch(() => {
      setActiveCurrencies([]);
    });
  }

  function cancelWizard() {
    const hasData = wizardName.trim() || wizardSelectedProductIds.size > 0 || Object.keys(wizardRules).length > 0;
    if (hasData) {
      setShowDiscardWizardModal(true);
      return;
    }
    setShowWizard(false);
    resetWizardState();
  }

  function confirmDiscardWizard() {
    setShowDiscardWizardModal(false);
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
        currencyId: wizardCurrencyId,
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
            adjustmentPercentage: rule.overrideType === 'rule_discount' || rule.overrideType === 'rule_markup'
              ? numericValue
              : undefined,
            customPrice: rule.overrideType === 'fixed_amount_add' || rule.overrideType === 'fixed_amount_deduct'
              ? numericValue
              : undefined,
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

    const exportedItems = approvedSelectedLevelItems.filter((item) => selectedExportProductIds.has(item.productId));
    const unitPriceLabel = levelCurrencyCode ? `Unit Price (${levelCurrencyCode})` : `Unit Price (${baseCurrency})`;
    const packPriceLabel = levelCurrencyCode ? `Pack Price (${levelCurrencyCode})` : `Pack Price (${baseCurrency})`;

    const now = new Date();
    const metadataLine = [
      includeGeneratedDate ? `Generated on: ${formatDateForMeta(now)}` : '',
      includeValidUntil && exportValidUntil ? `Valid until: ${exportValidUntil}` : '',
    ].filter(Boolean).join('   |   ');

    const headerRow = ['#', 'Product Name', 'Pack Size', unitPriceLabel, packPriceLabel];
    const totalColumns = headerRow.length;

    const dataRows: Array<Array<string | number>> = [];
    let rowNumber = 0;
    for (const item of exportedItems) {
      const unitPrice = levelCurrencyCode
        ? toNumber(item.finalPriceConverted, item.finalPrice)
        : toNumber(item.finalPrice, 0);

      if (!item.packSizes?.length) {
        rowNumber += 1;
        dataRows.push([rowNumber, item.productName, '', unitPrice, '']);
      } else {
        item.packSizes.forEach((pack, idx) => {
          rowNumber += 1;
          const packPrice = levelCurrencyCode
            ? toNumber(pack.packPriceConverted, pack.packPrice)
            : toNumber(pack.packPrice, 0);
          dataRows.push([
            rowNumber,
            idx === 0 ? item.productName : '',
            pack.packQuantity,
            unitPrice,
            packPrice,
          ]);
        });
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet([
      [includeCompanyName ? exportCompanyName.trim() : ''],
      [`Price List: ${selectedLevel.name}`],
      [metadataLine],
      [],
      headerRow,
      ...dataRows,
      [],
      ['Prepared in PriceRight'],
    ]);

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
    ];

    const footerRowIndex = dataRows.length + 6;
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: totalColumns - 1 } },
      { s: { r: footerRowIndex, c: 0 }, e: { r: footerRowIndex, c: totalColumns - 1 } },
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

    for (let col = 0; col < totalColumns; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: 4, c: col });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = headerFill as any;
      }
    }

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const excelRow = rowIndex + 6;
      for (let col = 3; col < totalColumns; col += 1) {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow - 1, c: col });
        if (worksheet[cellRef]) worksheet[cellRef].z = '#,##0.00';
      }
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
            body { font-family: 'Plus Jakarta Sans', sans-serif; margin: 28px; color: #0f172a; }
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

  async function handlePrintPriceList() {
    if (!selectedLevel || selectedLevelItems.length === 0) {
      return;
    }

    let companyName = 'PriceRight';
    let printBaseCurrency = baseCurrency;
    try {
      const settings = await settingsApi.getAll();
      const companySetting = settings.find(
        (entry: { settingKey: string; settingValue: string }) => entry.settingKey === 'companyName',
      );
      if (companySetting?.settingValue) {
        companyName = companySetting.settingValue;
      }
      const currencySetting = settings.find(
        (entry: { settingKey: string; settingValue: string }) => entry.settingKey === 'baseCurrency',
      );
      if (currencySetting?.settingValue) {
        printBaseCurrency = currencySetting.settingValue;
      }
    } catch {
      // Use defaults.
    }

    const date = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const printableItems = selectedLevelItems.filter(
      (item) => item.finalPrice != null && Number.isFinite(Number(item.finalPrice)),
    );

    if (printableItems.length === 0) {
      showToastMessage('No prices available to print for this level.', 'error');
      return;
    }

    const displayCurrency = levelCurrencyCode || printBaseCurrency;
    const exchangeRateNote = levelCurrencyCode
      ? `Exchange rate: 1 ${levelCurrencyCode} = ${levelRateToBase.toFixed(4)} ${printBaseCurrency} as of ${date}`
      : '';

    const rowHtml: string[] = [];
    for (const item of printableItems) {
      const unitPrice = formatLevelMoney(item.finalPrice, item.finalPriceConverted);

      if (!item.packSizes || item.packSizes.length === 0) {
        rowHtml.push(`
        <tr>
          <td>${escapeHtml(item.productName || '')}</td>
          <td style="text-align:center">—</td>
          <td style="text-align:right">${escapeHtml(unitPrice)}</td>
          <td style="text-align:right">—</td>
        </tr>
      `);
      } else {
        item.packSizes.forEach((pack, idx) => {
          const packPrice = formatLevelMoney(pack.packPrice, pack.packPriceConverted);
          rowHtml.push(`
            <tr>
              <td style="color: ${idx === 0 ? '#000' : '#999'}">
                ${idx === 0 ? escapeHtml(item.productName || '') : ''}
              </td>
              <td style="text-align:center">${pack.packQuantity}</td>
              <td style="text-align:right">${escapeHtml(unitPrice)}</td>
              <td style="text-align:right">${escapeHtml(packPrice)}</td>
            </tr>
          `);
        });
      }
    }
    const rows = rowHtml.join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(selectedLevel.name || 'Price List')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      padding: 32px 40px;
    }
    .header {
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 2px solid #000;
    }
    .company {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .level-name {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 11px;
      color: #555;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    thead th {
      text-align: left;
      padding: 8px 12px;
      background: #f5f5f5;
      border-top: 1px solid #ccc;
      border-bottom: 1px solid #ccc;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    thead th:last-child,
    thead th[data-align="right"],
    tbody td[data-align="right"] {
      text-align: right;
    }
    tbody td {
      padding: 7px 12px;
      border-bottom: 1px solid #eee;
      font-size: 12px;
    }
    tbody tr:nth-child(even) td {
      background: #fafafa;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #ccc;
      font-size: 10px;
      color: #777;
    }
    @page {
      margin: 15mm;
      size: A4 portrait;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName)}</div>
    <div class="level-name">${escapeHtml(selectedLevel.name || 'Price List')}</div>
    <div class="meta">Valid as of ${escapeHtml(date)} · Prices in ${escapeHtml(displayCurrency)}</div>
    ${exchangeRateNote ? `<div class="meta">${escapeHtml(exchangeRateNote)}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th style="text-align:center">Pack Size</th>
        <th style="text-align:right">Unit Price (${escapeHtml(displayCurrency)})</th>
        <th style="text-align:right">Pack Price (${escapeHtml(displayCurrency)})</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="footer">
    Generated by PriceRight · ${escapeHtml(companyName)} · ${escapeHtml(date)}
    ${exchangeRateNote ? `<br>${escapeHtml(exchangeRateNote)}` : ''}
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToastMessage('Allow pop-ups to print the price list.', 'error');
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
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
        <AppButton variant="primary" onClick={openWizard} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
          <Plus size={14} strokeWidth={2} />
          New price level
        </AppButton>
      </div>

      <div className="app-page-content app-page-content--data">
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
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0F2847', borderRadius: '8px', padding: '8px 12px' }}>
                  <span style={{ fontSize: '15px', color: '#cbd5e1', flex: 1 }}>
                    {selectedLevelIds.size} level{selectedLevelIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenBulkDeleteLevelsModal}
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
                      borderLeft: isSelected ? '3px solid #0F2847' : '3px solid transparent',
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
                        <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '16px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <div className="app-empty-state" style={{ padding: '28px 16px' }}>
                  <div className="app-empty-state-icon" aria-hidden="true">🏷️</div>
                  <div className="app-empty-state-title">No price levels yet</div>
                  <div className="app-empty-state-text">
                    Price levels let you set different prices for different customer types — wholesale,
                    retail, export. Create your first level to get started.
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: '16px' }}
                    onClick={openWizard}
                  >
                    + Create your first price level
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            {!selectedLevel ? (
              <div className="app-card" style={{ minHeight: '540px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Tag size={48} strokeWidth={1.4} color="#CBD5E1" aria-hidden="true" />
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginTop: '16px' }}>
                  No price list selected
                </div>
                <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', maxWidth: '280px', marginTop: '8px', marginBottom: 0 }}>
                  Select a price list from the left to view its details, or create a new one to get started.
                </p>
                <button type="button" className="btn btn-success" style={{ marginTop: '24px' }} onClick={openWizard}>
                  Create price list
                </button>
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
                            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '22px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                          />
                          <AppButton variant="primary" size="sm" onClick={saveLevelName} disabled={saving}>Save</AppButton>
                          <AppButton variant="secondary" size="sm" onClick={() => { setEditingLevelName(false); setLevelNameDraft(selectedLevel.name); }}>Cancel</AppButton>
                        </div>
                      ) : (
                        <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '22px', margin: 0 }}>{selectedLevel.name}</h2>
                      )}
                      <div style={{ marginTop: '12px', maxWidth: '360px' }}>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#0F2847',
                          marginBottom: '6px',
                        }}
                        >
                          Price list currency
                        </label>
                        <select
                          value={editLevelCurrencyId ?? ''}
                          onChange={(e) => {
                            const nextValue = e.target.value ? Number(e.target.value) : null;
                            setEditLevelCurrencyId(nextValue);
                            void saveLevelCurrency(nextValue);
                          }}
                          disabled={saving}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            fontSize: '13px',
                            padding: '0 10px',
                            background: '#F8FAFC',
                          }}
                        >
                          <option value="">
                            Base currency ({baseCurrency})
                          </option>
                          {activeCurrencies.map((currency) => (
                            <option key={currency.id} value={currency.id}>
                              {currency.code} — {currency.name}
                            </option>
                          ))}
                        </select>
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
                          Prices are converted using the current exchange rate when displaying and exporting.
                        </p>
                      </div>
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
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          if (selectedLevelItems.length === 0) return;
                          void handlePrintPriceList();
                        }}
                        disabled={selectedLevelItems.length === 0}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Printer size={14} />
                        Print price list
                      </button>
                      <OverflowMenu
                        ariaLabel="More actions for selected price level"
                        items={[
                          { label: 'Edit level name', icon: Pencil, onClick: () => setEditingLevelName(true) },
                          { label: 'Duplicate', icon: Copy, onClick: () => selectedLevel ? handleDuplicateLevel(selectedLevel) : undefined },
                          { type: 'divider' as const, key: 'detail-divider' },
                          { label: 'Delete level', icon: Trash2, onClick: openDeleteLevelModal, danger: true },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="app-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Products and prices</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <TableZoomControl zoomPercent={zoomPercent} decreaseZoom={decreaseZoom} increaseZoom={increaseZoom} />
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
                        backgroundColor: '#0F2847',
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
                    const staleCount = selectedLevelItems.filter((item) => item.isStalePrice).length;
                    if (staleCount === 0 || staleBannerDismissed) return null;
                    return (
                      <div style={{ position: 'relative', margin: '12px 16px 0', padding: '10px 44px 10px 14px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderLeft: '3px solid #e65100', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <button className="btn-close-x" type="button" onClick={() => setStaleBannerDismissed(true)} aria-label="Dismiss">
                          &times;
                        </button>
                        <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ flex: 1, fontSize: '14px', color: '#bf360c' }}>
                          <strong>{staleCount} price override{staleCount === 1 ? '' : 's'} may need review.</strong> The approved base price changed after these overrides were set.
                        </div>
                      </div>
                    );
                  })()}

                  <div className="app-table-wrap" style={{ zoom: `${zoomPercent}%` }}>
                    <table className="app-table app-table-compact app-table-uniform-numbers">
                      <thead>
                        <tr>
                          <th style={{ width: '34px', textAlign: 'center' }}>
                            <input type="checkbox" checked={allRowsSelected} onChange={(e) => toggleSelectAllRows(e.target.checked)} />
                          </th>
                          <th style={{ textAlign: 'left' }}>Product name</th>
                          <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>
                            Approved base<br/>({baseCurrency})
                          </th>
                          <th style={{ textAlign: 'center' }}>Pack size</th>
                          <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>
                            {levelCurrencyCode ? (
                              <>Unit price<br/>({levelCurrencyCode})</>
                            ) : (
                              'Unit price'
                            )}
                          </th>
                          <th style={{ textAlign: 'right', whiteSpace: 'normal', minWidth: '80px' }}>
                            {levelCurrencyCode ? (
                              <>Pack price<br/>({levelCurrencyCode})</>
                            ) : (
                              'Pack price'
                            )}
                          </th>
                          <th style={{ textAlign: 'left' }}>Pricing rule</th>
                          <th style={{ textAlign: 'left' }}>Status</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLevelItems.flatMap((item) => {
                          const isSelected = selectedRows.has(item.productId);
                          const packs = item.packSizes || [];
                          const displayRows: Array<PriceLevelPackSize | null> = packs.length > 0 ? packs : [null];
                          const rowSpan = displayRows.length;

                          const packSizeTd = (pack: PriceLevelPackSize | null) => {
                            if (pack) {
                              return (
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0F2847' }}>
                                    {pack.packQuantity}
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                                —
                              </td>
                            );
                          };

                          const unitPriceCell = (showStaleIndicator: boolean) => (
                            <td style={{ textAlign: 'right', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500, fontSize: '13px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                {formatLevelMoney(item.finalPrice, item.finalPriceConverted)}
                                {showStaleIndicator && item.isStalePrice && (
                                  <span title="Base price was updated after this price override was set. Review to confirm this price is still appropriate.">
                                    <AlertTriangle size={13} style={{ color: '#e65100' }} />
                                  </span>
                                )}
                              </span>
                            </td>
                          );

                          const packRows = displayRows.map((pack, packIndex) => {
                            const isFirstRow = packIndex === 0;
                            return (
                              <tr key={pack ? `${item.productId}-pack-${pack.id}` : `${item.productId}-no-pack`}>
                                {isFirstRow && (
                                  <td rowSpan={rowSpan} style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => toggleRowSelection(item.productId, e.target.checked)}
                                    />
                                  </td>
                                )}
                                <td style={isFirstRow ? { textAlign: 'left' } : { color: 'rgba(0,0,0,0.3)', textAlign: 'left' }}>
                                  {isFirstRow ? item.productName : ''}
                                </td>
                                {isFirstRow && (
                                  <td rowSpan={rowSpan} style={{ textAlign: 'right' }}>
                                    {formatMoney(item.productApprovedPrice)}
                                  </td>
                                )}
                                {packSizeTd(pack)}
                                {unitPriceCell(isFirstRow)}
                                <td style={{ textAlign: 'right', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500, fontSize: '13px' }}>
                                  {pack
                                    ? formatLevelMoney(pack.packPrice, pack.packPriceConverted)
                                    : '—'}
                                </td>
                                {isFirstRow && (
                                  <>
                                    <td rowSpan={rowSpan} style={{ textAlign: 'left' }}>{pricingRuleLabel(item, baseCurrency)}</td>
                                    <td rowSpan={rowSpan} style={{ textAlign: 'left' }}>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                        <AppBadge variant={itemStatusVariant(item.status)}>{item.status}</AppBadge>
                                        {item.isStalePrice && (
                                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#e65100', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>Review price</span>
                                        )}
                                      </div>
                                    </td>
                                    <td rowSpan={rowSpan} style={{ textAlign: 'center' }}>
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
                                            onClick={() => openRuleEditModal(item)}
                                            ariaLabel="Edit price"
                                            title="Edit price"
                                          >
                                            <Pencil size={14} />
                                          </AppButton>
                                        )}

                                        <OverflowMenu
                                          ariaLabel={`More actions for ${item.productName}`}
                                          items={[
                                            ...packMenuItems(item),
                                            ...(item.status === 'pending'
                                              ? [
                                                { label: 'Edit price', icon: Pencil, onClick: () => openRuleEditModal(item) },
                                                { type: 'divider' as const, key: `pending-divider-${item.productId}` },
                                                {
                                                  label: 'Delete',
                                                  icon: Trash2,
                                                  onClick: () => removeItem(item.productId),
                                                  danger: true,
                                                },
                                              ]
                                              : [
                                                { label: 'Re-approve at optimal', icon: Check, onClick: () => approveItem(item.productId) },
                                                { type: 'divider' as const, key: `approved-divider-${item.productId}` },
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
                                  </>
                                )}
                              </tr>
                            );
                          });

                          return packRows;
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

                      <a href="/activity?entityType=price_level_item" style={{ fontSize: '14px', color: '#0F2847', textDecoration: 'none', fontWeight: 600 }}>
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

      {showRuleEditModal && ruleEditItem && (
        <div className="app-modal-overlay" onClick={closeRuleEditModal}>
          <div className="app-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={closeRuleEditModal} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Edit Pricing Rule — {ruleEditItem.productName}</h2>

            {ruleEditItem.isStalePrice && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', fontSize: '14px', color: '#bf360c', marginBottom: '12px' }}>
                <AlertTriangle size={13} style={{ color: '#e65100', flexShrink: 0, marginTop: '1px' }} />
                <span>The approved base price changed since this price was set. Current base price: <strong>{formatMoney(ruleEditItem.productApprovedPrice)}</strong>.</span>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <AppButton variant={ruleEditOverrideType === 'rule_discount' ? 'primary' : 'secondary'} size="sm" onClick={() => setRuleEditOverrideType('rule_discount')}>Discount %</AppButton>
              <AppButton variant={ruleEditOverrideType === 'rule_markup' ? 'primary' : 'secondary'} size="sm" onClick={() => setRuleEditOverrideType('rule_markup')}>Markup %</AppButton>
              <AppButton variant={ruleEditOverrideType === 'fixed_amount_add' ? 'primary' : 'secondary'} size="sm" onClick={() => setRuleEditOverrideType('fixed_amount_add')}>Add amount</AppButton>
              <AppButton variant={ruleEditOverrideType === 'fixed_amount_deduct' ? 'primary' : 'secondary'} size="sm" onClick={() => setRuleEditOverrideType('fixed_amount_deduct')}>Deduct amount</AppButton>
              <AppButton variant={ruleEditOverrideType === 'custom_price' ? 'primary' : 'secondary'} size="sm" onClick={() => setRuleEditOverrideType('custom_price')}>Custom price</AppButton>
            </div>

            {ruleEditOverrideType === 'custom_price' ? (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Custom price ({baseCurrency})</label>
                <input
                  value={ruleEditCustomPrice}
                  onChange={(e) => setRuleEditCustomPrice(e.target.value)}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Enter custom price"
                  className="app-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  {ruleEditOverrideType === 'fixed_amount_add' || ruleEditOverrideType === 'fixed_amount_deduct' ? `Amount (${baseCurrency})` : 'Percentage'}
                </label>
                <input
                  value={ruleEditAdjustment}
                  onChange={(e) => setRuleEditAdjustment(e.target.value)}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={ruleEditOverrideType === 'fixed_amount_add' || ruleEditOverrideType === 'fixed_amount_deduct' ? 'Enter amount' : 'Enter percentage'}
                  className="app-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {(() => {
              const isCustomPrice = ruleEditOverrideType === 'custom_price';
              const numericValue = isCustomPrice
                ? parseDraftValue(ruleEditCustomPrice) ?? 0
                : parseDraftValue(ruleEditAdjustment) ?? 0;
              const approvedBasePrice = toNumber(ruleEditItem.productApprovedPrice);
              const productionCost = toNumber(ruleEditItem.productProductionCost);
              const draftFinal = isCustomPrice
                ? roundToTwo(numericValue)
                : computeFinalPrice(ruleEditOverrideType as OverrideType, numericValue, approvedBasePrice);
              const draftMargin = computeMarginPercent(draftFinal, productionCost);
              const belowCost = draftFinal <= productionCost;

              return (
                <>
                  <div style={{ fontSize: '15px', color: '#475569', marginBottom: '12px' }}>
                    Final price: <strong>{formatMoney(draftFinal)}</strong> | Margin: <strong>{draftMargin.toFixed(1)}%</strong>
                  </div>

                  {!belowCost && draftMargin < MIN_MARGIN_WARNING && (
                    <div style={{ fontSize: '14px', color: '#b45309', marginBottom: '12px' }}>Warning: margin is below 15%. Justification is required.</div>
                  )}
                  {belowCost && (
                    <div style={{ fontSize: '14px', color: '#b91c1c', marginBottom: '12px' }}>Final price is below production cost. Save is blocked.</div>
                  )}

                  <textarea
                    value={ruleEditJustification}
                    onChange={(e) => setRuleEditJustification(e.target.value)}
                    rows={3}
                    placeholder="Add justification (required if margin is below 15%)"
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', boxSizing: 'border-box', marginBottom: '16px' }}
                  />

                  <div className="app-modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeRuleEditModal} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-success" onClick={() => void saveRuleEdit()} disabled={saving || belowCost}>Save Rule</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {managePacksItem && selectedLevel && (
        <div className="app-modal-overlay" onClick={() => setManagePacksItem(null)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setManagePacksItem(null)} aria-label="Close">
              &times;
            </button>
            <h2 className="app-modal-title">Manage pack sizes</h2>
            <p className="app-modal-subtitle">{managePacksItem.productName}</p>

            <div style={{ marginTop: '12px', marginBottom: '16px' }}>
              {(managePacksItem.packSizes || []).length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No pack sizes yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {(managePacksItem.packSizes || []).map((pack) => (
                    <div
                      key={pack.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <div style={{ fontSize: '14px', color: '#0F2847' }}>
                        Pack of <strong>{pack.packQuantity}</strong>
                        {' · '}
                        {formatLevelMoney(pack.packPrice, pack.packPriceConverted)}
                      </div>
                      <button
                        type="button"
                        onClick={() => void removePackSize(pack.id, managePacksItem.id)}
                        aria-label={`Remove pack of ${pack.packQuantity}`}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '13px',
                          padding: '2px 6px',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min={2}
                step={1}
                value={managePacksNewQuantity}
                onChange={(e) => setManagePacksNewQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && managePacksNewQuantity.trim()) {
                    void addPackSize(managePacksItem.id, managePacksNewQuantity);
                  }
                }}
                placeholder="Qty e.g. 12"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '15px',
                }}
              />
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => void addPackSize(managePacksItem.id, managePacksNewQuantity)}
                disabled={!managePacksNewQuantity.trim()}
              >
                Add pack
              </AppButton>
            </div>

            <div className="app-modal-actions">
              <AppButton variant="secondary" onClick={() => setManagePacksItem(null)}>Done</AppButton>
            </div>
          </div>
        </div>
      )}

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
                    <th style={{ width: '32px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={addProductsRows.filter((row) => !row.alreadyAdded).length > 0 && selectedAddProductIds.size === addProductsRows.filter((row) => !row.alreadyAdded).length}
                        onChange={(e) => toggleSelectAllProductsForAdd(e.target.checked)}
                      />
                    </th>
                    <th style={{ textAlign: 'left' }}>Product name</th>
                    <th style={{ textAlign: 'left' }}>Category</th>
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
                      <td style={{ textAlign: 'center' }}>
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
                      <td style={{ textAlign: 'left' }}>{product.name} {alreadyAdded ? <span style={{ fontSize: '15px' }}>(Already added)</span> : null}</td>
                      <td style={{ textAlign: 'left' }}>{product.category || '-'}</td>
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
                const staleExportCount = approvedSelectedLevelItems.filter((item) => item.isStalePrice).length;
                if (staleExportCount === 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px' }}>
                    <AlertTriangle size={14} style={{ color: '#e65100', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '14px', color: '#bf360c' }}>
                      <div style={{ fontWeight: 700, marginBottom: '3px' }}>{staleExportCount} product{staleExportCount === 1 ? '' : 's'} have price overrides that may be outdated.</div>
                      <div>This export uses the latest approved base prices for rule-based prices, but fixed amounts are exported as set.</div>
                      <div style={{ color: '#78350f', marginTop: '4px' }}>Review amount-based price overrides before exporting if base prices have changed recently.</div>
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
                      style={{ border: 'none', background: 'none', padding: 0, color: '#0F2847', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                    >
                      Select all
                    </button>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => toggleExportSelectAll(false)}
                      style={{ border: 'none', background: 'none', padding: 0, color: '#0F2847', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
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
                        <th style={{ width: '34px', textAlign: 'center' }} />
                        <th style={{ textAlign: 'left' }}>Product</th>
                        <th style={{ textAlign: 'left' }}>Category</th>
                        <th style={{ textAlign: 'right' }}>Approved base price</th>
                        <th style={{ textAlign: 'left' }}>Adjustment</th>
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
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedExportProductIds.has(item.productId)}
                                onChange={(e) => toggleExportProduct(item.productId, e.target.checked)}
                              />
                            </td>
                            <td style={{ textAlign: 'left' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                {row.productName}
                                {item.isStalePrice && (
                                  <span style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: '#e65100', display: 'inline-block', flexShrink: 0 }} title="Price override may be outdated" />
                                )}
                              </span>
                            </td>
                            <td style={{ textAlign: 'left' }}>{row.category}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(row.approvedBasePrice)}</td>
                            <td style={{ textAlign: 'left' }}>{row.adjustmentLabel}</td>
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
                <div style={{ marginTop: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0F2847',
                    marginBottom: '6px',
                  }}
                  >
                    Price list currency
                  </label>
                  <select
                    value={wizardCurrencyId ?? ''}
                    onChange={(e) => setWizardCurrencyId(
                      e.target.value ? Number(e.target.value) : null,
                    )}
                    style={{
                      width: '100%',
                      height: '36px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '13px',
                      padding: '0 10px',
                      background: '#F8FAFC',
                    }}
                  >
                    <option value="">
                      Base currency ({baseCurrency})
                    </option>
                    {activeCurrencies.map((currency) => (
                      <option key={currency.id} value={currency.id}>
                        {currency.code} — {currency.name}
                      </option>
                    ))}
                  </select>
                  <p style={{
                    fontSize: '12px',
                    color: '#64748b',
                    marginTop: '4px',
                  }}
                  >
                    Prices will be converted using the current exchange rate when displaying and exporting.
                  </p>
                </div>
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
                        <th style={{ width: '32px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={wizardProducts.length > 0 && wizardProducts.every((product) => wizardSelectedProductIds.has(product.id))}
                            onChange={(e) => toggleWizardSelectAll(e.target.checked)}
                          />
                        </th>
                        <th style={{ textAlign: 'left' }}>Product name</th>
                        <th style={{ textAlign: 'left' }}>Category</th>
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
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={wizardSelectedProductIds.has(product.id)}
                              onChange={(e) => toggleWizardProduct(product.id, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td style={{ textAlign: 'left' }}>{product.name}</td>
                          <td style={{ textAlign: 'left' }}>{product.category || '-'}</td>
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
                    <option value="fixed_amount_add">Add amount</option>
                    <option value="fixed_amount_deduct">Deduct amount</option>
                  </select>
                  <input
                    value={wizardApplyAllValue}
                    onChange={(e) => setWizardApplyAllValue(e.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={wizardApplyAllType === 'fixed_amount_add' || wizardApplyAllType === 'fixed_amount_deduct' ? 'Amount' : 'Percent'}
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
                          <AppButton variant={rule.overrideType === 'fixed_amount_add' ? 'primary' : 'secondary'} size="sm" onClick={() => updateWizardRule(product.id, { overrideType: 'fixed_amount_add' })}>Add amount</AppButton>
                          <AppButton variant={rule.overrideType === 'fixed_amount_deduct' ? 'primary' : 'secondary'} size="sm" onClick={() => updateWizardRule(product.id, { overrideType: 'fixed_amount_deduct' })}>Deduct amount</AppButton>
                          <input
                            value={rule.value}
                            onChange={(e) => updateWizardRule(product.id, { value: e.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={rule.overrideType === 'fixed_amount_add' || rule.overrideType === 'fixed_amount_deduct' ? 'Amount' : 'Percent'}
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
                        <th style={{ textAlign: 'left' }}>Product</th>
                        <th style={{ textAlign: 'left' }}>Rule</th>
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
                            <td style={{ textAlign: 'left' }}>{product.name}</td>
                            <td style={{ textAlign: 'left' }}>
                              {rule.overrideType === 'fixed_amount_add'
                                ? `+${formatMoney(numericValue)}`
                                : rule.overrideType === 'fixed_amount_deduct'
                                  ? `-${formatMoney(numericValue)}`
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

      {removeProductTargetId !== null && (
        <div className="app-modal-overlay" onClick={() => setRemoveProductTargetId(null)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setRemoveProductTargetId(null)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Remove Product</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This product will be removed from the price level. You can add it back at any time.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setRemoveProductTargetId(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void confirmRemoveItem()} disabled={saving}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteLevelModal && selectedLevel && (
        <div className="app-modal-overlay" onClick={() => setShowDeleteLevelModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowDeleteLevelModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Price List</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This price list and all its pricing rules will be permanently deleted. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteLevelModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void confirmDeleteLevel()} disabled={saving}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteLevelsModal && (
        <div className="app-modal-overlay" onClick={() => setShowBulkDeleteLevelsModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowBulkDeleteLevelsModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Selected Price Lists</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              {selectedLevelIds.size} price list{selectedLevelIds.size !== 1 ? 's' : ''} will be permanently deleted. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBulkDeleteLevelsModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleBulkDeleteLevels()} disabled={saving}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showDiscardWizardModal && (
        <div className="app-modal-overlay" onClick={() => setShowDiscardWizardModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowDiscardWizardModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Discard Changes</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              Your changes to this price list will be discarded. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDiscardWizardModal(false)}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={confirmDiscardWizard}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
