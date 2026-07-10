import {
  deriveCompletedOutput,
  deriveYieldPercent,
  type OutputInputMethod,
} from '../utils/intermediateOutput';

const OUTPUT_TAB_ACTIVE_STYLE = {
  borderRadius: '999px',
  padding: '6px 12px',
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  backgroundColor: '#16A34A',
  color: '#ffffff',
  border: '1.5px solid #16A34A',
  fontWeight: 600,
};

const OUTPUT_TAB_INACTIVE_STYLE = {
  borderRadius: '999px',
  padding: '6px 12px',
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: '1.5px solid #E2E8F0',
  fontWeight: 400,
};

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '15px',
  fontWeight: '600',
} as const;

const fieldInputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxSizing: 'border-box' as const,
} as const;

interface IntermediateOutputSectionProps {
  unit: string;
  totalRawInput: number;
  outputInputMethod: OutputInputMethod;
  onOutputInputMethodChange: (method: OutputInputMethod) => void;
  completedOutput: string;
  yieldPercentage: string;
  onSyncValues: (completedOutput: string, yieldPercentage: string, intermediateCostMode: 'yield' | 'completed_output') => void;
  errorMessage?: string;
}

export default function IntermediateOutputSection({
  unit,
  totalRawInput,
  outputInputMethod,
  onOutputInputMethodChange,
  completedOutput,
  yieldPercentage,
  onSyncValues,
  errorMessage,
}: IntermediateOutputSectionProps) {
  const unitLabel = unit.trim() || 'unit';

  function handleExactChange(rawValue: string) {
    const numericOutput = Number(rawValue);
    const syncedYield = deriveYieldPercent(
      Number.isFinite(numericOutput) ? numericOutput : 0,
      totalRawInput,
    );
    onSyncValues(
      rawValue,
      Number.isFinite(syncedYield) && syncedYield > 0 ? String(syncedYield) : yieldPercentage,
      'completed_output',
    );
  }

  function handlePercentageChange(rawValue: string) {
    const numericYield = Number(rawValue);
    const syncedOutput = deriveCompletedOutput(
      totalRawInput,
      Number.isFinite(numericYield) ? numericYield : 0,
    );
    onSyncValues(
      syncedOutput > 0 ? String(syncedOutput) : completedOutput,
      rawValue,
      'yield',
    );
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', margin: '0 0 12px' }}>
        How much finished product did this batch make?
      </h3>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }} role="tablist" aria-label="Output input method">
        <button
          type="button"
          role="tab"
          aria-selected={outputInputMethod === 'exact'}
          style={outputInputMethod === 'exact' ? OUTPUT_TAB_ACTIVE_STYLE : OUTPUT_TAB_INACTIVE_STYLE}
          onClick={() => onOutputInputMethodChange('exact')}
        >
          Exact amount
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={outputInputMethod === 'percentage'}
          style={outputInputMethod === 'percentage' ? OUTPUT_TAB_ACTIVE_STYLE : OUTPUT_TAB_INACTIVE_STYLE}
          onClick={() => onOutputInputMethodChange('percentage')}
        >
          Percentage of input
        </button>
      </div>

      {outputInputMethod === 'exact' ? (
        <div>
          <label style={fieldLabelStyle}>Finished amount ({unitLabel}) *</label>
          <input
            className="app-input"
            type="number"
            step="0.001"
            min="0.001"
            value={completedOutput}
            onChange={(e) => handleExactChange(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
      ) : (
        <div>
          <label style={fieldLabelStyle}>Yield (% of raw input) *</label>
          <input
            className="app-input"
            type="number"
            step="0.1"
            min="0.1"
            max="100"
            value={yieldPercentage}
            onChange={(e) => handlePercentageChange(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
        Total raw input: {totalRawInput.toFixed(3)} {unitLabel}
      </div>
      {totalRawInput > 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
          Equivalent: {Number(completedOutput || 0).toFixed(3)} {unitLabel} at {Number(yieldPercentage || 0).toFixed(1)}% yield
        </div>
      ) : null}
      {errorMessage ? (
        <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '6px' }}>{errorMessage}</div>
      ) : null}
    </div>
  );
}
