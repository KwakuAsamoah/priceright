import { useEffect, useState } from 'react';
import type { ColumnConfig } from '../config/productsColumns';

function buildDefaultVisibleSet(columns: ColumnConfig[]): Set<string> {
  return new Set(
    columns
      .filter((column) => column.defaultVisible || column.locked)
      .map((column) => column.id),
  );
}

export function useColumnVisibility(storageKey: string, columns: ColumnConfig[]) {
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const allowed = new Set(columns.map((column) => column.id));
          const next = new Set<string>();
          parsed.forEach((entry) => {
            if (typeof entry === 'string' && allowed.has(entry)) {
              next.add(entry);
            }
          });
          columns.forEach((column) => {
            if (column.locked) {
              next.add(column.id);
            }
          });
          if (next.size > 0) {
            return next;
          }
        }
      }
    } catch {
      // Fall through to defaults.
    }
    return buildDefaultVisibleSet(columns);
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(visibleColumns)));
    } catch {
      // Ignore persistence failures.
    }
  }, [storageKey, visibleColumns]);

  function toggleColumn(id: string) {
    const column = columns.find((entry) => entry.id === id);
    if (column?.locked) return;

    setVisibleColumns((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      columns.forEach((entry) => {
        if (entry.locked) {
          next.add(entry.id);
        }
      });
      return next;
    });
  }

  function resetToDefaults() {
    setVisibleColumns(buildDefaultVisibleSet(columns));
  }

  function isVisible(id: string) {
    const column = columns.find((entry) => entry.id === id);
    if (column?.locked) return true;
    return visibleColumns.has(id);
  }

  const visibleColumnCount = columns.filter((column) => isVisible(column.id)).length;

  return {
    visibleColumns,
    visibleColumnCount,
    toggleColumn,
    resetToDefaults,
    isVisible,
  };
}
