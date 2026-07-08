export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');

import { downloadFile } from './utils/download';
import { parseImportFileRows } from './utils/importWorkbook';

// When loaded via file:// (Electron), relative /templates/ URLs don't resolve.
// Use an absolute HTTP URL derived from the API base instead.
export function templateUrl(filename: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return `${API_BASE.replace(/\/api$/, '')}/templates/${filename}`;
  }
  return `/templates/${filename}`;
}

// Download a template file. In Electron uses native save dialog via IPC;
// in browser uses fetch + blob URL.
export async function downloadTemplate(filename: string): Promise<void> {
  await downloadFile(templateUrl(filename), filename);
}

async function parseResponse(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as any)?.error || `Request failed (${res.status})`;
    const error = new Error(message) as Error & {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
    };
    error.status = res.status;
    error.code = (data as any)?.code;
    error.details = (data as any)?.details;
    throw error;
  }
  return data;
}

export type EntityStatusFilter = 'active' | 'inactive' | 'all';
export type MaterialTypeFilter = 'primary' | 'intermediate' | 'all';

export interface MaterialRecord {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  materialType?: 'primary' | 'intermediate';
  category: string;
  unit: string;
  bulkQuantity: number | string;
  bulkPrice: number | string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode?: string;
  purchaseCurrencySymbol?: string;
  baseCurrencySymbol?: string;
  unitPrice: number | string;
  overheadPercentage?: number | string;
  marginPercentage?: number | string;
  intermediateCostMode?: 'yield' | 'completed_output';
  yieldPercentage?: number | string;
  calculatedCostPerUnit?: number | string;
  supplier: string;
  isActive: boolean;
}

export interface IntermediateBomItemRecord {
  id: number;
  intermediateMaterialId: number;
  componentMaterialId: number;
  quantity: number;
  componentMaterialName?: string;
  unit?: string;
  unitPrice?: number | string;
}

export interface ProductRecord {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  overheadPercentage: number;
  profitMargin: number;
  otherDirectCosts?: number;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  currentSellingPrice?: number;
  approvalStatus?: 'pending' | 'approved' | 'needs_review';
  approvedPrice?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | number | null;
  approvedPriceExpiresAt?: string | null;
  priceExpiryNotifiedAt?: string | null;
  needsReviewReason?: string | null;
  isPriceExpired?: boolean;
  daysUntilExpiry?: number | null;
  isActive: boolean;
}

export interface ImportMaterialRow {
  name: string;
  category: string;
  unit: string;
  currencyCode?: string;
  bulkPrice: number;
  bulkQuantity: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; error: string }>;
}

export interface DemoModeState {
  demoMode: boolean;
  message?: string;
}

export interface DemoResetResponse {
  success: boolean;
}

export interface PinStatusResponse {
  hasPIN: boolean;
}

export interface PinSetResponse {
  success: boolean;
}

export interface PinVerifyResponse {
  valid: boolean;
}

export interface PinResetResponse {
  message: string;
}

export interface PriceLevelPackSize {
  id: number;
  packQuantity: number;
  packPrice: number;
  packPriceConverted: number;
}

export interface PriceLevelItemResponse {
  id: number;
  priceLevelId: number;
  productId: number;
  productName: string;
  productCategory: string;
  productApprovedPrice: number;
  productOptimalPrice: number;
  productProductionCost: number;
  overrideType: 'rule_discount' | 'rule_markup' | 'fixed_amount_add' | 'fixed_amount_deduct';
  adjustmentPercentage: number | null;
  customPrice: number | null;
  finalPrice: number;
  finalPriceConverted?: number;
  currencyCode?: string;
  rateToBase?: number;
  status: 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: number | null;
  justification: string | null;
  createdAt: number;
  updatedAt: number;
  productApprovedAt: number | null;
  isStalePrice: boolean;
  productApprovalStatus?: string;
  packSizes?: PriceLevelPackSize[];
}

export interface ActivityEntry {
  id: number;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  action: string;
  details: Record<string, unknown> | null;
  performedBy: string | null;
  userId?: number;
  userName?: string;
  createdAt: number;
}

export const activityLogApi = {
  getAll: async (params?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    entityId?: number;
    action?: string;
    from?: number;
    to?: number;
  }): Promise<{ entries: ActivityEntry[]; total: number }> => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.entityId) query.set('entityId', String(params.entityId));
    if (params?.action) query.set('action', params.action);
    if (params?.from) query.set('from', String(params.from));
    if (params?.to) query.set('to', String(params.to));

    const queryString = query.toString();
    const url = `${API_BASE}/activity${queryString ? `?${queryString}` : ''}`;
    const res = await fetch(url);
    return parseResponse(res);
  },
};

