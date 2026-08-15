import { activityLogApi, priceListsApi, productsApi, type ActivityEntry } from '../../../api';
import { calculateActualMarkupPercent } from '../../../utils/margin';
import type { ApprovalsListsReportResultMap } from '../types';
import { daysUntil, parseDate, toNumber } from './reportUtils';

type ProductRow = {
  id: number;
  name: string;
  category?: string | null;
  optimalPrice?: number;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'needs_review';
  approvedBy?: string | null;
  isActive?: boolean;
};

type PriceListRow = {
  id: number;
  name: string;
  customerId?: number | null;
  customerName?: string | null;
  priceLevelName?: string | null;
  validFrom: string | number;
  validUntil: string | number | null;
  status: string;
  updatedAt?: string | number;
  itemsCount?: number;
};

async function fetchAllActivityEntries(params: {
  entityType?: string;
  action?: string;
  from?: number;
  to?: number;
}): Promise<ActivityEntry[]> {
  const limit = 200;
  let offset = 0;
  let total = Infinity;
  const entries: ActivityEntry[] = [];

  while (offset < total) {
    const response = await activityLogApi.getAll({ ...params, limit, offset });
    const batch = response.entries || [];
    entries.push(...batch);
    total = response.total ?? entries.length;
    if (batch.length === 0) {
      break;
    }
    offset += limit;
  }

  return entries;
}

export type ApprovalHistoryFilters = {
  fromDate: string;
  toDate: string;
  statusFilter: 'All' | 'approved' | 'needs_review' | 'pending';
  categoryFilter: string;
};

export async function generateApprovalHistoryReport(
  filters: ApprovalHistoryFilters,
): Promise<ApprovalsListsReportResultMap['approval-history']> {
  const fromDate = parseDate(filters.fromDate);
  const toDate = parseDate(filters.toDate);

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  const [approvalEntries, products] = await Promise.all([
    fetchAllActivityEntries({
      entityType: 'product',
      action: 'product.approved',
      from: fromDate ? fromDate.getTime() : undefined,
      to: toDate ? toDate.getTime() : undefined,
    }),
    productsApi.getAll('all') as Promise<ProductRow[]>,
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));

  const rows = approvalEntries
    .map((entry) => {
      const details = entry.details || {};
      const approvedPrice = typeof details.newPrice === 'number' ? details.newPrice : null;
      const productionCost = typeof details.productionCost === 'number' ? details.productionCost : null;
      const markupPercent = typeof details.markupPercent === 'number' ? details.markupPercent : null;
      const marginPercent = typeof details.margin === 'number'
        ? details.margin
        : (typeof details.grossMargin === 'number' ? details.grossMargin : null);
      const actualMarkupPercent = markupPercent ?? marginPercent ?? (
        approvedPrice != null && productionCost != null && productionCost > 0
          ? calculateActualMarkupPercent(approvedPrice, productionCost)
          : null
      );

      const product = entry.entityId != null ? productById.get(entry.entityId) : undefined;

      return {
        productName: product?.name || entry.entityName || 'Unknown product',
        category: product?.category || 'Uncategorised',
        currentStatus: product?.approvalStatus || 'pending',
        approvedPrice,
        optimalPrice: product ? toNumber(product.optimalPrice) : null,
        productionCost,
        actualMarkupPercent,
        approvedOn: entry.createdAt ?? null,
        approvedBy: entry.performedBy || product?.approvedBy || '—',
        isActive: product ? Boolean(product.isActive) : false,
      };
    })
    .filter((row) => (filters.statusFilter === 'All' ? true : row.currentStatus === filters.statusFilter))
    .filter((row) => (filters.categoryFilter === 'All' ? true : row.category === filters.categoryFilter))
    .sort((a, b) => {
      const aTime = parseDate(a.approvedOn)?.getTime() ?? -1;
      const bTime = parseDate(b.approvedOn)?.getTime() ?? -1;
      return bTime - aTime;
    });

  return { rows };
}

export async function generatePriceListSummaryReport(): Promise<ApprovalsListsReportResultMap['price-list-summary']> {
  const lists = (await priceListsApi.getAll()) as PriceListRow[];

  const rows = lists.map((list) => {
    const validFromDate = parseDate(list.validFrom);
    const validUntilDate = parseDate(list.validUntil);
    const updatedAtDate = parseDate(list.updatedAt || list.validFrom);
    const daysLeft = daysUntil(validUntilDate);

    return {
      priceListName: list.name,
      listType: list.customerId ? 'By Customer' as const : 'By Level' as const,
      customerOrLevel: list.customerId ? (list.customerName || 'Customer') : (list.priceLevelName || '-'),
      productsCovered: toNumber(list.itemsCount),
      validFrom: validFromDate ? validFromDate.toLocaleDateString() : '—',
      validUntil: validUntilDate ? validUntilDate.toLocaleDateString() : '—',
      daysUntilExpiry: daysLeft,
      lastUpdated: updatedAtDate ? updatedAtDate.toLocaleDateString() : '—',
      status: list.status,
    };
  }).sort((a, b) => {
    if (a.daysUntilExpiry === null && b.daysUntilExpiry === null) return 0;
    if (a.daysUntilExpiry === null) return 1;
    if (b.daysUntilExpiry === null) return -1;
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });

  const expiringSoonCount = rows.filter((row) => row.daysUntilExpiry !== null && row.daysUntilExpiry <= 30 && row.daysUntilExpiry >= 0).length;
  const activeCount = rows.filter((row) => row.status === 'active').length;
  const expiredCount = rows.filter((row) => row.daysUntilExpiry !== null && row.daysUntilExpiry < 0).length;

  return { rows, activeCount, expiringSoonCount, expiredCount };
}
