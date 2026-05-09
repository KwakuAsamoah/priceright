export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ExchangeRate {
  id: number;
  currencyId: number;
  rateToBase: number;
  effectiveDate: Date;
  source: string;
  createdAt: Date;
}

export interface Setting {
  id: number;
  settingKey: string;
  settingValue: string;
  updatedAt: Date;
}

export interface Material {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category: string;
  unit: string;
  bulkQuantity: number;
  bulkPrice: number;
  purchaseCurrencyId: number;
  currencyCode?: string;
  currencySymbol?: string;
  priceInPurchaseCurrency: number;
  priceInBaseCurrency: number;
  unitPrice: number;
  supplier: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillOfMaterial {
  id: number;
  productId: number;
  materialId: number;
  quantity: number;
  createdAt: Date;
}

export interface ProductWithDetails extends Product {
  materials?: Array<{
    id: number;
    materialId: number;
    materialName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalCost: number;
    currencySymbol: string;
  }>;
  totalMaterialCost?: number;
  overheadCost?: number;
  totalCost?: number;
  profitAmount?: number;
  recommendedPrice?: number;
}