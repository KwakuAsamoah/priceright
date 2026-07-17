import type { ColumnConfig } from './columnConfig';

export type { ColumnConfig };

/** Matches the Products table column order in Products.tsx (as of v1.0.27). */
export const PRODUCTS_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: '', locked: true, defaultVisible: true },
  { id: 'rowNumber', label: '#', locked: true, defaultVisible: true },
  { id: 'product', label: 'Product', locked: true, defaultVisible: true },
  { id: 'productionCost', label: 'Production Cost', locked: false, defaultVisible: true },
  { id: 'optimalPrice', label: 'Optimal Price', locked: false, defaultVisible: true },
  { id: 'validUntil', label: 'Valid Until', locked: false, defaultVisible: false },
  { id: 'approvedBasePrice', label: 'Approved Base Price', locked: false, defaultVisible: true },
  {
    id: 'optimalMarkup',
    label: 'Optimal Markup %',
    locked: false,
    defaultVisible: true,
    description: 'The target markup based on your default markup setting. Calculated as (Optimal Price − Production Cost) ÷ Production Cost × 100',
  },
  {
    id: 'optimalGrossMargin',
    label: 'Optimal Gross Margin % (reference)',
    locked: false,
    defaultVisible: false,
    description: 'For reference only. Gross Margin = (Optimal Price − Production Cost) ÷ Optimal Price × 100',
  },
  {
    id: 'actualMarkup',
    label: 'Actual Markup %',
    locked: false,
    defaultVisible: true,
    description: 'Your actual profit as a percentage of production cost. Calculated as (Approved Price − Production Cost) ÷ Production Cost × 100',
  },
  {
    id: 'actualGrossMargin',
    label: 'Actual Gross Margin % (reference)',
    locked: false,
    defaultVisible: false,
    description: 'For reference only. PriceRight uses Markup on Cost for all health calculations. Gross Margin = (Approved Price − Production Cost) ÷ Approved Price × 100',
  },
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

export function getProductsColumnConfig(id: string): ColumnConfig | undefined {
  return PRODUCTS_COLUMNS.find((column) => column.id === id);
}

export function getDefaultVisibleColumnKeys(): ProductColumnKey[] {
  return (Object.entries(PRODUCT_COLUMN_KEY_TO_ID) as Array<[ProductColumnKey, string]>)
    .filter(([, id]) => {
      const config = PRODUCTS_COLUMNS.find((column) => column.id === id);
      return config?.defaultVisible ?? false;
    })
    .map(([key]) => key);
}
