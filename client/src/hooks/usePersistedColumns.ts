import { useCallback, useMemo, useState } from 'react';

export default function usePersistedColumns<T extends string>(
  key: string,
  defaultColumns: T[],
): [T[], (columns: T[]) => void] {
  const normalizedDefaults = useMemo(() => {
    const unique = new Set<T>();
    defaultColumns.forEach((column) => unique.add(column));
    return Array.from(unique);
  }, [defaultColumns]);

  const [columns, setColumns] = useState<T[]>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (!saved) return normalizedDefaults;

      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return normalizedDefaults;

      const allowed = new Set(normalizedDefaults);
      const unique = new Set<T>();
      parsed.forEach((entry) => {
        if (typeof entry !== 'string') return;
        const column = entry as T;
        if (allowed.has(column)) {
          unique.add(column);
        }
      });

      const filtered = Array.from(unique);
      return filtered.length > 0 ? filtered : normalizedDefaults;
    } catch {
      return normalizedDefaults;
    }
  });

  const setPersistedColumns = useCallback((nextColumns: T[]) => {
    const allowed = new Set(normalizedDefaults);
    const unique = new Set<T>();

    nextColumns.forEach((column) => {
      if (allowed.has(column)) {
        unique.add(column);
      }
    });

    const filtered = Array.from(unique);
    const resolved = filtered.length > 0 ? filtered : normalizedDefaults;

    setColumns(resolved);

    try {
      window.localStorage.setItem(key, JSON.stringify(resolved));
    } catch {
      // Ignore persistence failures and keep in-memory state.
    }
  }, [key, normalizedDefaults]);

  return [columns, setPersistedColumns];
}