// Settings API
export const settingsApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/settings`);
    return parseResponse(res);
  },
  getByKey: async (key: string) => {
    const res = await fetch(`${API_BASE}/settings/${key}`);
    return res.json();
  },
  save: async (data: { settingKey: string; settingValue: string }) => {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

export const pinApi = {
  getStatus: async (): Promise<PinStatusResponse> => {
    const res = await fetch(`${API_BASE}/pin/status`);
    return parseResponse(res);
  },
  set: async (pin: string, currentPin?: string): Promise<PinSetResponse> => {
    const res = await fetch(`${API_BASE}/pin/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, currentPin }),
    });
    return parseResponse(res);
  },
  verify: async (pin: string): Promise<PinVerifyResponse> => {
    const res = await fetch(`${API_BASE}/pin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return parseResponse(res);
  },
  reset: async (): Promise<PinResetResponse> => {
    const res = await fetch(`${API_BASE}/pin/reset`, {
      method: 'POST',
    });
    return parseResponse(res);
  },
};

// Currencies API
export const currenciesApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/currencies`);
    return parseResponse(res);
  },
  create: async (data: { code: string; name: string; symbol: string }) => {
    const res = await fetch(`${API_BASE}/currencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id: number, data: { code: string; name: string; symbol: string }) => {
    const res = await fetch(`${API_BASE}/currencies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  toggle: async (id: number) => {
    const res = await fetch(`${API_BASE}/currencies/${id}/toggle`, {
      method: 'PUT',
    });
    return res.json();
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/currencies/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
};

// Exchange Rates API
export const exchangeRatesApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/exchange-rates`);
    return res.json();
  },
  create: async (data: { currencyId: number; rateToBase: number; source?: string }) => {
    const res = await fetch(`${API_BASE}/exchange-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (currencyId: number, data: { rateToBase: number }) => {
    const res = await fetch(`${API_BASE}/exchange-rates/${currencyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  recalculateMaterials: async (id: number) => {
    const response = await fetch(`${API_BASE}/exchange-rates/${id}/recalculate-materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  },
};

// Materials API
export const materialsApi = {
  getAll: async (status?: EntityStatusFilter, type?: MaterialTypeFilter) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') {
      params.set('status', status);
    }
    if (type && type !== 'all') {
      params.set('type', type);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/materials${query}`);
    return parseResponse(res);
  },
  create: async (data: any) => {
    const res = await fetch(`${API_BASE}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  update: async (id: number, data: any) => {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
  bulkDeleteIntermediates: async (ids: number[]) => {
    const res = await fetch(`${API_BASE}/intermediate-materials/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return parseResponse(res);
  },
  getPriceHistory: async (id: number) => {
    const res = await fetch(`${API_BASE}/materials/${id}/price-history`);
    return res.json();
  },
  checkUsage: async (materialIds: number[]) => {
    const res = await fetch(`${API_BASE}/materials/check-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialIds }),
    });
    return res.json();
  },
  getIntermediateBom: async (materialId: number) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/bom`);
    return parseResponse(res);
  },
  addIntermediateBomItem: async (materialId: number, data: { componentMaterialId: number; quantity: number }) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/bom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  updateIntermediateBomItem: async (materialId: number, bomId: number, data: { quantity: number }) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/bom/${bomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  deleteIntermediateBomItem: async (materialId: number, bomId: number) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/bom/${bomId}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
  recalculateIntermediateCost: async (materialId: number) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/recalculate-cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse(res);
  },
  cascadeIntermediateCosts: async (materialId: number) => {
    const res = await fetch(`${API_BASE}/materials/${materialId}/cascade-intermediate-costs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse(res);
  },
  importMaterials: async (materials: ImportMaterialRow[]): Promise<ImportResult> => {
    const res = await fetch(`${API_BASE}/materials/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materials }),
    });
    return parseResponse(res);
  },
  importIntermediateMaterials: async (file: File): Promise<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; name: string; reason: string }>;
  }> => {
    const materials = await parseImportFileRows(file);

    const res = await fetch(`${API_BASE}/intermediate-materials/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materials }),
    });
    return parseResponse(res);
  },
};

