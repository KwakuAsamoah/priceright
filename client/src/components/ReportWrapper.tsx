import { Download, Loader2, Printer } from 'lucide-react';
import AppButton from './AppButton';

interface ReportWrapperProps {
  title: string;
  subtitle: string;
  onExportPDF: () => void;
  onExportExcel: () => void;
  onPrint?: () => void;
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  generatedAt: Date | null;
  children: React.ReactNode;
}

export default function ReportWrapper({
  title,
  subtitle,
  onExportPDF,
  onExportExcel,
  onPrint,
  isLoading,
  error,
  isEmpty,
  generatedAt,
  children,
}: ReportWrapperProps) {
  return (
    <div className="app-card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{title}</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '15px' }}>{subtitle}</p>
          <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '13px' }}>Oxy Industries · PriceRight</div>
          <div style={{ marginTop: '2px', color: '#94a3b8', fontSize: '13px' }}>
            Generated: {generatedAt ? generatedAt.toLocaleString() : 'Not generated yet'}
          </div>
        </div>

        <div className="export-buttons" style={{ display: 'flex', gap: '8px' }}>
          {onPrint && (
            <AppButton variant="secondary" size="sm" onClick={onPrint} disabled={!generatedAt || isLoading || !!error || isEmpty}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Printer size={14} strokeWidth={2} />
                Print
              </span>
            </AppButton>
          )}
          <AppButton variant="secondary" size="sm" onClick={onExportPDF} disabled={!generatedAt || isLoading || !!error || isEmpty}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Printer size={14} strokeWidth={2} />
              Export PDF
            </span>
          </AppButton>
          <AppButton variant="primary" size="sm" onClick={onExportExcel} disabled={!generatedAt || isLoading || !!error || isEmpty}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} strokeWidth={2} />
              Export to Excel
            </span>
          </AppButton>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '36px 0', color: '#334155' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          Loading report data...
        </div>
      )}

      {!isLoading && error && (
        <div style={{ marginTop: '16px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
          {error}
        </div>
      )}

      {!isLoading && !error && isEmpty && (
        <div style={{ marginTop: '16px', backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
          No data matches the selected filters.
        </div>
      )}

      {!isLoading && !error && !isEmpty && <div style={{ marginTop: '16px' }}>{children}</div>}
    </div>
  );
}
