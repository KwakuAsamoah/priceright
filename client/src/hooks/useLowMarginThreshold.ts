import { useEffect, useState } from 'react';
import { settingsApi } from '../api';

export const DEFAULT_LOW_MARKUP_THRESHOLD = 20;

/** @deprecated Alias for backward compatibility — use DEFAULT_LOW_MARKUP_THRESHOLD */
export const DEFAULT_LOW_MARGIN_THRESHOLD = DEFAULT_LOW_MARKUP_THRESHOLD;

function parseThreshold(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

export function useLowMarkupThreshold() {
  const [lowMarkupThreshold, setLowMarkupThreshold] = useState(DEFAULT_LOW_MARKUP_THRESHOLD);

  useEffect(() => {
    let cancelled = false;

    async function loadThreshold() {
      try {
        const settings = await settingsApi.getAll();
        if (cancelled) return;

        const healthyMarkupSetting = settings.find(
          (entry: { settingKey: string; settingValue: string }) =>
            entry.settingKey === 'healthyMarkupThreshold',
        );
        const legacyMarginSetting = settings.find(
          (entry: { settingKey: string; settingValue: string }) =>
            entry.settingKey === 'defaultProfitMargin',
        );

        const threshold =
          parseThreshold(healthyMarkupSetting?.settingValue) ??
          parseThreshold(legacyMarginSetting?.settingValue);

        if (threshold != null) {
          setLowMarkupThreshold(threshold);
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

  return lowMarkupThreshold;
}

/** @deprecated Alias for backward compatibility — use useLowMarkupThreshold */
export const useLowMarginThreshold = useLowMarkupThreshold;