// Products API
export const productsApi = {
  getAll: async (status?: EntityStatusFilter) => {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${API_BASE}/products${query}`);
    return parseResponse(res);
  },
  getById: async (id: number) => {
    const res = await fetch(`${API_BASE}/products/${id}`);
    return res.json();
  },
  create: async (data: any) => {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete product');
    }
    return res.json();
  },
  getBOM: async (productId: number) => {
    const res = await fetch(`${API_BASE}/products/${productId}/bom`);
    return res.json();
  },
  addMaterialToBOM: async (productId: number, data: { materialId: number; quantity: number }) => {
    const res = await fetch(`${API_BASE}/products/${productId}/bom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  removeMaterialFromBOM: async (productId: number, bomId: number) => {
    const res = await fetch(`${API_BASE}/products/${productId}/bom/${bomId}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  calculateCost: async (productId: number) => {
    const res = await fetch(`${API_BASE}/products/${productId}/calculate`);
    return res.json();
  },
  approve: async (productId: number, data: { approvedPrice?: number; reason?: string; priceExpiryDate?: string | null }) => {
    const res = await fetch(`${API_BASE}/products/${productId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to approve price');
    }
    return res.json();
  },
  resetToPending: async (productId: number, data?: { reason?: string }) => {
    const res = await fetch(`${API_BASE}/products/${productId}/reset-to-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to reset price to pending');
    }
    return res.json();
  },
  bulkResetToPending: async (productIds: number[], reason?: string) => {
    const res = await fetch(`${API_BASE}/products/bulk-reset-to-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds, reason }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to bulk reset products to pending');
    }
    return res.json();
  },
  bulkApprove: async (
    productIds: number[],
    options?: {
      priceMethod?: 'optimal' | 'selling' | 'markup';
      markupPercentage?: number;
      priceExpiryDate?: string | null;
    }
  ) => {
    const res = await fetch(`${API_BASE}/products/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds, ...options }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to bulk approve products');
    }
    return res.json();
  },
  import: async (rows: any[]) => {
    const res = await fetch(`${API_BASE}/products/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    });
    return parseResponse(res);
  },
  processPriceExpiry: async () => {
    const res = await fetch(`${API_BASE}/products/process-price-expiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse(res);
  },
  
};

// Price Level Rules API
export const priceLevelRulesApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/price-level-rules`);
    return res.json();
  },
  create: async (data: { name: string; adjustmentType: 'discount' | 'markup'; adjustmentPercentage: number; description?: string; currencyId?: number | null }) => {
    const res = await fetch(`${API_BASE}/price-level-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id: number, data: { name: string; adjustmentType: 'discount' | 'markup'; adjustmentPercentage: number; description?: string; isActive?: boolean; currencyId?: number | null }) => {
    const res = await fetch(`${API_BASE}/price-level-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/price-level-rules/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
};

export const priceLevelItemsApi = {
  getAll: async (priceLevelId: number): Promise<PriceLevelItemResponse[]> => {
    const res = await fetch(`${API_BASE}/price-levels/${priceLevelId}/items`);
    return parseResponse(res);
  },
  upsert: async (
    priceLevelId: number,
    data: {
      productId: number;
      overrideType: 'rule_discount' | 'rule_markup' | 'fixed_amount_add' | 'fixed_amount_deduct';
      adjustmentPercentage?: number;
      customPrice?: number;
      justification?: string;
    }
  ): Promise<PriceLevelItemResponse> => {
    const res = await fetch(`${API_BASE}/price-levels/${priceLevelId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  delete: async (priceLevelId: number, productId: number) => {
    const res = await fetch(`${API_BASE}/price-levels/${priceLevelId}/items/${productId}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
  approve: async (priceLevelId: number, productId: number, approvedBy?: string): Promise<PriceLevelItemResponse> => {
    const res = await fetch(`${API_BASE}/price-levels/${priceLevelId}/items/${productId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy }),
    });
    return parseResponse(res);
  },
  bulkApprove: async (priceLevelId: number, approvedBy?: string): Promise<{ approved: number }> => {
    const res = await fetch(`${API_BASE}/price-levels/${priceLevelId}/items/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy }),
    });
    return parseResponse(res);
  },
};

export const packSizesApi = {
  getForItem: async (itemId: number): Promise<Array<{ id: number; packQuantity: number }>> => {
    const res = await fetch(`${API_BASE}/price-level-items/${itemId}/pack-sizes`);
    return parseResponse(res);
  },
  add: async (itemId: number, packQuantity: number): Promise<{ id: number; packQuantity: number }> => {
    const res = await fetch(`${API_BASE}/price-level-items/${itemId}/pack-sizes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packQuantity }),
    });
    return parseResponse(res);
  },
  delete: async (packSizeId: number): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/price-level-pack-sizes/${packSizeId}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
};

// Reports API
export const reportsApi = {
  getTopCostDrivers: async () => {
    const res = await fetch(`${API_BASE}/reports/top-cost-drivers`);
    return parseResponse(res);
  },
  getPriceVolatility: async (period: '30' | '90' | '180' | '365') => {
    const res = await fetch(`${API_BASE}/reports/price-volatility?period=${encodeURIComponent(period)}`);
    return parseResponse(res);
  },
};

// Backup API
export const backupApi = {
  getStatus: async () => {
    const res = await fetch(`${API_BASE}/backup/status`);
    if (!res.ok) {
      throw new Error('Failed to get backup status');
    }
    return res.json();
  },
};

// Price Lists API
export const priceListsApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/price-lists`);
    if (!res.ok) {
      throw new Error('Failed to fetch price lists');
    }
    return res.json();
  },
};

export const demoModeApi = {
  get: async (): Promise<DemoModeState> => {
    const res = await fetch(`${API_BASE}/demo-mode`);
    return parseResponse(res);
  },
  set: async (demoMode: boolean): Promise<DemoModeState> => {
    const res = await fetch(`${API_BASE}/demo-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoMode }),
    });
    return parseResponse(res);
  },
  reset: async (): Promise<DemoResetResponse> => {
    const res = await fetch(`${API_BASE}/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse(res);
  },
};