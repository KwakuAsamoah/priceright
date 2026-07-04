export function calculateActualGrossMarginPercent(approvedPrice: number, totalCost: number): number | null {
  if (approvedPrice <= 0 || totalCost <= 0) {
    return null;
  }
  return ((approvedPrice - totalCost) / approvedPrice) * 100;
}

export function getThresholdMarginColor(margin: number, threshold: number): string {
  if (margin >= threshold) return '#16a34a';
  if (margin >= threshold / 2) return '#d97706';
  return '#dc2626';
}
