import type { ColumnConfig } from './columnConfig';

/** Matches the Intermediate Materials table column order in IntermediateMaterials.tsx. */
export const INTERMEDIATE_MATERIALS_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: '', locked: true, defaultVisible: true },
  { id: 'rowNumber', label: '#', locked: true, defaultVisible: true },
  { id: 'material', label: 'Material', locked: true, defaultVisible: true },
  { id: 'unit', label: 'Unit', locked: false, defaultVisible: true },
  { id: 'yield', label: 'Yield %', locked: false, defaultVisible: true },
  { id: 'overhead', label: 'Overhead', locked: false, defaultVisible: true },
  { id: 'unitCost', label: 'Unit Cost', locked: false, defaultVisible: true },
  { id: 'status', label: 'Status', locked: true, defaultVisible: true },
  { id: 'actions', label: 'Actions', locked: true, defaultVisible: true },
];

export type IntermediateColumnKey =
  | 'material'
  | 'unit'
  | 'yield'
  | 'overhead'
  | 'unitCost'
  | 'status'
  | 'actions';

export const INTERMEDIATE_TOGGLEABLE_KEYS: IntermediateColumnKey[] = [
  'unit',
  'yield',
  'overhead',
  'unitCost',
];

export const INTERMEDIATE_LOCKED_KEYS = new Set<IntermediateColumnKey>([
  'material',
  'status',
  'actions',
]);
