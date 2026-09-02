import { materialsApi, productsApi, reportsApi } from '../../../api';
import type { MaterialCostsReportResultMap } from '../types';
import { toNumber } from './reportUtils';

type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit?: string;
  unitPrice: number | string;
  isActive: boolean;
};

type ProductWithBomRow = {
  id: number;
  name: string;
  isActive?: boolean;
  bom: Array<{ materialId?: number; quantity?: number | string }>;
};

async function loadActiveProductsWithBom(): Promise<ProductWithBomRow[]> {
  const allProducts = (await productsApi.getAll('all')) as ProductWithBomRow[];
  const activeProducts = allProducts.filter((product) => product.isActive !== false);

  return Promise.all(
    activeProducts.map(async (product) => {
      try {
        const bom = await productsApi.getBOM(product.id);
        return {
          ...product,
          bom: Array.isArray(bom) ? bom : [],
        };
      } catch {
        return { ...product, bom: [] };
      }
    }),
  );
}

function buildMaterialProductUsageMap(products: ProductWithBomRow[]): Map<number, number> {
  const usage = new Map<number, Set<number>>();

  for (const product of products) {
    const seenInProduct = new Set<number>();
    for (const entry of product.bom) {
      if (!entry.materialId || seenInProduct.has(entry.materialId)) continue;
      seenInProduct.add(entry.materialId);
      const existing = usage.get(entry.materialId) || new Set<number>();
      existing.add(product.id);
      usage.set(entry.materialId, existing);
    }
  }

  return new Map(Array.from(usage.entries()).map(([materialId, productIds]) => [materialId, productIds.size]));
}

export type MaterialsCostAnalysisGenerationResult = {
  data: MaterialCostsReportResultMap['materials-cost-analysis'];
  categories: string[];
};

export async function generateMaterialsCostAnalysisReport(
  categoryFilter: string,
): Promise<MaterialsCostAnalysisGenerationResult> {
  const [materials, productsWithBom] = await Promise.all([
    materialsApi.getAll('active') as Promise<MaterialRow[]>,
    loadActiveProductsWithBom(),
  ]);

  const usageMap = buildMaterialProductUsageMap(productsWithBom);
  const categories = Array.from(
    new Set(materials.map((material) => (material.category || 'Uncategorised').trim() || 'Uncategorised')),
  ).sort((a, b) => a.localeCompare(b));

  const rows = materials
    .map((material) => ({
      materialName: material.name,
      category: material.category || 'Uncategorised',
      unit: material.unit || '—',
      unitCost: toNumber(material.unitPrice),
      productsUsedCount: usageMap.get(material.id) || 0,
    }))
    .filter((row) => (categoryFilter === 'All' ? true : row.category === categoryFilter))
    .sort((a, b) => b.unitCost - a.unitCost);

  const mostExpensive = materials.reduce<MaterialRow | null>((best, material) => {
    if (!best) return material;
    return toNumber(material.unitPrice) > toNumber(best.unitPrice) ? material : best;
  }, null);

  return {
    categories,
    data: {
      rows,
      totalActiveMaterials: materials.length,
      mostExpensiveName: mostExpensive?.name || '—',
      mostExpensiveCost: mostExpensive ? toNumber(mostExpensive.unitPrice) : 0,
    },
  };
}

export async function generateTopCostDriversReport(): Promise<MaterialCostsReportResultMap['top-cost-drivers']> {
  const data = await reportsApi.getTopCostDrivers();
  return {
    rows: data.rows,
    totalMaterialsInBoms: data.totalMaterialsInBoms,
    totalWeightedCost: data.totalWeightedCost,
    mostImpactfulMaterial: data.mostImpactfulMaterial,
  };
}
