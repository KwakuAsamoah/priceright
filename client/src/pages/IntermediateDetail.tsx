import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { materialsApi, type IntermediateBomItemRecord, type MaterialRecord } from '../api';
import AppBadge from '../components/AppBadge';

interface IntermediateDetailLocationState {
  from?: string;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function IntermediateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as IntermediateDetailLocationState | null)?.from || '/materials';
  const materialId = Number(id);

  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [bomItems, setBomItems] = useState<IntermediateBomItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!Number.isFinite(materialId) || materialId <= 0) {
        if (!active) return;
        setError('Intermediate material not found');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [materialsData, bomData] = await Promise.all([
          materialsApi.getAll('all', 'intermediate'),
          materialsApi.getIntermediateBom(materialId),
        ]);

        if (!active) return;

        const resolvedMaterials = Array.isArray(materialsData) ? materialsData : [];
        const foundMaterial = resolvedMaterials.find((item) => Number(item.id) === materialId) || null;

        if (!foundMaterial) {
          setMaterial(null);
          setBomItems([]);
          setError('Intermediate material not found');
        } else {
          setMaterial(foundMaterial);
          setBomItems(Array.isArray(bomData) ? bomData : []);
          setError(null);
        }
      } catch {
        if (!active) return;
        setMaterial(null);
        setBomItems([]);
        setError('Failed to load intermediate material');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [materialId]);

  const liveCost = useMemo(() => {
    if (!material) return null;

    const totalMaterialCost = bomItems.reduce((sum, item) => {
      return sum + toNumber(item.quantity) * toNumber(item.unitPrice);
    }, 0);

    const overheadPercentage = toNumber(material.overheadPercentage) / 100;
    const overheadCost = totalMaterialCost * overheadPercentage;
    const batchTotalCost = totalMaterialCost + overheadCost;

    const batchQuantity = Math.max(0.0001, toNumber(material.bulkQuantity) || 1);
    const yieldPercent = Math.max(0.0001, toNumber(material.yieldPercentage) || 100);
    const effectiveOutputQuantity = material.intermediateCostMode === 'completed_output'
      ? batchQuantity
      : batchQuantity * (yieldPercent / 100);
    const costPerUnit = batchTotalCost / effectiveOutputQuantity;
    const marginPercentage = toNumber(material.marginPercentage) / 100;
    const profitAmount = costPerUnit * marginPercentage;
    const optimalPrice = costPerUnit + profitAmount;

    return {
      batchMaterialCost: totalMaterialCost,
      batchOverheadCost: overheadCost,
      batchTotalCost,
      effectiveOutputQuantity,
      costPerUnit,
      profitAmount,
      optimalPrice,
    };
  }, [material, bomItems]);

  const currencySymbol = material?.baseCurrencySymbol || material?.purchaseCurrencySymbol || 'GHS';

  const formatMoney = (value: number) => `${currencySymbol}${currencySymbol ? ' ' : ''}${value.toFixed(2)}`;

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-content" style={{ padding: '24px' }}>
          <div style={{ padding: '24px', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ fontSize: '16px', color: '#1e293b' }}>Loading intermediate material...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="app-page">
        <div className="app-page-content" style={{ padding: '24px' }}>
          <div style={{ padding: '24px', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Intermediate material not found</div>
            <div style={{ marginBottom: '24px', color: '#475569' }}>The requested intermediate material could not be loaded.</div>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => navigate(backTo)}>
              ← Back to Intermediate Materials
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-content" style={{ gap: '16px', paddingTop: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate(backTo)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <ArrowLeft size={14} /> Intermediate Materials
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</h1>
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>{material.sku || 'No SKU'}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => navigate('/materials', { state: { editMaterialId: material.id } })}>
            Edit
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '20px' }}>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'grid', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>SKU</div>
                    <div style={{ fontWeight: 600 }}>{material.sku || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Category</div>
                    <div style={{ fontWeight: 600 }}>{material.category || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Unit</div>
                    <div style={{ fontWeight: 600 }}>{material.unit || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Supplier</div>
                    <div style={{ fontWeight: 600 }}>{material.supplier || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Costing Method</div>
                    <div style={{ fontWeight: 600 }}>{material.intermediateCostMode === 'completed_output' ? 'Completed Output' : 'Yield-Based'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Status</div>
                    <AppBadge variant={material.isActive ? 'active' : 'inactive'} size="sm">
                      {material.isActive ? 'Active' : 'Inactive'}
                    </AppBadge>
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Description</div>
                  <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap', color: material.description ? '#0f172a' : '#64748b' }}>
                    {material.description || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Bill of Materials</h2>
                  <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Components used to produce this intermediate material</div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Material Name</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Quantity</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Unit</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '16px', color: '#64748b' }}>No BOM components found.</td>
                      </tr>
                    ) : bomItems.map((item) => {
                      const unitPrice = toNumber(item.unitPrice);
                      const quantity = toNumber(item.quantity);
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px', fontSize: '16px' }}>{item.componentMaterialName || '—'}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '16px' }}>{quantity.toFixed(3)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '16px' }}>{item.unit || '—'}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '16px' }}>{formatMoney(unitPrice)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, fontSize: '16px' }}>{formatMoney(quantity * unitPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {bomItems.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={4} style={{ padding: '10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>Total Material Cost (batch):</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>{formatMoney(liveCost?.batchMaterialCost ?? 0)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>Cost breakdown</h2>
              <div style={{ display: 'grid', gap: '10px', fontSize: '15px', color: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Material Cost (batch):</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(liveCost?.batchMaterialCost ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Overhead ({toNumber(material.overheadPercentage).toFixed(0)}%):</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(liveCost?.batchOverheadCost ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Total Production Cost (batch):</span>
                  <span>{formatMoney(liveCost?.batchTotalCost ?? 0)}</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{material.intermediateCostMode === 'completed_output' ? 'Completed Output Qty:' : 'Effective Output Qty:'}</span>
                  <span style={{ fontWeight: 600 }}>{liveCost?.effectiveOutputQuantity.toFixed(3)} {material.unit || '-'}</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cost Per Unit:</span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(liveCost?.costPerUnit ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Profit on cost ({toNumber(material.marginPercentage).toFixed(0)}%):</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(liveCost?.profitAmount ?? 0)}</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>
                  <span>Optimal Price Per Unit:</span>
                  <span>{formatMoney(liveCost?.optimalPrice ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '14px', padding: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>Production settings</h2>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#475569', marginBottom: '6px' }}>Costing Method</div>
                  <AppBadge variant="info" size="sm">{material.intermediateCostMode === 'completed_output' ? 'Completed Output' : 'Yield-Based'}</AppBadge>
                </div>
                <div style={{ fontSize: '14px', color: '#475569' }}>
                  {material.intermediateCostMode === 'completed_output'
                    ? 'Unit cost is calculated from total batch cost divided by completed output quantity.'
                    : 'Unit cost is calculated from batch quantity adjusted by yield percentage.'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Batch/Output Quantity</div>
                    <div style={{ fontWeight: 600 }}>{toNumber(material.bulkQuantity).toFixed(3)} {material.unit || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Yield %</div>
                    <div style={{ fontWeight: 600 }}>{material.intermediateCostMode === 'yield' ? `${toNumber(material.yieldPercentage).toFixed(1)}%` : '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Overhead %</div>
                    <div style={{ fontWeight: 600 }}>{toNumber(material.overheadPercentage).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Profit on cost %</div>
                    <div style={{ fontWeight: 600 }}>{toNumber(material.marginPercentage).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>Price history</h2>
              <div style={{ color: '#64748b', fontSize: '14px' }}>Price history will be shown here.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
