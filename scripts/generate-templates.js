const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUTPUT_DIR = path.join(__dirname, '..', 'client', 'public', 'templates');

const TEMPLATES = [
  {
    filename: 'PriceRight_Materials_Import_Template.xlsx',
    instructions: [
      'Primary Materials Import Template',
      '',
      'Fill in your materials on the Import Data sheet.',
      'Each row is one material.',
      '',
      'Required columns: Material Name, Category, Unit, Bulk Price, Bulk Quantity.',
      'Optional columns: Purchase Currency (defaults to base currency GHS), Supplier Type (Local or Foreign).',
      '',
      'Currency Code must match a currency configured in PriceRight Settings (GHS, USD, EUR, etc.).',
      'Leave Purchase Currency blank to use the base currency (GHS).',
      '',
      'After filling in the template, save as CSV (File → Save As → CSV UTF-8) and upload in the import dialog.',
    ],
    headers: [
      'Material Name',
      'Category',
      'Unit',
      'Purchase Currency',
      'Bulk Price',
      'Bulk Quantity',
      'Supplier Type',
    ],
  },
  {
    filename: 'PriceRight_Intermediates_Import_Template.xlsx',
    instructions: [
      'Intermediate Materials Import Template',
      '',
      'Fill in your data on the Import Data sheet.',
      'One row per component material. Repeat Intermediate Name, Category, Unit, Overhead %, Yield %, Margin %, and Bulk Quantity on every row for the same intermediate.',
      '',
      'Component Name must match a raw material already in PriceRight.',
      'Leave Component Name blank for intermediates with no components yet.',
      '',
      'Overhead %: factory overhead added to material cost (e.g. 10 = 10%). Default 0.',
      'Yield %: usable output from the batch (e.g. 85 = 85%). Default 100.',
      'Margin %: profit margin on cost (e.g. 20 = 20%). Default 0.',
      'Bulk Quantity: units produced per batch. Default 1.',
    ],
    headers: [
      'Intermediate Name',
      'Category',
      'Unit',
      'Overhead %',
      'Yield %',
      'Margin %',
      'Bulk Quantity',
      'Component Name',
      'Component Quantity',
      'Component Unit',
    ],
  },
  {
    filename: 'PriceRight_Products_Import_Template.xlsx',
    instructions: [
      'Products + BOM Import Template',
      '',
      'Fill in your data on the Import Data sheet.',
      'One row per BOM line. Keep Product Name, Category, Production Mode, Batch Yield, Overhead %, Profit on Cost %, and SKU identical for every row of the same product.',
      '',
      'Product Name (required), Category, Production Mode (single or batch), Batch Yield, Overhead %, Profit on Cost %, SKU, Material Name (required), Quantity, Unit.',
      '',
      'Production Mode: single = 1 unit per run | batch = Batch Yield units per run.',
      'Overhead %: overhead applied to material cost (e.g. 15 = 15%). Defaults to 0 if blank.',
      'Profit on Cost %: profit margin on total cost, 0-99 (e.g. 25 = 25%). Required.',
      'SKU: optional product code.',
      'Unit column is informational only — the material unit is determined by the material record.',
      'Material Name must exactly match a raw material or intermediate already saved in PriceRight.',
    ],
    headers: [
      'Product Name',
      'Category',
      'Production Mode',
      'Batch Yield',
      'Overhead %',
      'Profit on Cost %',
      'SKU',
      'Material Name',
      'Quantity',
      'Unit',
    ],
  },
];

function buildWorkbook(template) {
  const instructionsRows = template.instructions.map((line) => [line]);
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows);
  instructionsSheet['!cols'] = [{ wch: 100 }];

  const dataSheet = XLSX.utils.aoa_to_sheet([template.headers]);
  dataSheet['!cols'] = template.headers.map((header) => ({ wch: Math.max(header.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Import Data');
  return workbook;
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const template of TEMPLATES) {
  const workbook = buildWorkbook(template);
  const outputPath = path.join(OUTPUT_DIR, template.filename);
  XLSX.writeFile(workbook, outputPath);
  console.log(`Wrote ${outputPath}`);
}

const REMOVE_FILES = [
  'materials-import-template.csv',
  'PriceRight_Intermediates_Import_Template.csv',
  'PriceRight_Products_Import_Template.csv',
];

for (const filename of REMOVE_FILES) {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed ${filePath}`);
  }
}

console.log('Template generation complete.');
