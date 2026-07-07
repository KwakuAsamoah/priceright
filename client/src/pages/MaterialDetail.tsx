import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  currenciesApi,
  exchangeRatesApi,
  materialsApi,
  settingsApi,
} from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import PageHelpButton from '../components/PageHelpButton';
import useAppToast from '../hooks/useAppToast';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { useMaterialCostSync } from '../context/MaterialCostSyncContext';

interface MaterialRecord {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category: string;
  unit: string;
  bulkQuantity: string;
  bulkPrice: string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode: string;
  purchaseCurrencySymbol: string;
  baseCurrencySymbol: string;
  unitPrice: string;
  supplier?: string;
  isActive: boolean;
  updatedAt?: string | number | null;
}

interface MaterialUsageProductEntry {
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
}

interface MaterialUsageRecord {
  materialId: number;
  materialName: string;
  productCount: number;
  products: MaterialUsageProductEntry[];
}

interface PriceHistoryEntry {
  id: number;
  changedAt: string | number;
  currencySymbol: string;
  priceInPurchaseCurrency: string | number;
  priceInBaseCurrency: string | number;
}

interface MaterialDetailLocationState {
  materialIds?: number[];
  from?: string;
  fromPage?: string;
  highlightMaterialId?: number;
}

interface CurrencyOption {
  id: number;
  code: string;
  symbol: string;
  isActive: boolean;
}

interface ExchangeRateRow {
  currencyId: number;
  rateToBase: number;
}

const PREV_NEXT_HINT_KEY = 'priceright_prevnext_hint_dismissed';

