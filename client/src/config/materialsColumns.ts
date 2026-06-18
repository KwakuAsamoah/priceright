import type { ColumnConfig } from './columnConfig';

/** Matches the Primary Materials table column order in Materials.tsx. */
export const MATERIALS_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: '', locked: true, defaultVisible: true },
  { id: 'rowNumber', label: '#', locked: true, defaultVisible: true },
  { id: 'material', label: 'Material', locked: true, defaultVisible: true },
  { id: 'category', label: 'Category', locked: false, defaultVisible: true },
  { id: 'unit', label: 'Unit', locked: false, defaultVisible: true },
  { id: 'unitCost', label: 'Unit Cost', locked: false, defaultVisible: true },
  { id: 'bulkPricing', label: 'Bulk', locked: false, defaultVisible: true },
  { id: 'status', label: 'Status', locked: true, defaultVisible: true },
  { id: 'actions', label: 'Actions', locked: true, defaultVisible: true },
];

export type MaterialColumnKey =
  | 'material'
  | 'category'
  | 'unit'
  | 'unitCost'
  | 'bulkPricing'
  | 'status'
  | 'actions';

export const MATERIAL_TOGGLEABLE_KEYS: MaterialColumnKey[] = [
  'category',
  'unit',
  'unitCost',
  'bulkPricing',
];

export const MATERIAL_LOCKED_KEYS = new Set<MaterialColumnKey>([
  'material',
  'status',
  'actions',
]);
