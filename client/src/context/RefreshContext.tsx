import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
  isRefreshing: boolean;
  requestRefresh: (options?: { hard?: boolean }) => Promise<void>;
}

const RefreshContext = createContext<RefreshContextValue>({
  isRefreshing: false,
  requestRefresh: async () => {},
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handlersRef = useRef(new Map<string, RefreshHandler>());

  const registerRefreshHandler = useCallback((sourceId: string, handler: RefreshHandler | null) => {
    if (handler) {
      handlersRef.current.set(sourceId, handler);
    } else {
      handlersRef.current.delete(sourceId);
    }
  }, []);

  const requestRefresh = useCallback(async (options?: { hard?: boolean }) => {
    if (options?.hard) {
      window.location.reload();
      return;
    }

    setIsRefreshing(true);
    try {
      await Promise.all(
        Array.from(handlersRef.current.values()).map((handler) => Promise.resolve(handler())),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ isRefreshing, requestRefresh }}>
      <RefreshRegistryContext.Provider value={registerRefreshHandler}>
        {children}
      </RefreshRegistryContext.Provider>
    </RefreshContext.Provider>
  );
}

const RefreshRegistryContext = createContext<(sourceId: string, handler: RefreshHandler | null) => void>(
  () => {},
);

export function useRefresh() {
  return useContext(RefreshContext);
}

/** Register the current page's data reload handler. Only active (mounted) pages refresh. */
export function usePageRefresh(sourceId: string, handler: RefreshHandler) {
  const registerRefreshHandler = useContext(RefreshRegistryContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    registerRefreshHandler(sourceId, () => handlerRef.current());
    return () => registerRefreshHandler(sourceId, null);
  }, [sourceId, registerRefreshHandler]);
}