function parseConfiguredList(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return rawValue.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function normalizeChoiceValue(selectedValue: string, customValue: string, fallback = '') {
  const resolved = selectedValue === '__custom__' ? customValue : selectedValue;
  const trimmed = resolved.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
}

function buildDuplicateName(baseName: string, existingNames: Set<string>) {
  const normalizedBase = (baseName || 'Untitled Material').trim();
  let candidate = `${normalizedBase} (Copy)`;
  let counter = 2;
  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${normalizedBase} (Copy ${counter})`;
    counter += 1;
  }
  return candidate;
}

function formatDetailDate(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isProductUsageEntry(entry: MaterialUsageProductEntry) {
  return !entry.productName.startsWith('Intermediate:');
}

function DetailLoadingSkeleton() {
  const line = (width: string, height = 16) => (
    <div
      className="detail-skeleton-block"
      style={{ width, height, marginBottom: height === 16 ? 10 : 0 }}
    />
  );

  return (
    <div className="app-page">
      <style>{`
        .detail-skeleton-block {
          background: #E2E8F0;
          border-radius: 6px;
          animation: detailSkeletonPulse 1.2s ease-in-out infinite;
        }
        @keyframes detailSkeletonPulse {
          0% { opacity: 0.55; }
          50% { opacity: 1; }
          100% { opacity: 0.55; }
        }
      `}</style>
      <div className="app-page-header">
        <div className="detail-skeleton-block" style={{ width: '120px', height: 16 }} />
      </div>
      <div style={{ padding: '0 24px 24px', display: 'flex', gap: '20px', minHeight: 0 }}>
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="app-card" style={{ padding: '16px' }}>
            {line('55%')}
            {line('40%')}
            {line('70%')}
            {line('35%')}
          </div>
          <div className="app-card" style={{ padding: '16px', minHeight: '220px' }}>
            {line('30%')}
            {line('100%', 12)}
            {line('90%', 12)}
            {line('75%', 12)}
          </div>
        </div>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="app-card" style={{ padding: '16px' }}>
            <div className="detail-skeleton-block" style={{ width: '45%', height: 16, marginBottom: 16 }} />
            <div className="detail-skeleton-block" style={{ width: '100%', height: 100 }} />
          </div>
          <div className="app-card" style={{ padding: '16px' }}>
            <div className="detail-skeleton-block" style={{ width: '40%', height: 16, marginBottom: 16 }} />
            <div className="detail-skeleton-block" style={{ width: '100%', height: 100 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUsageQuantity(quantity: number | null | undefined, unit: string): string {
  if (quantity == null || quantity === 0) {
    return '—';
  }
  const qtyLabel = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(3);
  return unit ? `${qtyLabel} ${unit}` : qtyLabel;
}

export default function MaterialDetail() {
  const { baseCurrency } = useBaseCurrency();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as MaterialDetailLocationState | null) || null;
  const backTo = locationState?.from || '/materials?tab=primary';
  const materialId = Number(id);
  const { notifyMaterialCostsChanged } = useMaterialCostSync();
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();

  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [materialOrder, setMaterialOrder] = useState<number[]>(locationState?.materialIds || []);
  const [usageRecord, setUsageRecord] = useState<MaterialUsageRecord | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'usage' | 'history'>('usage');
  const [showPrevNextHint, setShowPrevNextHint] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [configuredUnits, setConfiguredUnits] = useState<string[]>([]);
  const [materialCustomCategoryValue, setMaterialCustomCategoryValue] = useState('');
  const [materialCustomUnitValue, setMaterialCustomUnitValue] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    unit: 'kg',
    bulkQuantity: '',
    bulkPrice: '',
    purchaseCurrencyId: 0,
  });

  async function loadMaterialById(targetId: number) {
    const materialsData = await materialsApi.getAll('all', 'primary');
    const rows = Array.isArray(materialsData) ? materialsData : [];
    return rows.find((entry) => Number(entry.id) === targetId) as MaterialRecord | undefined;
  }

  async function loadSupportingData() {
    const [currenciesData, settingsData, exchangeRatesData] = await Promise.all([
      currenciesApi.getAll(),
      settingsApi.getAll(),
      exchangeRatesApi.getAll(),
    ]);

    const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];
    setCurrencies(safeCurrencies.filter((currency: CurrencyOption) => currency.isActive));
    setExchangeRates(Array.isArray(exchangeRatesData) ? exchangeRatesData : []);

    const materialCategoriesSetting = (settingsData || []).find((entry: { settingKey: string }) => entry.settingKey === 'materialCategories');
    const materialUnitsSetting = (settingsData || []).find((entry: { settingKey: string }) => entry.settingKey === 'materialUnits');
    setConfiguredCategories(parseConfiguredList(materialCategoriesSetting?.settingValue));
    setConfiguredUnits(parseConfiguredList(materialUnitsSetting?.settingValue));
  }

  async function loadUsage(targetId: number) {
    setUsageLoading(true);
    try {
      const result = await materialsApi.checkUsage([targetId]);
      const usageList = Array.isArray(result?.inUse) ? result.inUse as MaterialUsageRecord[] : [];
      setUsageRecord(usageList.find((entry) => entry.materialId === targetId) || null);
    } catch {
      setUsageRecord(null);
    } finally {
      setUsageLoading(false);
    }
  }

  async function loadHistory(targetId: number) {
    setHistoryLoading(true);
    try {
      const history = await materialsApi.getPriceHistory(targetId);
      setPriceHistory(Array.isArray(history) ? history : []);
    } catch {
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadPageData() {
    if (!Number.isFinite(materialId) || materialId <= 0) {
      setError('Invalid material ID');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [foundMaterial] = await Promise.all([
        loadMaterialById(materialId),
        loadSupportingData(),
      ]);

      if (!foundMaterial) {
        setMaterial(null);
        setError('Material not found');
        return;
      }

      setMaterial(foundMaterial);

      if (materialOrder.length === 0) {
        const allMaterials = await materialsApi.getAll('active', 'primary');
        const ids = (Array.isArray(allMaterials) ? allMaterials : [])
          .map((entry) => Number(entry.id))
          .filter((entryId) => Number.isFinite(entryId) && entryId > 0);
        setMaterialOrder(ids);
      }

      await Promise.all([loadUsage(materialId), loadHistory(materialId)]);
    } catch {
      setError('Failed to load material data');
      setMaterial(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, [materialId]);

  const materialCategories = useMemo(() => {
    const observed = material?.category ? [material.category.trim()] : [];
    return Array.from(new Set([...configuredCategories, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredCategories, material?.category]);

  const materialUnits = useMemo(() => {
    const observed = material?.unit ? [material.unit.trim()] : [];
    return Array.from(new Set([...configuredUnits, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredUnits, material?.unit]);

  const currentMaterialIndex = useMemo(
    () => materialOrder.findIndex((entryId) => entryId === materialId),
    [materialOrder, materialId],
  );
  const previousMaterialId = currentMaterialIndex > 0 ? materialOrder[currentMaterialIndex - 1] : null;
  const nextMaterialId = currentMaterialIndex >= 0 && currentMaterialIndex < materialOrder.length - 1
    ? materialOrder[currentMaterialIndex + 1]
    : null;
  const materialCounterCurrent = currentMaterialIndex >= 0 ? currentMaterialIndex + 1 : 1;
  const materialCounterTotal = materialOrder.length > 0 ? materialOrder.length : 1;
  const prevNextNavVisible = materialOrder.length > 1;

  const productUsageEntries = useMemo(() => {
    const entries = usageRecord?.products || [];
    return entries.filter(isProductUsageEntry);
  }, [usageRecord]);

  const exchangeRate = useMemo(() => {
    if (!material) return null;
    const row = exchangeRates.find((entry) => entry.currencyId === material.purchaseCurrencyId);
    return row ? Number(row.rateToBase) : null;
  }, [exchangeRates, material]);

  const isForeignCurrency = Boolean(
    material
    && material.purchaseCurrencyCode
    && material.purchaseCurrencyCode.toUpperCase() !== baseCurrency.toUpperCase(),
  );

  function dismissPrevNextHint() {
    setShowPrevNextHint(false);
    try {
      localStorage.setItem(PREV_NEXT_HINT_KEY, 'true');
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!prevNextNavVisible) return;
    try {
      if (localStorage.getItem(PREV_NEXT_HINT_KEY) === 'true') return;
    } catch {
      // ignore
    }
    setShowPrevNextHint(true);
    const timeoutId = window.setTimeout(() => dismissPrevNextHint(), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [prevNextNavVisible]);

  function navigateToMaterial(targetId: number | null) {
    if (!targetId) return;
    navigate(`/materials/${targetId}`, {
      state: {
        materialIds: materialOrder,
        from: backTo,
        fromPage: 'materials',
      },
    });
  }

  useEffect(() => {
    function handleArrowNavigation(event: KeyboardEvent) {
      const activeElement = document.activeElement as HTMLElement | null;
      const tagName = activeElement?.tagName?.toLowerCase();
      const isTypingField =
        tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || Boolean(activeElement?.isContentEditable);
      if (isTypingField) return;

      if (event.key === 'ArrowLeft' && previousMaterialId) {
        event.preventDefault();
        navigateToMaterial(previousMaterialId);
      }
      if (event.key === 'ArrowRight' && nextMaterialId) {
        event.preventDefault();
        navigateToMaterial(nextMaterialId);
      }
    }

    window.addEventListener('keydown', handleArrowNavigation);
    return () => window.removeEventListener('keydown', handleArrowNavigation);
  }, [previousMaterialId, nextMaterialId, materialOrder, backTo]);

  function openEditModal() {
    if (!material) return;
    const knownCategory = materialCategories.includes(material.category);
    const knownUnit = materialUnits.includes(material.unit);
    setMaterialCustomCategoryValue(knownCategory ? '' : material.category);
    setMaterialCustomUnitValue(knownUnit ? '' : material.unit);
    setFormData({
      name: material.name,
      sku: material.sku || '',
      description: material.description || '',
      category: knownCategory ? material.category : '__custom__',
      unit: knownUnit ? material.unit : '__custom__',
      bulkQuantity: material.bulkQuantity,
      bulkPrice: material.bulkPrice,
      purchaseCurrencyId: material.purchaseCurrencyId,
    });
    setShowEditModal(true);
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!material) return;

    const resolvedCategory = normalizeChoiceValue(formData.category, materialCustomCategoryValue);
    const resolvedUnit = normalizeChoiceValue(formData.unit, materialCustomUnitValue, 'kg');
    if (!resolvedCategory || !resolvedUnit) {
      showToastMessage('Please provide both category and unit of measurement', 'error');
      return;
    }

    const resolvedPurchaseCurrencyId = Number(formData.purchaseCurrencyId || 0);
    if (!Number.isInteger(resolvedPurchaseCurrencyId) || resolvedPurchaseCurrencyId <= 0) {
      showToastMessage('Please select a purchase currency', 'error');
      return;
    }

    const resolvedBulkQuantity = parseFloat(formData.bulkQuantity);
    const resolvedBulkPrice = parseFloat(formData.bulkPrice);
    if (!Number.isFinite(resolvedBulkQuantity) || resolvedBulkQuantity <= 0) {
      showToastMessage('Please enter a valid bulk quantity', 'error');
      return;
    }
    if (!Number.isFinite(resolvedBulkPrice) || resolvedBulkPrice < 0) {
      showToastMessage('Please enter a valid bulk price', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        category: resolvedCategory,
        unit: resolvedUnit,
        bulkQuantity: resolvedBulkQuantity,
        bulkPrice: resolvedBulkPrice,
        purchaseCurrencyId: resolvedPurchaseCurrencyId,
        supplier: material.supplier || '',
      };
      const updateResult = await materialsApi.update(material.id, payload);
      const intermediatesUpdated = Number(updateResult?.intermediateMaterialsUpdated || 0);
      notifyMaterialCostsChanged();
      setShowEditModal(false);
      await loadPageData();
      if (intermediatesUpdated > 0) {
        showToastMessage(
          `Material saved. ${intermediatesUpdated} intermediate material${intermediatesUpdated === 1 ? '' : 's'} recalculated.`,
          'success',
        );
      } else {
        showToastMessage('Material saved', 'success');
      }
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to save material', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!material) return;
    if (material.isActive) {
      setShowInactiveModal(true);
      return;
    }
    try {
      await materialsApi.update(material.id, { isActive: true });
      showToastMessage('Material marked as active', 'success');
      await loadPageData();
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to update material status', 'error');
    }
  }

  async function handleConfirmSetInactive() {
    if (!material) return;
    try {
      await materialsApi.update(material.id, { isActive: false });
      showToastMessage('Material marked as inactive', 'success');
      setShowInactiveModal(false);
      await loadPageData();
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to update material status', 'error');
    }
  }

  async function handleDuplicate() {
    if (!material) return;
    setSaving(true);
    try {
      const allMaterials = await materialsApi.getAll('all', 'primary');
      const existingNames = new Set(
        (Array.isArray(allMaterials) ? allMaterials : []).map((entry) => String(entry.name || '').trim().toLowerCase()),
      );
      const duplicatedName = buildDuplicateName(material.name, existingNames);
      await materialsApi.create({
        name: duplicatedName,
        sku: material.sku ? `${material.sku}-COPY` : '',
        description: material.description || '',
        category: material.category,
        unit: material.unit,
        bulkQuantity: parseFloat(material.bulkQuantity),
        bulkPrice: parseFloat(material.bulkPrice),
        purchaseCurrencyId: material.purchaseCurrencyId,
        supplier: material.supplier || '',
      });
      showToastMessage(`Duplicated material: ${duplicatedName}`, 'success');
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to duplicate material', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!material) return;
    setSaving(true);
    try {
      await materialsApi.delete(material.id);
      showToastMessage('Material deleted successfully', 'success');
      setShowDeleteModal(false);
      navigate(backTo);
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to delete material', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleViewInTable() {
    navigate('/materials?tab=primary', {
      state: { highlightMaterialId: materialId, fromPage: 'materials' },
    });
  }

  if (loading) {
    return <DetailLoadingSkeleton />;
  }

  if (error || !material) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Materials
          </button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error || 'Material not found'}</div>
      </div>
    );
  }

  const currencySymbol = material.purchaseCurrencySymbol || material.baseCurrencySymbol || baseCurrency;
  const unitCost = Number(material.unitPrice || 0);

  return (
    <div className="app-page">
      {showToast && <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />}

      <div className="app-page-header" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Materials
          </button>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
            <AppButton variant="secondary" size="sm" onClick={openEditModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Pencil size={13} strokeWidth={2} />
              Edit
            </AppButton>
            <AppButton variant="secondary" size="sm" onClick={() => void handleToggleActive()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {material.isActive ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
              {material.isActive ? 'Set Inactive' : 'Set Active'}
            </AppButton>
            <PageHelpButton context="materials" />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0', gap: '12px' }}>
            <button
              type="button"
              onClick={() => navigateToMaterial(previousMaterialId)}
              disabled={!previousMaterialId}
              style={{
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: previousMaterialId ? '#334155' : '#94a3b8',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: previousMaterialId ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ChevronLeft size={14} strokeWidth={2} />
              Previous
            </button>
            <div style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}>
              {materialCounterCurrent} of {materialCounterTotal} materials
            </div>
            <button
              type="button"
              onClick={() => navigateToMaterial(nextMaterialId)}
              disabled={!nextMaterialId}
              style={{
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: nextMaterialId ? '#334155' : '#94a3b8',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: nextMaterialId ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Next
              <ChevronRight size={14} strokeWidth={2} />
            </button>
          </div>

          {showPrevNextHint && prevNextNavVisible ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                backgroundColor: '#DCFCE7',
                border: '1px solid #16A34A',
                color: '#15803D',
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '6px',
              }}
            >
              <span>Tip: Use Previous and Next to move between items without going back to the list</span>
              <button type="button" onClick={dismissPrevNextHint} aria-label="Dismiss tip" style={{ border: 'none', background: 'transparent', color: '#15803D', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>
                ×
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <h1 className="app-page-title" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {material.name}
          </h1>
          <AppBadge variant={material.isActive ? 'success' : 'inactive'} size="sm">
            {material.isActive ? 'Active' : 'Inactive'}
          </AppBadge>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '20px', minHeight: 0, overflow: 'hidden', padding: '0 24px 24px' }}>
        <div style={{ flex: 3, minWidth: 0, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Material Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Category', value: material.category || '—' },
                { label: 'Unit', value: material.unit || '—' },
                { label: 'SKU', value: material.sku || '—' },
                { label: 'Status', value: material.isActive ? 'Active' : 'Inactive', badge: true },
              ].map((field) => (
                <div key={field.label}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{field.label}</div>
                  {field.badge ? (
                    <AppBadge variant={material.isActive ? 'success' : 'inactive'} size="sm">
                      {field.value}
                    </AppBadge>
                  ) : (
                    <div style={{ color: '#0F2847', fontWeight: 600 }}>{field.value}</div>
                  )}
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Description</div>
                <div style={{ color: '#0F2847', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{material.description || '—'}</div>
              </div>
            </div>
          </div>

          <div className="app-card" style={{ padding: 0 }}>
            <div className="app-section-tabs" role="tablist" aria-label="Material detail sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'usage'}
                onClick={() => setActiveTab('usage')}
                className={`app-section-tab ${activeTab === 'usage' ? 'is-active' : ''}`}
              >
                Usage
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                className={`app-section-tab ${activeTab === 'history' ? 'is-active' : ''}`}
              >
                Price History
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {activeTab === 'usage' && (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <BarChart2 size={15} />
                    Used in {productUsageEntries.length} product{productUsageEntries.length !== 1 ? 's' : ''}
                  </div>
                  {usageLoading ? (
                    <div style={{ color: '#64748b', fontSize: '14px' }}>Loading usage...</div>
                  ) : productUsageEntries.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '14px', padding: '12px 0' }}>
                      This material is not used in any active product BOMs
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Product</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Quantity Used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productUsageEntries.map((usage) => (
                            <tr key={usage.productId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px', textAlign: 'left' }}>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/products/${usage.productId}`)}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    color: '#16A34A',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    textAlign: 'left',
                                  }}
                                  onMouseEnter={(event) => {
                                    event.currentTarget.style.textDecoration = 'underline';
                                  }}
                                  onMouseLeave={(event) => {
                                    event.currentTarget.style.textDecoration = 'none';
                                  }}
                                >
                                  {usage.productName}
                                </button>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>
                                {formatUsageQuantity(usage.quantity, usage.unit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <>
                  {historyLoading ? (
                    <div style={{ color: '#64748b', fontSize: '14px' }}>Loading price history...</div>
                  ) : priceHistory.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '14px', padding: '12px 0' }}>No price changes recorded yet</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Purchase Price</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Base Currency Price</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Change %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {priceHistory.map((entry, index) => {
                            const previousEntry = priceHistory[index + 1];
                            const basePrice = Number(entry.priceInBaseCurrency);
                            const previousBase = previousEntry ? Number(previousEntry.priceInBaseCurrency) : null;
                            const priceChange = previousBase && previousBase !== 0
                              ? ((basePrice - previousBase) / previousBase) * 100
                              : null;
                            const isIncrease = priceChange != null && priceChange > 0;
                            const isDecrease = priceChange != null && priceChange < 0;

                            return (
                              <tr key={entry.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px', textAlign: 'left' }}>{formatDetailDate(entry.changedAt)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                  {entry.currencySymbol}{Number(entry.priceInPurchaseCurrency).toFixed(2)}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                  {material.baseCurrencySymbol}{basePrice.toFixed(2)}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                  {priceChange == null ? (
                                    <span style={{ color: '#64748b' }}>Initial</span>
                                  ) : (
                                    <span style={{ color: isIncrease ? '#dc2626' : isDecrease ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                                      {isIncrease ? '↑' : isDecrease ? '↓' : '−'} {Math.abs(priceChange).toFixed(1)}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 2, minWidth: 0, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            className="app-card"
            style={{
              border: isForeignCurrency ? '1px solid #BFDBFE' : '1px solid #e2e8f0',
              backgroundColor: isForeignCurrency ? '#EFF6FF' : '#ffffff',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Pricing</div>
            <div style={{ display: 'grid', gap: '10px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>Purchase Currency</span>
                <span style={{ color: '#0F2847', fontWeight: 600 }}>{material.purchaseCurrencyCode || baseCurrency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>Bulk Price</span>
                <span className="money-value" style={{ color: '#0F2847', fontWeight: 600, textAlign: 'right' }}>
                  {currencySymbol}{Number(material.bulkPrice || 0).toFixed(2)} for {Number(material.bulkQuantity || 0).toFixed(2)} {material.unit}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Unit Cost</span>
                <span className="money-value" style={{ color: '#0F2847', fontWeight: 800, fontSize: '20px', textAlign: 'right' }}>
                  {material.baseCurrencySymbol}{unitCost.toFixed(2)}
                </span>
              </div>
              {isForeignCurrency && exchangeRate != null ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: '#64748b' }}>Exchange Rate</span>
                  <span style={{ color: '#0F2847', fontWeight: 600, textAlign: 'right' }}>
                    1 {material.purchaseCurrencyCode} = {exchangeRate.toFixed(4)} {baseCurrency}
                  </span>
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>Last updated</span>
                <span style={{ color: '#0F2847', fontWeight: 600, textAlign: 'right' }}>{formatDetailDate(material.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Actions</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button type="button" className="btn btn-outline" onClick={() => void handleDuplicate()} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <Copy size={14} strokeWidth={2} />
                Duplicate material
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowDeleteModal(true)} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', color: '#dc2626', borderColor: '#fecaca' }}>
                <Trash2 size={14} strokeWidth={2} />
                Delete material
              </button>
              <button type="button" className="btn btn-outline" onClick={handleViewInTable} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <Eye size={14} strokeWidth={2} />
                View in table
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowEditModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Edit Material</h2>
            <form onSubmit={(event) => void handleEditSubmit(event)}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label className="app-settings-label">Material Name *</label>
                  <input className="app-control" type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">SKU</label>
                    <input className="app-control" type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label className="app-settings-label">Category *</label>
                    <select className="app-control" required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={{ width: '100%' }}>
                      <option value="" disabled>Select category</option>
                      {materialCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      <option value="__custom__">+ Add new category...</option>
                    </select>
                    {formData.category === '__custom__' && (
                      <input className="app-control" required value={materialCustomCategoryValue} onChange={(e) => setMaterialCustomCategoryValue(e.target.value)} placeholder="Enter new category" style={{ width: '100%', marginTop: '8px' }} />
                    )}
                  </div>
                </div>
                <div>
                  <label className="app-settings-label">Description</label>
                  <textarea className="app-control" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ width: '100%', minHeight: '60px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">Unit of Measurement *</label>
                    <select className="app-control" required value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} style={{ width: '100%' }}>
                      <option value="" disabled>Select unit</option>
                      {materialUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      <option value="__custom__">+ Add new unit...</option>
                    </select>
                    {formData.unit === '__custom__' && (
                      <input className="app-control" required value={materialCustomUnitValue} onChange={(e) => setMaterialCustomUnitValue(e.target.value)} placeholder="Enter new unit" style={{ width: '100%', marginTop: '8px' }} />
                    )}
                  </div>
                  <div>
                    <label className="app-settings-label">Bulk Quantity *</label>
                    <input className="app-control" type="number" required step="0.01" value={formData.bulkQuantity} onChange={(e) => setFormData({ ...formData, bulkQuantity: e.target.value })} style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">Bulk Price *</label>
                    <input className="app-control" type="number" required step="0.01" value={formData.bulkPrice} onChange={(e) => setFormData({ ...formData, bulkPrice: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label className="app-settings-label">Currency *</label>
                    <select className="app-control" required value={formData.purchaseCurrencyId} onChange={(e) => setFormData({ ...formData, purchaseCurrencyId: parseInt(e.target.value, 10) })} style={{ width: '100%' }}>
                      {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="app-modal-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setShowEditModal(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInactiveModal && (
        <div className="app-modal-overlay" onClick={() => setShowInactiveModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowInactiveModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Set Material Inactive</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              {material.name} will remain in existing BOMs but will be flagged in the inactive filter.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowInactiveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void handleConfirmSetInactive()}>Set Inactive</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="app-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowDeleteModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Material</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This material will be permanently deleted. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleConfirmDelete()} disabled={saving}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
