import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HUBS_BY_ID,
  isApprovalsListsSubViewId,
  isCostChangesSubViewId,
  isHubId,
  isMaterialCostsSubViewId,
  isPricingHealthSubViewId,
  LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS,
  LEGACY_COST_CHANGES_REPORT_REDIRECTS,
  LEGACY_MATERIAL_COST_REPORT_REDIRECTS,
  LEGACY_PRICING_HEALTH_REPORT_REDIRECTS,
} from '../constants/hubRegistry';
import type { ApprovalsListsSubViewId, CostChangesSubViewId, HubId, MaterialCostsSubViewId, PricingHealthSubViewId } from '../types';

export type ReportHubState = {
  hubId: HubId;
  subViewId: MaterialCostsSubViewId;
  selectSubView: (subViewId: MaterialCostsSubViewId) => void;
};

export function useMaterialCostsHubState(): ReportHubState {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hubParam = searchParams.get('hub');
  const viewParam = searchParams.get('view');

  const hubId: HubId = 'material-costs';
  const defaultSubView = HUBS_BY_ID['material-costs'].defaultSubViewId as MaterialCostsSubViewId;

  const subViewId = useMemo(() => {
    if (isMaterialCostsSubViewId(viewParam)) {
      return viewParam;
    }
    return defaultSubView;
  }, [defaultSubView, viewParam]);

  const selectSubView = useCallback((nextSubViewId: MaterialCostsSubViewId) => {
    navigate(`/reports?hub=material-costs&view=${nextSubViewId}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');

    if (group === 'materials' && report && report in LEGACY_MATERIAL_COST_REPORT_REDIRECTS) {
      const mappedView = LEGACY_MATERIAL_COST_REPORT_REDIRECTS[report as keyof typeof LEGACY_MATERIAL_COST_REPORT_REDIRECTS];
      if (mappedView) {
        navigate(`/reports?hub=material-costs&view=${mappedView}`, { replace: true });
        return;
      }
    }

    if (isHubId(hubParam) && hubParam === 'material-costs') {
      if (!isMaterialCostsSubViewId(viewParam)) {
        navigate(`/reports?hub=material-costs&view=${defaultSubView}`, { replace: true });
      }
    }
  }, [defaultSubView, hubParam, navigate, searchParams, viewParam]);

  return { hubId, subViewId, selectSubView };
}

export function useApprovalsListsHubState() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hubParam = searchParams.get('hub');
  const viewParam = searchParams.get('view');

  const hubId: HubId = 'approvals-lists';
  const defaultSubView = HUBS_BY_ID['approvals-lists'].defaultSubViewId as ApprovalsListsSubViewId;

  const subViewId = useMemo(() => {
    if (isApprovalsListsSubViewId(viewParam)) {
      return viewParam;
    }
    return defaultSubView;
  }, [defaultSubView, viewParam]);

  const selectSubView = useCallback((nextSubViewId: ApprovalsListsSubViewId) => {
    navigate(`/reports?hub=approvals-lists&view=${nextSubViewId}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');

    if (group === 'pricing' && report && report in LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS) {
      const mappedView = LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS[report as keyof typeof LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS];
      if (mappedView) {
        navigate(`/reports?hub=approvals-lists&view=${mappedView}`, { replace: true });
        return;
      }
    }

    if (isHubId(hubParam) && hubParam === 'approvals-lists') {
      if (!isApprovalsListsSubViewId(viewParam)) {
        navigate(`/reports?hub=approvals-lists&view=${defaultSubView}`, { replace: true });
      }
    }
  }, [defaultSubView, hubParam, navigate, searchParams, viewParam]);

  return { hubId, subViewId, selectSubView };
}

export function useCostChangesHubState() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hubParam = searchParams.get('hub');
  const viewParam = searchParams.get('view');

  const hubId: HubId = 'cost-changes';
  const defaultSubView = HUBS_BY_ID['cost-changes'].defaultSubViewId as CostChangesSubViewId;

  const subViewId = useMemo(() => {
    if (isCostChangesSubViewId(viewParam)) {
      return viewParam;
    }
    return defaultSubView;
  }, [defaultSubView, viewParam]);

  const selectSubView = useCallback((nextSubViewId: CostChangesSubViewId) => {
    navigate(`/reports?hub=cost-changes&view=${nextSubViewId}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');

    if (group === 'products' && report === 'price-vs-cost-drift') {
      navigate('/reports?hub=cost-changes&view=price-vs-cost-drift', { replace: true });
      return;
    }

    if (group === 'materials' && report && report in LEGACY_COST_CHANGES_REPORT_REDIRECTS) {
      const mappedView = LEGACY_COST_CHANGES_REPORT_REDIRECTS[report as keyof typeof LEGACY_COST_CHANGES_REPORT_REDIRECTS];
      if (mappedView) {
        navigate(`/reports?hub=cost-changes&view=${mappedView}`, { replace: true });
        return;
      }
    }

    if (isHubId(hubParam) && hubParam === 'cost-changes') {
      if (!isCostChangesSubViewId(viewParam)) {
        navigate(`/reports?hub=cost-changes&view=${defaultSubView}`, { replace: true });
      }
    }
  }, [defaultSubView, hubParam, navigate, searchParams, viewParam]);

  return { hubId, subViewId, selectSubView };
}

export function usePricingHealthHubState() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hubParam = searchParams.get('hub');
  const viewParam = searchParams.get('view');

  const hubId: HubId = 'pricing-health';
  const defaultSubView = HUBS_BY_ID['pricing-health'].defaultSubViewId as PricingHealthSubViewId;

  const subViewId = useMemo(() => {
    if (isPricingHealthSubViewId(viewParam)) {
      return viewParam;
    }
    return defaultSubView;
  }, [defaultSubView, viewParam]);

  const selectSubView = useCallback((nextSubViewId: PricingHealthSubViewId) => {
    navigate(`/reports?hub=pricing-health&view=${nextSubViewId}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');

    if (group === 'pricing' && report && report in LEGACY_PRICING_HEALTH_REPORT_REDIRECTS) {
      const mappedView = LEGACY_PRICING_HEALTH_REPORT_REDIRECTS[report as keyof typeof LEGACY_PRICING_HEALTH_REPORT_REDIRECTS];
      if (mappedView) {
        navigate(`/reports?hub=pricing-health&view=${mappedView}`, { replace: true });
        return;
      }
    }

    if (group === 'products' && report === 'margin-health') {
      navigate('/reports?hub=pricing-health&view=margin-health', { replace: true });
      return;
    }

    if (isHubId(hubParam) && hubParam === 'pricing-health') {
      if (!isPricingHealthSubViewId(viewParam)) {
        navigate(`/reports?hub=pricing-health&view=${defaultSubView}`, { replace: true });
      }
    }
  }, [defaultSubView, hubParam, navigate, searchParams, viewParam]);

  return { hubId, subViewId, selectSubView };
}

/** Generic hub + sub-view URL sync for future phases. */
export function useReportHubState(hubId: HubId) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hub = HUBS_BY_ID[hubId];
  const viewParam = searchParams.get('view');

  const subViewId = useMemo(() => {
    const match = hub.subViews.find((subView) => subView.id === viewParam);
    return match?.id ?? hub.defaultSubViewId;
  }, [hub.defaultSubViewId, hub.subViews, viewParam]);

  const selectSubView = useCallback((nextSubViewId: string) => {
    navigate(`/reports?hub=${hubId}&view=${nextSubViewId}`, { replace: true });
  }, [hubId, navigate]);

  return { hubId, subViewId, selectSubView };
}
