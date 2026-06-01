import { useOnboarding } from '../context/OnboardingContext';

const STEPS = [
  {
    key: 'materials',
    number: 1,
    title: 'Add your materials',
    instruction:
      'Add your raw materials with their unit costs and suppliers. Everything else builds from here.',
    nextLabel: 'Done — go to Products →',
  },
  {
    key: 'products',
    number: 2,
    title: 'Build your products',
    instruction:
      'Create a product and add its ingredients. PriceRight calculates the production cost automatically.',
    nextLabel: 'Done — approve prices →',
  },
  {
    key: 'prices',
    number: 3,
    title: 'Approve your prices',
    instruction:
      'Click on any product to see its calculated cost and approve a selling price.',
    nextLabel: 'Done — set up price levels →',
  },
  {
    key: 'price-levels',
    number: 4,
    title: 'Set up a price level',
    instruction:
      'Create a price level to organise and distribute your approved prices to your sales team.',
    nextLabel: 'Finish setup ✓',
  },
];

export function OnboardingBar() {
  const { isActive, currentStep, nextStep, skipOnboarding } = useOnboarding();

  if (!isActive) {
    return null;
  }

  const step = STEPS.find((s) => s.key === currentStep);
  if (!step) {
    return null;
  }

  const progressPercent = (step.number / STEPS.length) * 100;

  return (
    <div
      style={{
        background: '#0F2847',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: 0,
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)' }}>
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: '#059669',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '10px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#059669',
              color: 'white',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {step.number}
          </div>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
            Step {step.number} of {STEPS.length}
          </span>
        </div>

        <div
          style={{
            width: '1px',
            height: '20px',
            background: 'rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginRight: '8px' }}>
            {step.title}
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
            {step.instruction}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={nextStep}
            style={{
              padding: '6px 14px',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {step.nextLabel}
          </button>
          <button
            type="button"
            onClick={() => { void skipOnboarding(); }}
            style={{
              padding: '6px 10px',
              background: 'none',
              color: 'rgba(255,255,255,0.35)',
              border: 'none',
              borderRadius: '7px',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Skip guide
          </button>
        </div>
      </div>
    </div>
  );
}
