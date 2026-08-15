import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { productsApi } from '../../../api';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import useCompanyName from '../../../hooks/useCompanyName';
import { exportToCsv, exportToExcelWorkbookAsync } from '../../../utils/reportExport';
import { generateTablePDF, printTable } from '../../../utils/exportPrint';
import { formatCurrency as formatCurrencyAmount } from '../../../utils/currency';
import { getHubSubViewMeta, HUBS_BY_ID } from '../constants/hubRegistry';
import { getApprovalsListsExportPayload, getApprovalsListsExportTitle } from '../export/getExportPayload';
import { useApprovalsListsHubState } from '../hooks/useReportHubState';
import { useReportGeneration } from '../hooks/useReportGeneration';
import ReportExportToolbar from '../shared/ReportExportToolbar';
import ReportFilterBar from '../shared/ReportFilterBar';
import ReportFilterChips from '../shared/ReportFilterChips';
import ApprovalHistoryView from '../subviews/ApprovalHistoryView';
import PriceListSummaryView from '../subviews/PriceListSummaryView';
import type { ActiveFilterChip, ApprovalsListsReportData, ApprovalsListsReportResultMap, ApprovalsListsSubViewId } from '../types';
import {
  generateApprovalHistoryReport,
  generatePriceListSummaryReport,
} from '../utils/approvalsListsGeneration';
import {
  getDefaultApprovalFromDate,
  getDefaultApprovalToDate,
  INLINE_FILTER_FIELD,
  REPORT_SELECTOR_STICKY_STYLE,
} from '../utils/reportUtils';

