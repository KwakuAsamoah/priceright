import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calculator, CheckCircle2, Clock3, Database, HardDrive, Layers, ListTree, Package, Plus, Settings2, ShoppingBag, Trash2, WalletCards, Lock } from 'lucide-react';
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

type SettingsTab = 'general' | 'pricing' | 'currencies' | 'master-data' | 'data-backups';

const SETTINGS_TABS: Array<{ key: SettingsTab; label: string; icon: LucideIcon }> = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'pricing', label: 'Pricing Engine', icon: Calculator },
  { key: 'currencies', label: 'Currencies & Rates', icon: WalletCards },
  { key: 'master-data', label: 'Master Data', icon: ListTree },
  { key: 'data-backups', label: 'Data & Backups', icon: Database },
];

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

export default function Settings() {
  const [searchParams] = useSearchParams();
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
  const [productCategoriesInput, setProductCategoriesInput] = useState('');
  const [materialCategoriesInput, setMaterialCategoriesInput] = useState('');
  const [materialUnitsInput, setMaterialUnitsInput] = useState('');
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
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    setHasOpenForm(showAddModal || showResetModal || showPrivacy || showTerms);
  }, [showAddModal, showResetModal, showPrivacy, showTerms, setHasOpenForm]);

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
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const urlTab = searchParams.get('tab');
    if (
      urlTab === 'general'
      || urlTab === 'pricing'
      || urlTab === 'currencies'
      || urlTab === 'master-data'
      || urlTab === 'data-backups'
    ) {
      return urlTab;
    }
    return 'general';
  });

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (
      urlTab === 'general'
      || urlTab === 'pricing'
      || urlTab === 'currencies'
      || urlTab === 'master-data'
      || urlTab === 'data-backups'
    ) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  const configuredProductCategories = useMemo(
    () => normalizeMasterListInput(productCategoriesInput),
    [productCategoriesInput]
  );
  const configuredMaterialCategories = useMemo(
    () => normalizeMasterListInput(materialCategoriesInput),
    [materialCategoriesInput]
  );
  const configuredMaterialUnits = useMemo(
    () => normalizeMasterListInput(materialUnitsInput),
    [materialUnitsInput]
  );

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

      const companyNameSetting = settingsData.find((s: any) => s.settingKey === 'companyName');
      if (companyNameSetting) {
        setCompanyName(companyNameSetting.settingValue);
      }

      const companyLogoSetting = settingsData.find((s: any) => s.settingKey === 'companyLogoDataUrl');
      if (companyLogoSetting) {
        setCompanyLogoDataUrl(companyLogoSetting.settingValue);
      }

      const productCategoriesSetting = settingsData.find((s: any) => s.settingKey === 'productCategories');
      setProductCategoriesInput(parseConfiguredList(productCategoriesSetting?.settingValue || '').join('\n'));

      const materialCategoriesSetting = settingsData.find((s: any) => s.settingKey === 'materialCategories');
      setMaterialCategoriesInput(parseConfiguredList(materialCategoriesSetting?.settingValue || '').join('\n'));

      const materialUnitsSetting = settingsData.find((s: any) => s.settingKey === 'materialUnits');
      setMaterialUnitsInput(parseConfiguredList(materialUnitsSetting?.settingValue || '').join('\n'));

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
      const productCategories = normalizeMasterListInput(productCategoriesInput);
      const materialCategories = normalizeMasterListInput(materialCategoriesInput);
      const materialUnits = normalizeMasterListInput(materialUnitsInput);

      await Promise.all([
        settingsApi.save({ settingKey: 'productCategories', settingValue: JSON.stringify(productCategories) }),
        settingsApi.save({ settingKey: 'materialCategories', settingValue: JSON.stringify(materialCategories) }),
        settingsApi.save({ settingKey: 'materialUnits', settingValue: JSON.stringify(materialUnits) }),
      ]);

      setProductCategoriesInput(productCategories.join('\n'));
      setMaterialCategoriesInput(materialCategories.join('\n'));
      setMaterialUnitsInput(materialUnits.join('\n'));
      setMasterDataMessage('Master data saved. New values are available across forms.');
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
    setIsRestoring(true);
    setBackupUserMsg('');
    setBackupUserError('');

    try {
      let base64Data: string | null = null;

      if (window.electronAPI?.isElectron) {
        const result = await window.electronAPI.selectRestoreFile();
        if (result.canceled) { setIsRestoring(false); return; }
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

      const confirmed = window.confirm(
        'Restore this backup?\n\nWARNING: This will replace ALL your current data with the data from the backup file.\n\nThis cannot be undone. Are you sure?'
      );
      if (!confirmed) { setIsRestoring(false); return; }

      const response = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64Data }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Restore failed');

      setBackupUserMsg('Backup restored successfully. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      if (message !== 'No file selected') {
        setBackupUserError(message);
      }
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleLiveReset() {
    if (resetConfirmText !== 'RESET') return;
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

    const nextMode = !isDemoMode;
    const confirmMessage = nextMode
      ? 'Enable Demo Mode? The app will start reading from demo.db sample data.'
      : 'Switch to Live Data? The app will start reading from priceright.db real data.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsSwitchingMode(true);
    try {
      await setDemoMode(nextMode);
      try { sessionStorage.setItem('priceright_skip_pin_once', '1'); } catch {}
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch data mode:', error);
      showToastMessage('Failed to switch data mode', 'error');
    } finally {
      setIsSwitchingMode(false);
    }
  }

  async function handleResetDemoData() {
    if (!window.confirm('This will delete all changes in demo mode and restore the original sample data. Continue?')) {
      return;
    }

    try {
      await demoModeApi.reset();
      try { sessionStorage.setItem('priceright_skip_pin_once', '1'); } catch {}
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset demo data:', error);
      showToastMessage('Failed to reset demo data', 'error');
    }
  }

  function handleTabChange(tab: SettingsTab) {
    setActiveTab(tab);
  }

// Price Level Rules Functions
  return (
    <div className="app-page settings-page">
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      {/* Header */}
      <div className="app-page-header">
        <h1 className="app-page-title">Settings</h1>
        <div className="app-section-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={`app-section-tab ${isActive ? 'is-active' : ''}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <TabIcon size={14} strokeWidth={2} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
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

        {(activeTab === 'general' || activeTab === 'pricing' || activeTab === 'master-data') && (
        <div className="app-settings-grid">
          <div>
            {activeTab === 'general' && (
            <>
            <div className="app-card app-settings-card">
              <h2>Company Branding</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Set your company name and logo for the Dashboard header.
              </p>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label className="app-settings-label">Company Name</label>
                  <input
                    className="app-control"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter company name"
                  />
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
                    PNG/JPG up to 1MB.
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

            {activeTab === 'pricing' && (
            <div className="app-card app-settings-card">
              <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Default Markup %
                <MarkupInfoTooltip />
              </h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Applied automatically when creating a new product. Can be overridden per product.
              </p>
              <div className="app-settings-row-end">
                <div style={{ flex: 1 }}>
                  <label className="app-settings-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Default Markup %
                    <MarkupInfoTooltip />
                  </label>
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
            </div>
            )}

            {activeTab === 'pricing' && (
            <div className="app-card app-settings-card">
              <h2>Default Overhead Rate</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                This percentage will be pre-filled when creating new products. Use the calculator to the right to determine it.
              </p>
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
            )}

            {activeTab === 'master-data' && (
            <div className="app-card app-settings-card">
              <h2>Master Data</h2>
              <p className="app-page-subtitle" style={{ marginBottom: '16px' }}>
                Define standard categories and units that appear as suggestions when creating products and materials. Enter one value per line.
              </p>

              <div style={{ display: 'grid', gap: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <label className="app-settings-label" style={{ margin: 0 }}>Product Categories</label>
                    <div style={{ fontSize: '13px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '3px' }}>
                      Suggested options when creating/editing products
                    </div>
                  </div>
                  <textarea
                    className="app-control"
                    value={productCategoriesInput}
                    onChange={(e) => setProductCategoriesInput(e.target.value)}
                    placeholder="Beverages&#10;Snacks&#10;Frozen Goods"
                    style={{ minHeight: '90px', width: '100%' }}
                  />
                  {configuredProductCategories.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Current ({configuredProductCategories.length}):</div>
                      {configuredProductCategories.map((value) => {
                        const count = productCategoryCounts[value.toLowerCase()] || 0;
                        return (
                          <div key={value} style={{ marginBottom: '2px' }}>
                            • {value}{count > 0 ? ` (${count} product${count === 1 ? '' : 's'})` : ' (not used)'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <label className="app-settings-label" style={{ margin: 0 }}>Raw Material Categories</label>
                    <div style={{ fontSize: '13px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '3px' }}>
                      Suggested options when creating/editing materials
                    </div>
                  </div>
                  <textarea
                    className="app-control"
                    value={materialCategoriesInput}
                    onChange={(e) => setMaterialCategoriesInput(e.target.value)}
                    placeholder="Packaging&#10;Spices&#10;Oils & Fats"
                    style={{ minHeight: '90px', width: '100%' }}
                  />
                  {configuredMaterialCategories.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Current ({configuredMaterialCategories.length}):</div>
                      {configuredMaterialCategories.map((value) => {
                        const count = materialCategoryCounts[value.toLowerCase()] || 0;
                        return (
                          <div key={value} style={{ marginBottom: '2px' }}>
                            • {value}{count > 0 ? ` (${count} material${count === 1 ? '' : 's'})` : ' (not used)'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <label className="app-settings-label" style={{ margin: 0 }}>Units of Measure</label>
                    <div style={{ fontSize: '13px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '3px' }}>
                      Suggested options when specifying material quantities
                    </div>
                  </div>
                  <textarea
                    className="app-control"
                    value={materialUnitsInput}
                    onChange={(e) => setMaterialUnitsInput(e.target.value)}
                    placeholder="kg&#10;liters&#10;pieces&#10;boxes"
                    style={{ minHeight: '90px', width: '100%' }}
                  />
                  {configuredMaterialUnits.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Current ({configuredMaterialUnits.length}):</div>
                      {configuredMaterialUnits.map((value) => {
                        const count = materialUnitCounts[value.toLowerCase()] || 0;
                        return (
                          <div key={value} style={{ marginBottom: '2px' }}>
                            • {value}{count > 0 ? ` (${count} material${count === 1 ? '' : 's'})` : ' (not used)'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

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
          </div>

          <div>
            {activeTab === 'pricing' && (
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
            )}
          </div>
        </div>
        )}

        {activeTab === 'data-backups' && (
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
                  void handleResetDemoData();
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

        {activeTab === 'currencies' && (
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
                        onClick={async () => {
                          if (window.confirm(`Delete ${currency.code}? This cannot be undone.`)) {
                            try {
                              await currenciesApi.delete(currency.id);
                              loadData();
                              showToastMessage(`${currency.code} deleted`, 'success');
                            } catch (error) {
                              showToastMessage('Failed to delete currency', 'error');
                            }
                          }
                        }}
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

      {/* Reset All Data Modal */}
      {showResetModal && (
        <div className="app-modal-overlay">
          <div className="app-modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-x" onClick={() => setShowResetModal(false)} aria-label="Close">&times;</button>
            {resetStep === 1 && (
              <>
                <h2 className="app-modal-title">Reset all data</h2>
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
                  <button className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
                  <button className="btn btn-ghost" onClick={() => { setResetStep(2); }}>Create backup first</button>
                  <button className="btn btn-primary" onClick={() => { setResetStep(2); }}>Continue →</button>
                </div>
              </>
            )}
            {resetStep === 2 && (
              <>
                <h2 className="app-modal-title">Confirm reset</h2>
                <p style={{ marginTop: '8px', color: '#475569' }}>Type <strong>RESET</strong> in the box below to confirm you want to permanently delete all data.</p>
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
                  <button className="btn btn-danger" onClick={() => handleLiveReset()} disabled={isResetting || resetConfirmText !== 'RESET'}>
                    {isResetting ? 'Resetting...' : 'Reset all data permanently'}
                  </button>
                </div>
              </>
            )}
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