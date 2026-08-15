import type { ColumnDef, ReportRow } from '../../../utils/reportExport';
import type {
  ApprovalsListsReportData,
  ApprovalsListsSubViewId,
  CostChangesReportData,
  CostChangesSubViewId,
  MaterialCostsReportData,
  MaterialCostsSubViewId,
  PricingHealthReportData,
  PricingHealthReportResultMap,
  PricingHealthSubViewId,
} from '../types';
import {
  approvalStatusLabel,
  formatApprovalExportDate,
  getPriceVolatilityStartColumnLabel,
  roundExportMarkupPercent,
  toNumber,
  withCurrencyColumnAfter,
} from '../utils/reportUtils';
import { calculateActualMarkupPercent } from '../../../utils/margin';

export function getMaterialCostsExportPayload(
  subViewId: MaterialCostsSubViewId,
  reportData: MaterialCostsReportData,
  baseCurrency: string,
): { rows: ReportRow[]; columns: ColumnDef[]; filename: string } | null {
  if (subViewId === 'materials-cost-analysis') {
    const data = reportData as Extract<MaterialCostsReportData, { totalActiveMaterials: number }>;
    const rows = data.rows.map((row) => ({
      materialName: row.materialName,
      category: row.category,
      unit: row.unit,
      unitCost: Number(row.unitCost.toFixed(2)),
      productsUsedCount: row.productsUsedCount,
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'materialName', label: 'Material Name' },
        { key: 'category', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        { key: 'unitCost', label: 'Unit Cost' },
        { key: 'productsUsedCount', label: 'Used in Products' },
      ],
      filename: 'materials-cost-analysis-report.csv',
    }, 'unitCost', baseCurrency);
  }

  if (subViewId === 'top-cost-drivers') {
    const data = reportData as Extract<MaterialCostsReportData, { totalMaterialsInBoms: number }>;
    const totalSum = data.totalWeightedCost;
    const rows = data.rows.map((row, index) => ({
      rank: index + 1,
      materialName: row.materialName,
      category: row.category,
      unitCost: Number(row.unitCost.toFixed(2)),
      bomUsageCount: row.bomUsageCount,
      totalContribution: Number(row.totalContribution.toFixed(2)),
      percentOfTotal: totalSum > 0
        ? Math.round((row.totalContribution / totalSum) * 1000) / 10
        : 0,
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'materialName', label: 'Material Name' },
        { key: 'category', label: 'Category' },
        { key: 'unitCost', label: 'Unit Cost' },
        { key: 'bomUsageCount', label: 'Times Used in BOMs' },
        { key: 'totalContribution', label: 'Total BOM Contribution' },
        { key: 'percentOfTotal', label: '% of Total Cost' },
      ],
      filename: 'top-cost-drivers-report.csv',
    }, 'unitCost', baseCurrency);
  }

  return null;
}

export function getMaterialCostsExportTitle(subViewId: MaterialCostsSubViewId): string {
  if (subViewId === 'materials-cost-analysis') {
    return 'Materials Cost Analysis';
  }
  return 'Top Cost Drivers';
}

export function getApprovalsListsExportPayload(
  subViewId: ApprovalsListsSubViewId,
  reportData: ApprovalsListsReportData,
  baseCurrency: string,
): { rows: ReportRow[]; columns: ColumnDef[]; filename: string } | null {
  if (subViewId === 'price-list-summary') {
    const data = reportData as Extract<ApprovalsListsReportData, { activeCount: number }>;
    const rows = data.rows.map((row) => ({
      priceListName: row.priceListName,
      listType: row.listType,
      customerOrLevel: row.customerOrLevel,
      productsCovered: row.productsCovered,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      daysUntilExpiry: row.daysUntilExpiry === null ? '' : row.daysUntilExpiry,
      lastUpdated: row.lastUpdated,
      status: row.status,
    }));
    return {
      rows,
      columns: [
        { key: 'priceListName', label: 'Price List Name' },
        { key: 'listType', label: 'Type' },
        { key: 'customerOrLevel', label: 'Customer/Level' },
        { key: 'productsCovered', label: 'Products Covered' },
        { key: 'validFrom', label: 'Valid From' },
        { key: 'validUntil', label: 'Valid Until' },
        { key: 'daysUntilExpiry', label: 'Days Until Expiry' },
        { key: 'lastUpdated', label: 'Last Updated' },
        { key: 'status', label: 'Status' },
      ],
      filename: 'price-list-summary-report.csv',
    };
  }

  if (subViewId === 'approval-history') {
    const data = reportData as Extract<ApprovalsListsReportData, { rows: Array<{ productName: string }> }>;
    const rows = data.rows.map((row) => ({
      productName: row.productName,
      category: row.category,
      currentStatus: row.currentStatus,
      approvedPrice: row.approvedPrice === null ? '' : row.approvedPrice.toFixed(2),
      currentOptimalPrice: row.optimalPrice == null ? '' : row.optimalPrice.toFixed(2),
      actualMarkupPercent: row.actualMarkupPercent == null ? '' : Number(row.actualMarkupPercent.toFixed(1)),
      approvedOn: formatApprovalExportDate(row.approvedOn),
      approvedBy: row.approvedBy,
      active: row.isActive ? 'Yes' : 'No',
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'productName', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'currentStatus', label: 'Current Status' },
        { key: 'approvedPrice', label: 'Approved base price' },
        { key: 'currentOptimalPrice', label: 'Current Optimal Price' },
        { key: 'actualMarkupPercent', label: 'Actual Markup %' },
        { key: 'approvedOn', label: 'Approved On' },
        { key: 'approvedBy', label: 'Approved By' },
        { key: 'active', label: 'Active' },
      ],
      filename: 'approval-history-report.csv',
    }, 'approvedPrice', baseCurrency);
  }

  return null;
}

