import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Loader2 } from 'lucide-react';
import { productsApi } from '../../../api';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import useCompanyName from '../../../hooks/useCompanyName';
import { useLowMarkupThreshold } from '../../../hooks/useLowMarginThreshold';
import { exportInChunks, exportToCsv, exportToExcelWorkbookAsync, type ReportCell } from '../../../utils/reportExport';
import { generateTablePDF, printTable } from '../../../utils/exportPrint';
import { formatCurrency as formatCurrencyAmount } from '../../../utils/currency';
import { getHubSubViewMeta, HUBS_BY_ID } from '../constants/hubRegistry';
import { getPricingHealthExportPayload, getPricingHealthExportTitle } from '../export/getExportPayload';
import { usePricingHealthHubState } from '../hooks/useReportHubState';
import { useReportGeneration } from '../hooks/useReportGeneration';
import ReportExportToolbar from '../shared/ReportExportToolbar';
import ReportFilterBar from '../shared/ReportFilterBar';
import ReportFilterChips from '../shared/ReportFilterChips';
import MarginHealthView from '../subviews/MarginHealthView';
import MarkupAnalysisView from '../subviews/MarkupAnalysisView';
import PricingStatusView from '../subviews/PricingStatusView';
import type {
  ActiveFilterChip,
  PricingHealthReportData,
  PricingHealthReportResultMap,
  PricingHealthSubViewId,
} from '../types';
import {
  generateMarginHealthReport,
  generateMarkupAnalysisReport,
  generatePricingStatusReport,
} from '../utils/pricingHealthGeneration';
import { INLINE_FILTER_FIELD, REPORT_SELECTOR_STICKY_STYLE } from '../utils/reportUtils';

