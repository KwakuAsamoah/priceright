import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { materialsApi, settingsApi } from '../api';
import AppToast from '../components/AppToast';
import ProductFormDrawer from '../components/ProductFormDrawer';
import useAppToast from '../hooks/useAppToast';
import { useFormState } from '../context/FormStateContext';

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

export default function ProductCreatePage() {
  const navigate = useNavigate();
  const { setHasOpenForm } = useFormState();
  const { showToast, toastMessage, toastType, showToastMessage, closeToast } = useAppToast();
  const [materials, setMaterials] = useState<any[]>([]);
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [defaultOverhead, setDefaultOverhead] = useState('30');
  const [defaultProfitMargin, setDefaultProfitMargin] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHasOpenForm(true);
    return () => {
      setHasOpenForm(false);
    };
  }, [setHasOpenForm]);

  useEffect(() => {
    async function loadData() {
      try {
        const [materialsData, settingsData] = await Promise.all([
          materialsApi.getAll(),
          settingsApi.getAll(),
        ]);
        setMaterials(Array.isArray(materialsData) ? materialsData : []);

        const safeSettings = Array.isArray(settingsData) ? settingsData : [];
        const overheadSetting = safeSettings.find((entry: any) => entry.settingKey === 'defaultOverhead');
        const profitMarginSetting = safeSettings.find((entry: any) => entry.settingKey === 'defaultProfitMargin');
        const productCategoriesSetting = safeSettings.find((entry: any) => entry.settingKey === 'productCategories');

        if (overheadSetting) {
          setDefaultOverhead(overheadSetting.settingValue);
        }
        if (profitMarginSetting) {
          setDefaultProfitMargin(profitMarginSetting.settingValue);
        }
        setConfiguredCategories(parseConfiguredList(productCategoriesSetting?.settingValue));
      } catch (error) {
        console.error('Error loading product create data:', error);
        setMaterials([]);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const categoryOptions = useMemo(
    () => Array.from(new Set(configuredCategories)).sort((a, b) => a.localeCompare(b)),
    [configuredCategories],
  );

  return (
    <div className="app-page" style={{ backgroundColor: '#ffffff' }}>
      <AppToast open={showToast} message={toastMessage} type={toastType} onClose={closeToast} />
      <div className="app-page-content" style={{ padding: '24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/products')}
            style={{ marginBottom: '16px', paddingLeft: 0 }}
          >
            ← Back to Products
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#0F2847', margin: '0 0 24px' }}>
            New Product
          </h1>
          {loading ? (
            <div style={{ color: '#64748b' }}>Loading form...</div>
          ) : (
            <ProductFormDrawer
              layout="page"
              formId="product-create-form"
              saveButtonLabel="Save Product"
              isOpen
              product={null}
              materials={materials}
              categoryOptions={categoryOptions}
              defaultOverhead={defaultOverhead}
              defaultProfitMargin={defaultProfitMargin}
              onClose={() => navigate('/products')}
              onSaved={async () => {
                showToastMessage('Product created successfully', 'success');
                navigate('/products');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
