import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MarkupHealthPopover from '../components/MarkupHealthPopover';
import PageHelpButton from '../components/PageHelpButton';
import {
  HUBS,
  HUBS_BY_ID,
  isHubId,
  LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS,
  LEGACY_COST_CHANGES_REPORT_REDIRECTS,
  LEGACY_MATERIAL_COST_REPORT_REDIRECTS,
  LEGACY_PRICING_HEALTH_REPORT_REDIRECTS,
  RETIRED_REPORT_REDIRECTS,
} from './reports/constants/hubRegistry';
import ReportsPage from './reports/ReportsPage';
import type { HubId, LegacyReportKey } from './reports/types';

const HUB_TAB_ORDER: HubId[] = [
  'pricing-health',
  'cost-changes',
  'material-costs',
  'approvals-lists',
];

function resolveLegacyRedirect(group: string | null, report: string | null): string | null {
  if (!report) return null;

  if (report in RETIRED_REPORT_REDIRECTS) {
    const target = RETIRED_REPORT_REDIRECTS[report as LegacyReportKey];
    if (target) {
      return `/reports?hub=${target.hubId}&view=${target.subViewId}`;
    }
  }

  if (group === 'pricing' && report in LEGACY_PRICING_HEALTH_REPORT_REDIRECTS) {
    const mappedView = LEGACY_PRICING_HEALTH_REPORT_REDIRECTS[report as keyof typeof LEGACY_PRICING_HEALTH_REPORT_REDIRECTS];
    if (mappedView) {
      return `/reports?hub=pricing-health&view=${mappedView}`;
    }
  }

  if (group === 'products' && report === 'margin-health') {
    return '/reports?hub=pricing-health&view=margin-health';
  }

  if (group === 'products' && report === 'price-vs-cost-drift') {
    return '/reports?hub=cost-changes&view=price-vs-cost-drift';
  }

  if (group === 'pricing' && report in LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS) {
    const mappedView = LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS[report as keyof typeof LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS];
    if (mappedView) {
      return `/reports?hub=approvals-lists&view=${mappedView}`;
    }
  }

  if (group === 'materials' && report in LEGACY_COST_CHANGES_REPORT_REDIRECTS) {
    const mappedView = LEGACY_COST_CHANGES_REPORT_REDIRECTS[report as keyof typeof LEGACY_COST_CHANGES_REPORT_REDIRECTS];
    if (mappedView) {
      return `/reports?hub=cost-changes&view=${mappedView}`;
    }
  }

  if (group === 'materials' && report in LEGACY_MATERIAL_COST_REPORT_REDIRECTS) {
    const mappedView = LEGACY_MATERIAL_COST_REPORT_REDIRECTS[report as keyof typeof LEGACY_MATERIAL_COST_REPORT_REDIRECTS];
    if (mappedView) {
      return `/reports?hub=material-costs&view=${mappedView}`;
    }
  }

  return null;
}

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageContentRef = useRef<HTMLDivElement>(null);

  const hubParam = searchParams.get('hub');
  const activeHub: HubId = isHubId(hubParam) ? hubParam : 'pricing-health';

  useEffect(() => {
    const group = searchParams.get('group');
    const report = searchParams.get('report');
    const hub = searchParams.get('hub');
    const view = searchParams.get('view');

    const legacyRedirect = resolveLegacyRedirect(group, report);
    if (legacyRedirect) {
      navigate(legacyRedirect, { replace: true });
      return;
    }

    if (!hub) {
      navigate('/reports?hub=pricing-health&view=margin-health', { replace: true });
      return;
    }

    if (isHubId(hub)) {
      const hubMeta = HUBS_BY_ID[hub];
      const validView = hubMeta.subViews.some((subView) => subView.id === view);
      if (!validView) {
        navigate(`/reports?hub=${hub}&view=${hubMeta.defaultSubViewId}`, { replace: true });
      }
    }
  }, [navigate, searchParams]);

  function handleHubTabChange(hubId: HubId) {
    const defaultView = HUBS_BY_ID[hubId].defaultSubViewId;
    navigate(`/reports?hub=${hubId}&view=${defaultView}`, { replace: true });
    pageContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-page">
      <div className="app-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
          <h1 className="app-page-title">Reports & Analysis</h1>
          <div className="app-section-tabs" role="tablist" aria-label="Report hubs">
            {HUB_TAB_ORDER.map((hubId) => {
              const hubMeta = HUBS.find((hub) => hub.id === hubId) ?? HUBS_BY_ID[hubId];
              return (
                <button
                  key={hubId}
                  type="button"
                  role="tab"
                  aria-selected={activeHub === hubId}
                  className={`app-section-tab ${activeHub === hubId ? 'is-active' : ''}`}
                  onClick={() => handleHubTabChange(hubId)}
                >
                  {hubMeta.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <MarkupHealthPopover />
          <PageHelpButton context="reports" />
        </div>
      </div>

      <div ref={pageContentRef} className="app-page-content app-page-content--data">
        <ReportsPage />
      </div>
    </div>
  );
}
