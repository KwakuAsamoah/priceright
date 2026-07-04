/** Primary metric — Markup on Cost: (price - cost) / cost × 100 */
export function calculateActualMarkupPercent(approvedPrice: number, totalCost: number): number | null {
  if (approvedPrice <= 0 || totalCost <= 0) {
    return null;
  }
  return ((approvedPrice - totalCost) / totalCost) * 100;
}

/** Reference only — Gross Margin: (price - cost) / price × 100 (optional hidden column) */
export function calculateActualGrossMarginPercent(approvedPrice: number, totalCost: number): number | null {
  if (approvedPrice <= 0 || totalCost <= 0) {
    return null;
  }
  return ((approvedPrice - totalCost) / approvedPrice) * 100;
}

/** Markup on Cost at optimal price: (optimalPrice - cost) / cost × 100 */
export function calculateOptimalMarkupPercent(optimalPrice: number, totalCost: number): number | null {
  if (optimalPrice <= 0 || totalCost <= 0) {
    return null;
  }
  return ((optimalPrice - totalCost) / totalCost) * 100;
}

export function getThresholdMarkupColor(markup: number, threshold: number): string {
  if (markup >= threshold) return '#16a34a';
  if (markup >= threshold / 2) return '#d97706';
  return '#dc2626';
}

/** @deprecated Alias for backward compatibility — use getThresholdMarkupColor */
export const getThresholdMarginColor = getThresholdMarkupColor;

export type MarkupHealthBand = 'healthy' | 'low' | 'critical' | 'not-priced';

export function getMarkupHealthBand(
  markupPercent: number | null | undefined,
  threshold: number,
): MarkupHealthBand {
  if (markupPercent == null || Number.isNaN(markupPercent)) {
    return 'not-priced';
  }
  if (markupPercent >= threshold) {
    return 'healthy';
  }
  if (markupPercent >= threshold / 2) {
    return 'low';
  }
  if (markupPercent >= 0) {
    return 'critical';
  }
  return 'critical';
}
