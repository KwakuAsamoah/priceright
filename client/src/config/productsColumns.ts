export interface ColumnConfig {
  id: string;
  label: string;
  locked: boolean;
  defaultVisible: boolean;
}

/** Matches the Products table column order in Products.tsx (as of v1.0.27). */
export const PRODUCTS_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: '', locked: true, defaultVisible: true },
  { id: 'product', label: 'Product', locked: true, defaultVisible: true },
  { id: 'productionCost', label: 'Production Cost', locked: false, defaultVisible: true },
  { id: 'optimalPrice', label: 'Optimal Price', locked: false, defaultVisible: true },
  { id: 'validUntil', label: 'Valid Until', locked: false, defaultVisible: false },
  { id: 'approvedBasePrice', label: 'Approved Base Price', locked: false, defaultVisible: false },
  { id: 'optimalMarkup', label: 'Optimal Markup %', locked: false, defaultVisible: false },
  { id: 'optimalGrossMargin', label: 'Optimal Gross Margin %', locked: false, defaultVisible: false },
  { id: 'actualMarkup', label: 'Actual Markup %', locked: false, defaultVisible: false },
  { id: 'actualGrossMargin', label: 'Actual Gross Margin %', locked: false, defaultVisible: false },
  { id: 'status', label: 'Status', locked: true, defaultVisible: true },
  { id: 'actions', label: 'Actions', locked: true, defaultVisible: true },
];

export type ProductColumnKey =
  | 'name'
  | 'materialCost'
  | 'optimalPrice'
  | 'priceExpires'
  | 'sellingPrice'
  | 'profitOnCost'
  | 'profitOnSales'
  | 'actualProfitOnCost'
  | 'actualProfitOnSales'
  | 'status'
  | 'actions';

export const PRODUCT_COLUMN_KEY_TO_ID: Record<ProductColumnKey, string> = {
  name: 'product',
  materialCost: 'productionCost',
  optimalPrice: 'optimalPrice',
  priceExpires: 'validUntil',
  sellingPrice: 'approvedBasePrice',
  profitOnCost: 'optimalMarkup',
  profitOnSales: 'optimalGrossMargin',
  actualProfitOnCost: 'actualMarkup',
  actualProfitOnSales: 'actualGrossMargin',
  status: 'status',
  actions: 'actions',
};

export function getDefaultVisibleColumnKeys(): ProductColumnKey[] {
  return (Object.entries(PRODUCT_COLUMN_KEY_TO_ID) as Array<[ProductColumnKey, string]>)
    .filter(([, id]) => {
      const config = PRODUCTS_COLUMNS.find((column) => column.id === id);
      return config?.defaultVisible ?? false;
    })
    .map(([key]) => key);
}
