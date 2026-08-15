import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import useCompanyName from '../../../hooks/useCompanyName';
import { exportInChunks, exportToCsv, exportToExcelWorkbookAsync, type ReportCell } from '../../../utils/reportExport';
import { generateTablePDF, printTable } from '../../../utils/exportPrint';
import { formatCurrency as formatCurrencyAmount } from '../../../utils/currency';
import { getHubSubViewMeta, HUBS_BY_ID } from '../constants/hubRegistry';
import { getCostChangesExportPayload, getCostChangesExportTitle } from '../export/getExportPayload';
import { useCostChangesHubState } from '../hooks/useReportHubState';
import { useReportGeneration } from '../hooks/useReportGeneration';
import ReportExportToolbar from '../shared/ReportExportToolbar';
import ReportFilterBar from '../shared/ReportFilterBar';
import ReportFilterChips from '../shared/ReportFilterChips';
import MaterialPriceHistoryView from '../subviews/MaterialPriceHistoryView';
import PriceVolatilityView from '../subviews/PriceVolatilityView';
import PriceVsCostDriftView from '../subviews/PriceVsCostDriftView';
import type {
  ActiveFilterChip,
  CostChangesReportData,
  CostChangesReportResultMap,
  CostChangesSubViewId,
} from '../types';
import {
  generateMaterialPriceHistoryReport,
  generatePriceVolatilityReport,
  generatePriceVsCostDriftReport,
  type PriceVsCostDriftFilter,
} from '../utils/costChangesGeneration';
import { getPriceVolatilityPeriodLabel, INLINE_FILTER_FIELD, REPORT_SELECTOR_STICKY_STYLE } from '../utils/reportUtils';

