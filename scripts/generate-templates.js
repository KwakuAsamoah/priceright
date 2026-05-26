const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUTPUT_DIR = path.join(__dirname, '..', 'client', 'public', 'templates');

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const TEMPLATES = [
  // -------------------------------------------------------------------------
  // MATERIALS
  // -------------------------------------------------------------------------
  {
    filename: 'PriceRight_Materials_Import_Template.xlsx',
    instructions: [
      'PriceRight — Materials Import Template',
      '',
      'HOW TO USE THIS TEMPLATE',
      '',
      'STEPS:',
      '1. Click the "Import Data" tab at the bottom of this file',
      '2. Review the sample rows to understand the expected format',
      '3. Delete the sample data rows (rows 2 and below)',
      '   — Keep row 1 (the column headers) — do not delete or edit it',
      '4. Enter your real data starting from row 2',
      '5. Save the file (keep the .xlsx format)',
      '6. In PriceRight go to Materials → More → Import and select this file',
      '',
      'IMPORTANT NOTES:',
      '— Do not rename or delete any column headers',
      '— Do not add extra columns',
      '— Leave optional fields blank if not needed',
      '— Currency codes must match currencies set up in PriceRight',
      '',
      'COLUMN GUIDE:',
      '',
      '  Material Name — Required',
      '    The full name of the raw material as it will appear in PriceRight',
      '    Example: Cocoa Beans (Dried)',
      '',
      '  SKU — Optional',
      '    Your internal stock keeping unit or product code',
      '    Example: RM-001',
      '',
      '  Category — Required',
      '    The material category. Must match a category in PriceRight',
      '    or a new one will be created automatically',
      '    Example: Cocoa',
      '',
      '  Unit — Required',
      '    Unit of measure for this material',
      '    Example: Kg   L   Ea   m   g',
      '',
      '  Supplier — Optional',
      '    Name of the supplier for this material',
      '    Example: Agro Distributors Ltd',
      '',
      '  Bulk Price — Required',
      '    The price paid for the bulk quantity below',
      '    Example: 562.50',
      '',
      '  Bulk Quantity — Required',
      '    The quantity the bulk price applies to',
      '    Example: 25  (meaning GHS 562.50 for 25 Kg)',
      '',
      '  Currency Code — Required',
      '    The currency of purchase. Must be set up in PriceRight first',
      '    Example: GHS   USD   EUR',
      '',
      '  Description — Optional',
      '    Any additional notes about this material',
      '    Example: Premium grade sun-dried cocoa beans',
      '',
      'SAMPLE DATA:',
      'The Import Data sheet contains sample rows showing the correct format.',
      'Delete them before importing.',
    ],
    headers: [
      'Material Name',
      'SKU',
      'Category',
      'Unit',
      'Supplier',
      'Bulk Price',
      'Bulk Quantity',
      'Currency Code',
      'Description',
    ],
    sampleRows: [
      [
        'Cocoa Beans (Dried)', 'RM-001', 'Cocoa', 'Kg',
        'Agro Distributors Ltd', 562.50, 25, 'GHS',
        'Premium grade sun-dried cocoa beans',
      ],
      [
        'Palm Oil (Crude)', 'RM-002', 'Oils & Fats', 'L',
        'West Africa Oils', 187.50, 25, 'GHS',
        'Refined palm oil for food production',
      ],
      [
        'Packaging Film (Roll)', 'RM-003', 'Packaging', 'm',
        'PackRight Ltd', 850.00, 1, 'GHS',
        '100m roll of clear heat-seal packaging film',
      ],
    ],
  },

  // -------------------------------------------------------------------------
  // INTERMEDIATES
  // -------------------------------------------------------------------------
  {
    filename: 'PriceRight_Intermediates_Import_Template.xlsx',
    instructions: [
      'PriceRight — Intermediate Materials Import Template',
      '',
      'HOW TO USE THIS TEMPLATE',
      '',
      'STEPS:',
      '1. Click the "Import Data" tab at the bottom of this file',
      '2. Review the sample rows to understand the expected format',
      '3. Delete the sample data rows (rows 2 and below)',
      '   — Keep row 1 (the column headers) — do not delete or edit it',
      '4. Enter your real data starting from row 2',
      '5. Save the file (keep the .xlsx format)',
      '6. In PriceRight go to Materials → Intermediate tab → More → Import',
      '   and select this file',
      '',
      'NOTE: Each intermediate material can have multiple components.',
      'Add one row per component. Repeat the Intermediate Name,',
      'Category, Unit and settings on each row for the same material.',
      '',
      'IMPORTANT NOTES:',
      '— Do not rename or delete any column headers',
      '— Do not add extra columns',
      '— Leave optional fields blank if not needed',
      '— Currency codes must match currencies set up in PriceRight',
      '',
      'COLUMN GUIDE:',
      '',
      '  Intermediate Name — Required',
      '    Name of the intermediate (semi-processed) material',
      '    Example: Refined Peanut Paste',
      '',
      '  Category — Required',
      '    Material category',
      '    Example: Processed',
      '',
      '  Unit — Required',
      '    Unit of the finished intermediate material',
      '    Example: Kg',
      '',
      '  Overhead % — Optional (default: 0)',
      '    Overhead cost as a percentage of material cost',
      '    Example: 10  (means 10% overhead added to batch cost)',
      '',
      '  Yield % — Optional (default: 100)',
      '    Expected output as a percentage of input',
      '    Example: 85  (means 15% loss during processing)',
      '',
      '  Margin % — Optional (default: 0)',
      '    Profit margin percentage to add to cost per unit',
      '    Example: 0',
      '',
      '  Bulk Quantity — Optional (default: 1)',
      '    The batch output quantity this recipe produces',
      '    Example: 20  (this recipe produces 20 Kg per batch)',
      '',
      '  Component Name — Required',
      '    Name of a raw material used in this batch',
      '    Must already exist in PriceRight as a primary material',
      '    Example: Raw Peanuts',
      '',
      '  Component Quantity — Required',
      '    Quantity of this component used per batch',
      '    Example: 25  (25 Kg of Raw Peanuts per batch)',
      '',
      '  Notes — Optional',
      '    Any additional notes',
      '    Example: Yield-based processing',
      '',
      'SAMPLE DATA:',
      'The Import Data sheet contains sample rows showing the correct format.',
      'Delete them before importing.',
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
      'Notes',
    ],
    sampleRows: [
      [
        'Refined Peanut Paste', 'Processed', 'Kg',
        10, 85, 0, 20,
        'Raw Peanuts', 25,
        'First component — main ingredient',
      ],
      [
        'Refined Peanut Paste', 'Processed', 'Kg',
        10, 85, 0, 20,
        'Salt (Iodised)', 0.5,
        'Second component — same intermediate',
      ],
      [
        'Blended Pepper Mix', 'Processed Seasonings', 'Kg',
        12, 100, 0, 10,
        'Pepper (Ground Chilli)', 7,
        'Third row — different intermediate',
      ],
      [
        'Blended Pepper Mix', 'Processed Seasonings', 'Kg',
        12, 100, 0, 10,
        'Garlic Powder', 1.5,
        'Fourth row — second component',
      ],
    ],
  },

  // -------------------------------------------------------------------------
  // PRODUCTS
  // -------------------------------------------------------------------------
  {
    filename: 'PriceRight_Products_Import_Template.xlsx',
    instructions: [
      'PriceRight — Products Import Template',
      '',
      'HOW TO USE THIS TEMPLATE',
      '',
      'STEPS:',
      '1. Click the "Import Data" tab at the bottom of this file',
      '2. Review the sample rows to understand the expected format',
      '3. Delete the sample data rows (rows 2 and below)',
      '   — Keep row 1 (the column headers) — do not delete or edit it',
      '4. Enter your real data starting from row 2',
      '5. Save the file (keep the .xlsx format)',
      '6. In PriceRight go to Products → More → Import and select this file',
      '',
      'NOTE: Each product can have multiple BOM lines.',
      'Add one row per material. Repeat the Product Name,',
      'SKU, Category and settings on each row for the same product.',
      'Import all materials (primary and intermediate) before importing products.',
      '',
      'IMPORTANT NOTES:',
      '— Do not rename or delete any column headers',
      '— Do not add extra columns',
      '— Leave optional fields blank if not needed',
      '— Currency codes must match currencies set up in PriceRight',
      '',
      'COLUMN GUIDE:',
      '',
      '  Product Name — Required',
      '    Full name of the finished product',
      '    Example: Peanut Butter 250g',
      '',
      '  SKU — Optional',
      '    Product code or barcode reference',
      '    Example: PB-250',
      '',
      '  Category — Required',
      '    Product category',
      '    Example: Spreads',
      '',
      '  Unit — Optional',
      '    Unit of sale',
      '    Example: Ea  Kg  L',
      '',
      '  Batch Size — Optional',
      '    Number of units produced per production run',
      '    Example: 500  (500 units per batch)',
      '',
      '  Overhead % — Optional (default: 0)',
      '    Production overhead as a percentage',
      '    Example: 20',
      '',
      '  Profit on Cost % — Optional',
      '    Target profit margin on cost',
      '    Example: 25  (means 25% profit on cost)',
      '',
      '  Material Name — Required',
      '    Name of a material used in the product BOM',
      '    Must already exist in PriceRight',
      '    Example: Refined Peanut Paste',
      '',
      '  Material Quantity — Required',
      '    Quantity of material per batch',
      '    Example: 130  (130 Kg per batch of 500 units)',
      '',
      '  Material Type — Optional',
      '    primary or intermediate',
      '    Example: intermediate',
      '',
      '  Notes — Optional',
      '    Additional notes',
      '    Example: Main ingredient',
      '',
      'SAMPLE DATA:',
      'The Import Data sheet contains sample rows showing the correct format.',
      'Delete them before importing.',
    ],
    headers: [
      'Product Name',
      'SKU',
      'Category',
      'Unit',
      'Batch Size',
      'Overhead %',
      'Profit on Cost %',
      'Material Name',
      'Material Quantity',
      'Material Type',
      'Notes',
    ],
    sampleRows: [
      [
        'Peanut Butter 250g', 'PB-250', 'Spreads', 'Ea',
        500, 20, 25,
        'Refined Peanut Paste', 130,
        'intermediate', 'Main ingredient',
      ],
      [
        'Peanut Butter 250g', 'PB-250', 'Spreads', 'Ea',
        500, 20, 25,
        'Packaging Film (Roll)', 135,
        'primary', 'Packaging — 0.27m per unit',
      ],
      [
        'Blended Spice Mix 100g', 'BSM-100', 'Seasonings', 'Ea',
        800, 20, 30,
        'Blended Pepper Mix', 20,
        'intermediate', 'Main spice blend',
      ],
      [
        'Blended Spice Mix 100g', 'BSM-100', 'Seasonings', 'Ea',
        800, 20, 30,
        'Sachet Film 100g', 800,
        'primary', 'Packaging sachet',
      ],
    ],
  },
];

// ---------------------------------------------------------------------------
// Build workbook
// ---------------------------------------------------------------------------

function buildWorkbook(template) {
  // Instructions sheet — one row per string
  const instructionsRows = template.instructions.map((line) => [line]);
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows);
  instructionsSheet['!cols'] = [{ wch: 100 }];

  // Import Data sheet — header row + sample data rows
  const dataRows = [template.headers, ...template.sampleRows];
  const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);
  dataSheet['!cols'] = template.headers.map((header) => ({
    wch: Math.max(header.length + 4, 18),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Import Data');
  return workbook;
}

// ---------------------------------------------------------------------------
// Generate files
// ---------------------------------------------------------------------------

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const template of TEMPLATES) {
  const workbook = buildWorkbook(template);
  const outputPath = path.join(OUTPUT_DIR, template.filename);
  XLSX.writeFile(workbook, outputPath);
  console.log(`Wrote ${outputPath}`);
}

// Remove any old CSV templates that may still be present
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
