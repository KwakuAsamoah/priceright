import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface FormStateContextValue {
  hasOpenForm: boolean;
  /** Track open forms per page so one route unmount does not clear another page's form state. */
  setFormOpenForSource: (sourceId: string, open: boolean) => void;
  /** @deprecated Use setFormOpenForSource instead */
  setHasOpenForm: (open: boolean) => void;
}

const FormStateContext = createContext<FormStateContextValue>({
  hasOpenForm: false,
  setFormOpenForSource: () => {},
  setHasOpenForm: () => {},
});

export function FormStateProvider({ children }: { children: ReactNode }) {
  const [hasOpenForm, setHasOpenFormState] = useState(false);
  const openSourcesRef = useRef(new Set<string>());

  const syncHasOpenForm = useCallback(() => {
    setHasOpenFormState(openSourcesRef.current.size > 0);
  }, []);

  const setFormOpenForSource = useCallback((sourceId: string, open: boolean) => {
    if (open) {
      openSourcesRef.current.add(sourceId);
    } else {
      openSourcesRef.current.delete(sourceId);
    }
    syncHasOpenForm();
  }, [syncHasOpenForm]);

  const setHasOpenForm = useCallback((open: boolean) => {
    if (open) {
      openSourcesRef.current.add('legacy');
    } else {
      openSourcesRef.current.delete('legacy');
    }
    syncHasOpenForm();
  }, [syncHasOpenForm]);

  return (
    <FormStateContext.Provider value={{ hasOpenForm, setFormOpenForSource, setHasOpenForm }}>
      {children}
    </FormStateContext.Provider>
  );
}

export function useFormState() {
  return useContext(FormStateContext);
}

/** Register whether a page currently has an open form. Cleans up on unmount. */
export function useRegisterFormOpen(sourceId: string, open: boolean) {
  const { setFormOpenForSource } = useFormState();

  useEffect(() => {
    setFormOpenForSource(sourceId, open);
  }, [sourceId, open, setFormOpenForSource]);

  useEffect(() => {
    return () => setFormOpenForSource(sourceId, false);
  }, [sourceId, setFormOpenForSource]);
}
