import { useCallback, useRef } from 'react';

/**
 * Tracks monotonic request IDs per key so async handlers can ignore stale responses
 * when selection/filter state changes before an earlier fetch completes.
 */
export default function useLatestRequest() {
  const countersRef = useRef<Map<string, number>>(new Map());

  const beginRequest = useCallback((key = 'default') => {
    const nextId = (countersRef.current.get(key) ?? 0) + 1;
    countersRef.current.set(key, nextId);
    return nextId;
  }, []);

  const isLatestRequest = useCallback((key: string, requestId: number) => {
    return countersRef.current.get(key) === requestId;
  }, []);

  return { beginRequest, isLatestRequest };
}