export default function PricingHealthHub() {
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const lowMarkupThreshold = useLowMarkupThreshold();
  const { hubId, subViewId, selectSubView } = usePricingHealthHubState();
  const hubMeta = HUBS_BY_ID['pricing-health'];
  const subViewMeta = getHubSubViewMeta(hubId, subViewId);

  const [currentPage, setCurrentPage] = useState(1);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [pricingCategoryFilter, setPricingCategoryFilter] = useState('All');
  const [pricingStatusFilter, setPricingStatusFilter] = useState<'All' | 'Above Optimal' | 'Below Optimal' | 'At Optimal'>('All');
  const [pricingSort, setPricingSort] = useState<'Product Name' | 'Markup % desc' | 'Markup % asc' | 'Variance desc' | 'Variance asc'>('Product Name');

  const [markupAnalysisThreshold, setMarkupAnalysisThreshold] = useState(lowMarkupThreshold);
  const [markupAnalysisFilter, setMarkupAnalysisFilter] = useState<'all' | 'above' | 'below' | 'custom'>('all');
  const [markupAnalysisCategory, setMarkupAnalysisCategory] = useState('All');
  const [markupAnalysisMinRange, setMarkupAnalysisMinRange] = useState('');
  const [markupAnalysisMaxRange, setMarkupAnalysisMaxRange] = useState('');

  useEffect(() => {
    setMarkupAnalysisThreshold(lowMarkupThreshold);
  }, [lowMarkupThreshold]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const products = await productsApi.getAll('all') as Array<{ category?: string | null }>;
        if (cancelled) return;
        const categories = Array.from(
          new Set(
            products
              .map((product) => String(product.category || '').trim())
              .filter((category) => category.length > 0),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setAvailableCategories(categories);
      } catch {
        if (!cancelled) {
          setAvailableCategories([]);
        }
      }
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const formatCurrency = useCallback((value: number) => {
    const absValue = Math.abs(value);
    const text = formatCurrencyAmount(absValue, baseCurrency);
    return value < 0 ? `(${text})` : text;
  }, [baseCurrency]);

  const filterDeps = useMemo(() => {
    if (subViewId === 'pricing-status') {
      return [pricingCategoryFilter, pricingStatusFilter, pricingSort, baseCurrency];
    }
    if (subViewId === 'markup-analysis') {
      return [
        markupAnalysisThreshold,
        markupAnalysisFilter,
        markupAnalysisCategory,
        markupAnalysisMinRange,
        markupAnalysisMaxRange,
        baseCurrency,
      ];
    }
    return [lowMarkupThreshold, baseCurrency];
  }, [
    baseCurrency,
    lowMarkupThreshold,
    markupAnalysisCategory,
    markupAnalysisFilter,
    markupAnalysisMaxRange,
    markupAnalysisMinRange,
    markupAnalysisThreshold,
    pricingCategoryFilter,
    pricingSort,
    pricingStatusFilter,
    subViewId,
  ]);

  const {
    isLoading,
    isExporting,
    setIsExporting,
    error,
    reportData,
    generatedAt,
  } = useReportGeneration<PricingHealthReportData>({
    hubId,
    subViewId,
    filterDeps,
    generate: async ({ setReportData }) => {
      if (subViewId === 'margin-health') {
        const data = await generateMarginHealthReport();
        setReportData(data);
        return;
      }

      if (subViewId === 'markup-analysis') {
        const data = await generateMarkupAnalysisReport({
          threshold: markupAnalysisThreshold,
          filter: markupAnalysisFilter,
          category: markupAnalysisCategory,
          minRange: markupAnalysisMinRange,
          maxRange: markupAnalysisMaxRange,
        });
        setReportData(data);
        return;
      }

      const data = await generatePricingStatusReport({
        categoryFilter: pricingCategoryFilter,
        statusFilter: pricingStatusFilter,
        sort: pricingSort,
      });
      setReportData(data);
    },
  });

  const resetFiltersForSubView = useCallback((nextSubViewId: PricingHealthSubViewId) => {
    if (nextSubViewId === 'pricing-status') {
      setPricingCategoryFilter('All');
      setPricingStatusFilter('All');
      setPricingSort('Product Name');
      return;
    }
    if (nextSubViewId === 'markup-analysis') {
      setMarkupAnalysisThreshold(lowMarkupThreshold);
      setMarkupAnalysisFilter('all');
      setMarkupAnalysisCategory('All');
      setMarkupAnalysisMinRange('');
      setMarkupAnalysisMaxRange('');
    }
  }, [lowMarkupThreshold]);

  useEffect(() => {
    resetFiltersForSubView(subViewId);
  }, [subViewId, resetFiltersForSubView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    subViewId,
    pricingCategoryFilter,
    pricingStatusFilter,
    pricingSort,
    markupAnalysisThreshold,
    markupAnalysisFilter,
    markupAnalysisCategory,
    markupAnalysisMinRange,
    markupAnalysisMaxRange,
  ]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData) return 0;
    if (subViewId === 'margin-health') {
      return (reportData as PricingHealthReportResultMap['margin-health']).products.length;
    }
    return (reportData as PricingHealthReportResultMap['markup-analysis' | 'pricing-status']).rows.length;
  }, [reportData, subViewId]);

  const shouldShowReportBody = useMemo(() => {
    if (!reportData) return false;
    if (subViewId === 'markup-analysis' || subViewId === 'margin-health') return true;
    return generatedRowsCount > 0;
  }, [generatedRowsCount, reportData, subViewId]);

  const canExportReport = Boolean(reportData && generatedAt && generatedRowsCount > 0);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    if (subViewId === 'pricing-status') {
      const chips: ActiveFilterChip[] = [];
      if (pricingCategoryFilter !== 'All') {
        chips.push({
          key: 'pricing-category',
          label: `Category: ${pricingCategoryFilter}`,
          onClear: () => setPricingCategoryFilter('All'),
        });
      }
      if (pricingStatusFilter !== 'All') {
        chips.push({
          key: 'pricing-status',
          label: `Status: ${pricingStatusFilter}`,
          onClear: () => setPricingStatusFilter('All'),
        });
      }
      if (pricingSort !== 'Product Name') {
        chips.push({
          key: 'pricing-sort',
          label: `Sort: ${pricingSort}`,
          onClear: () => setPricingSort('Product Name'),
        });
      }
      return chips;
    }

    if (subViewId === 'markup-analysis') {
      const chips: ActiveFilterChip[] = [];
      if (markupAnalysisThreshold !== lowMarkupThreshold) {
        chips.push({
          key: 'markup-analysis-threshold',
          label: `Target: ${markupAnalysisThreshold}%`,
          onClear: () => setMarkupAnalysisThreshold(lowMarkupThreshold),
        });
      }
      if (markupAnalysisFilter !== 'all') {
        const filterLabel = markupAnalysisFilter === 'above'
          ? 'Above target'
          : markupAnalysisFilter === 'below'
            ? 'Below target'
            : 'Custom range';
        chips.push({
          key: 'markup-analysis-filter',
          label: `Showing: ${filterLabel}`,
          onClear: () => setMarkupAnalysisFilter('all'),
        });
      }
      if (markupAnalysisCategory !== 'All') {
        chips.push({
          key: 'markup-analysis-category',
          label: `Category: ${markupAnalysisCategory}`,
          onClear: () => setMarkupAnalysisCategory('All'),
        });
      }
      if (markupAnalysisFilter === 'custom' && (markupAnalysisMinRange !== '' || markupAnalysisMaxRange !== '')) {
        chips.push({
          key: 'markup-analysis-range',
          label: `Range: ${markupAnalysisMinRange || '…'}%–${markupAnalysisMaxRange || '…'}%`,
          onClear: () => {
            setMarkupAnalysisMinRange('');
            setMarkupAnalysisMaxRange('');
          },
        });
      }
      return chips;
    }

    return [];
  }, [
    lowMarkupThreshold,
    markupAnalysisCategory,
    markupAnalysisFilter,
    markupAnalysisMaxRange,
    markupAnalysisMinRange,
    markupAnalysisThreshold,
    pricingCategoryFilter,
    pricingSort,
    pricingStatusFilter,
    subViewId,
  ]);

  const handleSubViewChange = (nextSubViewId: PricingHealthSubViewId) => {
    resetFiltersForSubView(nextSubViewId);
    setCurrentPage(1);
    selectSubView(nextSubViewId);
  };

  const buildPdfOptions = useCallback((payload: NonNullable<ReturnType<typeof getPricingHealthExportPayload>>) => {
    const date = new Date().toLocaleDateString('en-GB');
    return {
      title: getPricingHealthExportTitle(subViewId),
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
      const payload = getPricingHealthExportPayload(subViewId, reportData, baseCurrency);
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
      const payload = getPricingHealthExportPayload(subViewId, reportData, baseCurrency);
      if (!payload) return;

      if (subViewId === 'markup-analysis') {
        const preamble = [`Target markup threshold: ${markupAnalysisThreshold}%`];
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
    const payload = getPricingHealthExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await generateTablePDF(buildPdfOptions(payload));
    } catch (exportError: unknown) {
      console.error(exportError);
    }
  };

  const handlePrintReport = async () => {
    if (!reportData) return;
    const payload = getPricingHealthExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await printTable(buildPdfOptions(payload));
    } catch (printError: unknown) {
      console.error(printError);
    }
  };

  const renderFilters = () => {
    if (subViewId === 'margin-health') {
      return null;
    }

    if (subViewId === 'pricing-status') {
      return (
        <>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Category</label>
            <select className="app-control" value={pricingCategoryFilter} onChange={(event) => setPricingCategoryFilter(event.target.value)}>
              <option value="All">All</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Pricing Status</label>
            <select className="app-control" value={pricingStatusFilter} onChange={(event) => setPricingStatusFilter(event.target.value as typeof pricingStatusFilter)}>
              <option value="All">All</option>
              <option value="Above Optimal">Above Optimal</option>
              <option value="Below Optimal">Below Optimal</option>
              <option value="At Optimal">At Optimal</option>
            </select>
          </div>
          <div style={INLINE_FILTER_FIELD}>
            <label className="app-settings-label">Sort by</label>
            <select className="app-control" value={pricingSort} onChange={(event) => setPricingSort(event.target.value as typeof pricingSort)}>
              <option>Product Name</option>
              <option>Markup % desc</option>
              <option>Markup % asc</option>
              <option>Variance desc</option>
              <option>Variance asc</option>
            </select>
          </div>
        </>
      );
    }

    return (
      <>
        <div style={{ ...INLINE_FILTER_FIELD, minWidth: '150px' }}>
          <label className="app-settings-label">Target markup %</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              className="app-control"
              type="number"
              value={markupAnalysisThreshold}
              onChange={(event) => setMarkupAnalysisThreshold(Number(event.target.value || 0))}
            />
            <span style={{ fontWeight: 600 }}>%</span>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.35 }}>
            Defaults to your system threshold. Change system default in Settings → Pricing Engine
          </span>
        </div>
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Show</label>
          <select
            className="app-control"
            value={markupAnalysisFilter}
            onChange={(event) => setMarkupAnalysisFilter(event.target.value as typeof markupAnalysisFilter)}
          >
            <option value="all">All products</option>
            <option value="above">Above target</option>
            <option value="below">Below target</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        {markupAnalysisFilter === 'custom' && (
          <>
            <div style={INLINE_FILTER_FIELD}>
              <label className="app-settings-label">Min %</label>
              <input
                className="app-control"
                type="number"
                value={markupAnalysisMinRange}
                onChange={(event) => setMarkupAnalysisMinRange(event.target.value)}
              />
            </div>
            <div style={INLINE_FILTER_FIELD}>
              <label className="app-settings-label">Max %</label>
              <input
                className="app-control"
                type="number"
                value={markupAnalysisMaxRange}
                onChange={(event) => setMarkupAnalysisMaxRange(event.target.value)}
              />
            </div>
          </>
        )}
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Category</label>
          <select className="app-control" value={markupAnalysisCategory} onChange={(event) => setMarkupAnalysisCategory(event.target.value)}>
            <option value="All">All</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </>
    );
  };

  const renderReportBody = () => {
    if (!reportData) return null;

    if (subViewId === 'margin-health') {
      return (
        <MarginHealthView
          data={reportData as PricingHealthReportResultMap['margin-health']}
          lowMarginThreshold={lowMarkupThreshold}
        />
      );
    }

    if (subViewId === 'markup-analysis') {
      return (
        <MarkupAnalysisView
          data={reportData as PricingHealthReportResultMap['markup-analysis']}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          formatCurrency={formatCurrency}
          markupAnalysisThreshold={markupAnalysisThreshold}
        />
      );
    }

    return (
      <PricingStatusView
        data={reportData as PricingHealthReportResultMap['pricing-status']}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        formatCurrency={formatCurrency}
        lowMarkupThreshold={lowMarkupThreshold}
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
              onClick={() => handleSubViewChange(subView.id as PricingHealthSubViewId)}
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
