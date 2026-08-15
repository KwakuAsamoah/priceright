export type HubId =
  | 'pricing-health'
  | 'cost-changes'
  | 'material-costs'
  | 'approvals-lists';

export type MaterialCostsSubViewId = 'materials-cost-analysis' | 'top-cost-drivers';

export type PricingHealthSubViewId = 'margin-health' | 'markup-analysis' | 'pricing-status';
export type CostChangesSubViewId = 'price-vs-cost-drift' | 'price-volatility' | 'material-price-history';
export type ApprovalsListsSubViewId = 'approval-history' | 'price-list-summary';

export type SubViewId =
  | MaterialCostsSubViewId
  | PricingHealthSubViewId
  | CostChangesSubViewId
  | ApprovalsListsSubViewId;

/** Legacy report keys retained for unmigrated routes and redirect map. */
export type LegacyReportKey =
  | 'pricing-status'
  | 'markup-analysis'
  | 'price-list-summary'
  | 'approval-history'
  | 'currency-exposure'
  | 'materials-cost-analysis'
  | 'top-cost-drivers'
  | 'price-volatility'
  | 'material-price-history'
  | 'inactive-in-boms'
  | 'product-pricing-overview'
  | 'margin-health'
  | 'profitability-ranking'
  | 'price-vs-cost-drift'
  | 'optimal-vs-actual-gap';

export type MaterialsCostAnalysisRow = {
  materialName: string;
  category: string;
  unit: string;
  unitCost: number;
  productsUsedCount: number;
};

export type TopCostDriverRow = {
  materialName: string;
  category: string;
  unitCost: number;
  bomUsageCount: number;
  totalContribution: number;
  percentOfTotal: number;
};

export type MaterialCostsReportResultMap = {
  'materials-cost-analysis': {
    rows: MaterialsCostAnalysisRow[];
    totalActiveMaterials: number;
    averageUnitCost: number;
    mostExpensiveName: string;
    mostExpensiveCost: number;
    categoryCount: number;
  };
  'top-cost-drivers': {
    rows: TopCostDriverRow[];
    totalMaterialsInBoms: number;
    totalWeightedCost: number;
    mostImpactfulMaterial: string;
  };
};

export type MaterialCostsReportData =
  MaterialCostsReportResultMap[MaterialCostsSubViewId];

export type ActiveFilterChip = {
  key: string;
  label: string;
  onClear: () => void;
};

export type SubViewMeta = {
  id: SubViewId;
  name: string;
  pillLabel: string;
  description: string;
};

export type HubMeta = {
  id: HubId;
  label: string;
  description: string;
  subViews: SubViewMeta[];
  defaultSubViewId: SubViewId;
};

export type RetiredReportRedirect = {
  hubId: HubId;
  subViewId: SubViewId;
};

export type ApprovalHistoryRow = {
  productName: string;
  category: string;
  currentStatus: string;
  approvedPrice: number | null;
  optimalPrice: number | null;
  productionCost: number | null;
  actualMarkupPercent: number | null;
  approvedOn: string | number | null;
  approvedBy: string;
  isActive: boolean;
};

export type PriceListSummaryRow = {
  priceListName: string;
  listType: 'By Level' | 'By Customer';
  customerOrLevel: string;
  productsCovered: number;
  validFrom: string;
  validUntil: string;
  daysUntilExpiry: number | null;
  lastUpdated: string;
  status: string;
};

export type ApprovalsListsReportResultMap = {
  'approval-history': {
    rows: ApprovalHistoryRow[];
  };
  'price-list-summary': {
    rows: PriceListSummaryRow[];
    activeCount: number;
    expiringSoonCount: number;
    expiredCount: number;
  };
};

export type ApprovalsListsReportData =
  ApprovalsListsReportResultMap[ApprovalsListsSubViewId];

export type PriceVsCostDriftRow = {
  productName: string;
  category: string;
  approvedPrice: number;
  currentCost: number;
  currentMarkupPercent: number;
  targetMarkupPercent: number;
  markupDrift: number;
};

export type PriceVolatilityRow = {
  materialName: string;
  category: string;
  unit: string;
  costAtStart: number;
  currentCost: number;
  changeAmount: number;
  changePercent: number;
};

export type MaterialPriceHistoryTableRow = {
  date: string;
  oldCost: number | null;
  newCost: number;
  changeAmount: number | null;
  changePercent: number | null;
  changedBy: string;
};

export type CostChangesReportResultMap = {
  'price-vs-cost-drift': {
    rows: PriceVsCostDriftRow[];
    affectedCount: number;
  };
  'price-volatility': {
    rows: PriceVolatilityRow[];
    materialsWithChanges: number;
    averageChangePercent: number;
    biggestIncreaseName: string;
    biggestIncreasePercent: number;
    biggestDecreaseName: string;
    biggestDecreasePercent: number;
    endpointAvailable: boolean;
  };
  'material-price-history': {
    materialId: number | null;
    materialName: string;
    materialOptions: Array<{ id: number; name: string }>;
    rows: MaterialPriceHistoryTableRow[];
    currentCost: number;
    firstRecordedCost: number | null;
    priceChangeCount: number;
    costTrend: 'up' | 'down' | 'stable';
  };
};

export type CostChangesReportData =
  CostChangesReportResultMap[CostChangesSubViewId];

export type MarginHealthProduct = {
  id: number;
  name: string;
  category?: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  approvalStatus?: 'pending' | 'approved' | 'needs_review';
  approvedPrice?: number | null;
  totalCost: number;
  optimalPrice: number;
  isActive: boolean;
};

export type PricingStatusRow = {
  productName: string;
  approvalStatus: 'approved' | 'pending' | 'needs_review' | 'rejected';
  category: string;
  productionCost: number;
  optimalPrice: number;
  sellingPrice: number;
  hasSellingPrice: boolean;
  variance: number;
  variancePct: number;
  profit: number;
  markupPct: number;
  pricingStatus: 'Above Optimal' | 'Below Optimal' | 'At Optimal';
};

export type MarkupAnalysisRow = {
  productName: string;
  category: string;
  productionCost: number;
  approvedPrice: number;
  actualMarkupPercent: number;
  targetGap: number;
};

export type PricingHealthReportResultMap = {
  'margin-health': {
    products: MarginHealthProduct[];
  };
  'markup-analysis': {
    rows: MarkupAnalysisRow[];
    totalAnalysed: number;
    aboveTargetCount: number;
    belowTargetCount: number;
    averageMarkup: number;
    threshold: number;
  };
  'pricing-status': {
    rows: PricingStatusRow[];
  };
};

export type PricingHealthReportData =
  PricingHealthReportResultMap[PricingHealthSubViewId];
