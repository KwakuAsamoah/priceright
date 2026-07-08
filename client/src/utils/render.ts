/**
 * Safely renders any value as a string for use in React JSX.
 * Prevents React error #31 "Objects are not valid as a React child"
 */
export function safeRender(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(safeRender).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Type guard — checks if a usage item is the new object format
 */
export function isUsageObject(item: unknown): item is {
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
} {
  return typeof item === 'object' && item !== null && 'productId' in item;
}

export function formatUsageQuantity(quantity: number | null | undefined, unit: string): string {
  if (quantity == null || quantity === 0) {
    return '—';
  }
  const qtyLabel = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(3);
  return unit ? `${qtyLabel} ${unit}` : qtyLabel;
}

export function getUsageProductLabel(item: unknown): string {
  if (typeof item === 'string') return item;
  if (isUsageObject(item)) return item.productName;
  return safeRender(item);
}

export function getUsageProductKey(item: unknown, index: number, materialId?: number): string {
  if (isUsageObject(item)) return String(item.productId);
  if (typeof item === 'string') return `${materialId ?? 'usage'}-${item}-${index}`;
  return `${materialId ?? 'usage'}-unknown-${index}`;
}
