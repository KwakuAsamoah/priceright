import { useEffect, useMemo, useState } from 'react';

const DEFAULT_TABLE_ZOOM_STORAGE_KEY = 'tableZoomPercent';
const ZOOM_LEVELS = [75, 85, 100, 115, 130] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

function getStoredZoomPercent(storageKey: string): ZoomLevel {
  if (typeof window === 'undefined') {
    return 100;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const parsedValue = Number(storedValue);
    if (ZOOM_LEVELS.includes(parsedValue as ZoomLevel)) {
      return parsedValue as ZoomLevel;
    }
  } catch {
    // Ignore localStorage errors.
  }

  return 100;
}

export default function useTableZoom(storageKey: string = DEFAULT_TABLE_ZOOM_STORAGE_KEY) {
  const [zoomPercent, setZoomPercentState] = useState<ZoomLevel>(() => getStoredZoomPercent(storageKey));

  const currentIndex = useMemo(() => ZOOM_LEVELS.indexOf(zoomPercent), [zoomPercent]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(zoomPercent));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [storageKey, zoomPercent]);

  const setZoomPercent = (value: number) => {
    if (ZOOM_LEVELS.includes(value as ZoomLevel)) {
      setZoomPercentState(value as ZoomLevel);
      return;
    }

    setZoomPercentState(100);
  };

  const increaseZoom = () => {
    const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1);
    setZoomPercentState(ZOOM_LEVELS[nextIndex]);
  };

  const decreaseZoom = () => {
    const nextIndex = Math.max(currentIndex - 1, 0);
    setZoomPercentState(ZOOM_LEVELS[nextIndex]);
  };

  return {
    zoomPercent,
    increaseZoom,
    decreaseZoom,
    setZoomPercent,
    zoomLevels: ZOOM_LEVELS,
  };
}
