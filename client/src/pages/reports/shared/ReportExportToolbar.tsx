import { Download, FileText, Loader2, Printer, Table } from 'lucide-react';
import ActionDropdown from '../../../components/ActionDropdown';

type ReportExportToolbarProps = {
  disabled: boolean;
  isExporting: boolean;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onPrint: () => void;
};

export default function ReportExportToolbar({
  disabled,
  isExporting,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onPrint,
}: ReportExportToolbarProps) {
  const exportDisabled = disabled || isExporting;

  return (
    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
      <ActionDropdown
        label={isExporting ? 'Exporting...' : 'Export'}
        buttonClassName="btn btn-outline btn-sm"
        buttonIcon={isExporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
        disabled={exportDisabled}
        items={[
          {
            key: 'export-csv',
            label: 'CSV',
            onSelect: onExportCsv,
            icon: <Download size={14} />,
            disabled: exportDisabled,
          },
          {
            key: 'export-excel',
            label: 'Excel',
            onSelect: onExportExcel,
            icon: <Table size={14} />,
            disabled: exportDisabled,
          },
          {
            key: 'export-pdf',
            label: 'PDF',
            onSelect: onExportPdf,
            icon: <FileText size={14} />,
            disabled: exportDisabled,
          },
        ]}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={onPrint}
        disabled={exportDisabled}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <Printer size={14} />
        Print
      </button>
    </div>
  );
}
