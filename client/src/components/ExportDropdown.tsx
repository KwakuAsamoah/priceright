import { useCallback, useState } from 'react';
import { Download, FileText, Printer, Table } from 'lucide-react';
import { useOutsideClick } from '../hooks/useOutsideClick';

interface ExportDropdownProps {
  onExportCSV: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
}

export default function ExportDropdown({ onExportCSV, onExportExcel, onPrint }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);
  const containerRef = useOutsideClick(open, handleClose);

  function handleActionClick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((prev) => !prev)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Download size={16} strokeWidth={2} />
        Export
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
            padding: '6px',
            minWidth: '180px',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleActionClick(onExportCSV)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <FileText size={14} strokeWidth={2} />
            Export CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleActionClick(onExportExcel)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <Table size={14} strokeWidth={2} />
            Export Excel
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleActionClick(onPrint)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <Printer size={14} strokeWidth={2} />
            Print
          </button>
        </div>
      )}
    </div>
  );
}
