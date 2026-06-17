import { useCallback, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useOutsideClick } from '../hooks/useOutsideClick';

interface TableSettingsColumn {
  key: string;
  label: string;
  visible: boolean;
}

interface TableSettingsDropdownProps {
  columns?: TableSettingsColumn[];
  onToggleColumn?: (key: string) => void;
  onResetColumns?: () => void;
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
  onApproveAllEligible?: () => void;
  approveAllEligibleLabel?: string;
  disableApproveAllEligible?: boolean;
}

export default function TableSettingsDropdown({
  columns = [],
  onToggleColumn,
  onResetColumns,
  density,
  onToggleDensity,
  onApproveAllEligible,
  approveAllEligibleLabel = 'Approve all eligible',
  disableApproveAllEligible = false,
}: TableSettingsDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);
  const containerRef = useOutsideClick(open, handleClose);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((prev) => !prev)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 10px' }}
        aria-label="Table settings"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Settings2 size={16} strokeWidth={2} />
        Columns
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '6px',
            zIndex: 60,
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px',
            minWidth: '240px',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', padding: '2px 4px 6px' }}>Table settings</div>
          {columns.length > 0 && (
            <>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', padding: '2px 4px 6px' }}>Columns</div>
              <div style={{ display: 'grid', gap: '2px' }}>
                {columns.map((column) => (
                  <label key={column.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '14px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={column.visible}
                      onChange={() => onToggleColumn?.(column.key)}
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={onResetColumns}
                style={{
                  marginTop: '6px',
                  border: 'none',
                  background: 'none',
                  color: '#0F2847',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                Reset to default
              </button>
            </>
          )}

          <div style={{ marginTop: columns.length > 0 ? '8px' : 0, borderTop: columns.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: columns.length > 0 ? '8px' : 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', padding: '0 4px 6px' }}>View</div>
            <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => {
                  if (density !== 'comfortable') onToggleDensity();
                }}
                style={{
                  border: 'none',
                  padding: '6px 10px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: density === 'comfortable' ? '#111827' : '#fff',
                  color: density === 'comfortable' ? '#fff' : '#334155',
                }}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => {
                  if (density !== 'compact') onToggleDensity();
                }}
                style={{
                  border: 'none',
                  padding: '6px 10px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: density === 'compact' ? '#111827' : '#fff',
                  color: density === 'compact' ? '#fff' : '#334155',
                }}
              >
                Compact
              </button>
            </div>
          </div>

          {onApproveAllEligible && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onApproveAllEligible();
              }}
              disabled={disableApproveAllEligible}
              style={{
                marginTop: '10px',
                width: '100%',
                border: '1px solid #cbd5e1',
                background: disableApproveAllEligible ? '#f1f5f9' : '#ffffff',
                color: disableApproveAllEligible ? '#94a3b8' : '#0f172a',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: disableApproveAllEligible ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
            >
              {approveAllEligibleLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