export function getApprovalsListsExportTitle(subViewId: ApprovalsListsSubViewId): string {
  if (subViewId === 'approval-history') {
    return 'Approval History';
  }
  return 'Price List Summary';
}

type CostChangesExportOptions = {
  priceVolatilityPeriod?: '30' | '90' | '180' | '365';
};

export function getCostChangesExportPayload(
  subViewId: CostChangesSubViewId,
  reportData: CostChangesReportData,
  baseCurrency: string,
  options: CostChangesExportOptions = {},
): { rows: ReportRow[]; columns: ColumnDef[]; filename: string } | null {
  if (subViewId === 'price-vs-cost-drift') {
    const data = reportData as Extract<CostChangesReportData, { affectedCount: number }>;
    const rows = data.rows.map((row) => ({
      productName: row.productName,
      category: row.category,
      approvedPrice: Number(row.approvedPrice.toFixed(2)),
      currentCost: Number(row.currentCost.toFixed(2)),
      currentMarkupPercent: roundExportMarkupPercent(row.approvedPrice, row.currentCost) ?? '',
      targetMarkupPercent: Number(row.targetMarkupPercent.toFixed(1)),
      markupDrift: Number(row.markupDrift.toFixed(1)),
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'productName', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'approvedPrice', label: 'Approved base price' },
        { key: 'currentCost', label: 'Current Cost' },
        { key: 'currentMarkupPercent', label: 'Current Markup %' },
        { key: 'targetMarkupPercent', label: 'Target Markup %' },
        { key: 'markupDrift', label: 'Markup Drift' },
      ],
      filename: 'price-vs-cost-drift-report.csv',
    }, 'approvedPrice', baseCurrency);
  }

  if (subViewId === 'price-volatility') {
    const period = options.priceVolatilityPeriod ?? '90';
    const data = reportData as Extract<CostChangesReportData, { endpointAvailable: boolean }>;
    const rows = data.rows.map((row) => ({
      materialName: row.materialName,
      category: row.category,
      unit: row.unit,
      costAtStart: Number(row.costAtStart.toFixed(2)),
      currentCost: Number(row.currentCost.toFixed(2)),
      changeAmount: Number(row.changeAmount.toFixed(2)),
      changePercent: Number(row.changePercent.toFixed(1)),
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'materialName', label: 'Material Name' },
        { key: 'category', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        { key: 'costAtStart', label: getPriceVolatilityStartColumnLabel(period) },
        { key: 'currentCost', label: 'Current Cost' },
        { key: 'changeAmount', label: 'Change Amount' },
        { key: 'changePercent', label: 'Change %' },
      ],
      filename: 'price-volatility-report.csv',
    }, 'costAtStart', baseCurrency);
  }

  if (subViewId === 'material-price-history') {
    const data = reportData as Extract<CostChangesReportData, { materialId: number | null }>;
    const rows = data.rows.map((row) => ({
      date: row.date,
      oldCost: row.oldCost == null ? '' : Number(row.oldCost.toFixed(2)),
      newCost: Number(row.newCost.toFixed(2)),
      changeAmount: row.changeAmount == null ? '' : Number(row.changeAmount.toFixed(2)),
      changePercent: row.changePercent == null ? '' : Number(row.changePercent.toFixed(1)),
      changedBy: row.changedBy,
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'oldCost', label: 'Old Cost' },
        { key: 'newCost', label: 'New Cost' },
        { key: 'changeAmount', label: 'Change Amount' },
        { key: 'changePercent', label: 'Change %' },
        { key: 'changedBy', label: 'Changed By' },
      ],
      filename: `material-price-history-${data.materialName || 'report'}.csv`,
    }, 'oldCost', baseCurrency);
  }

  return null;
}

