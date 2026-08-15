import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import useLatestRequest from '../../../hooks/useLatestRequest';

type ApplyIfLatest = (apply: () => void) => void;

export type ReportGenerationContext<TData> = {
  applyIfLatest: ApplyIfLatest;
  setReportData: (data: TData) => void;
};

type UseReportGenerationOptions<TData> = {
  hubId: string;
  subViewId: string;
  enabled?: boolean;
  filterDeps: unknown[];
  generate: (context: ReportGenerationContext<TData>) => Promise<void>;
};

export function useReportGeneration<TData>({
  hubId,
  subViewId,
  enabled = true,
  filterDeps,
  generate,
}: UseReportGenerationOptions<TData>) {
  const { beginRequest, isLatestRequest } = useLatestRequest();
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const generateRef = useRef(generate);
  generateRef.current = generate;
  const subViewIdRef = useRef(subViewId);
  subViewIdRef.current = subViewId;

  const requestKey = `report:${hubId}:${subViewId}`;

  useLayoutEffect(() => {
    setReportData(null);
    setGeneratedAt(null);
    setError(null);
  }, [hubId, subViewId]);

  const runGeneration = useCallback(async () => {
    if (!enabled) return;

    const capturedSubViewId = subViewId;
    const requestId = beginRequest(requestKey);
    const applyIfLatest: ApplyIfLatest = (apply) => {
      if (
        isLatestRequest(requestKey, requestId)
        && subViewIdRef.current === capturedSubViewId
      ) {
        apply();
      }
    };

    applyIfLatest(() => {
      setIsLoading(true);
      setError(null);
    });

    try {
      await generateRef.current({
        applyIfLatest,
        setReportData: (data) => {
          applyIfLatest(() => {
            setReportData(data);
            setGeneratedAt(new Date());
          });
        },
      });
    } catch (generationError: unknown) {
      console.error(generationError);
      applyIfLatest(() => {
        setError('Unable to load report data. Please try again.');
        setReportData(null);
        setGeneratedAt(null);
      });
    } finally {
      applyIfLatest(() => {
        setIsLoading(false);
      });
    }
  }, [beginRequest, enabled, isLatestRequest, requestKey, subViewId]);

  useEffect(() => {
    void runGeneration();
  }, [hubId, subViewId, enabled, runGeneration, ...filterDeps]);

  return {
    isLoading,
    isExporting,
    setIsExporting,
    error,
    reportData,
    generatedAt,
    regenerate: runGeneration,
  };
}
