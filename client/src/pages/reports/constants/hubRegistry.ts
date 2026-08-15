import type {
  ApprovalsListsSubViewId,
  CostChangesSubViewId,
  HubId,
  HubMeta,
  LegacyReportKey,
  MaterialCostsSubViewId,
  PricingHealthSubViewId,
  RetiredReportRedirect,
  SubViewId,
} from '../types';

export const MATERIAL_COSTS_SUB_VIEW_IDS: MaterialCostsSubViewId[] = [
  'materials-cost-analysis',
  'top-cost-drivers',
];

export const HUBS: HubMeta[] = [
  {
    id: 'pricing-health',
    label: 'Pricing Health',
    description: 'Markup analysis, pricing status, and margin health across products',
    defaultSubViewId: 'margin-health',
    subViews: [
      {
        id: 'margin-health',
        name: 'Margin Health',
        pillLabel: 'Margin Health',
        description: 'Product margin health bands and distribution',
      },
      {
        id: 'markup-analysis',
        name: 'Markup Analysis',
        pillLabel: 'Markup Analysis',
        description: 'Markup on cost vs target threshold with distribution and gap analysis',
      },
      {
        id: 'pricing-status',
        name: 'Pricing Status Report',
        pillLabel: 'Pricing Status',
        description: 'Approved base price vs optimal across all products',
      },
    ],
  },
  {
    id: 'cost-changes',
    label: 'Cost Changes',
    description: 'Price drift, volatility, and material price history',
    defaultSubViewId: 'price-vs-cost-drift',
    subViews: [
      {
        id: 'price-vs-cost-drift',
        name: 'Price vs Cost Drift',
        pillLabel: 'Price vs Cost Drift',
        description: 'Markup drift since price approval as costs change',
      },
      {
        id: 'price-volatility',
        name: 'Price Volatility',
        pillLabel: 'Price Volatility',
        description: 'Materials with unit cost changes over a selected period',
      },
      {
        id: 'material-price-history',
        name: 'Material Price History',
        pillLabel: 'Material Price History',
        description: 'Full price change history for a selected material',
      },
    ],
  },
  {
    id: 'material-costs',
    label: 'Material Costs',
    description: 'Material unit costs and top BOM cost drivers',
    defaultSubViewId: 'materials-cost-analysis',
    subViews: [
      {
        id: 'materials-cost-analysis',
        name: 'Materials Cost Analysis',
        pillLabel: 'Materials Cost Analysis',
        description: 'Unit costs, categories, and product usage across active materials',
      },
      {
        id: 'top-cost-drivers',
        name: 'Top Cost Drivers',
        pillLabel: 'Top Cost Drivers',
        description: 'Materials with the highest total BOM cost contribution',
      },
    ],
  },
  {
    id: 'approvals-lists',
    label: 'Approvals & Lists',
    description: 'Approval history and price list summary',
    defaultSubViewId: 'approval-history',
    subViews: [
      {
        id: 'approval-history',
        name: 'Approval History',
        pillLabel: 'Approval History',
        description: 'Product price approvals with dates',
      },
      {
        id: 'price-list-summary',
        name: 'Price List Summary',
        pillLabel: 'Price List Summary',
        description: 'All price lists and their coverage',
      },
    ],
  },
];

export const HUBS_BY_ID = Object.fromEntries(HUBS.map((hub) => [hub.id, hub])) as Record<HubId, HubMeta>;

/** Retired legacy report keys → target hub sub-view (applied in Phase 4; defined now to avoid rework). */
export const RETIRED_REPORT_REDIRECTS: Partial<Record<LegacyReportKey, RetiredReportRedirect>> = {
  'product-pricing-overview': { hubId: 'pricing-health', subViewId: 'margin-health' },
  'profitability-ranking': { hubId: 'pricing-health', subViewId: 'margin-health' },
  'optimal-vs-actual-gap': { hubId: 'pricing-health', subViewId: 'pricing-status' },
  'currency-exposure': { hubId: 'cost-changes', subViewId: 'price-volatility' },
  'inactive-in-boms': { hubId: 'material-costs', subViewId: 'materials-cost-analysis' },
};

/** Migrated material-cost reports: legacy ?group=materials&report= → new hub URL. */
export const LEGACY_MATERIAL_COST_REPORT_REDIRECTS: Partial<Record<LegacyReportKey, MaterialCostsSubViewId>> = {
  'materials-cost-analysis': 'materials-cost-analysis',
  'top-cost-drivers': 'top-cost-drivers',
};

/** Migrated approvals & lists reports: legacy ?group=pricing&report= → new hub URL. */
export const LEGACY_APPROVALS_LISTS_REPORT_REDIRECTS: Partial<Record<LegacyReportKey, ApprovalsListsSubViewId>> = {
  'approval-history': 'approval-history',
  'price-list-summary': 'price-list-summary',
};

/** Migrated pricing-health reports: legacy ?group=pricing|products&report= → new hub URL. */
export const LEGACY_PRICING_HEALTH_REPORT_REDIRECTS: Partial<Record<LegacyReportKey, PricingHealthSubViewId>> = {
  'markup-analysis': 'markup-analysis',
  'pricing-status': 'pricing-status',
  'margin-health': 'margin-health',
};

/** Migrated cost-changes reports: legacy ?group=products|materials&report= → new hub URL. */
export const LEGACY_COST_CHANGES_REPORT_REDIRECTS: Partial<Record<LegacyReportKey, CostChangesSubViewId>> = {
  'price-vs-cost-drift': 'price-vs-cost-drift',
  'price-volatility': 'price-volatility',
  'material-price-history': 'material-price-history',
};

export function isHubId(value: string | null): value is HubId {
  return value != null && value in HUBS_BY_ID;
}

export function isMaterialCostsSubViewId(value: string | null): value is MaterialCostsSubViewId {
  return value === 'materials-cost-analysis' || value === 'top-cost-drivers';
}

export function isApprovalsListsSubViewId(value: string | null): value is ApprovalsListsSubViewId {
  return value === 'approval-history' || value === 'price-list-summary';
}

export function isCostChangesSubViewId(value: string | null): value is CostChangesSubViewId {
  return value === 'price-vs-cost-drift'
    || value === 'price-volatility'
    || value === 'material-price-history';
}

export function isPricingHealthSubViewId(value: string | null): value is PricingHealthSubViewId {
  return value === 'margin-health'
    || value === 'markup-analysis'
    || value === 'pricing-status';
}

export function getHubSubViewMeta(hubId: HubId, subViewId: SubViewId) {
  const hub = HUBS_BY_ID[hubId];
  return hub.subViews.find((subView) => subView.id === subViewId) ?? hub.subViews[0];
}

export function buildHubUrl(hubId: HubId, subViewId: SubViewId): string {
  return `/reports?hub=${hubId}&view=${subViewId}`;
}

export function buildLegacyGroupUrl(group: 'pricing' | 'products' | 'materials', report: LegacyReportKey): string {
  return `/reports?group=${group}&report=${report}`;
}
