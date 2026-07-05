import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
} from 'lucide-react';
import { materialsApi, type IntermediateBomItemRecord, type MaterialRecord } from '../api';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppToast from '../components/AppToast';
import PageHelpButton from '../components/PageHelpButton';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';
import useAppToast from '../hooks/useAppToast';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { useLowMarkupThreshold } from '../hooks/useLowMarginThreshold';
import { calculateActualMarkupPercent, getThresholdMarkupColor } from '../utils/margin';

interface IntermediateDetailLocationState {
  from?: string;
  materialIds?: number[];
}

interface PriceHistoryEntry {
  id: number;
  changedAt: string | number;
  currencySymbol: string;
  priceInPurchaseCurrency: string | number;
  priceInBaseCurrency: string | number;
}

const PREV_NEXT_HINT_KEY = 'priceright_prevnext_hint_dismissed';

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDetailDate(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

function buildMaterialUpdatePayload(material: MaterialRecord, overrides?: Partial<MaterialRecord>) {
  return {
    name: String(overrides?.name ?? material.name ?? ''),
    sku: String(overrides?.sku ?? material.sku ?? ''),
    description: String(overrides?.description ?? material.description ?? ''),
    category: String(overrides?.category ?? material.category ?? ''),
    unit: String(overrides?.unit ?? material.unit ?? 'kg'),
    intermediateCostMode: String(overrides?.intermediateCostMode ?? material.intermediateCostMode ?? 'yield'),
    bulkQuantity: Number(overrides?.bulkQuantity ?? material.bulkQuantity ?? 1),
    bulkPrice: Number(overrides?.bulkPrice ?? material.bulkPrice ?? 0),
    purchaseCurrencyId: Number(overrides?.purchaseCurrencyId ?? material.purchaseCurrencyId ?? 1),
    overheadPercentage: Number(overrides?.overheadPercentage ?? material.overheadPercentage ?? 0),
    marginPercentage: Number(overrides?.marginPercentage ?? material.marginPercentage ?? 0),
    yieldPercentage: Number(overrides?.yieldPercentage ?? material.yieldPercentage ?? 100),
    calculatedCostPerUnit: Number(overrides?.calculatedCostPerUnit ?? material.unitPrice ?? material.calculatedCostPerUnit ?? 0),
    supplier: '',
    isActive: Boolean(overrides?.isActive ?? material.isActive),
    materialType: 'intermediate' as const,
  };
}

export default function IntermediateDetail() {
  const { baseCurrency } = useBaseCurrency();
  const lowMarkupThreshold = useLowMarkupThreshold();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as IntermediateDetailLocationState | null) || null;
  const backTo = locationState?.from || '/materials?tab=intermediate';
  const materialId = Number(id);
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();

  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [materialOrder, setMaterialOrder] = useState<number[]>(locationState?.materialIds || []);
  const [bomItems, setBomItems] = useState<IntermediateBomItemRecord[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bom' | 'history'>('bom');
  const [showPrevNextHint, setShowPrevNextHint] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!Number.isFinite(materialId) || materialId <= 0) {
        if (!active) return;
        setError('Intermediate material not found');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [materialsData, bomData] = await Promise.all([
          materialsApi.getAll('all', 'intermediate'),
          materialsApi.getIntermediateBom(materialId),
        ]);

        if (!active) return;

        const resolvedMaterials = Array.isArray(materialsData) ? materialsData : [];
        const foundMaterial = resolvedMaterials.find((item) => Number(item.id) === materialId) || null;

        if (!foundMaterial) {
          setMaterial(null);
          setBomItems([]);
          setError('Intermediate material not found');
        } else {
          setMaterial(foundMaterial);
          setBomItems(Array.isArray(bomData) ? bomData : []);
          setError(null);

          if (materialOrder.length === 0) {
            const ids = resolvedMaterials
              .map((entry) => Number(entry.id))
              .filter((entryId) => Number.isFinite(entryId) && entryId > 0);
            setMaterialOrder(ids);
          }
        }
      } catch {
        if (!active) return;
        setMaterial(null);
        setBomItems([]);
        setError('Failed to load intermediate material');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [materialId]);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!Number.isFinite(materialId) || materialId <= 0) return;
      setHistoryLoading(true);
      try {
        const history = await materialsApi.getPriceHistory(materialId);
        if (!active) return;
        setPriceHistory(Array.isArray(history) ? history : []);
      } catch {
        if (!active) return;
        setPriceHistory([]);
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [materialId]);

  const liveCost = useMemo(() => {
    if (!material) return null;

    const totalMaterialCost = bomItems.reduce((sum, item) => {
      return sum + toNumber(item.quantity) * toNumber(item.unitPrice);
    }, 0);

    const overheadPercentage = toNumber(material.overheadPercentage) / 100;
    const overheadCost = totalMaterialCost * overheadPercentage;
    const batchTotalCost = totalMaterialCost + overheadCost;

    const batchQuantity = Math.max(0.0001, toNumber(material.bulkQuantity) || 1);
    const yieldPercent = Math.max(0.0001, toNumber(material.yieldPercentage) || 100);
    const effectiveOutputQuantity = material.intermediateCostMode === 'completed_output'
      ? batchQuantity
      : batchQuantity * (yieldPercent / 100);
    const costPerUnit = batchTotalCost / effectiveOutputQuantity;
    const markupRate = toNumber(material.marginPercentage) / 100;
    const markupAmount = costPerUnit * markupRate;
    const optimalPrice = costPerUnit * (1 + markupRate);

    return {
      batchMaterialCost: totalMaterialCost,
      batchOverheadCost: overheadCost,
      batchTotalCost,
      effectiveOutputQuantity,
      costPerUnit,
      markupAmount,
      optimalPrice,
    };
  }, [material, bomItems]);

  const configuredMarkupPercent = material ? toNumber(material.marginPercentage) : 0;
  const actualMarkupPercent = liveCost
    ? calculateActualMarkupPercent(liveCost.optimalPrice, liveCost.costPerUnit)
    : null;
  const markupColor = actualMarkupPercent != null
    ? getThresholdMarkupColor(actualMarkupPercent, lowMarkupThreshold)
    : '#64748b';

  const currencySymbol = material?.baseCurrencySymbol || material?.purchaseCurrencySymbol || baseCurrency;
  const formatMoney = (value: number) => `${currencySymbol}${currencySymbol ? ' ' : ''}${value.toFixed(2)}`;

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
    navigate(`/intermediate-materials/${targetId}`, {
      state: {
        materialIds: materialOrder,
        from: backTo,
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

  function openEdit() {
    if (!material) return;
    navigate('/materials?tab=intermediate', { state: { editMaterialId: material.id } });
  }

  async function handleToggleActive() {
    if (!material) return;
    if (material.isActive) {
      setShowInactiveModal(true);
      return;
    }
    try {
      await materialsApi.update(material.id, buildMaterialUpdatePayload(material, { isActive: true }));
      showToastMessage('Material marked as active', 'success');
      setMaterial((prev) => (prev ? { ...prev, isActive: true } : prev));
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to update material status', 'error');
    }
  }

  async function handleConfirmSetInactive() {
    if (!material) return;
    try {
      await materialsApi.update(material.id, buildMaterialUpdatePayload(material, { isActive: false }));
      showToastMessage('Material marked as inactive', 'success');
      setShowInactiveModal(false);
      setMaterial((prev) => (prev ? { ...prev, isActive: false } : prev));
    } catch (err: unknown) {
      showToastMessage(err instanceof Error ? err.message : 'Failed to update material status', 'error');
    }
  }

  async function handleDuplicate() {
    if (!material) return;
    setSaving(true);
    try {
      const allMaterials = await materialsApi.getAll('all', 'intermediate');
      const existingNames = new Set(
        (Array.isArray(allMaterials) ? allMaterials : []).map((entry) => String(entry.name || '').trim().toLowerCase()),
      );
      const duplicatedName = buildDuplicateName(material.name, existingNames);
      const duplicatedSku = material.sku ? `${String(material.sku).trim()}-COPY` : '';

      const created = await materialsApi.create({
        name: duplicatedName,
        sku: duplicatedSku,
        description: String(material.description || ''),
        category: String(material.category || ''),
        unit: String(material.unit || 'kg'),
        bulkQuantity: Number(material.bulkQuantity || 1),
        bulkPrice: Number(material.bulkPrice || 0),
        purchaseCurrencyId: Number(material.purchaseCurrencyId || 1),
        supplier: '',
        materialType: 'intermediate',
        overheadPercentage: Number(material.overheadPercentage || 0),
        marginPercentage: Number(material.marginPercentage || 0),
        intermediateCostMode: material.intermediateCostMode === 'completed_output' ? 'completed_output' : 'yield',
        yieldPercentage: Number(material.yieldPercentage || 100),
        calculatedCostPerUnit: Number(material.unitPrice || 0),
      });

      const sourceBom = await materialsApi.getIntermediateBom(material.id);
      const sourceBomItems = Array.isArray(sourceBom) ? sourceBom : [];
      for (const bomItem of sourceBomItems) {
        await materialsApi.addIntermediateBomItem(created.id, {
          componentMaterialId: bomItem.componentMaterialId,
          quantity: Number(bomItem.quantity || 0),
        });
      }

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
    navigate('/materials?tab=intermediate', {
      state: { highlightMaterialId: materialId },
    });
  }

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Intermediate Materials
          </button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading intermediate material...</div>
      </div>
    );
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
            <ArrowLeft size={14} strokeWidth={2} /> Intermediate Materials
          </button>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error || 'Intermediate material not found'}</div>
      </div>
    );
  }

  const outputQtyLabel = material.intermediateCostMode === 'completed_output'
    ? 'Completed Output Qty'
    : 'Effective Output Qty';

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
            <ArrowLeft size={14} strokeWidth={2} /> Intermediate Materials
          </button>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
            <AppButton variant="secondary" size="sm" onClick={openEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
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
                {
                  label: 'Yield %',
                  value: material.intermediateCostMode === 'yield'
                    ? `${toNumber(material.yieldPercentage).toFixed(1)}%`
                    : '100.0%',
                },
                {
                  label: 'Costing Method',
                  value: material.intermediateCostMode === 'completed_output' ? 'Completed Output' : 'Yield-Based',
                },
              ].map((field) => (
                <div key={field.label}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{field.label}</div>
                  <div style={{ color: '#0F2847', fontWeight: 600 }}>{field.value}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Description</div>
                <div style={{ color: '#0F2847', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{material.description || '—'}</div>
              </div>
            </div>
          </div>

          <div className="app-card" style={{ padding: 0 }}>
            <div className="app-section-tabs" role="tablist" aria-label="Intermediate detail sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'bom'}
                onClick={() => setActiveTab('bom')}
                className={`app-section-tab ${activeTab === 'bom' ? 'is-active' : ''}`}
              >
                BOM
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                className={`app-section-tab ${activeTab === 'history' ? 'is-active' : ''}`}
              >
                Cost History
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {activeTab === 'bom' && (
                <>
                  {bomItems.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '14px', padding: '12px 0' }}>
                      No components in this intermediate material
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '560px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Material Name</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Quantity</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Unit Cost</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Total Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bomItems.map((item) => {
                            const unitPrice = toNumber(item.unitPrice);
                            const quantity = toNumber(item.quantity);
                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px', textAlign: 'left' }}>{item.componentMaterialName || '—'}</td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>{quantity.toFixed(3)}</td>
                                <td style={{ padding: '8px', textAlign: 'left' }}>{item.unit || '—'}</td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>{formatMoney(unitPrice)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(quantity * unitPrice)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <>
                  {historyLoading ? (
                    <div style={{ color: '#64748b', fontSize: '14px' }}>Loading cost history...</div>
                  ) : priceHistory.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '14px', padding: '12px 0' }}>No cost changes recorded yet</div>
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
                                  {material.baseCurrencySymbol || baseCurrency}{basePrice.toFixed(2)}
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
          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Cost Summary</div>
            <div style={{ display: 'grid', gap: '10px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Yield %</span>
                <span style={{ color: '#0F2847', fontWeight: 700, fontSize: '16px' }}>
                  {material.intermediateCostMode === 'yield'
                    ? `${toNumber(material.yieldPercentage).toFixed(1)}%`
                    : '100.0%'}
                </span>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>Material Cost (batch)</span>
                <span style={{ color: '#0F2847', fontWeight: 600 }}>{formatMoney(liveCost?.batchMaterialCost ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>Overhead ({toNumber(material.overheadPercentage).toFixed(0)}%)</span>
                <span style={{ color: '#0F2847', fontWeight: 600 }}>{formatMoney(liveCost?.batchOverheadCost ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Total Production Cost</span>
                <span style={{ color: '#0F2847', fontWeight: 700 }}>{formatMoney(liveCost?.batchTotalCost ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b' }}>{outputQtyLabel}</span>
                <span style={{ color: '#0F2847', fontWeight: 600 }}>
                  {liveCost?.effectiveOutputQuantity.toFixed(3)} {material.unit || '—'}
                </span>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Cost Per Unit</span>
                <span className="money-value" style={{ color: '#0F2847', fontWeight: 800, fontSize: '20px', textAlign: 'right' }}>
                  {formatMoney(liveCost?.costPerUnit ?? 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
                  Markup ({configuredMarkupPercent.toFixed(0)}%)
                  <MarkupInfoTooltip />
                </span>
                <span style={{ color: markupColor, fontWeight: 700, textAlign: 'right' }}>
                  {formatMoney(liveCost?.markupAmount ?? 0)}
                  {actualMarkupPercent != null ? (
                    <span style={{ marginLeft: '8px', fontSize: '13px' }}>
                      ({actualMarkupPercent.toFixed(1)}%)
                    </span>
                  ) : null}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Optimal Price</span>
                <span className="money-value" style={{ color: '#0F2847', fontWeight: 700, textAlign: 'right' }}>
                  {formatMoney(liveCost?.optimalPrice ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="app-card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>Actions</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button type="button" className="btn btn-outline" onClick={openEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <Pencil size={14} strokeWidth={2} />
                Edit
              </button>
              <button type="button" className="btn btn-outline" onClick={() => void handleDuplicate()} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <Copy size={14} strokeWidth={2} />
                Duplicate
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowDeleteModal(true)} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', color: '#dc2626', borderColor: '#fecaca' }}>
                <Trash2 size={14} strokeWidth={2} />
                Delete
              </button>
              <button type="button" className="btn btn-outline" onClick={handleViewInTable} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <Eye size={14} strokeWidth={2} />
                View in table
              </button>
            </div>
          </div>
        </div>
      </div>

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
              This intermediate material will be permanently deleted. This cannot be undone.
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
