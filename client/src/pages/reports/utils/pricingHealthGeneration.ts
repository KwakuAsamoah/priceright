import { productsApi } from '../../../api';
import { calculateActualMarkupPercent } from '../../../utils/margin';
import type {
  MarginHealthProduct,
  PricingHealthReportResultMap,
  PricingStatusRow,
} from '../types';
import { toNumber } from './reportUtils';

type ProductRow = {
  id: number;
  name: string;
  category?: string | null;
  productionCost?: number;
  optimalPrice?: number;
  approvedPrice?: number | null;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  profitMargin?: number;
  isActive?: boolean;
  productionMode?: 'single' | 'batch' | null;
  batchYield?: number | null;
};

function mapProductForAnalysisTab(product: ProductRow): MarginHealthProduct {
  return {
    id: product.id,
    name: product.name,
    category: product.category || undefined,
    productionMode: product.productionMode ?? undefined,
    batchYield: product.batchYield ?? undefined,
    approvalStatus: product.approvalStatus === 'rejected' ? 'pending' : product.approvalStatus,
    approvedPrice: product.approvedPrice,
    totalCost: toNumber(product.productionCost),
    optimalPrice: toNumber(product.optimalPrice),
    isActive: product.isActive !== false,
  };
}

export type PricingStatusFilters = {
  categoryFilter: string;
  statusFilter: 'All' | 'Above Optimal' | 'Below Optimal' | 'At Optimal';
  sort: 'Product Name' | 'Markup % desc' | 'Markup % asc' | 'Variance desc' | 'Variance asc';
};

export type MarkupAnalysisFilters = {
  threshold: number;
  filter: 'all' | 'above' | 'below' | 'custom';
  category: string;
  minRange: string;
  maxRange: string;
};

export async function generateMarginHealthReport(): Promise<PricingHealthReportResultMap['margin-health']> {
  const products = (await productsApi.getAll('active')) as ProductRow[];
  const mappedProducts = products
    .filter((product) => product.isActive !== false)
    .map(mapProductForAnalysisTab);

  return { products: mappedProducts };
}

export async function generatePricingStatusReport(
  filters: PricingStatusFilters,
): Promise<PricingHealthReportResultMap['pricing-status']> {
  const products = (await productsApi.getAll('all')) as ProductRow[];
  const activeProducts = products.filter((product) => product.isActive !== false);

  const rows: PricingStatusRow[] = activeProducts.map((product) => {
    const productionCost = toNumber(product.productionCost);
    const optimalPrice = toNumber(product.optimalPrice);
    const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : null;
    const hasApprovedPrice = approvedPrice != null && approvedPrice > 0;
    const sellingPrice = hasApprovedPrice ? approvedPrice : 0;
    const variance = hasApprovedPrice ? sellingPrice - optimalPrice : 0;
    const variancePct = hasApprovedPrice && optimalPrice > 0 ? (variance / optimalPrice) * 100 : 0;
    const profit = hasApprovedPrice ? sellingPrice - productionCost : 0;
    const markupPct = hasApprovedPrice && productionCost > 0
      ? (calculateActualMarkupPercent(sellingPrice, productionCost) ?? 0)
      : 0;
    const pricingStatus: PricingStatusRow['pricingStatus'] =
      !hasApprovedPrice ? 'At Optimal' :
      sellingPrice > optimalPrice + 0.01 ? 'Above Optimal' :
      sellingPrice < optimalPrice - 0.01 ? 'Below Optimal' :
      'At Optimal';

    return {
      productName: product.name,
      approvalStatus: product.approvalStatus || 'pending',
      category: product.category || 'Uncategorised',
      productionCost,
      optimalPrice,
      sellingPrice,
      hasSellingPrice: hasApprovedPrice,
      variance,
      variancePct,
      profit,
      markupPct,
      pricingStatus,
    };
  });

  const filtered = rows
    .filter((row) => (filters.categoryFilter === 'All' ? true : row.category === filters.categoryFilter))
    .filter((row) => (filters.statusFilter === 'All' ? true : row.pricingStatus === filters.statusFilter));

  filtered.sort((a, b) => {
    if (filters.sort === 'Product Name') return a.productName.localeCompare(b.productName);
    if (filters.sort === 'Markup % desc') return b.markupPct - a.markupPct;
    if (filters.sort === 'Markup % asc') return a.markupPct - b.markupPct;
    if (filters.sort === 'Variance desc') return b.variance - a.variance;
    return a.variance - b.variance;
  });

  return { rows: filtered };
}

export async function generateMarkupAnalysisReport(
  filters: MarkupAnalysisFilters,
): Promise<PricingHealthReportResultMap['markup-analysis']> {
  const products = (await productsApi.getAll('all')) as ProductRow[];
  const approvedRows = products
    .filter((product) => {
      const approvedPrice = product.approvedPrice != null ? toNumber(product.approvedPrice) : 0;
      return product.approvalStatus === 'approved' && product.isActive !== false && approvedPrice > 0 && toNumber(product.productionCost) > 0;
    })
    .map((product) => {
      const approvedPrice = toNumber(product.approvedPrice);
      const productionCost = toNumber(product.productionCost);
      const actualMarkupPercent = calculateActualMarkupPercent(approvedPrice, productionCost) ?? 0;
      const targetGap = actualMarkupPercent - filters.threshold;

      return {
        productName: product.name,
        category: product.category || 'Uncategorised',
        productionCost,
        approvedPrice,
        actualMarkupPercent,
        targetGap,
      };
    });

  const afterCategory = approvedRows.filter((row) =>
    filters.category === 'All' ? true : row.category === filters.category,
  );

  const threshold = filters.threshold;
  const totalAnalysed = afterCategory.length;
  const aboveTargetCount = afterCategory.filter((row) => row.actualMarkupPercent >= threshold).length;
  const belowTargetCount = afterCategory.filter((row) => row.actualMarkupPercent < threshold).length;
  const averageMarkup = totalAnalysed > 0
    ? afterCategory.reduce((sum, row) => sum + row.actualMarkupPercent, 0) / totalAnalysed
    : 0;

  let filtered = afterCategory;
  if (filters.filter === 'above') {
    filtered = filtered.filter((row) => row.actualMarkupPercent >= threshold);
  } else if (filters.filter === 'below') {
    filtered = filtered.filter((row) => row.actualMarkupPercent < threshold);
  } else if (filters.filter === 'custom') {
    const min = filters.minRange === '' ? null : Number(filters.minRange);
    const max = filters.maxRange === '' ? null : Number(filters.maxRange);
    filtered = filtered.filter((row) => {
      if (min != null && Number.isFinite(min) && row.actualMarkupPercent < min) return false;
      if (max != null && Number.isFinite(max) && row.actualMarkupPercent > max) return false;
      return true;
    });
  }

  filtered.sort((a, b) => {
    const aBelow = a.actualMarkupPercent < threshold;
    const bBelow = b.actualMarkupPercent < threshold;
    if (aBelow && !bBelow) return -1;
    if (!aBelow && bBelow) return 1;
    if (aBelow && bBelow) return a.actualMarkupPercent - b.actualMarkupPercent;
    return b.actualMarkupPercent - a.actualMarkupPercent;
  });

  return {
    rows: filtered,
    totalAnalysed,
    aboveTargetCount,
    belowTargetCount,
    averageMarkup,
    threshold,
  };
}
