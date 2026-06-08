import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type MaterialCostSyncContextValue = {
  version: number;
  notifyMaterialCostsChanged: () => void;
};

const MaterialCostSyncContext = createContext<MaterialCostSyncContextValue>({
  version: 0,
  notifyMaterialCostsChanged: () => {},
});

export function MaterialCostSyncProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);

  const notifyMaterialCostsChanged = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({ version, notifyMaterialCostsChanged }),
    [version, notifyMaterialCostsChanged],
  );

  return (
    <MaterialCostSyncContext.Provider value={value}>
      {children}
    </MaterialCostSyncContext.Provider>
  );
}

export function useMaterialCostSync() {
  return useContext(MaterialCostSyncContext);
}
