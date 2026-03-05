import { Fragment } from 'react';

interface Product {
  id: number;
  name: string;
  sku?: string;
  category?: string;
  productionMode?: 'single' | 'batch';
  batchYield?: number;
  overheadPercentage: number;
  profitMargin: number;
  currentSellingPrice?: number;
}

interface BOMMaterial {
  id: number;
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  currencySymbol: string;
}

interface ProductTabsProps {
  product: Product;
  displayBom: BOMMaterial[];
  bomLoading: boolean;
  activeTab: 'bom' | 'history';
  onTabChange: (tab: 'bom' | 'history') => void;
}

function toNumber(value: string | number | undefined) {
  if (value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const TAB_BUTTONS = [
  { id: 'bom', label: 'BOM' },
  { id: 'history', label: 'Price History' },
];

export default function ProductTabs({
  product,
  displayBom,
  bomLoading,
  activeTab,
  onTabChange,
}: ProductTabsProps) {
  return (
    <div>
      {/* Tab Header Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '2px solid #e2e8f0',
          backgroundColor: 'white',
        }}
      >
        {TAB_BUTTONS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as any)}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #1e40af' : '2px solid transparent',
              color: activeTab === tab.id ? '#1e40af' : '#64748b',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '700' : '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-2px',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.color = '#1e293b';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ backgroundColor: 'white' }}>
        {activeTab === 'bom' && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
              Bill of Materials {product.productionMode === 'batch' ? `(per unit from batch of ${product.batchYield || 1})` : ''}
            </div>
            {bomLoading ? (
              <div style={{ padding: '12px', color: '#64748b' }}>Loading BOM...</div>
            ) : displayBom.length === 0 ? (
              <div style={{ padding: '12px', color: '#64748b' }}>No materials in BOM</div>
            ) : (
              <Fragment>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e2e8f0' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Material Name</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Quantity</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Unit</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Unit Price</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayBom.map((item) => {
                      const totalCost = toNumber(item.unitPrice) * item.quantity;
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontSize: '12px' }}>{item.materialName}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>{item.quantity.toFixed(3)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>{item.unit}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>GHS {toNumber(item.unitPrice).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>GHS {totalCost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Cost Breakdown */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Cost Breakdown (per unit)</div>
                  <div style={{ display: 'grid', gap: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Total Material Cost:</span>
                      <span style={{ fontWeight: '600' }}>GHS {(displayBom.reduce((sum, item) => sum + toNumber(item.unitPrice) * item.quantity, 0)).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Overhead ({product.overheadPercentage}%):</span>
                      <span style={{ fontWeight: '600' }}>GHS {((displayBom.reduce((sum, item) => sum + toNumber(item.unitPrice) * item.quantity, 0)) * (product.overheadPercentage / 100)).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Total Production Cost:</span>
                      <span style={{ fontWeight: '700' }}>GHS {((displayBom.reduce((sum, item) => sum + toNumber(item.unitPrice) * item.quantity, 0)) * (1 + product.overheadPercentage / 100)).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Profit Margin ({product.profitMargin}%):</span>
                      <span style={{ fontWeight: '600' }}>GHS {((displayBom.reduce((sum, item) => sum + toNumber(item.unitPrice) * item.quantity, 0)) * (product.profitMargin / 100)).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </Fragment>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Price History</div>
            <div style={{ fontSize: '13px' }}>Coming soon...</div>
          </div>
        )}
      </div>
    </div>
  );
}
