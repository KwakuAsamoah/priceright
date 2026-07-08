/**
 * Formats numeric values for CSV, Excel, PDF, and print exports.
 * Null/undefined/NaN export as empty string; zero exports as "0.00".
 */
export function formatExportNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) {
    return '';
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '';
  }
  return numeric.toFixed(decimals);
}
