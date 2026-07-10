export type OutputInputMethod = 'exact' | 'percentage';

export function sumRawInputQuantities(quantities: number[]): number {
  return quantities.reduce((sum, quantity) => {
    const numeric = Number(quantity);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
}

function roundTo6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function deriveYieldPercent(completedOutput: number, totalRawInput: number): number {
  if (!Number.isFinite(totalRawInput) || totalRawInput <= 0) {
    return 100;
  }
  if (!Number.isFinite(completedOutput) || completedOutput <= 0) {
    return 0;
  }
  return roundTo6((completedOutput / totalRawInput) * 100);
}

export function deriveCompletedOutput(totalRawInput: number, yieldPercent: number): number {
  if (!Number.isFinite(totalRawInput) || totalRawInput <= 0) {
    return 0;
  }
  const safeYield = Math.max(0.0001, Number.isFinite(yieldPercent) ? yieldPercent : 100);
  return roundTo6(totalRawInput * (safeYield / 100));
}

export function getActualOutputQuantity(completedOutput: number, totalRawInput: number, yieldPercent: number): number {
  const parsedOutput = Number(completedOutput);
  if (Number.isFinite(parsedOutput) && parsedOutput > 0) {
    return parsedOutput;
  }
  return deriveCompletedOutput(totalRawInput, yieldPercent);
}

export interface OutputSavePayload {
  intermediateCostMode: 'yield' | 'completed_output';
  bulkQuantity: number;
  yieldPercentage: number;
}

export function buildOutputSavePayload(
  outputInputMethod: OutputInputMethod,
  totalRawInput: number,
  completedOutput: number,
  yieldPercent: number,
): OutputSavePayload {
  const output = Math.max(0.0001, Number.isFinite(completedOutput) && completedOutput > 0 ? completedOutput : 0);
  const rawInput = Math.max(0.0001, totalRawInput > 0 ? totalRawInput : output);
  const syncedYield = Math.max(0.01, deriveYieldPercent(output, rawInput) || Number(yieldPercent) || 100);

  if (outputInputMethod === 'exact') {
    return {
      intermediateCostMode: 'completed_output',
      bulkQuantity: output,
      yieldPercentage: syncedYield,
    };
  }

  return {
    intermediateCostMode: 'yield',
    bulkQuantity: rawInput,
    yieldPercentage: Math.max(0.01, Number(yieldPercent) || syncedYield),
  };
}

export function inferOutputInputMethod(
  intermediateCostMode?: 'yield' | 'completed_output' | string | null,
): OutputInputMethod {
  return intermediateCostMode === 'yield' ? 'percentage' : 'exact';
}

export function resolveCompletedOutputFromStored(
  intermediateCostMode: string | undefined,
  bulkQuantity: number,
  yieldPercentage: number,
): number {
  if (intermediateCostMode === 'yield') {
    return deriveCompletedOutput(bulkQuantity, yieldPercentage);
  }
  return Math.max(0, Number(bulkQuantity) || 0);
}

export function resolveDisplayYieldPercent(
  intermediateCostMode: string | undefined,
  bulkQuantity: number,
  yieldPercentage: number,
  totalRawInput: number,
): number {
  if (totalRawInput > 0) {
    const completedOutput = resolveCompletedOutputFromStored(intermediateCostMode, bulkQuantity, yieldPercentage);
    if (completedOutput > 0) {
      return deriveYieldPercent(completedOutput, totalRawInput);
    }
  }
  return Math.max(0, Number(yieldPercentage) || 0);
}
