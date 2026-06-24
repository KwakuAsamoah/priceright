import { settingsApi } from '../api';

let cachedBaseCurrency: string | null = null;

export async function getBaseCurrency(): Promise<string> {
  if (cachedBaseCurrency) {
    return cachedBaseCurrency;
  }
  try {
    const settings = await settingsApi.getAll();
    const setting = settings.find(
      (s: { settingKey: string; settingValue: string }) => s.settingKey === 'baseCurrency',
    );
    const code = setting?.settingValue || 'GHS';
    cachedBaseCurrency = code;
    return code;
  } catch {
    return 'GHS';
  }
}

export function clearCurrencyCache() {
  cachedBaseCurrency = null;
}

export function formatCurrency(
  value: number,
  currencyCode: string = 'GHS',
): string {
  return `${currencyCode} ${Number(value || 0).toFixed(2)}`;
}
