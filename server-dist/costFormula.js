export function calculateProductionCost(params) {
    const material = Number(params.materialCost) || 0;
    const labor = Number(params.laborCost) || 0;
    const overheadPercentage = Number(params.overheadPercentage) || 0;
    const subtotal = material + labor;
    const overheadAmount = subtotal * (overheadPercentage / 100);
    const totalCost = subtotal + overheadAmount;
    return { subtotal, overheadAmount, totalCost };
}
export function calculateIntermediateCostPerUnit(params) {
    const { subtotal, overheadAmount, totalCost } = calculateProductionCost({
        materialCost: params.materialCost,
        laborCost: params.laborCost,
        overheadPercentage: params.overheadPercentage,
    });
    const outputQuantity = Number(params.outputQuantity) || 0;
    const costPerUnit = outputQuantity > 0 ? totalCost / outputQuantity : 0;
    return {
        subtotal,
        overheadAmount,
        totalBatchCost: totalCost,
        costPerUnit,
    };
}
