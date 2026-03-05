const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');

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
  getAll: async () => {
    const res = await fetch(`${API_BASE}/materials`);
    return parseResponse(res);
  },
  create: async (data: any) => {
    const res = await fetch(`${API_BASE}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id: number, data: any) => {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/materials/${id}`, {
      method: 'DELETE',
    });
    return res.json();
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
};

// Products API
export const productsApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/products`);
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
  approve: async (productId: number, data: { approvedPrice?: number; reason?: string }) => {
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
  reject: async (productId: number, data: { reason?: string }) => {
    const res = await fetch(`${API_BASE}/products/${productId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to reject price');
    }
    return res.json();
  },
  bulkApprove: async (productIds: number[]) => {
    const res = await fetch(`${API_BASE}/products/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds }),
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
  
};

// Price Level Rules API
export const priceLevelRulesApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/price-level-rules`);
    return res.json();
  },
  create: async (data: { name: string; adjustmentType: 'discount' | 'markup'; adjustmentPercentage: number; description?: string }) => {
    const res = await fetch(`${API_BASE}/price-level-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id: number, data: { name: string; adjustmentType: 'discount' | 'markup'; adjustmentPercentage: number; description?: string; isActive?: boolean }) => {
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

export const customersApi = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/customers`);
    return parseResponse(res);
  },
  create: async (data: { name: string; priceLevelId: number; allowSpecialPricing?: boolean }) => {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  update: async (id: number, data: { name: string; priceLevelId: number; allowSpecialPricing?: boolean }) => {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
  getCustomPrices: async (customerId: number) => {
    const res = await fetch(`${API_BASE}/customers/${customerId}/custom-prices`);
    return parseResponse(res);
  },
  setCustomPrice: async (
    customerId: number,
    data: {
      productId: number;
      customPrice: number;
      overrideType?: 'discount' | 'markup' | 'custom';
      discountPercentage?: number;
      markupPercentage?: number;
      status?: string;
      approvedBy?: string;
      approvedAt?: string;
      justification?: string;
      createdBy?: string;
    }
  ) => {
    const res = await fetch(`${API_BASE}/customers/${customerId}/custom-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },
  deleteCustomPrice: async (customerId: number, productId: number) => {
    const res = await fetch(`${API_BASE}/customers/${customerId}/custom-prices/${productId}`, {
      method: 'DELETE',
    });
    return parseResponse(res);
  },
  approveCustomPrice: async (customerId: number, productId: number, data?: { approvedBy?: string }) => {
    const res = await fetch(`${API_BASE}/customers/${customerId}/custom-prices/${productId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    return parseResponse(res);
  },
  rejectCustomPrice: async (
    customerId: number,
    productId: number,
    data?: { approvedBy?: string; justification?: string }
  ) => {
    const res = await fetch(`${API_BASE}/customers/${customerId}/custom-prices/${productId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    return parseResponse(res);
  },
};

// Backup API
export const backupApi = {
  createBackup: async () => {
    const res = await fetch(`${API_BASE}/backup`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to create backup');
    }
    return res.json();
  },

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

  getById: async (id: number) => {
    const res = await fetch(`${API_BASE}/price-lists/${id}`);
    if (!res.ok) {
      throw new Error('Failed to fetch price list');
    }
    return res.json();
  },

  getExpiryMonitor: async (days = 30) => {
    const res = await fetch(`${API_BASE}/price-lists/expiry-monitor?days=${encodeURIComponent(days)}`);
    if (!res.ok) {
      throw new Error('Failed to fetch expiry reminders');
    }
    return res.json();
  },

  create: async (data: {
    name: string;
    priceLevelId: number;
    selectedPriceLevelIds?: number[];
    customerId?: number;
    generationMode?: 'byPriceLevel' | 'byCustomer';
    validFrom: string;
    validUntil?: string;
    products: number[];
  }) => {
    const res = await fetch(`${API_BASE}/price-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to create price list');
    }
    return res.json();
  },

  update: async (
    id: number,
    data: {
      name?: string;
      validFrom?: string;
      validUntil?: string | null;
      status?: 'draft' | 'active' | 'expired' | 'archived';
      selectedPriceLevelIds?: number[];
    }
  ) => {
    const res = await fetch(`${API_BASE}/price-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update price list');
    }
    return res.json();
  },

  updateItems: async (
    id: number,
    data: {
      items: Array<{
        id: number;
        finalPrice: number;
        notes?: string;
      }>;
    }
  ) => {
    const res = await fetch(`${API_BASE}/price-lists/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update price list items');
    }
    return res.json();
  },

  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/price-lists/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('Failed to delete price list');
    }
    return res.json();
  },
};