export function getCostChangesExportTitle(subViewId: CostChangesSubViewId): string {
  if (subViewId === 'price-vs-cost-drift') {
    return 'Price vs Cost Drift';
  }
  if (subViewId === 'price-volatility') {
    return 'Price Volatility';
  }
  return 'Material Price History';
}

export function getPricingHealthExportPayload(
  subViewId: PricingHealthSubViewId,
  reportData: PricingHealthReportData,
  baseCurrency: string,
): { rows: ReportRow[]; columns: ColumnDef[]; filename: string } | null {
  if (subViewId === 'pricing-status') {
    const data = reportData as PricingHealthReportResultMap['pricing-status'];
    const rows = data.rows.map((row) => ({
      productName: row.productName,
      approvalStatus: approvalStatusLabel(row.approvalStatus),
      category: row.category,
      productionCost: Number(row.productionCost.toFixed(2)),
      optimalPrice: Number(row.optimalPrice.toFixed(2)),
      sellingPrice: row.hasSellingPrice ? Number(row.sellingPrice.toFixed(2)) : null,
      variance: row.hasSellingPrice ? Number(row.variance.toFixed(2)) : null,
      variancePct: row.hasSellingPrice ? Number(row.variancePct.toFixed(1)) : null,
      profit: row.hasSellingPrice ? Number(row.profit.toFixed(2)) : null,
      markupPct: row.hasSellingPrice
        ? roundExportMarkupPercent(row.sellingPrice, row.productionCost)
        : null,
      pricingStatus: row.pricingStatus,
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'productName', label: 'Product Name' },
        { key: 'approvalStatus', label: 'Approval Status' },
        { key: 'category', label: 'Category' },
        { key: 'productionCost', label: 'Production Cost' },
        { key: 'optimalPrice', label: 'Optimal Price' },
        { key: 'sellingPrice', label: 'Approved base price' },
        { key: 'variance', label: 'Variance' },
        { key: 'variancePct', label: 'Variance %' },
        { key: 'profit', label: 'Profit' },
        { key: 'markupPct', label: 'Actual Markup %' },
        { key: 'pricingStatus', label: 'Pricing Status' },
      ],
      filename: 'pricing-status-report.csv',
    }, 'productionCost', baseCurrency);
  }

  if (subViewId === 'markup-analysis') {
    const data = reportData as PricingHealthReportResultMap['markup-analysis'];
    const rows = data.rows.map((row) => ({
      productName: row.productName,
      category: row.category,
      productionCost: Number(row.productionCost.toFixed(2)),
      approvedPrice: Number(row.approvedPrice.toFixed(2)),
      actualMarkupPercent: roundExportMarkupPercent(row.approvedPrice, row.productionCost) ?? '',
      targetGap: Number(row.targetGap.toFixed(1)),
    }));
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'productName', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'productionCost', label: 'Production Cost' },
        { key: 'approvedPrice', label: 'Approved Price' },
        { key: 'actualMarkupPercent', label: 'Actual Markup %' },
        { key: 'targetGap', label: 'Target Gap %' },
      ],
      filename: 'markup-analysis-report.csv',
    }, 'productionCost', baseCurrency);
  }

  if (subViewId === 'margin-health') {
    const data = reportData as PricingHealthReportResultMap['margin-health'];
    const rows = data.products.map((product) => {
      const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
      const markup = approvedPrice > 0 && product.totalCost > 0
        ? calculateActualMarkupPercent(approvedPrice, product.totalCost)
        : null;
      return {
        productName: product.name,
        category: product.category || 'Uncategorised',
        productionCost: Number(product.totalCost.toFixed(2)),
        approvedPrice: approvedPrice > 0 ? Number(approvedPrice.toFixed(2)) : '',
        actualMarkupPercent: markup == null ? '' : Number(markup.toFixed(1)),
        approvalStatus: product.approvalStatus || 'pending',
      };
    });
    return withCurrencyColumnAfter({
      rows,
      columns: [
        { key: 'productName', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'productionCost', label: 'Production Cost' },
        { key: 'approvedPrice', label: 'Approved base price' },
        { key: 'actualMarkupPercent', label: 'Actual Markup %' },
        { key: 'approvalStatus', label: 'Approval Status' },
      ],
      filename: 'margin-health-report.csv',
    }, 'productionCost', baseCurrency);
  }

  return null;
}

export function getPricingHealthExportTitle(subViewId: PricingHealthSubViewId): string {
  if (subViewId === 'margin-health') {
    return 'Margin Health';
  }
  if (subViewId === 'markup-analysis') {
    return 'Markup Analysis';
  }
  return 'Pricing Status Report';
}
