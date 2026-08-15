import { materialsApi, productsApi, reportsApi } from '../../../api';
import { calculateActualMarkupPercent } from '../../../utils/margin';
import type { CostChangesReportResultMap, MaterialPriceHistoryTableRow } from '../types';
import { parseDate, toNumber } from './reportUtils';

type ProductRow = {
  name: string;
  category?: string | null;
  productionCost?: number;
  approvedPrice?: number | null;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  profitMargin?: number;
  isActive?: boolean;
};

type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit?: string;
  unitPrice: number | string;
};

type MaterialPriceHistoryApiEntry = {
  id: number;
  priceInBaseCurrency: number | string;
  changedAt: string | number;
};

export type PriceVsCostDriftFilter = 'Negative only' | 'All';

export async function generatePriceVsCostDriftReport(
  driftFilter: PriceVsCostDriftFilter,
): Promise<CostChangesReportResultMap['price-vs-cost-drift']> {
  const products = (await productsApi.getAll('active')) as ProductRow[];
  const allRows = products
    .filter((product) => product.approvalStatus === 'approved')
    .map((product) => {
      const approvedPrice = toNumber(product.approvedPrice);
      const currentCost = toNumber(product.productionCost);
      const targetMarkupPercent = toNumber(product.profitMargin);
      const currentMarkupPercent = calculateActualMarkupPercent(approvedPrice, currentCost) ?? 0;
      const markupDrift = currentMarkupPercent - targetMarkupPercent;

      return {
        productName: product.name,
        category: product.category || 'Uncategorised',
        approvedPrice,
        currentCost,
        currentMarkupPercent,
        targetMarkupPercent,
        markupDrift,
      };
    })
    .filter((row) => row.approvedPrice > 0 && row.currentCost > 0);

  const filteredRows = allRows
    .filter((row) => (driftFilter === 'Negative only' ? row.markupDrift < 0 : true))
    .sort((a, b) => a.markupDrift - b.markupDrift);

  return {
    rows: filteredRows,
    affectedCount: allRows.filter((row) => row.markupDrift < 0).length,
  };
}

export async function generatePriceVolatilityReport(
  period: '30' | '90' | '180' | '365',
): Promise<CostChangesReportResultMap['price-volatility']> {
  return reportsApi.getPriceVolatility(period);
}

export async function generateMaterialPriceHistoryReport(
  materialId: number | null,
): Promise<CostChangesReportResultMap['material-price-history']> {
  const materials = (await materialsApi.getAll('active')) as MaterialRow[];
  const materialOptions = materials
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((material) => ({ id: material.id, name: material.name }));

  const selectedMaterial = materialId
    ? materials.find((material) => material.id === materialId) || null
    : null;

  if (!selectedMaterial) {
    return {
      materialId: null,
      materialName: '',
      materialOptions,
      rows: [],
      currentCost: 0,
      firstRecordedCost: null,
      priceChangeCount: 0,
      costTrend: 'stable',
    };
  }

  const history = (await materialsApi.getPriceHistory(selectedMaterial.id)) as MaterialPriceHistoryApiEntry[];
  const historyDesc = Array.isArray(history)
    ? history.slice().sort((a, b) => (parseDate(b.changedAt)?.getTime() ?? 0) - (parseDate(a.changedAt)?.getTime() ?? 0))
    : [];

  const rows: MaterialPriceHistoryTableRow[] = historyDesc.map((entry, index) => {
    const newCost = toNumber(entry.priceInBaseCurrency);
    const olderEntry = historyDesc[index + 1];
    const oldCost = olderEntry ? toNumber(olderEntry.priceInBaseCurrency) : null;
    const changeAmount = oldCost == null ? null : newCost - oldCost;
    const changePercent = oldCost != null && oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : null;

    return {
      date: parseDate(entry.changedAt)?.toLocaleString() || '—',
      oldCost,
      newCost,
      changeAmount,
      changePercent,
      changedBy: '—',
    };
  });

  const firstRecordedCost = historyDesc.length > 0
    ? toNumber(historyDesc[historyDesc.length - 1].priceInBaseCurrency)
    : null;
  const currentCost = toNumber(selectedMaterial.unitPrice);
  const priceChangeCount = Math.max(0, historyDesc.length - 1);

  let costTrend: 'up' | 'down' | 'stable' = 'stable';
  if (firstRecordedCost != null && currentCost > firstRecordedCost + 0.01) costTrend = 'up';
  else if (firstRecordedCost != null && currentCost < firstRecordedCost - 0.01) costTrend = 'down';

  return {
    materialId: selectedMaterial.id,
    materialName: selectedMaterial.name,
    materialOptions,
    rows,
    currentCost,
    firstRecordedCost,
    priceChangeCount,
    costTrend,
  };
}
