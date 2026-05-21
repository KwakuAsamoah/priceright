import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface FormStateContextValue {
  hasOpenForm: boolean;
  setHasOpenForm: (open: boolean) => void;
}

const FormStateContext = createContext<FormStateContextValue>({
  hasOpenForm: false,
  setHasOpenForm: () => {},
});

export function FormStateProvider({ children }: { children: ReactNode }) {
  const [hasOpenForm, setHasOpenFormState] = useState(false);

  const setHasOpenForm = useCallback((open: boolean) => {
    setHasOpenFormState(open);
  }, []);

  return (
    <FormStateContext.Provider value={{ hasOpenForm, setHasOpenForm }}>
      {children}
    </FormStateContext.Provider>
  );
}

export function useFormState() {
  return useContext(FormStateContext);
}
