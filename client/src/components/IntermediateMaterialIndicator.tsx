import { Layers } from 'lucide-react';

const SUB_RECIPE_TOOLTIP = 'This is a sub-recipe made from other materials';

interface IntermediateMaterialIndicatorProps {
  /** When set, the icon is shown inline next to material names in lists/tables. */
  inline?: boolean;
}

export function isIntermediateMaterial(materialType?: string | null): boolean {
  return materialType === 'intermediate';
}

export default function IntermediateMaterialIndicator({ inline = false }: IntermediateMaterialIndicatorProps) {
  return (
    <span
      title={SUB_RECIPE_TOOLTIP}
      aria-label={SUB_RECIPE_TOOLTIP}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: inline ? '6px' : 0,
        verticalAlign: 'middle',
        lineHeight: 0,
      }}
    >
      <Layers size={12} color="#64748B" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

export { SUB_RECIPE_TOOLTIP };
