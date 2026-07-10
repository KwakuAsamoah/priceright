/**
 * seedDemo.ts
 * -----------
 * Populates the DEMO SQLite database (demo.db) with a fictitious bakery dataset.
 * This file is completely self-contained and NEVER touches the live priceright.db.
 *
 * Demo dataset â€” "Savanna Bakes":
 *   â€¢ 20 raw materials  (GHS base + USD imports)
 *   â€¢  8 intermediate materials (sub-assemblies with BOM)
 *   â€¢ 10 products (full BOM referencing materials + intermediates)
 *   â€¢  3 price levels (Standard Retail, Wholesale Clients, Export Partners)
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { calculateProductionCost, calculateIntermediateCostPerUnit } from './costFormula.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
// Fallback used only when running the dev server directly.
// In production Electron, db.ts always passes DEMO_DATABASE_FILE_PATH.
const defaultDemoDbPath = path.resolve(serverRoot, 'demo.db');

const USD_TO_GHS = 14.2500;

function priceForMarkupOnCost(productionCostPerUnit: number, markupOnCostPct: number): number {
  return Math.round(productionCostPerUnit * (1 + markupOnCostPct / 100) * 100) / 100;
}

type BomEntry = { r?: number; i?: number; qty: number };
type ProdDef = {
  name: string; sku: string; desc: string; cat: string;
  overhead: number; otherDirect: number;
  mode: 'single' | 'batch'; batchYield: number;
  approved: boolean;
  bom: BomEntry[];
};

function computeProductionCostPerUnit(
  pd: ProdDef,
  rawUP: (i: number) => number,
  intCost: (i: number) => number,
): number {
  let totalMaterialCost = 0;
  for (const entry of pd.bom) {
    const unitPrice = entry.i !== undefined ? intCost(entry.i) : rawUP(entry.r!);
    totalMaterialCost += unitPrice * entry.qty;
  }
  const { totalCost: materialsLaborOverheadTotal } = calculateProductionCost({
    materialCost: totalMaterialCost,
    laborCost: 0,
    overheadPercentage: pd.overhead,
  });
  const totalCost = materialsLaborOverheadTotal + pd.otherDirect;
  if (pd.mode === 'batch') {
    return totalCost / Math.max(1, pd.batchYield);
  }
  return totalCost;
}


// ─── Full schema for demo.db (always rebuilt fresh on seed) ─────────────────
const DEMO_SCHEMA_SQL = `
DROP TABLE IF EXISTS price_list_items;
DROP TABLE IF EXISTS price_lists;
DROP TABLE IF EXISTS price_level_pack_sizes;
DROP TABLE IF EXISTS price_level_items;
DROP TABLE IF EXISTS special_pricing;
DROP TABLE IF EXISTS bill_of_materials;
DROP TABLE IF EXISTS intermediate_material_bom;
DROP TABLE IF EXISTS material_price_history;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS materials;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS price_levels;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS currencies;
DROP TABLE IF EXISTS activity_log;

CREATE TABLE currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  rate_to_base REAL NOT NULL,
  effective_date INTEGER NOT NULL DEFAULT (unixepoch()),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  entity_name TEXT,
  performed_by TEXT,
  user_id INTEGER NOT NULL DEFAULT 1,
  user_name TEXT NOT NULL DEFAULT 'Admin',
  details TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  material_type TEXT NOT NULL DEFAULT 'primary',
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  bulk_quantity REAL NOT NULL,
  bulk_price REAL NOT NULL,
  purchase_currency_id INTEGER NOT NULL REFERENCES currencies(id),
  price_in_purchase_currency REAL NOT NULL,
  price_in_base_currency REAL NOT NULL,
  unit_price REAL NOT NULL,
  overhead_percentage REAL NOT NULL DEFAULT 0,
  labor_cost REAL NOT NULL DEFAULT 0,
  margin_percentage REAL NOT NULL DEFAULT 0,
  intermediate_cost_mode TEXT NOT NULL DEFAULT 'yield',
  yield_percentage REAL NOT NULL DEFAULT 100,
  calculated_cost_per_unit REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE material_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  purchase_currency_id INTEGER NOT NULL REFERENCES currencies(id),
  price_in_purchase_currency REAL NOT NULL,
  price_in_base_currency REAL NOT NULL,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE intermediate_material_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intermediate_material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  component_material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  category TEXT,
  overhead_percentage REAL NOT NULL,
  profit_margin REAL NOT NULL,
  labor_cost REAL NOT NULL DEFAULT 0,
  other_direct_costs REAL NOT NULL DEFAULT 0,
  production_mode TEXT DEFAULT 'single',
  batch_yield INTEGER DEFAULT 1,
  current_selling_price REAL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_price REAL,
  approved_by TEXT,
  approved_at INTEGER,
  approved_price_expires_at TEXT,
  price_expiry_notified_at TEXT,
  needs_review_reason TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE bill_of_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE price_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  adjustment_type TEXT NOT NULL DEFAULT 'discount',
  adjustment_percentage REAL NOT NULL DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_level_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_level_id INTEGER NOT NULL REFERENCES price_levels(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL DEFAULT 'rule_discount',
  adjustment_percentage REAL,
  custom_price REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at INTEGER,
  justification TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE price_level_pack_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_level_item_id INTEGER NOT NULL REFERENCES price_level_items(id) ON DELETE CASCADE,
  pack_quantity INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  allow_special_pricing INTEGER NOT NULL DEFAULT 0,
  price_level_id INTEGER NOT NULL REFERENCES price_levels(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE special_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price REAL NOT NULL,
  production_cost REAL,
  margin_impact_percentage REAL,
  old_margin_percentage REAL,
  override_type TEXT NOT NULL DEFAULT 'custom',
  discount_percentage REAL,
  markup_percentage REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at INTEGER,
  justification TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(customer_id, product_id)
);

CREATE TABLE price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  price_level_id INTEGER NOT NULL REFERENCES price_levels(id),
  valid_from INTEGER NOT NULL,
  valid_until INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  base_price REAL NOT NULL,
  discount_percentage REAL NOT NULL DEFAULT 0,
  final_price REAL NOT NULL,
  price_source TEXT NOT NULL DEFAULT 'base',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

// ─── Public API ──────────────────────────────────────────────────────────────

export async function seedDemoData(options?: { force?: boolean; dbPath?: string }) {
  const resolvedDbPath = options?.dbPath ?? defaultDemoDbPath;
  const db = new Database(resolvedDbPath);
  db.pragma('foreign_keys = OFF'); // disabled during DROP/CREATE sequence

  if (!options?.force) {
    try {
      const row = db.prepare('SELECT COUNT(*) AS cnt FROM price_levels').get() as { cnt: number } | undefined;
      if (Number(row?.cnt ?? 0) > 0) {
        console.log('[demo] Demo data already present — skipping seed');
        db.close();
        return;
      }
    } catch {
      // Tables may not exist yet; proceed to full seed.
    }
  }

  console.log('[demo] Seeding demo database ->', resolvedDbPath);

  db.exec(DEMO_SCHEMA_SQL);
  db.pragma('foreign_keys = ON');

  const now = Math.floor(Date.now() / 1000);

  // ── Prepared statements ──────────────────────────────────────────────────
  const insC = db.prepare('INSERT INTO currencies (code,name,symbol,is_active,created_at) VALUES (?,?,?,1,?)');
  const insR = db.prepare('INSERT INTO exchange_rates (currency_id,rate_to_base,effective_date,source,created_at) VALUES (?,?,?,?,?)');
  const insS = db.prepare('INSERT INTO settings (setting_key,setting_value,updated_at) VALUES (?,?,?)');
  const insMat = db.prepare(`
    INSERT INTO materials
      (name,sku,description,material_type,category,unit,
       bulk_quantity,bulk_price,purchase_currency_id,
       price_in_purchase_currency,price_in_base_currency,unit_price,
       overhead_percentage,margin_percentage,intermediate_cost_mode,yield_percentage,
       calculated_cost_per_unit,supplier,is_active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
  `);
  const insIBom = db.prepare('INSERT INTO intermediate_material_bom (intermediate_material_id,component_material_id,quantity,created_at) VALUES (?,?,?,?)');
  const insProd = db.prepare(`
    INSERT INTO products
      (name,sku,description,category,overhead_percentage,profit_margin,
       labor_cost,other_direct_costs,production_mode,batch_yield,current_selling_price,
       approval_status,approved_price,approved_by,approved_at,
       approved_price_expires_at,is_active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
  `);
  const insBom = db.prepare('INSERT INTO bill_of_materials (product_id,material_id,quantity,created_at) VALUES (?,?,?,?)');
  const insLevel = db.prepare('INSERT INTO price_levels (name,multiplier,adjustment_type,adjustment_percentage,description,is_active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)');
  const insLvlItem = db.prepare(`
    INSERT INTO price_level_items
      (price_level_id,product_id,override_type,adjustment_percentage,
       custom_price,status,approved_by,approved_at,justification,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insPackSize = db.prepare(
    'INSERT INTO price_level_pack_sizes (price_level_item_id, pack_quantity, created_at) VALUES (?,?,?)',
  );
  const insLog = db.prepare('INSERT INTO activity_log (action,entity_type,entity_id,entity_name,performed_by,user_id,user_name,details,created_at) VALUES (?,?,?,?,?,?,?,?,?)');

  const txn = db.transaction(() => {
    // ── Currencies ──────────────────────────────────────────────────────────
    const ghsId = Number(insC.run('GHS', 'Ghana Cedi', 'GH\u20B5', now).lastInsertRowid);
    const usdId = Number(insC.run('USD', 'US Dollar',  '$',       now).lastInsertRowid);

    insR.run(ghsId, 1.0,        now, 'seed', now);
    insR.run(usdId, USD_TO_GHS, now, 'seed', now);

    // ── Settings ────────────────────────────────────────────────────────────
    insS.run('baseCurrency',                'GHS',                now);
    insS.run('default_overhead_percentage', '25',                 now);
    insS.run('companyName',                 'Savanna Bakes Demo', now);

    // ────────────────────────────────────────────────────────────────────────
    // 20 RAW MATERIALS
    // Columns: name | sku | description | category | unit | bulkQty
    //          | bulkPrice(purchase currency) | currencyId | supplier
    // ────────────────────────────────────────────────────────────────────────
    type RawDef = readonly [string, string, string, string, string, number, number, number, string];
    const rawDefs: RawDef[] = [
      // ── Dry Goods ─────────────────────────────────────────────────────────
      ['All-Purpose Flour',       'MAT-001', 'Premium wheat flour, suitable for all baking',          'Dry Goods',     'kg',     50,  380, ghsId, 'Accra Millers Ltd'],
      ['Granulated Sugar',        'MAT-002', 'Fine white refined sugar',                              'Dry Goods',     'kg',     50,  540, ghsId, 'Ghana Sugar Co.'],
      ['Fine Salt',               'MAT-003', 'Iodised table salt',                                   'Dry Goods',     'kg',      5,   28, ghsId, 'Local Supplier GH'],
      ['Cornstarch',              'MAT-004', 'Food-grade cornflour, thickening agent',                'Dry Goods',     'kg',      5,   96, ghsId, 'Local Supplier GH'],
      // ── Additives ─────────────────────────────────────────────────────────
      ['Instant Dry Yeast',       'MAT-005', 'Fast-action baking yeast',                             'Additives',     'kg',      2,  180, ghsId, 'Bakers Corner GH'],
      ['Baking Powder',           'MAT-006', 'Double-acting baking powder',                          'Additives',     'kg',      5,  142, ghsId, 'Bakers Corner GH'],
      ['Food Grade Colours',      'MAT-007', 'Gel paste colours, assorted set',                      'Additives',     'kg',    0.5,   65, ghsId, 'Bakers Corner GH'],
      // ── Dairy ─────────────────────────────────────────────────────────────
      ['Unsalted Butter',         'MAT-008', 'Dairy butter blocks, 82% fat',                         'Dairy',         'kg',     25,  890, ghsId, 'Farm Fresh Dairy'],
      ['Full Cream Milk',         'MAT-009', 'Whole pasteurised milk',                               'Dairy',         'L',      20,  480, ghsId, 'Farm Fresh Dairy'],
      ['Heavy Cream',             'MAT-010', '36% fat cooking and whipping cream',                   'Dairy',         'L',      10,  560, ghsId, 'Farm Fresh Dairy'],
      ['Cream Cheese',            'MAT-011', 'Full-fat spreadable cream cheese',                     'Dairy',         'kg',      5,  420, ghsId, 'Farm Fresh Dairy'],
      // ── Protein ───────────────────────────────────────────────────────────
      ['Free-Range Eggs',         'MAT-012', 'Large graded eggs, 30-piece tray',                     'Protein',       'tray',    1,   55, ghsId, 'Poultry Plus GH'],
      // ── Flavoring ─────────────────────────────────────────────────────────
      ['Cocoa Powder',            'MAT-013', 'Dark unsweetened baking cocoa',                        'Flavoring',     'kg',     10,  650, ghsId, 'Cocoa Board GH'],
      ['Pure Vanilla Extract',    'MAT-014', 'Natural vanilla extract, imported',                    'Flavoring',     'L',       2,   28, usdId, 'Import Direct Ltd'],
      // ── Natural ───────────────────────────────────────────────────────────
      ['Raw Honey',               'MAT-015', 'Unprocessed forest honey, single-origin',              'Natural',       'kg',     10,  780, ghsId, 'Beekeepers Coop GH'],
      // ── Confectionery ─────────────────────────────────────────────────────
      ['Dark Chocolate Chips',    'MAT-016', '72% cacao baking chips, imported',                     'Confectionery', 'kg',      5,   42, usdId, 'Import Direct Ltd'],
      // ── Nuts ──────────────────────────────────────────────────────────────
      ['Blanched Almonds',        'MAT-017', 'Peeled whole almonds, imported',                       'Nuts',          'kg',      5,   35, usdId, 'Import Direct Ltd'],
      // ── Oils ──────────────────────────────────────────────────────────────
      ['Vegetable Oil',           'MAT-018', 'Refined sunflower oil',                                'Oils',          'L',      20,  460, ghsId, 'Nkulenu Oil Co.'],
      // ── Packaging ─────────────────────────────────────────────────────────
      ['Foil Bag 500g',           'MAT-019', 'Resealable foil-lined packaging bag',                  'Packaging',     'piece', 500,  280, ghsId, 'PackPro Ghana'],
      ['Printed Labels A-Series', 'MAT-020', 'Pre-printed adhesive product labels',                  'Packaging',     'piece',1000,  180, ghsId, 'PrintFast GH'],
    ];

    const rawIds: number[] = [];
    for (const [name, sku, desc, cat, unit, bulkQty, bulkPrice, curId, supplier] of rawDefs) {
      const priceGHS  = curId === usdId ? bulkPrice * USD_TO_GHS : bulkPrice;
      const unitPrice = priceGHS / bulkQty;
      rawIds.push(Number(insMat.run(
        name, sku, desc, 'primary', cat, unit,
        bulkQty, bulkPrice, curId,
        bulkPrice, priceGHS, unitPrice,
        0, 0, 'yield', 100,
        unitPrice, supplier, now, now,
      ).lastInsertRowid));
    }

    // Helper: raw material DB id by 0-based index into rawDefs
    const rId = (i: number) => rawIds[i];

    // Helper: unit price (GHS) for a raw material by index
    const rawUP = (i: number): number => {
      const [,,,,, bulkQty, bulkPrice, curId] = rawDefs[i] as RawDef;
      const g = (curId as number) === usdId
        ? (bulkPrice as number) * USD_TO_GHS
        : (bulkPrice as number);
      return g / (bulkQty as number);
    };

    // ────────────────────────────────────────────────────────────────────────
    // 8 INTERMEDIATE MATERIALS (5 bakery sub-assemblies + 3 ingredient bases)
    // ────────────────────────────────────────────────────────────────────────
    type IntDef = {
      name: string; sku: string; desc: string;
      unit: string; category: string;
      yieldPct: number; overhead: number; marginPct: number;
      bom: Array<[number, number]>; // [rawIndex, qty]
    };

    const intDefs: IntDef[] = [
      {
        name: 'Chocolate Ganache', sku: 'INT-001',
        desc: 'Rich chocolate ganache for fillings, drip coating and truffle centres',
        unit: 'kg', category: 'Intermediate',
        yieldPct: 95, overhead: 8, marginPct: 30,
        bom: [[15, 4.0], [9, 3.0], [7, 1.5]],
      },
      {
        name: 'Cream Cheese Frosting', sku: 'INT-002',
        desc: 'Smooth cream cheese frosting for layered cakes and Danish pastries',
        unit: 'kg', category: 'Intermediate',
        yieldPct: 95, overhead: 7, marginPct: 28,
        bom: [[10, 3.0], [1, 2.0], [7, 1.0], [13, 0.5]],
      },
      {
        name: 'Almond Paste', sku: 'INT-003',
        desc: 'Ground almond paste for croissant fillings and marzipan work',
        unit: 'kg', category: 'Intermediate',
        yieldPct: 94, overhead: 8, marginPct: 32,
        bom: [[16, 2.0], [1, 1.5], [11, 0.5]],
      },
      {
        name: 'Caramel Glaze', sku: 'INT-004',
        desc: 'Amber wet caramel for cake drips, tart fillings and decoration',
        unit: 'kg', category: 'Intermediate',
        yieldPct: 92, overhead: 7, marginPct: 28,
        bom: [[1, 3.0], [9, 1.0], [7, 0.5]],
      },
      {
        name: 'Enriched Bread Dough', sku: 'INT-005',
        desc: 'Pre-mixed enriched dough base for loaves, rolls and laminated pastries',
        unit: 'kg', category: 'Intermediate',
        yieldPct: 96, overhead: 6, marginPct: 25,
        bom: [[0, 10.0], [8, 5.0], [7, 2.0], [4, 0.1], [2, 0.05], [1, 0.5]],
      },
      {
        name: 'Spice Blend', sku: 'INT-006',
        desc: 'House spice blend for breads and pastries — salt, cocoa, and vanilla notes',
        unit: 'g', category: 'Ingredients',
        yieldPct: 90, overhead: 8, marginPct: 25,
        bom: [[2, 0.15], [12, 0.08], [13, 0.02]],
      },
      {
        name: 'Tomato Base Sauce', sku: 'INT-007',
        desc: 'Prepared savoury sauce base for filled pastries and savoury bakes',
        unit: 'kg', category: 'Ingredients',
        yieldPct: 75, overhead: 10, marginPct: 30,
        bom: [[8, 2.0], [17, 0.5], [3, 0.3], [1, 0.4]],
      },
      {
        name: 'Cream Mixture', sku: 'INT-008',
        desc: 'Prepared cream base for fillings, glazes, and pastry toppings',
        unit: 'L', category: 'Ingredients',
        yieldPct: 95, overhead: 5, marginPct: 20,
        bom: [[9, 3.0], [8, 2.0], [7, 0.5]],
      },
    ];

    const intIds: number[] = [];
    const intCosts: number[] = [];
    for (const def of intDefs) {
      let totalCost = 0;
      let totalInput = 0;
      for (const [rawIdx, qty] of def.bom) {
        totalCost  += rawUP(rawIdx) * qty;
        totalInput += qty;
      }
      const outputKg  = totalInput * (def.yieldPct / 100);
      const { costPerUnit: calcCost } = calculateIntermediateCostPerUnit({
        materialCost: totalCost,
        laborCost: 0,
        overheadPercentage: def.overhead,
        outputQuantity: outputKg,
      });

      const intDbId = Number(insMat.run(
        def.name, def.sku, def.desc, 'intermediate', def.category, def.unit,
        totalInput, totalCost, ghsId,
        totalCost, totalCost, calcCost,
        def.overhead, def.marginPct, 'yield', def.yieldPct,
        calcCost, 'Demo Kitchen', now, now,
      ).lastInsertRowid);
      intIds.push(intDbId);
      intCosts.push(calcCost);

      for (const [rawIdx, qty] of def.bom) {
        insIBom.run(intDbId, rId(rawIdx), qty, now);
      }
    }

    // Helper: intermediate DB id by 0-based index
    const iId = (i: number) => intIds[i];
    const intCost = (i: number) => intCosts[i];

    // Target markup on cost (%). Most products sit above the 20% healthy threshold.
    // PRD-001 and PRD-009 are intentionally low (12%) to demo below-target warnings.
    const markupOnCostBySku: Record<string, number> = {
      'PRD-001': 12, // Example low markup — dashboard warning demo
      'PRD-002': 32,
      'PRD-003': 38,
      'PRD-004': 35,
      'PRD-005': 33,
      'PRD-006': 30,
      'PRD-007': 28,
      'PRD-008': 36,
      'PRD-009': 12, // Example low markup — dashboard warning demo
      'PRD-010': 40,
    };

    // ────────────────────────────────────────────────────────────────────────
    // 10 PRODUCTS
    // ────────────────────────────────────────────────────────────────────────
    const prodDefs: ProdDef[] = [
      // ── Bakery ──────────────────────────────────────────────────────────
      {
        name: 'Example Low Markup Loaf', sku: 'PRD-001',
        desc: 'Demo product with intentionally low markup — used to show below-target warnings', cat: 'Bakery',
        overhead: 10, otherDirect: 2.50, mode: 'single', batchYield: 1,
        approved: true,
        bom: [{ i: 4, qty: 0.35 }, { r: 18, qty: 1 }],
      },
      {
        name: 'Honey Oat Loaf', sku: 'PRD-002',
        desc: 'Wholegrain honey-sweetened loaf, 500g', cat: 'Bakery',
        overhead: 12, otherDirect: 2.00, mode: 'single', batchYield: 1,
        approved: true,
        bom: [{ r: 0, qty: 0.30 }, { r: 14, qty: 0.08 }, { i: 5, qty: 5 }, { r: 4, qty: 0.01 }, { r: 5, qty: 0.01 }, { r: 18, qty: 1 }],
      },
      {
        name: 'Artisan Sourdough', sku: 'PRD-003',
        desc: 'Long-ferment sourdough loaf, 750g', cat: 'Bakery',
        overhead: 12, otherDirect: 3.00, mode: 'single', batchYield: 1,
        approved: true,
        bom: [{ r: 0, qty: 0.60 }, { r: 2, qty: 0.015 }, { r: 17, qty: 0.02 }, { r: 18, qty: 1 }, { r: 19, qty: 1 }],
      },
      // ── Cakes ───────────────────────────────────────────────────────────
      {
        name: 'Chocolate Fudge Cake', sku: 'PRD-004',
        desc: 'Rich chocolate layer cake, serves 12', cat: 'Cakes',
        overhead: 14, otherDirect: 3.00, mode: 'batch', batchYield: 12,
        approved: true,
        bom: [
          { r: 0, qty: 0.5 }, { r: 12, qty: 0.2 }, { i: 0, qty: 0.3 },
          { r: 11, qty: 4 }, { r: 1, qty: 0.4 }, { r: 18, qty: 1 },
        ],
      },
      {
        name: 'Caramel Drip Cake', sku: 'PRD-005',
        desc: 'Sponge cake with caramel glaze and ganache topping, serves 10', cat: 'Cakes',
        overhead: 13, otherDirect: 3.00, mode: 'batch', batchYield: 10,
        approved: true,
        bom: [
          { r: 0, qty: 0.4 }, { r: 11, qty: 3 }, { r: 1, qty: 0.3 },
          { r: 7, qty: 0.2 }, { i: 3, qty: 0.15 }, { i: 0, qty: 0.1 }, { r: 18, qty: 1 },
        ],
      },
      {
        name: 'Vanilla Pound Cake', sku: 'PRD-006',
        desc: 'Classic pound cake with vanilla bean, serves 8', cat: 'Cakes',
        overhead: 12, otherDirect: 2.50, mode: 'batch', batchYield: 8,
        approved: false,
        bom: [
          { r: 0, qty: 0.35 }, { r: 7, qty: 0.25 }, { r: 13, qty: 0.05 },
          { r: 11, qty: 4 }, { r: 1, qty: 0.3 }, { r: 18, qty: 1 },
        ],
      },
      {
        name: 'Fruit & Honey Cake', sku: 'PRD-007',
        desc: 'Traditional fruit cake with raw honey, 250g', cat: 'Cakes',
        overhead: 11, otherDirect: 2.50, mode: 'single', batchYield: 1,
        approved: false,
        bom: [
          { r: 0, qty: 0.20 }, { r: 14, qty: 0.05 }, { r: 11, qty: 2 },
          { r: 7, qty: 0.10 }, { r: 6, qty: 0.005 }, { r: 18, qty: 1 },
        ],
      },
      // ── Pastry ──────────────────────────────────────────────────────────
      {
        name: 'Cream Cheese Danish', sku: 'PRD-008',
        desc: 'Flaky pastry with cream cheese and vanilla filling', cat: 'Pastry',
        overhead: 12, otherDirect: 2.00, mode: 'single', batchYield: 1,
        approved: true,
        bom: [{ i: 4, qty: 0.25 }, { i: 1, qty: 0.08 }, { i: 7, qty: 0.05 }, { r: 18, qty: 1 }],
      },
      {
        name: 'Example Low Markup Croissant', sku: 'PRD-009',
        desc: 'Demo product with intentionally low markup — buttery croissant with almond paste', cat: 'Pastry',
        overhead: 10, otherDirect: 1.50, mode: 'single', batchYield: 1,
        approved: true,
        bom: [{ i: 4, qty: 0.22 }, { i: 2, qty: 0.06 }, { r: 18, qty: 1 }],
      },
      // ── Biscuits ────────────────────────────────────────────────────────
      {
        name: 'Choco-Almond Biscotti', sku: 'PRD-010',
        desc: 'Twice-baked almond and chocolate biscotti, pack of 10', cat: 'Biscuits',
        overhead: 15, otherDirect: 1.50, mode: 'batch', batchYield: 10,
        approved: true,
        bom: [
          { r: 0, qty: 0.25 }, { i: 0, qty: 0.12 }, { i: 2, qty: 0.10 },
          { r: 11, qty: 2 }, { r: 18, qty: 1 }, { r: 19, qty: 10 },
        ],
      },
    ];

    const productIds: number[] = [];
    const approvedMarkupPercents: number[] = [];
    for (let idx = 0; idx < prodDefs.length; idx++) {
      const pd = prodDefs[idx];
      const targetMarkup = markupOnCostBySku[pd.sku] ?? 32;
      const productionCost = computeProductionCostPerUnit(pd, rawUP, intCost);
      const approvedPrice = pd.approved
        ? priceForMarkupOnCost(productionCost, targetMarkup)
        : null;
      const approvedAt = pd.approved ? now - idx * 86_400 : null;
      const prodId = Number(insProd.run(
        pd.name, pd.sku, pd.desc, pd.cat,
        pd.overhead, targetMarkup, 0, pd.otherDirect,
        pd.mode, pd.batchYield,
        approvedPrice ?? 0,
        pd.approved ? 'approved' : 'pending',
        approvedPrice,
        pd.approved ? 'Admin' : null,
        approvedAt,
        null, now, now,
      ).lastInsertRowid);
      productIds.push(prodId);

      for (const entry of pd.bom) {
        const matDbId = entry.i !== undefined ? iId(entry.i) : rId(entry.r!);
        insBom.run(prodId, matDbId, entry.qty, now);
      }

      if (pd.approved && approvedPrice != null) {
        const realisedMarkup = productionCost > 0
          ? Math.round(((approvedPrice - productionCost) / productionCost) * 1000) / 10
          : 0;
        const realisedGrossMargin = approvedPrice > 0
          ? Math.round(((approvedPrice - productionCost) / approvedPrice) * 1000) / 10
          : 0;
        approvedMarkupPercents.push(realisedMarkup);
        insLog.run(
          'product.approved', 'product', prodId, pd.name, 'Admin',
          1, 'Admin',
          JSON.stringify({
            approvedPrice,
            productionCost: Math.round(productionCost * 100) / 100,
            markupPercent: realisedMarkup,
            margin: realisedGrossMargin,
            note: 'Demo seed',
          }),
          approvedAt,
        );
      }
    }

    const averageApprovedMarkup = approvedMarkupPercents.length > 0
      ? Math.round(
          approvedMarkupPercents.reduce((sum, markup) => sum + markup, 0) / approvedMarkupPercents.length * 10,
        ) / 10
      : 0;

    // ────────────────────────────────────────────────────────────────────────
    // 3 PRICE LEVELS
    // ────────────────────────────────────────────────────────────────────────
    const levelDefs = [
      { name: 'Standard Retail',   multiplier: 1.00, adjType: 'discount' as const, adjPct:  0, desc: 'Base retail prices for direct and walk-in customers' },
      { name: 'Wholesale Clients', multiplier: 0.85, adjType: 'discount' as const, adjPct: 15, desc: 'Volume buyers — 15% discount on approved base prices' },
      { name: 'Export Partners',   multiplier: 0.80, adjType: 'discount' as const, adjPct: 20, desc: 'International distribution — 20% export discount' },
    ];

    const levelIds: number[] = [];
    for (const ld of levelDefs) {
      levelIds.push(Number(
        insLevel.run(ld.name, ld.multiplier, ld.adjType, ld.adjPct, ld.desc, now, now).lastInsertRowid,
      ));
    }

    // Add every approved product to all 3 price levels
    const approvedEntries = prodDefs
      .map((pd, i) => ({ pd, prodId: productIds[i] }))
      .filter(e => e.pd.approved);

    // Pack sizes per approved product SKU (at least one pack size 1 per level)
    const packSizesBySku: Record<string, number[]> = {
      'PRD-001': [1, 6],
      'PRD-002': [1],
      'PRD-003': [1],
      'PRD-004': [1, 12],
      'PRD-005': [1, 10],
      'PRD-008': [1, 6],
      'PRD-009': [1, 6],
      'PRD-010': [1, 10, 24],
    };

    for (let li = 0; li < levelIds.length; li++) {
      const levelId = levelIds[li];
      const adjPct  = levelDefs[li].adjPct;
      for (const { pd, prodId } of approvedEntries) {
        const itemId = Number(insLvlItem.run(
          levelId, prodId, 'rule_discount', adjPct,
          null, 'approved', 'Admin', now,
          'Demo seed — auto-approved', now, now,
        ).lastInsertRowid);
        const packSizes = packSizesBySku[pd.sku] ?? [1];
        for (const packQty of packSizes) {
          insPackSize.run(itemId, packQty, now);
        }
        insLog.run(
          'price_level_item.approved', 'price_level_item', prodId, pd.name, 'Admin',
          1, 'Admin',
          JSON.stringify({ levelName: levelDefs[li].name, adjPct }),
          now,
        );
      }
    }

    console.log(
      `[demo] Seed complete — ${rawDefs.length} materials, ${intDefs.length} intermediates, ` +
      `${prodDefs.length} products, ${levelDefs.length} price levels, ` +
      `avg approved markup ${averageApprovedMarkup}%`,
    );
  });

  txn();
  db.close();
}

// ─── Direct execution support (dev / manual reset) ──────────────────────────
const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isDirectExecution) {
  seedDemoData({ force: true }).catch((err) => {
    console.error('[demo] Seed failed:', err);
    process.exitCode = 1;
  });
}