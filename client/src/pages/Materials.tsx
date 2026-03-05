import * as XLSX from 'xlsx';
import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpDown, CheckCircle2, Copy, FileSpreadsheet, FileUp, History, Loader2, Pencil, Plus, Printer, Tags, Trash2, X } from 'lucide-react';
import { materialsApi, currenciesApi, settingsApi } from '../api';

interface Material {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category: string;
  unit: string;
  bulkQuantity: string;
  bulkPrice: string;
  purchaseCurrencyId: number;
  purchaseCurrencyCode: string;
  purchaseCurrencySymbol: string;
  baseCurrencySymbol: string;
  unitPrice: string;
  supplier: string;
  isActive: boolean;
}

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

interface MaterialUsage {
  materialId: number;
  materialName: string;
  productCount: number;
  products: string[];
}

interface UsageCheckResult {
  canDelete: number[];
  inUse: MaterialUsage[];
}

function parseConfiguredList(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  const text = rawValue.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0);
    }
  } catch {
    // Ignore and fallback to delimited parsing
  }

  return text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildDuplicateName(baseName: string, existingNames: Set<string>) {
  const normalizedBase = (baseName || 'Untitled Material').trim();
  let candidate = `${normalizedBase} (Copy)`;
  let counter = 2;
  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${normalizedBase} (Copy ${counter})`;
    counter += 1;
  }
  return candidate;
}

export default function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [configuredMaterialCategories, setConfiguredMaterialCategories] = useState<string[]>([]);
  const [configuredMaterialUnits, setConfiguredMaterialUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedStatus, setSelectedStatus] = useState('All Status');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<number>>(new Set());
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<Array<{ rowNumber: number; name: string; reason: string; originalRow: any }>>([]);
  // Reference to avoid TS6133 error (used in UI but static analysis doesn't detect it)
  void importFailures;
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState<Material | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // New state for bulk actions
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = useState('');
  const [usageData, setUsageData] = useState<UsageCheckResult | null>(null);
  const [loadingUsageCheck, setLoadingUsageCheck] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    unit: 'kg',
    bulkQuantity: '',
    bulkPrice: '',
    purchaseCurrencyId: 0,
    supplier: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [materialsData, currenciesData, settingsData] = await Promise.all([
        materialsApi.getAll(),
        currenciesApi.getAll(),
        settingsApi.getAll(),
      ]);
      const safeMaterials = Array.isArray(materialsData) ? materialsData : [];
      const safeCurrencies = Array.isArray(currenciesData) ? currenciesData : [];

      setMaterials(safeMaterials);
      setCurrencies(safeCurrencies.filter((c: Currency) => c.isActive));

      const materialCategoriesSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'materialCategories');
      const materialUnitsSetting = (settingsData || []).find((entry: any) => entry.settingKey === 'materialUnits');
      setConfiguredMaterialCategories(parseConfiguredList(materialCategoriesSetting?.settingValue));
      setConfiguredMaterialUnits(parseConfiguredList(materialUnitsSetting?.settingValue));

      if (safeCurrencies.length > 0) {
        setFormData((prev) => ({ ...prev, purchaseCurrencyId: safeCurrencies[0].id }));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setMaterials([]);
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingMaterial) {
        await materialsApi.update(editingMaterial.id, {
          ...formData,
          bulkQuantity: parseFloat(formData.bulkQuantity),
          bulkPrice: parseFloat(formData.bulkPrice),
        });
      } else {
        await materialsApi.create({
          ...formData,
          bulkQuantity: parseFloat(formData.bulkQuantity),
          bulkPrice: parseFloat(formData.bulkPrice),
        });
      }
      setShowAddModal(false);
      setEditingMaterial(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving material:', error);
      alert('Failed to save material');
    }
  }

  function handleDownloadTemplate() {
    const templateData = [
      {
        'Material Name': 'Raw Palm Oil',
        'SKU': 'RPO-001',
        'Category': 'Raw Materials',
        'Unit': 'L',
        'Bulk Quantity': '200',
        'Bulk Price': '2500.00',
        'Currency': 'GHS',
        'Supplier': 'Palm Oil Supplier Ltd',
        'Description': 'Premium grade palm oil'
      },
      {
        'Material Name': 'PET Bottles 1L',
        'SKU': 'BOT-1L',
        'Category': 'Packaging',
        'Unit': 'piece',
        'Bulk Quantity': '1000',
        'Bulk Price': '850.00',
        'Currency': 'GHS',
        'Supplier': 'Bottles Co',
        'Description': 'Clear PET bottles'
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 8 },
      { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materials Template');
    XLSX.writeFile(wb, 'Materials_Import_Template.xlsx');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setImportPreview(jsonData);
      } catch (error) {
        console.error('Error reading file:', error);
        alert('Error reading file. Please check the format.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleImport() {
    if (importPreview.length === 0) {
      alert('No data to import');
      return;
    }

    setImporting(true);
    const failures: Array<{ rowNumber: number; name: string; reason: string; originalRow: any }> = [];
    let successCount = 0;

    for (let i = 0; i < importPreview.length; i++) {
      const row = importPreview[i];
      const rowNumber = i + 1;

      try {
        const name = (row['Material Name'] || row['name'] || '').toString().trim();
        const category = (row['Category'] || row['category'] || '').toString().trim();
        const unit = (row['Unit'] || row['unit'] || 'kg').toString();
        const bulkQuantityRaw = row['Bulk Quantity'] || row['bulkQuantity'] || '0';
        const bulkPriceRaw = row['Bulk Price'] || row['bulkPrice'] || '0';
        const currencyCode = (row['Currency'] || row['currency'] || 'GHS').toString().trim();
        const sku = row['SKU'] || row['sku'] || '';
        const description = row['Description'] || row['description'] || '';
        const supplier = row['Supplier'] || row['supplier'] || '';

        if (!name) {
          failures.push({ rowNumber, name: '', reason: 'Missing required field: Name', originalRow: row });
          continue;
        }
        if (!category) {
          failures.push({ rowNumber, name, reason: 'Missing required field: Category', originalRow: row });
          continue;
        }

        const bulkQuantity = parseFloat(bulkQuantityRaw as any);
        const bulkPrice = parseFloat(bulkPriceRaw as any);
        if (isNaN(bulkQuantity) || bulkQuantity <= 0) {
          failures.push({ rowNumber, name, reason: `Invalid bulk quantity: ${bulkQuantityRaw}`, originalRow: row });
          continue;
        }
        if (isNaN(bulkPrice) || bulkPrice <= 0) {
          failures.push({ rowNumber, name, reason: `Invalid bulk price: ${bulkPriceRaw}`, originalRow: row });
          continue;
        }

        const currency = currencies.find((c) => c.code.toUpperCase() === currencyCode.toUpperCase());
        if (!currency) {
          failures.push({ rowNumber, name, reason: `Currency code '${currencyCode}' not found`, originalRow: row });
          continue;
        }

        const exists = materials.some((m) => m.name.toLowerCase() === name.toLowerCase());
        if (exists) {
          failures.push({ rowNumber, name, reason: 'Duplicate material name already exists', originalRow: row });
          continue;
        }

        const materialData = {
          name,
          sku,
          description,
          category,
          unit,
          bulkQuantity: bulkQuantity,
          bulkPrice: bulkPrice,
          purchaseCurrencyId: currency.id,
          supplier,
        };

        try {
          await materialsApi.create(materialData);
          successCount++;
        } catch (apiErr: any) {
          const msg = apiErr?.message || JSON.stringify(apiErr) || 'API error';
          failures.push({ rowNumber, name, reason: `API error: ${msg}`, originalRow: row });
        }
      } catch (err: any) {
        failures.push({ rowNumber, name: '', reason: `Unexpected error: ${err?.message || String(err)}`, originalRow: importPreview[i] });
      }
    }

    setImporting(false);
    setImportFailures(failures);

    if (successCount > 0) await loadData();
  }



  function handleSelectAll() {
    if (selectedMaterials.size === filteredMaterials.length && filteredMaterials.length > 0) {
      setSelectedMaterials(new Set());
    } else {
      setSelectedMaterials(new Set(filteredMaterials.map((m) => m.id)));
    }
  }

  function handleSelectMaterial(id: number) {
    const newSet = new Set(selectedMaterials);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedMaterials(newSet);
  }

  async function handleOpenDeleteModal() {
    if (selectedMaterials.size === 0) return;
    
    setLoadingUsageCheck(true);
    try {
      const result = await materialsApi.checkUsage(Array.from(selectedMaterials));
      setUsageData(result);
      setShowDeleteModal(true);
    } catch (error) {
      console.error('Error checking usage:', error);
      showToastMessage('Failed to check material usage', 'error');
    } finally {
      setLoadingUsageCheck(false);
    }
  }

  async function handleConfirmDelete() {
    if (!usageData) return;
    
    try {
      // Delete only materials that can be deleted
      await Promise.all(usageData.canDelete.map((id) => materialsApi.delete(id)));
      
      const deletedCount = usageData.canDelete.length;
      const skippedCount = usageData.inUse.length;
      
      if (skippedCount > 0) {
        showToastMessage(
          `Deleted ${deletedCount} material${deletedCount !== 1 ? 's' : ''}. ${skippedCount} skipped (in use in products).`,
          'success'
        );
      } else {
        showToastMessage(
          `Successfully deleted ${deletedCount} material${deletedCount !== 1 ? 's' : ''}`,
          'success'
        );
      }
      
      setSelectedMaterials(new Set());
      setShowDeleteModal(false);
      setUsageData(null);
      loadData();
    } catch (error) {
      console.error('Error deleting materials:', error);
      showToastMessage('Failed to delete materials', 'error');
    }
  }

  async function handleBulkCategoryChange() {
    if (!bulkCategoryValue || selectedMaterials.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedMaterials).map((id) =>
          materialsApi.update(id, {
            ...materials.find((m) => m.id === id),
            category: bulkCategoryValue,
          })
        )
      );
      
      showToastMessage(
        `Updated category for ${selectedMaterials.size} material${selectedMaterials.size !== 1 ? 's' : ''}`,
        'success'
      );
      
      setShowCategoryModal(false);
      setBulkCategoryValue('');
      loadData();
    } catch (error) {
      console.error('Error updating category:', error);
      showToastMessage('Failed to update category', 'error');
    }
  }

  function handleBulkExport() {
    if (selectedMaterials.size === 0) return;
    
    const selectedMatList = filteredMaterials.filter((m) => selectedMaterials.has(m.id));
    const exportData = selectedMatList.map((material) => ({
      'Material Name': material.name,
      'SKU': material.sku || '',
      'Category': material.category,
      'Unit': material.unit,
      'Bulk Quantity': parseFloat(material.bulkQuantity).toFixed(2),
      'Bulk Price': parseFloat(material.bulkPrice).toFixed(2),
      'Currency': material.purchaseCurrencyCode,
      'Unit Cost': parseFloat(material.unitPrice).toFixed(2),
      'Supplier': material.supplier,
      'Description': material.description || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const columnWidths = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 30 },
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Materials_Selected_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    showToastMessage(`Exported ${selectedMaterials.size} material${selectedMaterials.size !== 1 ? 's' : ''} to Excel`, 'success');
  }

  function handleExportFilteredMaterialsExcel() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to export', 'error');
      return;
    }

    const exportData = filteredMaterials.map((material) => ({
      'Material Name': material.name,
      'SKU': material.sku || '',
      'Category': material.category,
      'Unit': material.unit,
      'Bulk Quantity': parseFloat(material.bulkQuantity).toFixed(2),
      'Bulk Price': parseFloat(material.bulkPrice).toFixed(2),
      'Currency': material.purchaseCurrencyCode,
      'Unit Cost': parseFloat(material.unitPrice).toFixed(2),
      'Supplier': material.supplier,
      'Status': material.isActive ? 'Active' : 'Inactive',
      'Description': material.description || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');

    const date = new Date().toISOString().split('T')[0];
    const filename = `PriceRight_Materials_Filtered_${date}.xlsx`;
    XLSX.writeFile(workbook, filename);

    showToastMessage(`Exported ${filteredMaterials.length} filtered material${filteredMaterials.length !== 1 ? 's' : ''} to Excel`, 'success');
  }

  function escapeCsvCell(value: unknown) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
    const csv = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportFilteredMaterialsCsv() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to export', 'error');
      return;
    }

    const rows = filteredMaterials.map((material) => [
      material.name,
      material.sku || '-',
      material.category,
      material.unit,
      Number(material.bulkQuantity || 0).toFixed(2),
      Number(material.bulkPrice || 0).toFixed(2),
      material.purchaseCurrencyCode,
      Number(material.unitPrice || 0).toFixed(2),
      material.supplier,
      material.isActive ? 'Active' : 'Inactive',
    ]);

    downloadCsv(
      `materials-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Material Name', 'SKU', 'Category', 'Unit', 'Bulk Quantity', 'Bulk Price', 'Currency', 'Unit Cost', 'Supplier', 'Status'],
      rows
    );

    showToastMessage(`Exported ${filteredMaterials.length} filtered material${filteredMaterials.length !== 1 ? 's' : ''} to CSV`, 'success');
  }

  function handlePrintFilteredMaterials() {
    if (filteredMaterials.length === 0) {
      showToastMessage('No materials to print', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredMaterials
      .map(
        (material) => `
          <tr>
            <td>${material.name}</td>
            <td>${material.sku || '-'}</td>
            <td>${material.category}</td>
            <td>${material.unit}</td>
            <td style="text-align:right;">${Number(material.bulkQuantity || 0).toFixed(2)}</td>
            <td style="text-align:right;">${Number(material.bulkPrice || 0).toFixed(2)}</td>
            <td>${material.purchaseCurrencyCode}</td>
            <td style="text-align:right;">${Number(material.unitPrice || 0).toFixed(2)}</td>
            <td>${material.supplier}</td>
            <td>${material.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Raw Materials Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .meta { margin-bottom: 12px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Raw Materials Report</h1>
          <div class="meta">Generated ${new Date().toLocaleString()} • ${filteredMaterials.length} record(s)</div>
          <table>
            <thead>
              <tr>
                <th>Material</th><th>SKU</th><th>Category</th><th>Unit</th><th>Bulk Qty</th><th>Bulk Price</th><th>Currency</th><th>Unit Cost</th><th>Supplier</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }

  function showToastMessage(message: string, type: 'success' | 'error') {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }

  async function handleViewPriceHistory(material: Material) {
    setSelectedMaterialForHistory(material);
    setShowPriceHistory(true);
    setLoadingHistory(true);
    
    try {
      const history = await materialsApi.getPriceHistory(material.id);
      setPriceHistory(history);
    } catch (error) {
      console.error('Error loading price history:', error);
      alert('Failed to load price history');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleDelete(id: number) {
    if (window.confirm('Are you sure you want to delete this material?')) {
      try {
        await materialsApi.delete(id);
        loadData();
        showToastMessage('Material deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting material:', error);
        showToastMessage('Failed to delete material', 'error');
      }
    }
  }

  async function handleDuplicate(material: Material) {
    try {
      const existingNames = new Set(materials.map((item) => (item.name || '').trim().toLowerCase()));
      const duplicatedName = buildDuplicateName(material.name, existingNames);
      const duplicatedSku = material.sku ? `${material.sku}-COPY` : '';

      await materialsApi.create({
        name: duplicatedName,
        sku: duplicatedSku,
        description: material.description || '',
        category: material.category,
        unit: material.unit,
        bulkQuantity: parseFloat(material.bulkQuantity),
        bulkPrice: parseFloat(material.bulkPrice),
        purchaseCurrencyId: material.purchaseCurrencyId,
        supplier: material.supplier,
      });

      await loadData();
      showToastMessage(`Duplicated material: ${duplicatedName}`, 'success');
    } catch (error: any) {
      console.error('Error duplicating material:', error);
      showToastMessage(error?.message || 'Failed to duplicate material', 'error');
    }
  }

  function handleEdit(material: Material) {
    setEditingMaterial(material);
    setFormData({
      name: material.name,
      sku: material.sku || '',
      description: material.description || '',
      category: material.category,
      unit: material.unit,
      bulkQuantity: material.bulkQuantity,
      bulkPrice: material.bulkPrice,
      purchaseCurrencyId: material.purchaseCurrencyId,
      supplier: material.supplier,
    });
    setShowAddModal(true);
  }

  function resetForm() {
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '',
      unit: 'kg',
      bulkQuantity: '',
      bulkPrice: '',
      purchaseCurrencyId: currencies[0]?.id || 0,
      supplier: '',
    });
  }

  // When filters change, update selection (deselect materials not in filtered list)
  useEffect(() => {
    const validIds = new Set(filteredMaterials.map((m) => m.id));
    const newSelected = new Set(
      Array.from(selectedMaterials).filter((id) => validIds.has(id))
    );
    setSelectedMaterials(newSelected);
  }, [searchTerm, selectedCategory, selectedStatus]);

  const materialCategories = useMemo(() => {
    const observed = materials
      .map((m) => (m.category || '').trim())
      .filter((category) => category.length > 0);
    return Array.from(new Set([...configuredMaterialCategories, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredMaterialCategories, materials]);

  const materialUnits = useMemo(() => {
    const observed = materials
      .map((m) => (m.unit || '').trim())
      .filter((unit) => unit.length > 0);
    return Array.from(new Set([...configuredMaterialUnits, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [configuredMaterialUnits, materials]);

  const filteredMaterials = useMemo(() => {
    return materials
      .filter((material) => {
        const matchesSearch =
          searchTerm === '' ||
          material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          material.supplier.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesCategory = selectedCategory === 'All Categories' || material.category === selectedCategory;
        const matchesStatus =
          selectedStatus === 'All Status' ||
          (selectedStatus === 'Active' && material.isActive) ||
          (selectedStatus === 'Inactive' && !material.isActive);

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        let aValue: any = a[sortField as keyof Material];
        let bValue: any = b[sortField as keyof Material];

        if (sortField === 'unitPrice' || sortField === 'bulkPrice' || sortField === 'bulkQuantity') {
          aValue = parseFloat(aValue as string);
          bValue = parseFloat(bValue as string);
        }

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [materials, searchTerm, selectedCategory, selectedStatus, sortField, sortOrder]);

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <div className="app-breadcrumb">
            <span>Home</span>
            <span>›</span>
            <span className="app-breadcrumb-current">Raw Materials</span>
          </div>
          <div className="app-header-row">
            <div>
              <h1 className="app-page-title">Raw Materials</h1>
              <p className="app-page-subtitle">Manage your raw materials and bulk pricing</p>
            </div>
          </div>
        </div>
        <div className="app-page-content" style={{ gap: '20px' }}>
          <div className="app-card app-loading-state">
            <div className="app-loading-title">Loading materials...</div>
          </div>
        </div>
      </div>
    );
  }

  const visibleInSelected = Array.from(selectedMaterials).filter((id) => 
    filteredMaterials.some((m) => m.id === id)
  ).length;

  return (
    <div className="app-page">
      {/* Toast Notification */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: toastType === 'success' ? '#d1fae5' : '#fee2e2',
            color: toastType === 'success' ? '#065f46' : '#991b1b',
            padding: '16px 24px',
            borderRadius: '8px',
            fontWeight: '600',
            zIndex: 2000,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="app-page-header">
        <div className="app-breadcrumb">
          <span>Home</span>
          <span>›</span>
          <span className="app-breadcrumb-current">Raw Materials</span>
        </div>
        <div className="app-header-row">
          <div>
            <h1 className="app-page-title">Raw Materials</h1>
            <p className="app-page-subtitle">Manage your raw materials and bulk pricing</p>
          </div>
          <div className="app-header-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingMaterial(null);
                resetForm();
                setShowAddModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} strokeWidth={2.2} />
              Add Material
            </button>
            <button
              className="btn btn-success"
              onClick={() => setShowImportModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileUp size={16} strokeWidth={2.2} />
              Import
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportFilteredMaterialsCsv}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileSpreadsheet size={16} strokeWidth={2.2} />
              Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={handlePrintFilteredMaterials}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Printer size={16} strokeWidth={2.2} />
              Print
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportFilteredMaterialsExcel}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileSpreadsheet size={16} strokeWidth={2.2} />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="app-page-content" style={{ gap: '20px' }}>
        <div className="app-card app-filter-card">
          <div className="app-filter-row">
            <div className="app-filter-search">
              <input
                className="app-control"
                type="text"
                placeholder="Search materials..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="app-control app-filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option>All Categories</option>
              {materialCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              className="app-control app-filter-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ArrowUpDown size={14} strokeWidth={2} />
                Sort
              </button>

              {showSortMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    minWidth: '200px',
                  }}
                >
                  <div style={{ padding: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', padding: '8px', textTransform: 'uppercase' }}>
                      Sort By
                    </div>
                    {[
                      { label: 'Name (A-Z)', field: 'name', order: 'asc' as const },
                      { label: 'Name (Z-A)', field: 'name', order: 'desc' as const },
                      { label: 'Category (A-Z)', field: 'category', order: 'asc' as const },
                      { label: 'Unit Price (Low-High)', field: 'unitPrice', order: 'asc' as const },
                    ].map((option) => (
                      <button
                        key={`${option.field}-${option.order}`}
                        onClick={() => {
                          setSortField(option.field);
                          setSortOrder(option.order);
                          setShowSortMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          textAlign: 'left',
                          border: 'none',
                          backgroundColor: sortField === option.field && sortOrder === option.order ? '#eff6ff' : 'transparent',
                          color: sortField === option.field && sortOrder === option.order ? '#3b82f6' : '#1a202c',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedMaterials.size > 0 && (
          <div className="app-bulk-bar">
            <div className="app-bulk-count-wrap">
              <span className="app-bulk-count">
                {visibleInSelected} of {materials.length} material{materials.length !== 1 ? 's' : ''} selected
              </span>
            </div>
            <button
              onClick={handleOpenDeleteModal}
              disabled={loadingUsageCheck}
              className="btn btn-danger"
              style={{ cursor: loadingUsageCheck ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {loadingUsageCheck ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</> : <><Trash2 size={14} strokeWidth={2} /> Delete</>}
            </button>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Tags size={14} strokeWidth={2} />
              Change Category
            </button>
            <button
              onClick={handleBulkExport}
              className="btn btn-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} strokeWidth={2} />
              Export Excel
            </button>
            <button
              onClick={() => setSelectedMaterials(new Set())}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <X size={14} strokeWidth={2} />
              Clear
            </button>
          </div>
        )}

        {/* Materials Table */}
        <div className="app-card app-data-card">
          <h2>
            Materials ({filteredMaterials.length})
          </h2>

          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '13px', color: '#475569', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.size === filteredMaterials.length && filteredMaterials.length > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedMaterials.size > 0 && selectedMaterials.size < filteredMaterials.length;
                      }}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', display: 'inline-block' }}
                    />
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', fontSize: '14px', width: '48px' }}>#</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Material</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Unit Cost</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Bulk Pricing</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Supplier</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material, idx) => (
                  <tr key={material.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedMaterials.has(material.id)}
                        onChange={() => handleSelectMaterial(material.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '16px', width: '48px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: '16px' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{material.name}</div>
                        {material.sku && (
                          <div style={{ fontSize: '12px', color: '#64748b' }}>SKU: {material.sku}</div>
                        )}
                        {material.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {material.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                        }}
                      >
                        {material.category}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div className="money-value" style={{ fontWeight: '600', fontSize: '16px' }}>
                        {material.baseCurrencySymbol}
                        {parseFloat(material.unitPrice).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>per {material.unit}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div className="money-value" style={{ fontSize: '14px', fontWeight: '600' }}>
                        {material.purchaseCurrencySymbol}
                        {parseFloat(material.bulkPrice).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        for {parseFloat(material.bulkQuantity).toFixed(2)} {material.unit}
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px' }}>{material.supplier}</td>
                    <td style={{ padding: '16px' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: material.isActive ? '#d1fae5' : '#fee2e2',
                          color: material.isActive ? '#065f46' : '#991b1b',
                        }}
                      >
                        {material.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleViewPriceHistory(material)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#f0fdf4',
                            color: '#166534',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <History size={13} strokeWidth={2} />
                          History
                        </button>
                        <button
                          onClick={() => handleEdit(material)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#eff6ff',
                            color: '#3b82f6',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Pencil size={13} strokeWidth={2} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(material)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#ecfeff',
                            color: '#0f766e',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Copy size={13} strokeWidth={2} />
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDelete(material.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Trash2 size={13} strokeWidth={2} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMaterials.length === 0 && (
              <div className="app-empty-state">
                No materials found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Material Modal */}
      {showAddModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">
              {editingMaterial ? 'Edit Material' : 'Add New Material'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label className="app-settings-label">
                    Material Name *
                  </label>
                  <input
                    className="app-control"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      SKU
                    </label>
                    <input
                      className="app-control"
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Category *
                    </label>
                    <input
                      className="app-control"
                      required
                      list="material-category-options"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Type or select category"
                      style={{ width: '100%' }}
                    />
                    <datalist id="material-category-options">
                      {materialCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="app-settings-label">
                    Description
                  </label>
                  <textarea
                    className="app-control"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ width: '100%', minHeight: '60px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      Unit of Measurement *
                    </label>
                    <input
                      className="app-control"
                      required
                      list="material-unit-options"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="Type or select unit"
                      style={{ width: '100%' }}
                    />
                    <datalist id="material-unit-options">
                      {materialUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Bulk Quantity *
                    </label>
                    <input
                      className="app-control"
                      type="number"
                      required
                      step="0.01"
                      value={formData.bulkQuantity}
                      onChange={(e) => setFormData({ ...formData, bulkQuantity: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label className="app-settings-label">
                      Bulk Price *
                    </label>
                    <input
                      className="app-control"
                      type="number"
                      required
                      step="0.01"
                      value={formData.bulkPrice}
                      onChange={(e) => setFormData({ ...formData, bulkPrice: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="app-settings-label">
                      Currency *
                    </label>
                    <select
                      className="app-control"
                      required
                      value={formData.purchaseCurrencyId}
                      onChange={(e) => setFormData({ ...formData, purchaseCurrencyId: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    >
                      {currencies.map((currency) => (
                        <option key={currency.id} value={currency.id}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="app-settings-label">
                    Supplier *
                  </label>
                  <input
                    className="app-control"
                    type="text"
                    required
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="app-modal-actions" style={{ marginTop: '24px' }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingMaterial(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                >
                  {editingMaterial ? 'Update Material' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">
              Import Materials from CSV/Excel
            </h2>

            {!importFile ? (
              <div>
                <label
                  htmlFor="file-upload"
                  style={{
                    display: 'block',
                    padding: '40px',
                    border: '2px dashed #cbd5e1',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><FileUp size={42} strokeWidth={1.8} /></div>
                  <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                    Click to upload CSV or Excel file
                  </div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    Supports .csv, .xlsx, .xls files
                  </div>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <button
                    onClick={handleDownloadTemplate}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ArrowDownToLine size={15} strokeWidth={2} />
                    Download Template
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                  <strong>File:</strong> {importFile.name} ({importPreview.length} rows)
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportFile(null);
                      setImportPreview([]);
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: 'white',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Choose Different File
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || importPreview.length === 0}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      backgroundColor: importing ? '#94a3b8' : '#10b981',
                      color: 'white',
                      fontWeight: '600',
                      border: 'none',
                      cursor: importing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {importing ? 'Importing...' : `Import ${importPreview.length} Materials`}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportPreview([]);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && usageData && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Delete {selectedMaterials.size} Material{selectedMaterials.size !== 1 ? 's' : ''}?
            </h2>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>
              Materials used in product BOMs cannot be deleted.
            </p>

            {usageData.inUse.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} strokeWidth={2} />
                  {usageData.inUse.length} material{usageData.inUse.length !== 1 ? 's' : ''} cannot be deleted
                </div>
                <div style={{ fontSize: '14px', color: '#78350f', maxHeight: '200px', overflowY: 'auto' }}>
                  {usageData.inUse.map((item) => (
                    <div key={item.materialId} style={{ marginBottom: '8px' }}>
                      <strong>{item.materialName}</strong>
                      <div style={{ fontSize: '12px', marginLeft: '8px', marginTop: '4px' }}>
                        Used in {item.productCount} product{item.productCount !== 1 ? 's' : ''}:
                        {item.products.slice(0, 3).map((p, idx) => (
                          <div key={idx}>• {p}</div>
                        ))}
                        {item.products.length > 3 && <div>+ {item.products.length - 3} more</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {usageData.canDelete.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
                <div style={{ fontWeight: '600', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} strokeWidth={2} />
                  {usageData.canDelete.length} material{usageData.canDelete.length !== 1 ? 's' : ''} can be deleted
                </div>
              </div>
            )}

            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={usageData.canDelete.length === 0}
                style={{
                  backgroundColor: usageData.canDelete.length === 0 ? '#94a3b8' : '#dc2626',
                  cursor: usageData.canDelete.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {usageData.canDelete.length === 0 ? 'Cannot Delete' : `Delete ${usageData.canDelete.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Category Change Modal */}
      {showCategoryModal && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal"
            style={{ maxWidth: '500px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title">
              Change Category for {selectedMaterials.size} Material{selectedMaterials.size !== 1 ? 's' : ''}
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label className="app-settings-label" style={{ marginBottom: '8px' }}>
                Select New Category *
              </label>
              <input
                className="app-control"
                list="material-bulk-category-options"
                value={bulkCategoryValue}
                onChange={(e) => setBulkCategoryValue(e.target.value)}
                placeholder="Type or select category"
                style={{ width: '100%' }}
              />
              <datalist id="material-bulk-category-options">
                {materialCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="app-modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCategoryModal(false);
                  setBulkCategoryValue('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBulkCategoryChange}
                disabled={!bulkCategoryValue}
                style={{
                  backgroundColor: bulkCategoryValue ? '#3b82f6' : '#94a3b8',
                  cursor: bulkCategoryValue ? 'pointer' : 'not-allowed',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {showPriceHistory && selectedMaterialForHistory && (
        <div
          className="app-modal-overlay"
        >
          <div
            className="app-modal app-modal-wide"
            style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app-modal-title" style={{ marginBottom: '8px' }}>
              Price History: {selectedMaterialForHistory.name}
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Track all price changes for this material
            </p>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                Loading price history...
              </div>
            ) : priceHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No price history available for this material.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Purchase Price</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Base Currency</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry, index) => {
                      const previousEntry = priceHistory[index + 1];
                      const priceChange = previousEntry
                        ? ((parseFloat(entry.priceInBaseCurrency) - parseFloat(previousEntry.priceInBaseCurrency)) /
                          parseFloat(previousEntry.priceInBaseCurrency) * 100)
                        : 0;
                      const isIncrease = priceChange > 0;
                      const isDecrease = priceChange < 0;

                      return (
                        <tr key={entry.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px', fontSize: '14px' }}>
                            {new Date(entry.changedAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                            {entry.currencySymbol}{parseFloat(entry.priceInPurchaseCurrency).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                            {selectedMaterialForHistory.baseCurrencySymbol}{parseFloat(entry.priceInBaseCurrency).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px' }}>
                            {index === priceHistory.length - 1 ? (
                              <span style={{ color: '#64748b', fontSize: '12px' }}>Initial</span>
                            ) : (
                              <span
                                style={{
                                  color: isIncrease ? '#dc2626' : isDecrease ? '#16a34a' : '#64748b',
                                  fontWeight: '600',
                                }}
                              >
                                {isIncrease ? '↑' : isDecrease ? '↓' : '−'} {Math.abs(priceChange).toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => {
                  setShowPriceHistory(false);
                  setSelectedMaterialForHistory(null);
                  setPriceHistory([]);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
