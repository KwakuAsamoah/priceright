import { InfoTooltip } from './InfoTooltip';

export function MarkupInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Markup %"
      explanation="How much profit you make compared to what it costs to produce. A 30% markup means for every 10.00 it costs you to make a product, you earn 3.00 profit."
      formula="(Selling price − Cost) ÷ Cost"
      example="Cost: 10.00 · Price: 13.00 → Markup: 30%"
      position={position}
    />
  );
}

export function OptimalMarkupInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Optimal Markup %"
      explanation="The target markup used to calculate the Optimal Price. This is based on the Markup % set on the product, not necessarily the markup of the actual approved price."
      formula="(Optimal Price − Cost) ÷ Cost"
      example="Cost: 10.00 · Optimal: 12.00 → Optimal Markup: 20%"
      position={position}
    />
  );
}

export function OptimalGrossMarginInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Optimal Gross Margin %"
      explanation="The gross margin at the Optimal Price — the target price calculated from cost and markup. May differ from the actual margin if a custom price was approved."
      formula="(Optimal Price − Cost) ÷ Optimal Price"
      example="Cost: 10.00 · Optimal: 12.00 → Optimal Gross Margin: 16.7%"
      position={position}
    />
  );
}

export function ActualMarkupInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Actual Markup %"
      explanation="The real markup based on the approved price, not the target. This may differ from Optimal Markup % if a custom price was approved instead of the optimal price."
      formula="(Approved Price − Cost) ÷ Cost"
      example="Cost: 10.00 · Approved: 11.00 → Actual Markup: 10%"
      position={position}
    />
  );
}

export function ActualGrossMarginInfoTooltip({ position = 'top' }: { position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <InfoTooltip
      title="Actual Gross Margin %"
      explanation="The real gross margin based on the approved price. This is the figure that reflects your true profitability."
      formula="(Approved Price − Cost) ÷ Approved Price"
      example="Cost: 10.00 · Approved: 11.00 → Actual Gross Margin: 9.1%"
      position={position}
    />
  );
}
