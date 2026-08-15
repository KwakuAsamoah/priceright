import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import useCompanyName from '../../../hooks/useCompanyName';
import { exportToCsv, exportToExcelWorkbookAsync } from '../../../utils/reportExport';
import { generateTablePDF, printTable } from '../../../utils/exportPrint';
import { formatCurrency as formatCurrencyAmount } from '../../../utils/currency';
import { getHubSubViewMeta, HUBS_BY_ID } from '../constants/hubRegistry';
import { getMaterialCostsExportPayload, getMaterialCostsExportTitle } from '../export/getExportPayload';
import { useMaterialCostsHubState } from '../hooks/useReportHubState';
import { useReportGeneration } from '../hooks/useReportGeneration';
import ReportExportToolbar from '../shared/ReportExportToolbar';
import ReportFilterBar from '../shared/ReportFilterBar';
import ReportFilterChips from '../shared/ReportFilterChips';
import MaterialsCostAnalysisView from '../subviews/MaterialsCostAnalysisView';
import TopCostDriversView from '../subviews/TopCostDriversView';
import type { ActiveFilterChip, MaterialCostsReportData, MaterialCostsSubViewId } from '../types';
import {
  generateMaterialsCostAnalysisReport,
  generateTopCostDriversReport,
} from '../utils/materialCostsGeneration';
import { INLINE_FILTER_FIELD, REPORT_SELECTOR_STICKY_STYLE } from '../utils/reportUtils';

