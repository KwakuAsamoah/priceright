import { useState, useEffect, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHelpButton from '../components/PageHelpButton';
import { AlertTriangle, Building2, Calculator, CheckCircle2, Clock3, Database, Globe, HardDrive, Layers, Lock, Package, Plus, ShoppingBag, Tag, Trash2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE, currenciesApi, exchangeRatesApi, settingsApi, backupApi, productsApi, materialsApi, demoModeApi, pinApi, templateUrl } from '../api';
import AppToast from '../components/AppToast';
import AppModal from '../components/AppModal';
import { PrivacyPolicyContent, TermsOfServiceContent } from '../data/legalContent';
import useAppToast from '../hooks/useAppToast';
import { useTemplateDownload } from '../hooks/useTemplateDownload';
import { useFormState } from '../context/FormStateContext';
import { useDemoMode } from '../context/DemoModeContext';
import { useBaseCurrencyContext } from '../context/BaseCurrencyContext';
import { MarkupInfoTooltip } from '../components/ProfitTooltips';

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

interface ExchangeRate {
  id: number;
  currencyId: number;
  rateToBase: number;
}

interface ProductSummary {
  category?: string | null;
}

interface MaterialSummary {
  category?: string | null;
  unit?: string | null;
}

interface ExchangeRateRecalculationSummary {
  materialsUpdated: number;
  productsReviewed: number;
  productsNowNeedsReview: number;
}

interface ExchangeRateUpdateResponse {
  success?: boolean;
  rate?: ExchangeRate;
  recalculation?: ExchangeRateRecalculationSummary;
  recalculationFailed?: boolean;
}

interface RateSaveBanner {
  tone: 'success' | 'warning' | 'error';
  message: string;
  reminder?: string;
}

type SettingsSection = 'business' | 'pricing' | 'currencies' | 'categories' | 'data';

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  name: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: 'business',
    name: 'Your Business',
    description: 'Company name, logo, and branding',
    icon: Building2,
  },
  {
    key: 'pricing',
    name: 'Pricing Defaults',
    description: 'Default markup, overhead, and healthy markup threshold',
    icon: TrendingUp,
  },
  {
    key: 'currencies',
    name: 'Currencies',
    description: 'Base currency and exchange rates',
    icon: Globe,
  },
  {
    key: 'categories',
    name: 'Categories',
    description: 'Product categories, material categories, and units of measure',
    icon: Tag,
  },
  {
    key: 'data',
    name: 'Data',
    description: 'Backup, restore, and demo data management',
    icon: Database,
  },
];

function resolveSettingsSection(sectionParam: string | null, tabParam: string | null): SettingsSection | null {
  if (
    sectionParam === 'business'
    || sectionParam === 'pricing'
    || sectionParam === 'currencies'
    || sectionParam === 'categories'
    || sectionParam === 'data'
  ) {
    return sectionParam;
  }

  if (tabParam === 'general') return 'business';
  if (tabParam === 'pricing') return 'pricing';
  if (tabParam === 'currencies') return 'currencies';
  if (tabParam === 'master-data') return 'categories';
  if (tabParam === 'data-backups') return 'data';

  return null;
}

function parseConfiguredList(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  const text = rawValue.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0);
    }
  } catch {
    // Ignore and fallback to delimited parsing
  }

  return text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeMasterListInput(input: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const value of parseConfiguredList(input)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }

  return values;
}

