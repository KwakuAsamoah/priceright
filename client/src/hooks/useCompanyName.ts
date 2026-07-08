import { useEffect, useState } from 'react';
import { settingsApi } from '../api';

export default function useCompanyName(): string {
  const [companyName, setCompanyName] = useState('PriceRight');

  useEffect(() => {
    settingsApi.getAll()
      .then((settings) => {
        const entry = settings.find(
          (setting: { settingKey: string; settingValue: string }) => setting.settingKey === 'companyName',
        );
        if (entry?.settingValue?.trim()) {
          setCompanyName(entry.settingValue.trim());
        }
      })
      .catch(() => {
        // Keep default.
      });
  }, []);

  return companyName;
}
