import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

interface BaseCurrencyContextValue {
  setBaseCurrencyMissing: Dispatch<SetStateAction<boolean>>;
}

export const BaseCurrencyContext = createContext<BaseCurrencyContextValue>({
  setBaseCurrencyMissing: () => {},
});

export function useBaseCurrencyContext() {
  return useContext(BaseCurrencyContext);
}
