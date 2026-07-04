import { useEffect, useState } from 'react';
import { settingsApi } from '../api';

export const DEFAULT_LOW_MARGIN_THRESHOLD = 20;

export function useLowMarginThreshold() {
  const [lowMarginThreshold, setLowMarginThreshold] = useState(DEFAULT_LOW_MARGIN_THRESHOLD);

  useEffect(() => {
    let cancelled = false;

    async function loadThreshold() {
      try {
        const settings = await settingsApi.getAll();
        if (cancelled) return;
        const marginSetting = settings.find(
          (entry: { settingKey: string; settingValue: string }) => entry.settingKey === 'defaultProfitMargin',
        );
        if (marginSetting?.settingValue) {
          const parsed = Number(marginSetting.settingValue);
          if (Number.isFinite(parsed) && parsed > 0) {
            setLowMarginThreshold(parsed);
          }
        }
      } catch {
        // Keep default threshold.
      }
    }

    void loadThreshold();

    return () => {
      cancelled = true;
    };
  }, []);

  return lowMarginThreshold;
}
