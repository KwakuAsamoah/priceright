import { useCallback } from 'react';
import { settingsApi } from '../api';
import { printPage } from '../utils/printPage';

interface PrintOptions {
  title: string;
  subtitle?: string;
}

export function usePrint() {
  const handlePrint = useCallback(async (options: PrintOptions) => {
    let companyName = 'PriceRight';
    try {
      const settings = await settingsApi.getAll();
      const companySetting = settings.find(
        (s: { settingKey: string; settingValue: string }) => s.settingKey === 'companyName'
      );
      if (companySetting?.settingValue) {
        companyName = companySetting.settingValue;
      }
    } catch {
      // Use default company name
    }

    const printHeader = document.getElementById('print-header');
    if (printHeader) {
      printHeader.innerHTML = `
        <div class="print-header-company">${companyName}</div>
        <div class="print-header-title">${options.title}</div>
        <div class="print-header-meta">
          ${options.subtitle || ''}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          Printed: ${new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      `;
    }

    await printPage();
  }, []);

  return { handlePrint };
}
