import { InfoTooltip } from './InfoTooltip';

export function MarkupInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Markup %"
      explanation="How much profit you make compared to what it costs to produce. A 30% markup means for every GHS 10 it costs you to make a product, you earn GHS 3 profit."
      formula="(Selling price − Cost) ÷ Cost"
      example="Cost: GHS 10 · Price: GHS 13 → Markup: 30%"
      position={position}
    />
  );
}

export function GrossMarginInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Gross Margin %"
      explanation="How much of every sale is profit. A 23% margin means for every GHS 13 you sell a product for, GHS 3 is profit."
      formula="(Selling price − Cost) ÷ Selling price"
      example="Cost: GHS 10 · Price: GHS 13 → Gross Margin: 23%"
      position={position}
    />
  );
}