function countByNormalized(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    const key = value.trim().toLowerCase();
    if (!key) return accumulator;
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

const CATEGORY_CHIP_STYLE: CSSProperties = {
  background: '#F1F5F9',
  border: '1px solid #CBD5E1',
  color: '#475569',
  fontSize: '13px',
  padding: '4px 10px',
  borderRadius: '16px',
  display: 'inline-flex',
  gap: '6px',
  alignItems: 'center',
};

interface CategoryChipEditorProps {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  usageCounts: Record<string, number>;
  usageNoun: 'product' | 'material';
}

function CategoryChipEditor({
  label,
  hint,
  values,
  onChange,
  usageCounts,
  usageNoun,
}: CategoryChipEditorProps) {
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState('');

  function addCategory() {
    const trimmed = draft.trim();
    if (!trimmed) return;

    const exists = values.some((value) => value.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setAddError('Already exists');
      return;
    }

    onChange([...values, trimmed]);
    setDraft('');
    setAddError('');
  }

  function removeCategory(target: string) {
    onChange(values.filter((value) => value !== target));
    setAddError('');
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
        <label className="app-settings-label" style={{ margin: 0 }}>{label}</label>
        <div style={{ fontSize: '13px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '3px' }}>
          {hint}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', minHeight: '32px' }}>
        {values.length === 0 ? (
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>No categories yet</span>
        ) : values.map((value) => (
          <span key={value} style={CATEGORY_CHIP_STYLE}>
            {value}
            <button
              type="button"
              onClick={() => removeCategory(value)}
              aria-label={`Remove ${value}`}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <input
          className="app-control"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (addError) setAddError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCategory();
            }
          }}
          placeholder="Add category..."
          style={{ width: '160px' }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={addCategory}>
          Add
        </button>
        {addError ? <span style={{ fontSize: '13px', color: '#dc2626' }}>{addError}</span> : null}
      </div>

      {values.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Current ({values.length}):</div>
          {values.map((value) => {
            const count = usageCounts[value.toLowerCase()] || 0;
            return (
              <div key={`usage-${value}`} style={{ marginBottom: '2px' }}>
                • {value}{count > 0 ? ` (${count} ${usageNoun}${count === 1 ? '' : 's'})` : ' (not used)'}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode, setDemoMode, loading: demoModeLoading } = useDemoMode();
  const { downloading, handleDownload } = useTemplateDownload();
  const { setBaseCurrencyMissing } = useBaseCurrencyContext();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<string>('');
  const [baseCurrencyLocked, setBaseCurrencyLocked] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRate, setEditingRate] = useState<number | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [defaultOverhead, setDefaultOverhead] = useState('30');
  const { setHasOpenForm } = useFormState();
  const [defaultProfitMargin, setDefaultProfitMargin] = useState('30');
  const [healthyMarkupThreshold, setHealthyMarkupThreshold] = useState('20');
  const [companyName, setCompanyName] = useState('');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState('');
  // Overhead Calculator State
  const [overheadInputs, setOverheadInputs] = useState({
    totalOverhead: '',
    materialCosts: '',
  });

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    symbol: '',
  });

  // Backup State
  const [backupStatus, setBackupStatus] = useState<{ lastBackupTime: string | null; backupCount: number } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupUserMsg, setBackupUserMsg] = useState('');
  const [backupUserError, setBackupUserError] = useState('');
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [savingRateCurrencyId, setSavingRateCurrencyId] = useState<number | null>(null);
  const [rateSaveBanner, setRateSaveBanner] = useState<RateSaveBanner | null>(null);
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [materialCategories, setMaterialCategories] = useState<string[]>([]);
  const [materialUnits, setMaterialUnits] = useState<string[]>([]);
  const [isSavingMasterData, setIsSavingMasterData] = useState(false);
  const [masterDataMessage, setMasterDataMessage] = useState('');
  const [productCategoryCounts, setProductCategoryCounts] = useState<Record<string, number>>({});
  const [materialCategoryCounts, setMaterialCategoryCounts] = useState<Record<string, number>>({});
  const [materialUnitCounts, setMaterialUnitCounts] = useState<Record<string, number>>({});
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<string | null>(null);
  const [showDemoModeModal, setShowDemoModeModal] = useState(false);
  const [pendingDemoMode, setPendingDemoMode] = useState<boolean | null>(null);
  const [showResetDemoModal, setShowResetDemoModal] = useState(false);
  const [resetDemoConfirmText, setResetDemoConfirmText] = useState('');
  const [deleteCurrencyTarget, setDeleteCurrencyTarget] = useState<Currency | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    setHasOpenForm(
      showAddModal
      || showResetModal
      || showRestoreModal
      || showDemoModeModal
      || showResetDemoModal
      || deleteCurrencyTarget !== null
      || showPrivacy
      || showTerms
    );
  }, [showAddModal, showResetModal, showRestoreModal, showDemoModeModal, showResetDemoModal, deleteCurrencyTarget, showPrivacy, showTerms, setHasOpenForm]);

  useEffect(() => {
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(() =>
    resolveSettingsSection(searchParams.get('section'), searchParams.get('tab')),
  );

  useEffect(() => {
    const nextSection = resolveSettingsSection(searchParams.get('section'), searchParams.get('tab'));
    setActiveSection(nextSection);
  }, [searchParams]);

  function openSettingsSection(section: SettingsSection) {
    setActiveSection(section);
    setSearchParams({ section });
  }

  function goToSettingsHome() {
    setActiveSection(null);
    setSearchParams({});
  }

  const activeSectionMeta = SETTINGS_SECTIONS.find((entry) => entry.key === activeSection) || null;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!rateSaveBanner) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRateSaveBanner(null);
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [rateSaveBanner]);


async function loadData() {
    try {
      const [currenciesData, ratesData, settingsData, backupData, productsData, materialsData] = await Promise.all([
        currenciesApi.getAll(),
        exchangeRatesApi.getAll(),
        settingsApi.getAll(),
        backupApi.getStatus(),
        productsApi.getAll(),
        materialsApi.getAll(),
      ]);
      setCurrencies(currenciesData);
      setExchangeRates(ratesData);
      setBackupStatus(backupData);
      
      const baseSetting = settingsData.find((s: any) => s.settingKey === 'baseCurrency');
      if (baseSetting) {
        setBaseCurrency(baseSetting.settingValue);
      }

      const overheadSetting = settingsData.find((s: any) => s.settingKey === 'defaultOverhead');
      if (overheadSetting) {
        setDefaultOverhead(overheadSetting.settingValue);
      }

      const profitMarginSetting = settingsData.find((s: any) => s.settingKey === 'defaultProfitMargin');
      if (profitMarginSetting) {
        setDefaultProfitMargin(profitMarginSetting.settingValue);
      }

      const healthyMarkupSetting = settingsData.find((s: any) => s.settingKey === 'healthyMarkupThreshold');
      if (healthyMarkupSetting) {
        setHealthyMarkupThreshold(healthyMarkupSetting.settingValue);
      }

      const companyNameSetting = settingsData.find((s: any) => s.settingKey === 'companyName');
      if (companyNameSetting) {
        setCompanyName(companyNameSetting.settingValue);
      }

      const companyLogoSetting = settingsData.find((s: any) => s.settingKey === 'companyLogoDataUrl');
      if (companyLogoSetting) {
        setCompanyLogoDataUrl(companyLogoSetting.settingValue);
      }

      const productCategoriesSetting = settingsData.find((s: any) => s.settingKey === 'productCategories');
      setProductCategories(parseConfiguredList(productCategoriesSetting?.settingValue || ''));

      const materialCategoriesSetting = settingsData.find((s: any) => s.settingKey === 'materialCategories');
      setMaterialCategories(parseConfiguredList(materialCategoriesSetting?.settingValue || ''));

      const materialUnitsSetting = settingsData.find((s: any) => s.settingKey === 'materialUnits');
      setMaterialUnits(parseConfiguredList(materialUnitsSetting?.settingValue || ''));

      const safeProducts = Array.isArray(productsData) ? productsData as ProductSummary[] : [];
      const safeMaterials = Array.isArray(materialsData) ? materialsData as MaterialSummary[] : [];

      // Lock base currency if any materials exist
      try {
        setBaseCurrencyLocked(Array.isArray(safeMaterials) && safeMaterials.length > 0);
      } catch {
        setBaseCurrencyLocked(false);
      }

      setProductCategoryCounts(
        countByNormalized(
          safeProducts
            .map((product) => (product.category || '').trim())
            .filter((category) => category.length > 0)
        )
      );

      setMaterialCategoryCounts(
        countByNormalized(
          safeMaterials
            .map((material) => (material.category || '').trim())
            .filter((category) => category.length > 0)
        )
      );

      setMaterialUnitCounts(
        countByNormalized(
          safeMaterials
            .map((material) => (material.unit || '').trim())
            .filter((unit) => unit.length > 0)
        )
      );
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function handleSaveMasterData() {
    setIsSavingMasterData(true);
    setMasterDataMessage('');
    try {
      const normalizedProductCategories = normalizeMasterListInput(productCategories.join('\n'));
      const normalizedMaterialCategories = normalizeMasterListInput(materialCategories.join('\n'));
      const normalizedMaterialUnits = normalizeMasterListInput(materialUnits.join('\n'));

      await Promise.all([
        settingsApi.save({ settingKey: 'productCategories', settingValue: JSON.stringify(normalizedProductCategories) }),
        settingsApi.save({ settingKey: 'materialCategories', settingValue: JSON.stringify(normalizedMaterialCategories) }),
        settingsApi.save({ settingKey: 'materialUnits', settingValue: JSON.stringify(normalizedMaterialUnits) }),
      ]);

      setProductCategories(normalizedProductCategories);
      setMaterialCategories(normalizedMaterialCategories);
      setMaterialUnits(normalizedMaterialUnits);
      setMasterDataMessage('Master data saved. New values are available across forms.');
      showToastMessage('Master data saved successfully', 'success');
      window.setTimeout(() => setMasterDataMessage(''), 3000);
    } catch (error) {
      console.error('Error saving master data:', error);
      setMasterDataMessage('Failed to save master data.');
    } finally {
      setIsSavingMasterData(false);
    }
  }

  async function handleBackup() {
    setIsBackingUp(true);
    setBackupUserMsg('');
    setBackupUserError('');
    try {
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `priceright_backup_${date}.db`;

      if (window.electronAPI?.isElectron) {
        const response = await fetch(`${API_BASE}/backup/download`);
        if (!response.ok) throw new Error('Backup download failed');
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const result = await window.electronAPI.saveBackupFile(base64, filename);
        if (result.canceled) {
          // user cancelled — no message
        } else if (result.success) {
          setBackupUserMsg(`Backup saved to: ${result.filePath}`);
        } else {
          throw new Error(result.error ?? 'Save failed');
        }
      } else {
        const link = document.createElement('a');
        link.href = `${API_BASE}/backup/download`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setBackupUserMsg('Backup downloaded successfully.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Backup failed';
      setBackupUserError(message);
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestore() {
    setBackupUserMsg('');
    setBackupUserError('');

    try {
      let base64Data: string | null = null;

      if (window.electronAPI?.isElectron) {
        const result = await window.electronAPI.selectRestoreFile();
        if (result.canceled) return;
        if (result.error) throw new Error(result.error);
        base64Data = result.base64 ?? null;
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.db';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) { reject(new Error('No file selected')); return; }
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              resolve(dataUrl.split(',')[1]);
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
          };
          document.body.appendChild(input);
          input.click();
          document.body.removeChild(input);
        });
      }

      if (!base64Data) throw new Error('No backup data');

      setPendingRestoreData(base64Data);
      setShowRestoreModal(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      if (message !== 'No file selected') {
        setBackupUserError(message);
      }
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestoreData) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: pendingRestoreData }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Restore failed');

      setShowRestoreModal(false);
      setPendingRestoreData(null);
      setBackupUserMsg('Backup restored successfully. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      setBackupUserError(message);
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleLiveReset() {
    if (resetConfirmText !== 'DELETE') return;
    setIsResetting(true);
    setResetError(null);
    try {
      const response = await fetch(`${API_BASE}/reset/live`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Reset failed');
      }
      // Clear PIN unlock state so PIN screen shows
      sessionStorage.removeItem('priceright_skip_pin_once');
      // Reload to fresh state
      window.location.reload();
    } catch (err: any) {
      setResetError(err?.message || 'Reset failed. Try again.');
    } finally {
      setIsResetting(false);
    }
  }

  async function handleAddCurrency(e: React.FormEvent) {
    e.preventDefault();
    try {
      await currenciesApi.create(formData);
      setShowAddModal(false);
      setFormData({ code: '', name: '', symbol: '' });
      loadData();
    } catch (error) {
      console.error('Error adding currency:', error);
    }
  }

  async function handleSetBaseCurrency(code: string) {
    try {
      if (baseCurrencyLocked) {
        showToastMessage('Base currency is locked. Reset all data to change it.', 'error');
        return;
      }
      await settingsApi.save({ settingKey: 'baseCurrency', settingValue: code });
      setBaseCurrency(code);
      setBaseCurrencyMissing(false);
    } catch (error) {
      console.error('Error setting base currency:', error);
      showToastMessage('Failed to set base currency', 'error');
    }
  }

  async function handleSaveDefaultProfitMargin() {
    try {
      await settingsApi.save({ settingKey: 'defaultProfitMargin', settingValue: defaultProfitMargin });
      showToastMessage('Default Markup % saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving default profit margin:', error);
      showToastMessage('Failed to save default Markup %', 'error');
    }
  }

  async function handleSaveHealthyMarkupThreshold() {
    try {
      await settingsApi.save({ settingKey: 'healthyMarkupThreshold', settingValue: healthyMarkupThreshold });
      showToastMessage('Healthy markup threshold saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving healthy markup threshold:', error);
      showToastMessage('Failed to save healthy markup threshold', 'error');
    }
  }

  async function handleSaveDefaultOverhead() {
    try {
      await settingsApi.save({ settingKey: 'defaultOverhead', settingValue: defaultOverhead });
      showToastMessage('Default overhead rate saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving default overhead:', error);
      showToastMessage('Failed to save default overhead rate', 'error');
    }
  }

  async function handleSaveBranding() {
    setIsSavingBranding(true);
    setBrandingMessage('');
    try {
      await settingsApi.save({ settingKey: 'companyName', settingValue: companyName.trim() });
      await settingsApi.save({ settingKey: 'companyLogoDataUrl', settingValue: companyLogoDataUrl || '' });
      setBrandingMessage('Company branding saved.');
      window.setTimeout(() => setBrandingMessage(''), 3000);
    } catch (error) {
      console.error('Error saving company branding:', error);
      setBrandingMessage('Failed to save company branding.');
    } finally {
      setIsSavingBranding(false);
    }
  }

  function handleLogoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBrandingMessage('Please choose an image file for logo.');
      return;
    }

    if (file.size > 1024 * 1024) {
      setBrandingMessage('Logo must be 1MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setCompanyLogoDataUrl(result);
      setBrandingMessage('Logo selected. Click Save Branding to apply.');
    };
    reader.onerror = () => {
      setBrandingMessage('Could not read selected logo file.');
    };
    reader.readAsDataURL(file);
  }

  async function handleUpdateRate(currencyId: number) {
    setIsSavingRate(true);
    setSavingRateCurrencyId(currencyId);
    setRateSaveBanner(null);

    try {
      const parsedRate = parseFloat(rateValue);
      const roundedRate = Number(parsedRate.toFixed(2));
      const response = await exchangeRatesApi.update(currencyId, { rateToBase: roundedRate }) as ExchangeRateUpdateResponse;

      const summary = response.recalculation;
      const reminder = 'Materials and Products pages will show updated values on next load.';

      if (response.recalculationFailed) {
        setRateSaveBanner({
          tone: 'warning',
          message: 'WARNING: Rate saved, but recalculation failed. Please go to Materials and manually trigger recalculation.',
          reminder,
        });
      } else if ((summary?.materialsUpdated ?? 0) === 0) {
        setRateSaveBanner({
          tone: 'success',
          message: 'SUCCESS: Exchange rate saved. No materials use this currency.',
          reminder,
        });
      } else {
        setRateSaveBanner({
          tone: 'success',
          message: `SUCCESS: Exchange rate saved. ${summary?.materialsUpdated ?? 0} materials and ${summary?.productsReviewed ?? 0} products recalculated. ${summary?.productsNowNeedsReview ?? 0} products moved to Needs Review.`,
          reminder,
        });
      }
      
      setEditingRate(null);
      setRateValue('');
      // Note: Materials and Products pages will reflect recalculated values
      // on their next load. Users should refresh those pages after a rate change.
      loadData();
    } catch (error) {
      console.error('Error updating rate:', error);
      setRateSaveBanner({
        tone: 'error',
        message: 'WARNING: Rate save failed. Please try again.',
      });
    } finally {
      setIsSavingRate(false);
      setSavingRateCurrencyId(null);
    }
  }

  function getExchangeRate(currencyId: number) {
    const rate = exchangeRates.find((r) => r.currencyId === currencyId);
    return rate ? rate.rateToBase : 1;
  }

  function calculateOverheadPercentage() {
    const totalOverhead = parseFloat(overheadInputs.totalOverhead || '0');
    const materialCosts = parseFloat(overheadInputs.materialCosts || '0');
    
    if (materialCosts === 0) return 0;
    return Math.round((totalOverhead / materialCosts) * 100);
  }

  function handleUseCalculatedRate() {
    const calculatedRate = calculateOverheadPercentage();
    setDefaultOverhead(calculatedRate.toString());
  }

  async function handleChangePin() {
    if (!/^\d{4,6}$/.test(currentPin)) {
      showToastMessage('Enter your current 4-6 digit PIN', 'error');
      return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      showToastMessage('New PIN must be 4 to 6 digits', 'error');
      return;
    }

    if (newPin !== confirmNewPin) {
      showToastMessage('New PIN and confirmation do not match', 'error');
      return;
    }

    setIsChangingPin(true);
    try {
      await pinApi.set(newPin, currentPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      showToastMessage('PIN changed successfully', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change PIN';
      showToastMessage(message, 'error');
    } finally {
      setIsChangingPin(false);
    }
  }

  async function handleDemoModeToggle() {
    if (demoModeLoading || isSwitchingMode) {
      return;
    }

    setPendingDemoMode(!isDemoMode);
    setShowDemoModeModal(true);
  }

  async function handleConfirmDemoModeToggle() {
    if (pendingDemoMode === null || demoModeLoading || isSwitchingMode) {
      return;
    }

    setIsSwitchingMode(true);
    try {
      await setDemoMode(pendingDemoMode);
      try { sessionStorage.setItem('priceright_skip_pin_once', '1'); } catch {}
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch data mode:', error);
      showToastMessage('Failed to switch data mode', 'error');
    } finally {
      setIsSwitchingMode(false);
      setShowDemoModeModal(false);
      setPendingDemoMode(null);
    }
  }

  function handleOpenResetDemoModal() {
    setResetDemoConfirmText('');
    setShowResetDemoModal(true);
  }

  async function handleResetDemoData() {
    if (resetDemoConfirmText !== 'RESET') return;

    try {
      await demoModeApi.reset();
      try { sessionStorage.setItem('priceright_skip_pin_once', '1'); } catch {}
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset demo data:', error);
      showToastMessage('Failed to reset demo data', 'error');
    }
  }

  async function handleConfirmDeleteCurrency() {
    if (!deleteCurrencyTarget) return;
    try {
      await currenciesApi.delete(deleteCurrencyTarget.id);
      loadData();
      showToastMessage(`${deleteCurrencyTarget.code} deleted`, 'success');
      setDeleteCurrencyTarget(null);
    } catch (error) {
      showToastMessage('Failed to delete currency', 'error');
    }
  }

  return (
    <div className="app-page settings-page">
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      {/* Header */}
      <div className="app-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeSection === null ? (
            <>
              <h1 className="settings-home__title">Settings</h1>
              <p className="settings-home__subtitle">Manage your PriceRight preferences</p>
            </>
          ) : (
            <h1 className="settings-home__title">Settings</h1>
          )}
        </div>
        <PageHelpButton context="settings" />
      </div>

      <div className="app-page-content">
        {rateSaveBanner && (
          <div
            style={{
              position: 'relative',
              marginBottom: '16px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              padding: '12px 44px 12px 14px',
              color: '#0f172a',
            }}
            role="status"
            aria-live="polite"
          >
            <button
              className="btn-close-x"
              type="button"
              onClick={() => setRateSaveBanner(null)}
              aria-label="Dismiss message"
            >
              &times;
            </button>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>{rateSaveBanner.message}</div>
            {rateSaveBanner.reminder && (
              <div style={{ marginTop: '6px', fontSize: '14px', color: '#475569' }}>{rateSaveBanner.reminder}</div>
            )}
          </div>
        )}

        {activeSection === null && (
          <div className="settings-home__grid">
            {SETTINGS_SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              return (
                <button
                  key={section.key}
                  type="button"
                  className="settings-home__card"
                  onClick={() => openSettingsSection(section.key)}
                >
                  <div className="settings-home__card-main">
                    <SectionIcon size={28} color="#16A34A" style={{ marginBottom: '12px' }} />
                    <div className="settings-home__card-name">{section.name}</div>
                    <div className="settings-home__card-desc">{section.description}</div>
                  </div>
                  <span className="settings-home__arrow" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
        )}

        {activeSection !== null && activeSectionMeta && (
          <>
            <button type="button" className="settings-section-back" onClick={goToSettingsHome}>
              ← Settings
            </button>
            <h2 className="settings-section-title">{activeSectionMeta.name}</h2>
            <p className="settings-section-subtitle">{activeSectionMeta.description}</p>
          </>
        )}

        {activeSection === 'business' && (
            <>
            <div className="app-card app-settings-card">
              <h2>Company Branding</h2>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label className="app-settings-label">Company Name</label>
                  <input
                    className="app-control"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter company name"
                  />
                  <div className="app-page-subtitle" style={{ marginTop: '6px', fontSize: '14px' }}>
                    Appears in the app header, on printed price lists, and on exported documents
                  </div>
                </div>

                <div>
                  <label className="app-settings-label">Logo</label>
                  <input
                    className="app-control"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                  />
                  <div className="app-page-subtitle" style={{ marginTop: '6px', fontSize: '14px' }}>
                    Appears in the app header and on printed price lists. Recommended size: at least 200 × 200 pixels. Supported formats: PNG, JPG.
                  </div>
                </div>

                {companyLogoDataUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={companyLogoDataUrl}
                      alt="Company logo preview"
                      style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #dbe2ea' }}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCompanyLogoDataUrl('')}
                      type="button"
                      style={{ padding: '6px 10px', fontSize: '14px' }}
                    >
                      Remove Logo
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveBranding}
                    disabled={isSavingBranding}
                    type="button"
                  >
                    {isSavingBranding ? 'Saving...' : 'Save Branding'}
                  </button>
                  {brandingMessage && <span style={{ fontSize: '14px', color: '#475569' }}>{brandingMessage}</span>}
                </div>
              </div>
            </div>

            <div className="app-card app-settings-card">
              <h2>Security</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Change your PIN to protect access to PriceRight.
              </p>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label className="app-settings-label">Current PIN</label>
                  <input
                    className="app-control"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={currentPin}
                    onChange={(event) => setCurrentPin(sanitizePinInput(event.target.value))}
                    placeholder="Enter current PIN"
                    disabled={isChangingPin}
                  />
                </div>

                <div>
                  <label className="app-settings-label">New PIN</label>
                  <input
                    className="app-control"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(event) => setNewPin(sanitizePinInput(event.target.value))}
                    placeholder="Enter new PIN"
                    disabled={isChangingPin}
                  />
                </div>

                <div>
                  <label className="app-settings-label">Confirm new PIN</label>
                  <input
                    className="app-control"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(event) => setConfirmNewPin(sanitizePinInput(event.target.value))}
                    placeholder="Re-enter new PIN"
                    disabled={isChangingPin}
                  />
                </div>

                <div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleChangePin}
                    disabled={isChangingPin}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    {isChangingPin ? '...' : 'Change PIN'}
                  </button>
                </div>
              </div>
            </div>

            <div className="app-card app-settings-card">
              <h2>About</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Application version and product information.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  padding: '12px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>PriceRight</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    Pricing management for food manufacturers
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#0F2847',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  v{import.meta.env.VITE_APP_VERSION}
                </div>
              </div>
              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
              }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowPrivacy(true)}
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowTerms(true)}
                >
                  Terms of Service
                </button>
              </div>
            </div>

            </>
            )}

            {activeSection === 'pricing' && (
            <>
            <div className="app-card app-settings-card">
              <h2>Default settings for new products</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                These values are used as starting points when you create a new product. You can override them on each product individually.
              </p>
              <div className="app-settings-row-end" style={{ marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label className="app-settings-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Default Markup %
                    <MarkupInfoTooltip />
                  </label>
                  <div className="app-page-subtitle" style={{ marginTop: '6px', fontSize: '14px', marginBottom: '8px' }}>
                    The default markup on cost applied when creating new products. You can override this on each product individually.
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="app-control"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={defaultProfitMargin}
                      onChange={(e) => setDefaultProfitMargin(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        paddingRight: '35px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '16px',
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>%</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveDefaultProfitMargin}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Save
                </button>
              </div>
              <div className="app-settings-row-end" style={{ marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label className="app-settings-label">
                    Healthy markup threshold (%)
                  </label>
                  <div className="app-page-subtitle" style={{ marginTop: '6px', fontSize: '14px', marginBottom: '8px' }}>
                    Sets the minimum markup % considered healthy across the app. Products are colour-coded based on this threshold:
                    <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.6 }}>
                      <li>Healthy (green) — markup at or above this value</li>
                      <li>Low (amber) — markup between half this value and this value</li>
                      <li>Critical (red) — markup below half this value</li>
                    </ul>
                    <div style={{ marginTop: '8px' }}>
                      For example with a 30% threshold: Healthy ≥ 30%, Low 15%–30%, Critical &lt; 15%.
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      This threshold applies to the Dashboard, Products table, Reports, and the Markup Health Guide card.
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="app-control"
                      type="number"
                      min="1"
                      max="200"
                      step="0.1"
                      value={healthyMarkupThreshold}
                      onChange={(e) => setHealthyMarkupThreshold(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        paddingRight: '35px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '16px',
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>%</span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#94A3B8' }}>
                    The Markup Health Guide card (visible on key pages) updates automatically when you change this value.
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveHealthyMarkupThreshold}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Save
                </button>
              </div>
              <div className="app-settings-row-end">
                <div style={{ flex: 1 }}>
                  <label className="app-settings-label">
                    Default Overhead %
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="app-control"
                      type="number"
                      step="0.1"
                      value={defaultOverhead}
                      onChange={(e) => setDefaultOverhead(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        paddingRight: '35px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '16px',
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>%</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveDefaultOverhead}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="app-card app-settings-card">
              <h2 style={{ marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={18} strokeWidth={2} />
                Overhead Calculator
              </h2>
              <p className="app-page-subtitle" style={{ fontSize: '14px', marginBottom: '16px' }}>
                (Overhead ÷ Material Costs) × 100 = Rate %
              </p>

              <div className="app-settings-note">
                <strong style={{ color: '#1f2937' }}>Include:</strong> Rent, utilities, salaries, maintenance, transport, admin<br/>
                <strong style={{ color: '#1f2937' }}>Exclude:</strong> Materials, capital equipment, profit, debt
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '15px', fontWeight: '600' }}>
                    Monthly Overhead ({baseCurrency || 'GHS'})
                  </label>
                  <input
                    className="app-control"
                    type="number"
                    value={overheadInputs.totalOverhead}
                    onChange={(e) => setOverheadInputs({ ...overheadInputs, totalOverhead: e.target.value })}
                    placeholder="e.g., 5000"
                    style={{ fontSize: '15px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '15px', fontWeight: '600', color: '#10b981' }}>
                    Material Costs ({baseCurrency || 'GHS'})
                  </label>
                  <input
                    className="app-control"
                    type="number"
                    value={overheadInputs.materialCosts}
                    onChange={(e) => setOverheadInputs({ ...overheadInputs, materialCosts: e.target.value })}
                    placeholder="e.g., 10000"
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '2px solid #10b981',
                      fontSize: '15px',
                    }}
                  />
                </div>
              </div>

              <div style={{
                backgroundColor: '#f0fdf4',
                border: '2px solid #10b981',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Recommended Rate:</div>
                <div style={{ fontSize: '34px', fontWeight: '700', color: '#10b981', marginBottom: '4px' }}>
                  {calculateOverheadPercentage()}%
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {baseCurrency || 'GHS'} {(parseFloat(overheadInputs.materialCosts || '0') * calculateOverheadPercentage() / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per {baseCurrency || 'GHS'} {parseFloat(overheadInputs.materialCosts || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <button
                className="btn btn-success"
                onClick={handleUseCalculatedRate}
                disabled={calculateOverheadPercentage() === 0}
                style={{
                  width: '100%',
                  backgroundColor: calculateOverheadPercentage() === 0 ? '#e2e8f0' : '#10b981',
                  color: calculateOverheadPercentage() === 0 ? '#94a3b8' : 'white',
                  cursor: calculateOverheadPercentage() === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Use as Default
              </button>
            </div>
            </>
            )}

            {activeSection === 'categories' && (
            <div className="app-card app-settings-card">
              <h2>Master Data</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Define standard categories and units that appear as suggestions when creating products and materials.
              </p>

              <div style={{ display: 'grid', gap: '18px' }}>
                <CategoryChipEditor
                  label="Product Categories"
                  hint="Suggested options when creating/editing products"
                  values={productCategories}
                  onChange={setProductCategories}
                  usageCounts={productCategoryCounts}
                  usageNoun="product"
                />

                <CategoryChipEditor
                  label="Raw Material Categories"
                  hint="Suggested options when creating/editing materials"
                  values={materialCategories}
                  onChange={setMaterialCategories}
                  usageCounts={materialCategoryCounts}
                  usageNoun="material"
                />

                <CategoryChipEditor
                  label="Units of Measure"
                  hint="Suggested options when specifying material quantities"
                  values={materialUnits}
                  onChange={setMaterialUnits}
                  usageCounts={materialUnitCounts}
                  usageNoun="material"
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveMasterData}
                    disabled={isSavingMasterData}
                    type="button"
                  >
                    {isSavingMasterData ? 'Saving...' : 'Save Master Data'}
                  </button>
                  {masterDataMessage && <span style={{ fontSize: '14px', color: '#475569' }}>{masterDataMessage}</span>}
                </div>
              </div>
            </div>
            )}

        {activeSection === 'data' && (
        <>
        <div className="app-card app-settings-card" style={{ marginBottom: '16px' }}>
          <h2>Data mode</h2>
          <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
            Switch between your real data and the built-in Savanna Bakes sample data.
          </p>
          <div className="app-choice-tabs" role="tablist" aria-label="Data mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isDemoMode}
              className={`app-choice-tab ${!isDemoMode ? 'is-active' : ''}`}
              disabled={!isDemoMode}
              onClick={() => !isDemoMode ? null : handleDemoModeToggle()}
            >
              Use my real data
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isDemoMode}
              className={`app-choice-tab ${isDemoMode ? 'is-active' : ''}`}
              disabled={isDemoMode}
              onClick={() => isDemoMode ? null : handleDemoModeToggle()}
            >
              Try sample data
            </button>
          </div>
          {isSwitchingMode && <span style={{ fontSize: '14px', color: '#64748b', display: 'block', marginTop: '8px' }}>Switching data mode...</span>}
          {isDemoMode && (
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  handleOpenResetDemoModal();
                }}
              >
                Reset demo data
              </button>
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>
                Restores the original Savanna Foods sample data
              </div>
            </div>
          )}
        </div>

        <div className="app-card app-settings-card">
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} strokeWidth={2} /> Danger Zone</h2>
          <p className="app-page-subtitle" style={{ marginBottom: '12px' }}>
            These actions are permanent and cannot be undone.
          </p>
          <div style={{ marginBottom: '12px', color: '#64748b' }}>
            Resetting will permanently delete ALL live data and clear your PIN. Create a backup first if you want to preserve your data.
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setResetStep(1);
                setResetConfirmText('');
                setResetError(null);
                setShowResetModal(true);
              }}
            >
              Reset all data
            </button>
          </div>
        </div>

        <div className="app-card app-settings-card">
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><HardDrive size={18} strokeWidth={2} /> Database Backups</h2>
          <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
            PriceRight automatically creates local backups every hour. Use the button below to download a backup file you can store safely offsite.
          </p>

          <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '15px', color: '#166534' }}>
            {backupStatus ? (
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Package size={14} strokeWidth={2} /> Backup Status:</strong>
                </div>
                <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} strokeWidth={2} />
                  Total backups stored: <strong>{backupStatus.backupCount}</strong>
                </div>
                {backupStatus.lastBackupTime && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock3 size={14} strokeWidth={2} />
                    Last backup: <strong>{new Date(backupStatus.lastBackupTime).toLocaleString()}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div>Loading backup status...</div>
            )}
          </div>

          {isDemoMode && (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: '#D97706',
              marginBottom: '12px',
            }}>
              ⚠ You are in demo mode. Switch to your real data before creating a backup.
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => { void handleBackup(); }}
              disabled={isBackingUp || isRestoring || isDemoMode}
            >
              {isBackingUp ? 'Downloading backup...' : 'Download backup file'}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => { void handleRestore(); }}
              disabled={isBackingUp || isRestoring || isDemoMode}
            >
              {isRestoring ? 'Restoring...' : 'Restore from backup'}
            </button>
          </div>
          <p style={{ marginTop: '10px', fontSize: '14px', color: '#64748b' }}>
            Downloads your current data as a backup file. Save it to a safe location such as Google Drive, Dropbox, or a USB drive.
          </p>
          {backupUserMsg && (
            <div style={{ marginTop: '10px', fontSize: '15px', color: '#166534' }}>{backupUserMsg}</div>
          )}
          {backupUserError && (
            <div style={{ marginTop: '10px', fontSize: '15px', color: '#991b1b' }}>{backupUserError}</div>
          )}
        </div>

        <div className="app-card app-settings-card">
          <h2>Sample data</h2>
          <p className="app-page-subtitle" style={{ marginBottom: '12px' }}>
            Download sample files to explore PriceRight with realistic data before entering your own.
          </p>
          <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#0c4a6e', marginBottom: '6px' }}>Import sample data in this order:</p>
            <ol style={{ fontSize: '15px', color: '#0F2847', paddingLeft: '20px', lineHeight: '1.9', margin: 0 }}>
              <li>Download and import <strong>Sample Materials</strong> first</li>
              <li>Download and import <strong>Sample Intermediates</strong> second</li>
              <li>Download and import <strong>Sample Products</strong> last</li>
            </ol>
            <p style={{ fontSize: '14px', color: '#0c4a6e', marginTop: '6px', marginBottom: 0 }}>Each file depends on the previous one being imported first.</p>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {/* Row 1 — Raw materials */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={18} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0F2847' }}>Sample raw materials</div>
                <div style={{ fontSize: '14px', fontWeight: '400', color: '#64748b', marginTop: '2px' }}>25 raw materials — ingredients, oils, grains, and packaging for a food manufacturer</div>
              </div>
              <a
                href={templateUrl('PriceRight_Sample_Materials.csv')}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDownload('PriceRight_Sample_Materials.csv');
                }}
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px 12px', cursor: downloading ? 'wait' : 'pointer', opacity: downloading ? 0.6 : 1, pointerEvents: downloading ? 'none' : 'auto' }}
              >
                {downloading === 'PriceRight_Sample_Materials.csv' ? 'Downloading...' : 'Download'}
              </a>
            </div>
            {/* Row 2 — Intermediate materials */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Layers size={18} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0F2847' }}>Sample intermediate materials</div>
                <div style={{ fontSize: '14px', fontWeight: '400', color: '#64748b', marginTop: '2px' }}>5 in-house processed ingredients — peanut paste, cocoa powder, blended spice mix</div>
              </div>
              <a
                href={templateUrl('PriceRight_Sample_Intermediates.csv')}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDownload('PriceRight_Sample_Intermediates.csv');
                }}
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px 12px', cursor: downloading ? 'wait' : 'pointer', opacity: downloading ? 0.6 : 1, pointerEvents: downloading ? 'none' : 'auto' }}
              >
                {downloading === 'PriceRight_Sample_Intermediates.csv' ? 'Downloading...' : 'Download'}
              </a>
            </div>
            {/* Row 3 — Products with BOM */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShoppingBag size={18} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0F2847' }}>Sample products with ingredients</div>
                <div style={{ fontSize: '14px', fontWeight: '400', color: '#64748b', marginTop: '2px' }}>11 finished products with full bills of materials — import materials first, then import this file</div>
              </div>
              <a
                href={templateUrl('PriceRight_Sample_Products.csv')}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDownload('PriceRight_Sample_Products.csv');
                }}
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px 12px', cursor: downloading ? 'wait' : 'pointer', opacity: downloading ? 0.6 : 1, pointerEvents: downloading ? 'none' : 'auto' }}
              >
                {downloading === 'PriceRight_Sample_Products.csv' ? 'Downloading...' : 'Download'}
              </a>
            </div>
          </div>
        </div>
        </>
        )}

        {activeSection === 'currencies' && (
        <>
        <div className="app-card app-settings-card">
          <h2>Base Currency</h2>
          <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
            All prices will be converted to this currency for calculations.
          </p>
          {baseCurrencyLocked ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} />
                <div style={{ fontWeight: 700 }}>{baseCurrency || 'GHS'}</div>
                <div style={{ color: '#64748b' }}>(locked)</div>
              </div>
              <div style={{ color: '#64748b', fontSize: '13px' }}>Base currency is locked because materials exist. Reset all data to change it.</div>
            </div>
          ) : (
            <select
              className="app-control"
              value={baseCurrency}
              onChange={(e) => handleSetBaseCurrency(e.target.value)}
              style={{ minWidth: '200px' }}
            >
              <option value="">Select base currency</option>
              {currencies.map((currency) => (
                <option key={currency.id} value={currency.code}>
                  {currency.code} - {currency.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="app-card app-settings-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>Currencies</h2>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} strokeWidth={2} />
              Add Currency
            </button>
          </div>

          {currencies.length === 0 && (
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '14px', color: '#78350f' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>No currencies configured yet.</strong>
                Start by adding your base currency (e.g. USD, GBP, NGN, GHS). You can add foreign currencies for imported materials after.
              </div>
            </div>
          )}

          <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Code</th>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th style={{ textAlign: 'left' }}>Symbol</th>
                <th style={{ textAlign: 'right' }}>Exchange Rate</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((currency) => (
                <tr key={currency.id}>
                  <td style={{ fontWeight: '600' }}>{currency.code}</td>
                  <td>{currency.name}</td>
                  <td>{currency.symbol}</td>
                  <td style={{ textAlign: 'right' }}>
                    {editingRate === currency.id ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={rateValue}
                          onChange={(e) => setRateValue(e.target.value)}
                          style={{
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            width: '120px',
                          }}
                        />
                        <button
                          onClick={() => {
                            setEditingRate(null);
                            setRateValue('');
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#e2e8f0',
                            color: '#1a202c',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateRate(currency.id)}
                          disabled={isSavingRate && savingRateCurrencyId === currency.id}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: (isSavingRate && savingRateCurrencyId === currency.id) ? '#cbd5e1' : '#0F2847',
                            color: 'white',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: (isSavingRate && savingRateCurrencyId === currency.id) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {(isSavingRate && savingRateCurrencyId === currency.id) ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span>{getExchangeRate(currency.id).toFixed(2)}</span>
                        <button
                          onClick={() => {
                            setEditingRate(currency.id);
                            setRateValue(getExchangeRate(currency.id).toFixed(2));
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '14px',
                            backgroundColor: 'rgba(15,40,71,0.06)',
                            color: '#0F2847',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Edit Rate
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: '600',
                        backgroundColor: currency.isActive ? '#d1fae5' : '#fee2e2',
                        color: currency.isActive ? '#065f46' : '#991b1b',
                      }}
                    >
                      {currency.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {currency.code === baseCurrency ? (
                      <span
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          color: '#64748b',
                          fontStyle: 'italic',
                        }}
                      >
                        Base Currency (Protected)
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteCurrencyTarget(currency)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Trash2 size={13} strokeWidth={2} />
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Clear All Data Modal */}
      {showResetModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => { setShowResetModal(false); setResetStep(1); setResetConfirmText(''); }} aria-label="Close">&times;</button>
            {resetStep === 1 && (
              <>
                <h2 className="app-modal-title">Clear All Data</h2>
                <p style={{ marginTop: '8px', color: '#475569' }}>
                  This will permanently delete everything in your live database:
                </p>
                <ul style={{ marginTop: '12px', color: '#475569' }}>
                  <li>All materials and intermediate materials</li>
                  <li>All products and bills of materials</li>
                  <li>All price levels and price lists</li>
                  <li>All approved prices and price history</li>
                  <li>All currencies and exchange rates</li>
                  <li>All settings including base currency</li>
                  <li>Your PIN — you will need to set a new one</li>
                  <li>All activity log entries</li>
                </ul>
                <p style={{ marginTop: '12px', color: '#7f1d1d' }}><strong>This cannot be undone. Create a backup first if you want to keep a copy of your data.</strong></p>
                <div className="app-modal-actions" style={{ marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={() => { setShowResetModal(false); setResetStep(1); setResetConfirmText(''); }}>Cancel</button>
                  <button className="btn btn-ghost" onClick={() => { setResetStep(2); }}>Create backup first</button>
                  <button className="btn btn-primary" onClick={() => { setResetStep(2); }}>Continue →</button>
                </div>
              </>
            )}
            {resetStep === 2 && (
              <>
                <h2 className="app-modal-title">Clear All Data</h2>
                <p style={{ marginTop: '8px', color: '#475569' }}>
                  All your products, materials, price levels, and settings will be permanently deleted. This cannot be undone. Type <strong>DELETE</strong> to confirm.
                </p>
                <input
                  className="app-control"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  style={{ marginTop: '12px', width: '100%' }}
                  autoFocus
                />
                {resetError && (
                  <div style={{ marginTop: '12px', color: '#991b1b' }}>{resetError}</div>
                )}
                <div className="app-modal-actions" style={{ marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={() => setResetStep(1)} disabled={isResetting}>← Back</button>
                  <button className="btn btn-danger" onClick={() => handleLiveReset()} disabled={isResetting || resetConfirmText !== 'DELETE'}>
                    {isResetting ? 'Clearing...' : 'Clear all data permanently'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showRestoreModal && (
        <div className="app-modal-overlay" onClick={() => { if (!isRestoring) { setShowRestoreModal(false); setPendingRestoreData(null); } }}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => { if (!isRestoring) { setShowRestoreModal(false); setPendingRestoreData(null); } }} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Restore Backup</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This will replace ALL your current data with the data from the backup file. This cannot be undone.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowRestoreModal(false); setPendingRestoreData(null); }} disabled={isRestoring}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleConfirmRestore()} disabled={isRestoring}>
                {isRestoring ? 'Restoring...' : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDemoModeModal && pendingDemoMode !== null && (
        <div className="app-modal-overlay" onClick={() => { if (!isSwitchingMode) { setShowDemoModeModal(false); setPendingDemoMode(null); } }}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => { if (!isSwitchingMode) { setShowDemoModeModal(false); setPendingDemoMode(null); } }} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">{pendingDemoMode ? 'Enable Demo Mode' : 'Switch to Live Data'}</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              {pendingDemoMode
                ? 'The app will start reading from demo.db sample data.'
                : 'The app will start reading from priceright.db real data.'}
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowDemoModeModal(false); setPendingDemoMode(null); }} disabled={isSwitchingMode}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void handleConfirmDemoModeToggle()} disabled={isSwitchingMode}>
                {isSwitchingMode ? 'Switching...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetDemoModal && (
        <div className="app-modal-overlay" onClick={() => setShowResetDemoModal(false)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowResetDemoModal(false)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Reset Demo Data</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              All current data will be replaced with demo data. Type <strong>RESET</strong> to confirm.
            </p>
            <input
              className="app-control"
              value={resetDemoConfirmText}
              onChange={(e) => setResetDemoConfirmText(e.target.value)}
              style={{ marginBottom: '20px', width: '100%' }}
              autoFocus
            />
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowResetDemoModal(false)}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleResetDemoData()} disabled={resetDemoConfirmText !== 'RESET'}>
                Reset Demo Data
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCurrencyTarget && (
        <div className="app-modal-overlay" onClick={() => setDeleteCurrencyTarget(null)}>
          <div className="app-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setDeleteCurrencyTarget(null)} aria-label="Close">&times;</button>
            <h2 className="app-modal-title">Delete Currency</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '16px' }}>
              This currency will be removed. Any materials or price levels using this currency will be affected.
            </p>
            <div className="app-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteCurrencyTarget(null)}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={() => void handleConfirmDeleteCurrency()}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <AppModal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Currency" maxWidth={500}>
        <form onSubmit={handleAddCurrency}>
          <div style={{ marginBottom: '16px' }}>
            <label className="app-settings-label">
              Currency Code *
            </label>
            <input
              className="app-control"
              type="text"
              required
              maxLength={3}
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., USD"
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label className="app-settings-label">
              Currency Name *
            </label>
            <input
              className="app-control"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., US Dollar"
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label className="app-settings-label">
              Symbol *
            </label>
            <input
              className="app-control"
              type="text"
              required
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              placeholder="e.g., $"
            />
          </div>
          <div className="app-modal-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
            >
              Add Currency
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal open={showPrivacy} onClose={() => setShowPrivacy(false)} title="Privacy Policy" maxWidth={640}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          <PrivacyPolicyContent />
        </div>
      </AppModal>

      <AppModal open={showTerms} onClose={() => setShowTerms(false)} title="Terms of Service" maxWidth={640}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          <TermsOfServiceContent />
        </div>
      </AppModal>

    </div>
  );
}