export default function ApprovalsListsHub() {
  const { baseCurrency } = useBaseCurrency();
  const companyName = useCompanyName();
  const { hubId, subViewId, selectSubView } = useApprovalsListsHubState();
  const hubMeta = HUBS_BY_ID['approvals-lists'];
  const subViewMeta = getHubSubViewMeta(hubId, subViewId);

  const [currentPage, setCurrentPage] = useState(1);
  const [approvalFromDate, setApprovalFromDate] = useState(getDefaultApprovalFromDate);
  const [approvalToDate, setApprovalToDate] = useState(getDefaultApprovalToDate);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | 'approved' | 'needs_review' | 'pending'>('All');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState('All');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

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
    if (subViewId === 'approval-history') {
      return [approvalFromDate, approvalToDate, approvalStatusFilter, approvalCategoryFilter, baseCurrency];
    }
    return [baseCurrency];
  }, [
    approvalCategoryFilter,
    approvalFromDate,
    approvalStatusFilter,
    approvalToDate,
    baseCurrency,
    subViewId,
  ]);

  const {
    isLoading,
    isExporting,
    setIsExporting,
    error,
    reportData,
    generatedAt,
  } = useReportGeneration<ApprovalsListsReportData>({
    hubId,
    subViewId,
    filterDeps,
    generate: async ({ setReportData }) => {
      if (subViewId === 'approval-history') {
        const data = await generateApprovalHistoryReport({
          fromDate: approvalFromDate,
          toDate: approvalToDate,
          statusFilter: approvalStatusFilter,
          categoryFilter: approvalCategoryFilter,
        });
        setReportData(data);
        return;
      }

      const data = await generatePriceListSummaryReport();
      setReportData(data);
    },
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [subViewId, approvalFromDate, approvalToDate, approvalStatusFilter, approvalCategoryFilter]);

  const generatedRowsCount = useMemo(() => {
    if (!reportData) return 0;
    return reportData.rows.length;
  }, [reportData]);

  const canExportReport = Boolean(reportData && generatedAt && generatedRowsCount > 0);

  const activeFilterChips = useMemo((): ActiveFilterChip[] => {
    if (subViewId !== 'approval-history') {
      return [];
    }

    const chips: ActiveFilterChip[] = [];
    if (approvalFromDate !== getDefaultApprovalFromDate()) {
      chips.push({
        key: 'approval-from',
        label: `From: ${approvalFromDate}`,
        onClear: () => setApprovalFromDate(getDefaultApprovalFromDate()),
      });
    }
    if (approvalToDate !== getDefaultApprovalToDate()) {
      chips.push({
        key: 'approval-to',
        label: `To: ${approvalToDate}`,
        onClear: () => setApprovalToDate(getDefaultApprovalToDate()),
      });
    }
    if (approvalStatusFilter !== 'All') {
      chips.push({
        key: 'approval-status',
        label: `Status: ${approvalStatusFilter}`,
        onClear: () => setApprovalStatusFilter('All'),
      });
    }
    if (approvalCategoryFilter !== 'All') {
      chips.push({
        key: 'approval-category',
        label: `Category: ${approvalCategoryFilter}`,
        onClear: () => setApprovalCategoryFilter('All'),
      });
    }
    return chips;
  }, [
    approvalCategoryFilter,
    approvalFromDate,
    approvalStatusFilter,
    approvalToDate,
    subViewId,
  ]);

  const resetFiltersForSubView = useCallback((nextSubViewId: ApprovalsListsSubViewId) => {
    if (nextSubViewId === 'approval-history') {
      setApprovalFromDate(getDefaultApprovalFromDate());
      setApprovalToDate(getDefaultApprovalToDate());
      setApprovalStatusFilter('All');
      setApprovalCategoryFilter('All');
    }
  }, []);

  const handleSubViewChange = (nextSubViewId: ApprovalsListsSubViewId) => {
    resetFiltersForSubView(nextSubViewId);
    setCurrentPage(1);
    selectSubView(nextSubViewId);
  };

  const buildPdfOptions = useCallback((payload: NonNullable<ReturnType<typeof getApprovalsListsExportPayload>>) => {
    const date = new Date().toLocaleDateString('en-GB');
    return {
      title: getApprovalsListsExportTitle(subViewId),
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
      const payload = getApprovalsListsExportPayload(subViewId, reportData, baseCurrency);
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
      const payload = getApprovalsListsExportPayload(subViewId, reportData, baseCurrency);
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
    const payload = getApprovalsListsExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await generateTablePDF(buildPdfOptions(payload));
    } catch (exportError: unknown) {
      console.error(exportError);
    }
  };

  const handlePrintReport = async () => {
    if (!reportData) return;
    const payload = getApprovalsListsExportPayload(subViewId, reportData, baseCurrency);
    if (!payload) return;
    try {
      await printTable(buildPdfOptions(payload));
    } catch (printError: unknown) {
      console.error(printError);
    }
  };

  const renderFilters = () => {
    if (subViewId !== 'approval-history') {
      return null;
    }

    return (
      <>
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">From</label>
          <input className="app-control" type="date" value={approvalFromDate} onChange={(event) => setApprovalFromDate(event.target.value)} />
        </div>
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">To</label>
          <input className="app-control" type="date" value={approvalToDate} onChange={(event) => setApprovalToDate(event.target.value)} />
        </div>
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Approval status</label>
          <select className="app-control" value={approvalStatusFilter} onChange={(event) => setApprovalStatusFilter(event.target.value as typeof approvalStatusFilter)}>
            <option value="All">All</option>
            <option value="approved">Approved</option>
            <option value="needs_review">Needs Review</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div style={INLINE_FILTER_FIELD}>
          <label className="app-settings-label">Category</label>
          <select className="app-control" value={approvalCategoryFilter} onChange={(event) => setApprovalCategoryFilter(event.target.value)}>
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

    if (subViewId === 'approval-history') {
      return (
        <ApprovalHistoryView
          data={reportData as ApprovalsListsReportResultMap['approval-history']}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          formatCurrency={formatCurrency}
        />
      );
    }

    return (
      <PriceListSummaryView
        data={reportData as Extract<ApprovalsListsReportData, { activeCount: number }>}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
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
              onClick={() => handleSubViewChange(subView.id as ApprovalsListsSubViewId)}
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