export default function MaterialCostsHub() {
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const { hubId, subViewId, selectSubView } = useMaterialCostsHubState();
  const hubMeta = HUBS_BY_ID['material-costs'];
  const subViewMeta = getHubSubViewMeta(hubId, subViewId);

  const [currentPage, setCurrentPage] = useState(1);
  const [materialsCostCategoryFilter, setMaterialsCostCategoryFilter] = useState('All');
  const [availableMaterialCategories, setAvailableMaterialCategories] = useState<string[]>([]);

  const formatCurrency = useCallback((value: number) => {
    const absValue = Math.abs(value);
    const text = formatCurrencyAmount(absValue, baseCurrency);
    return value < 0 ? `(${text})` : text;
  }, [baseCurrency]);

  const filterDeps = useMemo(() => {
    if (subViewId === 'materials-cost-analysis') {
      return [materialsCostCategoryFilter, baseCurrency];
    }
    return [baseCurrency];
  }, [baseCurrency, materialsCostCategoryFilter, subViewId]);

  const {
    isLoading,
    isExporting,
    setIsExporting,
    error,
    reportData,
    generatedAt,
  } = useReportGeneration<MaterialCostsReportData>({
    hubId,
    subViewId,
    filterDeps,
    generate: async ({ applyIfLatest, setReportData }) => {
      if (subViewId === 'materials-cost-analysis') {
        const result = await generateMaterialsCostAnalysisReport(materialsCostCategoryFilter);
        applyIfLatest(() => setAvailableMaterialCategories(result.categories));
        setReportData(result.data);
        return;
      }

      const data = await generateTopCostDriversReport();
      setReportData(data);
    },
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [subViewId, materialsCostCategoryFilter]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData) return 0;
    const rows = (reportData as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows.length : 0;
  }, [reportData]);

  const canExportReport = Boolean(reportData && generatedAt && generatedRowsCount > 0);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    if (subViewId === 'materials-cost-analysis' && materialsCostCategoryFilter !== 'All') {
      return [{
        key: 'materials-cost-category',
        label: `Category: ${materialsCostCategoryFilter}`,
        onClear: () => setMaterialsCostCategoryFilter('All'),
      }];
    }
    return [];
  }, [materialsCostCategoryFilter, subViewId]);

  const resetFiltersForSubView = useCallback((nextSubViewId: MaterialCostsSubViewId) => {
    if (nextSubViewId === 'materials-cost-analysis') {
      setMaterialsCostCategoryFilter('All');
    }
  }, []);

  const handleSubViewChange = (nextSubViewId: MaterialCostsSubViewId) => {
    resetFiltersForSubView(nextSubViewId);
    setCurrentPage(1);
    selectSubView(nextSubViewId);
  };

  const buildPdfOptions = useCallback((payload: NonNullable<ReturnType<typeof getMaterialCostsExportPayload>>) => {
    const date = new Date().toLocaleDateString('en-GB');
    return {
      title: getMaterialCostsExportTitle(subViewId),
      subtitle: `Generated: ${date}`,
      columns: payload.columns.map((column) => ({
        header: column.label,
        dataKey: column.key,
      })),
      rows: payload.rows as Record<string, unknown>[],
      landscape: true,
      companyName: companyName,
      filename: payload.filename.replace(/\.csv$/i, '.pdf'),
    };
  }, [companyName, subViewId]);

  const handleExportCsv = async () => {
    if (isExporting || !reportData) return;
    setIsExporting(true);
    try {
      const payload = getMaterialCostsExportPayload(subViewId, reportData, baseCurrency);
      if (!payload) return;
      exportToCsv(payload.rows, payload.columns, payload.filename);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (isExporting || !reportData) return;
    setIsExporting(true);
    try {
      const payload = getMaterialCostsExportPayload(subViewId, reportData, baseCurrency);
      if (!payload) return;
      await exportToExcelWorkbookAsync(
        [{ name: 'Report', rows: payload.rows, columns: payload.columns }],
        payload.filename.replace(/\.csv$/i, '.xlsx'),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!reportData) return;
    const payload = getMaterialCostsExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await generateTablePDF(buildPdfOptions(payload));
    } catch (exportError: unknown) {
      console.error(exportError);
    }
  };

  const handlePrintReport = async () => {
    if (!reportData) return;
    const payload = getMaterialCostsExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await printTable(buildPdfOptions(payload));
    } catch (printError: unknown) {
      console.error(printError);
    }
  };

  const renderFilters = () => {
    if (subViewId !== 'materials-cost-analysis') {
      return null;
    }

    return (
      <div style={INLINE_FILTER_FIELD}>
        <label className="app-settings-label">Category</label>
        <select
          className="app-control"
          value={materialsCostCategoryFilter}
          onChange={(event) => setMaterialsCostCategoryFilter(event.target.value)}
        >
          <option value="All">All</option>
          {availableMaterialCategories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>
    );
  };

  const renderReportBody = () => {
    if (!reportData) return null;

    if (subViewId === 'materials-cost-analysis') {
      return (
        <MaterialsCostAnalysisView
          data={reportData as Extract<MaterialCostsReportData, { totalActiveMaterials: number }>}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          formatCurrency={formatCurrency}
        />
      );
    }

    return (
      <TopCostDriversView
        data={reportData as Extract<MaterialCostsReportData, { totalMaterialsInBoms: number }>}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        formatCurrency={formatCurrency}
      />
    );
  };

  return (
    <>
      <div style={{ ...REPORT_SELECTOR_STICKY_STYLE, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {hubMeta.subViews.map((subView) => {
          const isActive = subViewId === subView.id;
          return (
            <button
              key={subView.id}
              type="button"
              className={`app-pill-tab${isActive ? ' is-active' : ''}`}
              onClick={() => handleSubViewChange(subView.id as MaterialCostsSubViewId)}
            >
              {subView.pillLabel}
            </button>
          );
        })}
      </div>

      <div className="app-card" style={{ padding: '16px' }}>
        <div style={{ marginBottom: '4px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{subViewMeta.name}</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '15px' }}>{subViewMeta.description}</p>
          {generatedAt && (
            <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '13px' }}>
              Generated: {generatedAt.toLocaleString()}
            </div>
          )}
        </div>

        <ReportFilterBar
          filters={renderFilters()}
          exportToolbar={(
            <ReportExportToolbar
              disabled={!canExportReport || isLoading || !!error}
              isExporting={isExporting}
              onExportCsv={() => { void handleExportCsv(); }}
              onExportExcel={() => { void handleExportExcel(); }}
              onExportPdf={() => { void handleExportPdf(); }}
              onPrint={() => { void handlePrintReport(); }}
            />
          )}
        />

        <ReportFilterChips
          chips={activeFilterChips}
          onClearAll={() => resetFiltersForSubView(subViewId)}
        />

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '36px 0', color: '#334155' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Loading report data...
          </div>
        )}

        {!isLoading && error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
            {error}
          </div>
        )}

        {!isLoading && !error && generatedRowsCount === 0 && (
          <div style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
            No data matches the selected filters.
          </div>
        )}

        {!isLoading && !error && generatedRowsCount > 0 && (
          <ErrorBoundary key={subViewId}>
            {renderReportBody()}
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}
