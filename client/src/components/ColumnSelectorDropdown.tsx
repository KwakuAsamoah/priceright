import { useEffect, useRef, useState } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import type { ColumnConfig } from '../config/columnConfig';

interface ColumnSelectorDropdownProps {
  columns: ColumnConfig[];
  isVisible: (id: string) => boolean;
  toggleColumn: (id: string) => void;
  resetToDefaults: () => void;
}

export function ColumnSelectorDropdown({
  columns,
  isVisible,
  toggleColumn,
  resetToDefaults,
}: ColumnSelectorDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleable = columns.filter((column) => !column.locked && column.label.length > 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((previous) => !previous)}
        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Columns3 size={14} />
        Columns
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: 'white',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '8px',
            width: '240px',
            zIndex: 50,
            maxHeight: '360px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              padding: '4px 8px',
              letterSpacing: '0.04em',
            }}
          >
            Show columns
          </div>

          {toggleable.map((column) => (
            <label
              key={column.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                fontSize: '13px',
                color: '#0F2847',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
            >
              <input
                type="checkbox"
                checked={isVisible(column.id)}
                onChange={() => toggleColumn(column.id)}
                style={{ cursor: 'pointer' }}
              />
              {column.label}
            </label>
          ))}

          <div
            style={{
              borderTop: '1px solid #F1F5F9',
              marginTop: '6px',
              paddingTop: '6px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                resetToDefaults();
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                color: '#64748b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
            >
              <RotateCcw size={12} />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