export default function CostChangesHub() {
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const { hubId, subViewId, selectSubView } = useCostChangesHubState();
  const hubMeta = HUBS_BY_ID['cost-changes'];
  const subViewMeta = getHubSubViewMeta(hubId, subViewId);

  const [currentPage, setCurrentPage] = useState(1);
  const [driftFilter, setDriftFilter] = useState<PriceVsCostDriftFilter>('Negative only');
  const [priceVolatilityPeriod, setPriceVolatilityPeriod] = useState<'30' | '90' | '180' | '365'>('90');
  const [materialPriceHistoryMaterialId, setMaterialPriceHistoryMaterialId] = useState<number | null>(null);

  const formatCurrency = useCallback((value: number) => {
    const absValue = Math.abs(value);
    const text = formatCurrencyAmount(absValue, baseCurrency);
    return value < 0 ? `(${text})` : text;
  }, [baseCurrency]);

  const filterDeps = useMemo(() => {
    if (subViewId === 'price-vs-cost-drift') {
      return [driftFilter, baseCurrency];
    }
    if (subViewId === 'price-volatility') {
      return [priceVolatilityPeriod, baseCurrency];
    }
    return [materialPriceHistoryMaterialId, baseCurrency];
  }, [baseCurrency, driftFilter, materialPriceHistoryMaterialId, priceVolatilityPeriod, subViewId]);

  const {
    isLoading,
    isExporting,
    setIsExporting,
    error,
    reportData,
    generatedAt,
  } = useReportGeneration<CostChangesReportData>({
    hubId,
    subViewId,
    filterDeps,
    generate: async ({ setReportData }) => {
      if (subViewId === 'price-vs-cost-drift') {
        const data = await generatePriceVsCostDriftReport(driftFilter);
        setReportData(data);
        return;
      }

      if (subViewId === 'price-volatility') {
        const data = await generatePriceVolatilityReport(priceVolatilityPeriod);
        setReportData(data);
        return;
      }

      const data = await generateMaterialPriceHistoryReport(materialPriceHistoryMaterialId);
      setReportData(data);
    },
  });

  const resetFiltersForSubView = useCallback((nextSubViewId: CostChangesSubViewId) => {
    if (nextSubViewId === 'price-vs-cost-drift') {
      setDriftFilter('Negative only');
      return;
    }
    if (nextSubViewId === 'price-volatility') {
      setPriceVolatilityPeriod('90');
      return;
    }
    setMaterialPriceHistoryMaterialId(null);
  }, []);

  useEffect(() => {
    resetFiltersForSubView(subViewId);
  }, [subViewId, resetFiltersForSubView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [subViewId, driftFilter, priceVolatilityPeriod, materialPriceHistoryMaterialId]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData) return 0;
    if (subViewId === 'material-price-history') {
      const data = reportData as CostChangesReportResultMap['material-price-history'];
      if (!Array.isArray(data.materialOptions)) return 0;
      return data.materialId != null && Array.isArray(data.rows) ? data.rows.length : 0;
    }
    const rows = (reportData as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows.length : 0;
  }, [reportData, subViewId]);

  const shouldShowReportBody = useMemo(() => {
    if (!reportData) return false;
    if (subViewId === 'material-price-history') {
      return Array.isArray((reportData as CostChangesReportResultMap['material-price-history']).materialOptions);
    }
    if (subViewId === 'price-volatility') {
      return Array.isArray((reportData as CostChangesReportResultMap['price-volatility']).rows);
    }
    return generatedRowsCount > 0;
  }, [generatedRowsCount, reportData, subViewId]);

  const canExportReport = useMemo(() => {
    if (!reportData || !generatedAt) return false;
    if (subViewId === 'material-price-history') {
      const data = reportData as CostChangesReportResultMap['material-price-history'];
      return Array.isArray(data.materialOptions)
        && data.materialId != null
        && Array.isArray(data.rows)
        && data.rows.length > 0;
    }
    return generatedRowsCount > 0;
  }, [generatedAt, generatedRowsCount, reportData, subViewId]);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    if (subViewId === 'price-vs-cost-drift' && driftFilter !== 'Negative only') {
      return [{
        key: 'drift-filter',
        label: 'Showing: All products',
        onClear: () => setDriftFilter('Negative only'),
      }];
    }

    if (subViewId === 'price-volatility' && priceVolatilityPeriod !== '90') {
      const label = priceVolatilityPeriod === '30'
        ? 'Last 30 days'
        : priceVolatilityPeriod === '180'
          ? 'Last 6 months'
          : 'Last 12 months';
      return [{
        key: 'price-volatility-period',
        label: `Period: ${label}`,
        onClear: () => setPriceVolatilityPeriod('90'),
      }];
    }

    if (subViewId === 'material-price-history' && materialPriceHistoryMaterialId != null) {
      let materialName = 'Selected material';
      if (reportData && subViewId === 'material-price-history') {
        const historyData = reportData as CostChangesReportResultMap['material-price-history'];
        materialName = historyData.materialName
          || historyData.materialOptions.find((material) => material.id === materialPriceHistoryMaterialId)?.name
          || materialName;
      }
      return [{
        key: 'material-price-history-material',
        label: `Material: ${materialName}`,
        onClear: () => setMaterialPriceHistoryMaterialId(null),
      }];
    }

    return [];
  }, [
    driftFilter,
    materialPriceHistoryMaterialId,
    priceVolatilityPeriod,
    reportData,
    subViewId,
  ]);

  const handleSubViewChange = (nextSubViewId: CostChangesSubViewId) => {
    resetFiltersForSubView(nextSubViewId);
    setCurrentPage(1);
    selectSubView(nextSubViewId);
  };

  const buildPdfOptions = useCallback((payload: NonNullable<ReturnType<typeof getCostChangesExportPayload>>) => {
    const date = new Date().toLocaleDateString('en-GB');
    return {
      title: getCostChangesExportTitle(subViewId),
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
      const payload = getCostChangesExportPayload(subViewId, reportData, baseCurrency, { priceVolatilityPeriod });
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
      const payload = getCostChangesExportPayload(subViewId, reportData, baseCurrency, { priceVolatilityPeriod });
      if (!payload) return;

      if (subViewId === 'price-volatility') {
        const preamble = [`Period: ${getPriceVolatilityPeriodLabel(priceVolatilityPeriod)}`];
        const dataRows: ReportCell[][] = [];
        await exportInChunks(payload.rows, (chunk) => {
          chunk.forEach((row) => {
            dataRows.push(payload.columns.map((column) => row[column.key] ?? ''));
          });
        });
        const worksheet = XLSX.utils.aoa_to_sheet([
          preamble,
          [],
          payload.columns.map((column) => column.label),
          ...dataRows,
        ]);
        worksheet['!cols'] = payload.columns.map((column) => ({
          wch: Math.max(14, column.label.length + 2),
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
        XLSX.writeFile(workbook, payload.filename.replace(/\.csv$/i, '.xlsx'));
        return;
      }

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
    const payload = getCostChangesExportPayload(subViewId, reportData, baseCurrency, { priceVolatilityPeriod });
    if (!payload) return;
    try {
      await generateTablePDF(buildPdfOptions(payload));
    } catch (exportError: unknown) {
      console.error(exportError);
    }
  };

  const handlePrintReport = async () => {
    if (!reportData) return;
    const payload = getCostChangesExportPayload(subViewId, reportData, baseCurrency, { priceVolatilityPeriod });
    if (!payload) return;
    try {
      await printTable(buildPdfOptions(payload));
    } catch (printError: unknown) {
      console.error(printError);
    }
  };

  const renderFilters = () => {
    if (subViewId === 'price-vs-cost-drift') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Show</label>
          <select className="app-control" value={driftFilter} onChange={(event) => setDriftFilter(event.target.value as PriceVsCostDriftFilter)}>
            <option value="Negative only">Negative drift only</option>
            <option value="All">All products</option>
          </select>
        </div>
      );
    }

    if (subViewId === 'price-volatility') {
      return (
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Time period</label>
          <select className="app-control" value={priceVolatilityPeriod} onChange={(event) => setPriceVolatilityPeriod(event.target.value as typeof priceVolatilityPeriod)}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
          </select>
        </div>
      );
    }

    if (subViewId === 'material-price-history') {
      const rawOptions = reportData
        ? (reportData as CostChangesReportResultMap['material-price-history']).materialOptions
        : undefined;
      const options = Array.isArray(rawOptions) ? rawOptions : [];

      return (
        <div style={{ ...INLINE_FILTER_FIELD, minWidth: '240px' }}>
          <label className="app-settings-label">Material</label>
          <select
            className="app-control"
            value={materialPriceHistoryMaterialId ?? ''}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setMaterialPriceHistoryMaterialId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
            }}
          >
            <option value="">Select material</option>
            {options.map((material) => (
              <option key={material.id} value={material.id}>{material.name}</option>
            ))}
          </select>
        </div>
      );
    }

    return null;
  };

  const renderReportBody = () => {
    if (!reportData) return null;

    if (subViewId === 'price-vs-cost-drift') {
      return (
        <PriceVsCostDriftView
          data={reportData as CostChangesReportResultMap['price-vs-cost-drift']}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          formatCurrency={formatCurrency}
        />
      );
    }

    if (subViewId === 'price-volatility') {
      return (
        <PriceVolatilityView
          data={reportData as CostChangesReportResultMap['price-volatility']}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          formatCurrency={formatCurrency}
        />
      );
    }

    return (
      <MaterialPriceHistoryView
        data={reportData as CostChangesReportResultMap['material-price-history']}
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
              onClick={() => handleSubViewChange(subView.id as CostChangesSubViewId)}
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

        {!isLoading && !error && !shouldShowReportBody && (
          <div style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
            No data matches the selected filters.
          </div>
        )}

        {!isLoading && !error && shouldShowReportBody && (
          <ErrorBoundary key={subViewId}>
            {renderReportBody()}
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}
