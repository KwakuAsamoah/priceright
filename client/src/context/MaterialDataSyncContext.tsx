import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface MaterialDataSyncContextValue {
  /** Increments when primary material prices or exchange rates change. */
  materialsDataRevision: number;
  notifyMaterialsDataChanged: () => void;
}

const MaterialDataSyncContext = createContext<MaterialDataSyncContextValue>({
  materialsDataRevision: 0,
  notifyMaterialsDataChanged: () => {},
});

export function MaterialDataSyncProvider({ children }: { children: ReactNode }) {
  const [materialsDataRevision, setMaterialsDataRevision] = useState(0);

  const notifyMaterialsDataChanged = useCallback(() => {
    setMaterialsDataRevision((revision) => revision + 1);
  }, []);

  return (
    <MaterialDataSyncContext.Provider value={{ materialsDataRevision, notifyMaterialsDataChanged }}>
      {children}
    </MaterialDataSyncContext.Provider>
  );
}

export function useMaterialDataSync() {
  return useContext(MaterialDataSyncContext);
}

/** Re-run handler when primary material prices change elsewhere in the app. */
export function useOnMaterialsDataChanged(handler: () => void | Promise<void>) {
  const { materialsDataRevision } = useMaterialDataSync();

  useEffect(() => {
    if (materialsDataRevision === 0) return;
    void handler();
  }, [materialsDataRevision, handler]);
}
