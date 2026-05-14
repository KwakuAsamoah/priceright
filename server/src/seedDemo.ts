import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const demoDbPath = path.resolve(serverRoot, 'demo.db');

const schemaSql = `
DROP TABLE IF EXISTS price_list_items;
DROP TABLE IF EXISTS price_lists;
DROP TABLE IF EXISTS price_level_items;
DROP TABLE IF EXISTS special_pricing;
DROP TABLE IF EXISTS bill_of_materials;
DROP TABLE IF EXISTS intermediate_material_bom;
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
  margin_percentage REAL NOT NULL DEFAULT 0,
  intermediate_cost_mode TEXT NOT NULL DEFAULT 'yield',
  yield_percentage REAL NOT NULL DEFAULT 100,
  calculated_cost_per_unit REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
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

CREATE TABLE bill_of_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
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

export async function seedDemoData(options?: { force?: boolean }) {
  const db = new Database(demoDbPath);
  db.pragma('foreign_keys = ON');

  const forceSeed = Boolean(options?.force);
  if (!forceSeed) {
    try {
      const existingLevels = db.prepare('SELECT COUNT(*) AS count FROM price_levels').get() as { count?: number } | undefined;
      if (Number(existingLevels?.count || 0) > 0) {
        console.log('[demo] Demo data already exists — skipping seed');
        db.close();
        return;
      }
    } catch {
      // Table may not exist yet; continue with full seed.
    }
  }

  const now = Math.floor(Date.now() / 1000);

db.exec(schemaSql);

const insertCurrency = db.prepare(
  'INSERT INTO currencies (code, name, symbol, is_active, created_at) VALUES (?, ?, ?, 1, ?)'
);
const insertRate = db.prepare(
  'INSERT INTO exchange_rates (currency_id, rate_to_base, effective_date, source, created_at) VALUES (?, ?, ?, ?, ?)'
);
const insertSetting = db.prepare(
  'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)'
);
const insertMaterial = db.prepare(`
  INSERT INTO materials (
    name, sku, description, material_type, category, unit,
    bulk_quantity, bulk_price, purchase_currency_id,
    price_in_purchase_currency, price_in_base_currency, unit_price,
    overhead_percentage, margin_percentage, intermediate_cost_mode, yield_percentage,
    calculated_cost_per_unit, supplier, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);
const insertIntermediateBom = db.prepare(
  'INSERT INTO intermediate_material_bom (intermediate_material_id, component_material_id, quantity, created_at) VALUES (?, ?, ?, ?)'
);
const insertProduct = db.prepare(`
  INSERT INTO products (
    name, sku, description, category, overhead_percentage, profit_margin,
    other_direct_costs, production_mode, batch_yield, current_selling_price,
    approval_status, approved_price, approved_by, approved_at,
    approved_price_expires_at, is_active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);
const insertBom = db.prepare(
  'INSERT INTO bill_of_materials (product_id, material_id, quantity, created_at) VALUES (?, ?, ?, ?)'
);
const insertPriceLevel = db.prepare(
  'INSERT INTO price_levels (name, multiplier, adjustment_type, adjustment_percentage, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
);
const insertCustomer = db.prepare(
  'INSERT INTO customers (name, price_level_id, created_at, updated_at) VALUES (?, ?, ?, ?)'
);
const insertPriceLevelItem = db.prepare(`
  INSERT INTO price_level_items (
    price_level_id, product_id, override_type, adjustment_percentage,
    custom_price, status, approved_by, approved_at, justification,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPriceList = db.prepare(
  'INSERT INTO price_lists (name, customer_id, price_level_id, valid_from, valid_until, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertPriceListItem = db.prepare(
  'INSERT INTO price_list_items (price_list_id, product_id, base_price, discount_percentage, final_price, price_source, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertActivity = db.prepare(
  'INSERT INTO activity_log (action, entity_type, entity_id, entity_name, performed_by, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

const txn = db.transaction(() => {
  insertCurrency.run('GHS', 'Ghana Cedi', 'GH₵', now);
  insertCurrency.run('USD', 'US Dollar', '$', now);
  insertCurrency.run('EUR', 'Euro', '€', now);

  insertRate.run(1, 1, now, 'seed', now);
  insertRate.run(2, 14.25, now, 'seed', now);
  insertRate.run(3, 15.4, now, 'seed', now);

  insertSetting.run('base_currency', 'GHS', now);
  insertSetting.run('default_overhead_percentage', '25', now);

  const primaryMaterials = [
    ['Flour', 'MAT-001', 'Wheat flour', 'Dry Goods', 'kg', 25, 385],
    ['Sugar', 'MAT-002', 'Granulated sugar', 'Dry Goods', 'kg', 50, 520],
    ['Salt', 'MAT-003', 'Iodized salt', 'Dry Goods', 'kg', 10, 42],
    ['Yeast', 'MAT-004', 'Baker yeast', 'Additives', 'kg', 5, 220],
    ['Butter', 'MAT-005', 'Unsalted butter', 'Dairy', 'kg', 10, 710],
    ['Milk Powder', 'MAT-006', 'Full cream milk powder', 'Dairy', 'kg', 25, 1850],
    ['Cocoa Powder', 'MAT-007', 'Baking cocoa', 'Flavoring', 'kg', 8, 640],
    ['Vanilla Essence', 'MAT-008', 'Vanilla extract', 'Flavoring', 'L', 1, 120],
    ['Baking Powder', 'MAT-009', 'Double action baking powder', 'Additives', 'kg', 5, 175],
    ['Eggs', 'MAT-010', 'Fresh eggs', 'Protein', 'tray', 1, 55],
    ['Vegetable Oil', 'MAT-011', 'Refined oil', 'Oils', 'L', 20, 490],
    ['Palm Oil', 'MAT-012', 'Red palm oil', 'Oils', 'L', 20, 420],
    ['Tomato Paste', 'MAT-013', 'Concentrated paste', 'Canned', 'kg', 12, 360],
    ['Seasoning Mix', 'MAT-014', 'Mixed spices', 'Spices', 'kg', 4, 210],
    ['Onion Powder', 'MAT-015', 'Powdered onion', 'Spices', 'kg', 3, 156],
    ['Garlic Powder', 'MAT-016', 'Powdered garlic', 'Spices', 'kg', 3, 174],
    ['Plastic Bottle 500ml', 'MAT-017', 'PET bottle', 'Packaging', 'piece', 1000, 780],
    ['Label Sticker', 'MAT-018', 'Printed labels', 'Packaging', 'piece', 2000, 320],
    ['Carton Box', 'MAT-019', 'Shipping carton', 'Packaging', 'piece', 500, 950],
    ['Shrink Wrap', 'MAT-020', 'Clear shrink film', 'Packaging', 'roll', 10, 430],
  ] as const;

  for (const [name, sku, description, category, unit, bulkQuantity, bulkPrice] of primaryMaterials) {
    const unitPrice = bulkPrice / bulkQuantity;
    insertMaterial.run(
      name,
      sku,
      description,
      'primary',
      category,
      unit,
      bulkQuantity,
      bulkPrice,
      1,
      bulkPrice,
      bulkPrice,
      unitPrice,
      0,
      0,
      'yield',
      100,
      unitPrice,
      'Demo Supplier',
      now,
      now
    );
  }

  const intermediateBulkQty = 50;
  const intermediateBulkPrice = 980;
  const intermediateUnitPrice = intermediateBulkPrice / intermediateBulkQty;
  const intermediateId = Number(
    insertMaterial.run(
      'Chocolate Syrup Base',
      'INT-001',
      'Intermediate blend for toppings and fillings',
      'intermediate',
      'Intermediate',
      'kg',
      intermediateBulkQty,
      intermediateBulkPrice,
      1,
      intermediateBulkPrice,
      intermediateBulkPrice,
      intermediateUnitPrice,
      5,
      8,
      'yield',
      98,
      intermediateUnitPrice,
      'Demo Kitchen',
      now,
      now
    ).lastInsertRowid
  );

  insertIntermediateBom.run(intermediateId, 2, 12, now);
  insertIntermediateBom.run(intermediateId, 7, 6, now);
  insertIntermediateBom.run(intermediateId, 5, 4, now);

  const productRows = [
    ['Classic Bread', 'PRD-001', 'Soft sandwich bread', 'Bakery', 24, 22, 6, 'single', 1, 23.5],
    ['Milk Bread', 'PRD-002', 'Enriched milk bread', 'Bakery', 26, 24, 7, 'single', 1, 26.8],
    ['Chocolate Muffin', 'PRD-003', 'Muffin with cocoa', 'Bakery', 28, 27, 8, 'batch', 24, 18.5],
    ['Vanilla Muffin', 'PRD-004', 'Muffin with vanilla', 'Bakery', 27, 25, 8, 'batch', 24, 17.9],
    ['Tomato Sauce 500ml', 'PRD-005', 'Cooking sauce', 'Sauces', 22, 20, 10, 'batch', 50, 15.4],
    ['Spice Mix Paste', 'PRD-006', 'Ready spice paste', 'Sauces', 21, 21, 9, 'batch', 40, 14.9],
    ['Palm Oil 500ml', 'PRD-007', 'Fortified palm oil bottle', 'Oils', 18, 18, 9, 'batch', 35, 21.2],
    ['Pure Honey 250g Jar', 'PRD-008', 'Premium honey jar', 'Confectionery', 18, 19, 8, 'batch', 35, 22.1],
    ['White Rice 1kg Sachet', 'PRD-009', 'Retail rice pack', 'Dry Mixes', 25, 26, 7, 'batch', 20, 28.7],
    ['Peanut Butter 250g Jar', 'PRD-010', 'Smooth peanut butter jar', 'Confectionery', 25, 24, 7, 'batch', 20, 26.3],
    ['Choco Topping', 'PRD-011', 'Topping using intermediate syrup', 'Confectionery', 30, 30, 6, 'batch', 30, 31.5],
    ['Deluxe Choco Spread', 'PRD-012', 'Premium spread', 'Confectionery', 32, 33, 6, 'batch', 20, 36.4],
  ] as const;

  const productIds: number[] = [];
  const insertedProducts: Array<{ id: number; name: string; approvedPrice: number }> = [];
  for (const [name, sku, description, category, overhead, margin, otherCosts, productionMode, batchYield, approvedPrice] of productRows) {
    const result = insertProduct.run(
      name,
      sku,
      description,
      category,
      overhead,
      margin,
      otherCosts,
      productionMode,
      batchYield,
      approvedPrice,
      'approved',
      approvedPrice,
      'demo-admin',
      now,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      now,
      now
    );
    const productId = Number(result.lastInsertRowid);
    productIds.push(productId);
    insertedProducts.push({
      id: productId,
      name,
      approvedPrice,
    });
  }

  const bomMap: Array<[number, number, number]> = [
    [productIds[0], 1, 1.2],
    [productIds[0], 4, 0.03],
    [productIds[1], 1, 1.1],
    [productIds[1], 6, 0.2],
    [productIds[2], 1, 0.9],
    [productIds[2], 7, 0.15],
    [productIds[3], 1, 0.9],
    [productIds[3], 8, 0.03],
    [productIds[4], 13, 0.5],
    [productIds[4], 14, 0.08],
    [productIds[5], 13, 0.4],
    [productIds[5], 15, 0.05],
    [productIds[6], 12, 0.7],
    [productIds[7], 11, 0.7],
    [productIds[8], 1, 1.2],
    [productIds[8], 9, 0.06],
    [productIds[9], 1, 1.1],
    [productIds[9], 2, 0.3],
    [productIds[10], intermediateId, 0.4],
    [productIds[10], 17, 1],
    [productIds[11], intermediateId, 0.55],
    [productIds[11], 18, 1],
  ];

  for (const [productId, materialId, quantity] of bomMap) {
    insertBom.run(productId, materialId, quantity, now);
  }

  const priceLevelRows = [
    ['Retail', 1, 'discount', 0, 'Standard retail pricing'],
    ['Wholesale', 0.88, 'discount', 12, 'Wholesale discount profile'],
    ['Export', 0.82, 'discount', 18, 'Export discount profile'],
    ['Distributor', 0.92, 'discount', 8, 'Distributor discount profile'],
    ['Accra Supermart Ltd', 1, 'discount', 0, 'Customer-specific negotiated level'],
  ] as const;

  const priceLevelIdByName = new Map<string, number>();
  for (const [name, multiplier, adjustmentType, adjustmentPercentage, description] of priceLevelRows) {
    const result = insertPriceLevel.run(name, multiplier, adjustmentType, adjustmentPercentage, description, now, now);
    priceLevelIdByName.set(name, Number(result.lastInsertRowid));
  }

  const customerRows = [
    ['Accra Supermart Ltd', 'Accra Supermart Ltd'],
    ['West Coast Distributors', 'Wholesale'],
    ['Golden Gate Exports Ltd', 'Export'],
    ['Fresh & Fast Stores', 'Retail'],
    ['Northern Supply Co.', 'Distributor'],
    ['Sunshine Retailers', 'Retail'],
  ] as const;

  const customerIds: number[] = [];
  for (const [name, priceLevelName] of customerRows) {
    const priceLevelId = priceLevelIdByName.get(priceLevelName);
    if (!priceLevelId) {
      throw new Error(`Missing seeded price level: ${priceLevelName}`);
    }
    const result = insertCustomer.run(name, priceLevelId, now, now);
    customerIds.push(Number(result.lastInsertRowid));
  }

  const ruleLevelAdjustments = [
    ['Retail', 0],
    ['Wholesale', 12],
    ['Export', 18],
    ['Distributor', 8],
  ] as const;

  for (const [levelName, adjustmentPercentage] of ruleLevelAdjustments) {
    const levelId = priceLevelIdByName.get(levelName);
    if (!levelId) {
      throw new Error(`Missing rule level: ${levelName}`);
    }

    for (const product of insertedProducts) {
      insertPriceLevelItem.run(
        levelId,
        product.id,
        'rule_discount',
        adjustmentPercentage,
        null,
        'approved',
        'Admin',
        now,
        'Seeded level rule',
        now,
        now
      );
    }
  }

  const accraLevelId = priceLevelIdByName.get('Accra Supermart Ltd');
  if (!accraLevelId) {
    throw new Error('Missing price level: Accra Supermart Ltd');
  }

  const palmOil500 = insertedProducts.find((product) => product.name === 'Palm Oil 500ml');
  if (palmOil500 && palmOil500.approvedPrice) {
    insertPriceLevelItem.run(accraLevelId, palmOil500.id, 'custom_price', null, Number((palmOil500.approvedPrice * 0.92).toFixed(2)), 'approved', 'Admin', now, 'Negotiated account price', now, now);
  }

  const pureHoney250 = insertedProducts.find((product) => product.name === 'Pure Honey 250g Jar');
  if (pureHoney250 && pureHoney250.approvedPrice) {
    insertPriceLevelItem.run(accraLevelId, pureHoney250.id, 'custom_price', null, Number((pureHoney250.approvedPrice * 0.94).toFixed(2)), 'approved', 'Admin', now, 'Preferred customer discount', now, now);
  }

  const whiteRice1kg = insertedProducts.find((product) => product.name === 'White Rice 1kg Sachet');
  if (whiteRice1kg && whiteRice1kg.approvedPrice) {
    insertPriceLevelItem.run(accraLevelId, whiteRice1kg.id, 'rule_discount', 10, null, 'approved', 'Admin', now, 'Contractual rice discount', now, now);
  }

  const peanutButter250 = insertedProducts.find((product) => product.name === 'Peanut Butter 250g Jar');
  if (peanutButter250 && peanutButter250.approvedPrice) {
    insertPriceLevelItem.run(accraLevelId, peanutButter250.id, 'custom_price', null, Number((peanutButter250.approvedPrice * 0.90).toFixed(2)), 'approved', 'Admin', now, 'Quarterly promo support', now, now);
  }

  const validFrom = now;
  const validUntil = now + 90 * 24 * 60 * 60;

  const wholesaleLevelId = priceLevelIdByName.get('Wholesale');
  const retailLevelId = priceLevelIdByName.get('Retail');
  const exportLevelId = priceLevelIdByName.get('Export');
  if (!wholesaleLevelId || !retailLevelId || !exportLevelId) {
    throw new Error('Missing price levels for seeded price lists');
  }

  const wholesaleListId = Number(insertPriceList.run('Q3 Wholesale 2026', null, wholesaleLevelId, validFrom, validUntil, 'active', 'demo-admin', now, now).lastInsertRowid);
  const retailListId = Number(insertPriceList.run('Q3 Retail 2026', null, retailLevelId, validFrom, validUntil, 'active', 'demo-admin', now, now).lastInsertRowid);
  const exportListId = Number(insertPriceList.run('Q3 Export 2026', null, exportLevelId, validFrom, validUntil, 'active', 'demo-admin', now, now).lastInsertRowid);

  for (const productId of productIds) {
    const basePrice = productRows[productIds.indexOf(productId)][9];
    insertPriceListItem.run(wholesaleListId, productId, basePrice, 12, Number((basePrice * 0.88).toFixed(2)), 'rule', 'Auto discount', now);
    insertPriceListItem.run(retailListId, productId, basePrice, 0, basePrice, 'base', 'Standard retail', now);
    insertPriceListItem.run(exportListId, productId, basePrice, 18, Number((basePrice * 0.82).toFixed(2)), 'rule', 'Export discount', now);
  }

  const palmOilMaterialId = 12;
  const sugarMaterialId = 2;
  const palmOil500Product = insertedProducts.find((product) => product.name === 'Palm Oil 500ml');
  const peanutButter250Product = insertedProducts.find((product) => product.name === 'Peanut Butter 250g Jar');

  const activityRows: Array<[
    string,
    string,
    number | null,
    string | null,
    string,
    Record<string, unknown>,
    number,
  ]> = [
    ['material.cost_updated', 'material', palmOilMaterialId, 'Palm Oil', 'Admin', { oldGhsPrice: 18.2, newGhsPrice: 19.0 }, now - (9 * 24 * 60 * 60)],
    ['material.cost_updated', 'material', sugarMaterialId, 'Sugar', 'Admin', { oldGhsPrice: 10.4, newGhsPrice: 11.0 }, now - (8 * 24 * 60 * 60)],
    ['product.needs_review', 'product', palmOil500Product?.id ?? null, palmOil500Product?.name ?? 'Palm Oil 500ml', 'Admin', { reason: 'Material costs increased' }, now - (7 * 24 * 60 * 60)],
    ['product.approved', 'product', palmOil500Product?.id ?? null, palmOil500Product?.name ?? 'Palm Oil 500ml', 'Admin', { oldPrice: 20.9, newPrice: 21.2, margin: 18.0, productionCost: 17.38 }, now - (6 * 24 * 60 * 60)],
    ['product.approved', 'product', peanutButter250Product?.id ?? null, peanutButter250Product?.name ?? 'Peanut Butter 250g Jar', 'Admin', { oldPrice: null, newPrice: 24.50, margin: 29.8, productionCost: 17.20 }, now - (60 * 24 * 60 * 60)],
    ['product.approved', 'product', peanutButter250Product?.id ?? null, peanutButter250Product?.name ?? 'Peanut Butter 250g Jar', 'Admin', { oldPrice: 24.50, newPrice: 26.80, margin: 29.5, productionCost: 18.90 }, now - (30 * 24 * 60 * 60)],
    ['product.approved', 'product', peanutButter250Product?.id ?? null, peanutButter250Product?.name ?? 'Peanut Butter 250g Jar', 'Admin', { oldPrice: 25.6, newPrice: 26.3, margin: 24.0, productionCost: 20.0 }, now - (5 * 24 * 60 * 60)],
    ['price_level_item.approved', 'price_level_item', peanutButter250Product?.id ?? null, peanutButter250Product?.name ?? 'Peanut Butter 250g Jar', 'Admin', { levelName: 'Wholesale', productName: peanutButter250Product?.name ?? 'Peanut Butter 250g Jar', overrideType: 'rule_discount', value: 12, finalPrice: 23.14 }, now - (4 * 24 * 60 * 60)],
    ['price_level_item.rejected', 'price_level_item', palmOil500Product?.id ?? null, palmOil500Product?.name ?? 'Palm Oil 500ml', 'Admin', { levelName: 'Wholesale', productName: palmOil500Product?.name ?? 'Palm Oil 500ml', reason: 'Margin below target' }, now - (3 * 24 * 60 * 60)],
    ['price_level_item.bulk_approved', 'price_level_item', wholesaleLevelId, 'Wholesale', 'Admin', { levelName: 'Wholesale', count: 8 }, now - (2 * 24 * 60 * 60)],
    ['price_level.created', 'price_level', accraLevelId, 'Accra Supermart Ltd', 'Admin', { levelName: 'Accra Supermart Ltd' }, now - (36 * 60 * 60)],
    ['exchange_rate.updated', 'exchange_rate', 2, 'USD', 'Admin', { currencyCode: 'USD', oldRate: 13.9, newRate: 14.25, productsAffected: 6 }, now - (12 * 60 * 60)],
  ];

  for (const [action, entityType, entityId, entityName, performedBy, details, createdAt] of activityRows) {
    insertActivity.run(action, entityType, entityId, entityName, performedBy, JSON.stringify(details), createdAt);
  }
});

txn();

const counts = {
  currencies: db.prepare('SELECT COUNT(*) AS count FROM currencies').get() as { count: number },
  materials: db.prepare('SELECT COUNT(*) AS count FROM materials').get() as { count: number },
  products: db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number },
  price_levels: db.prepare('SELECT COUNT(*) AS count FROM price_levels').get() as { count: number },
  price_level_items: db.prepare('SELECT COUNT(*) AS count FROM price_level_items').get() as { count: number },
  customers: db.prepare('SELECT COUNT(*) AS count FROM customers').get() as { count: number },
  special_pricing: db.prepare('SELECT COUNT(*) AS count FROM special_pricing').get() as { count: number },
  price_lists: db.prepare('SELECT COUNT(*) AS count FROM price_lists').get() as { count: number },
  activity_log: db.prepare('SELECT COUNT(*) AS count FROM activity_log').get() as { count: number },
};

console.log('Demo seed complete at', demoDbPath);
console.log('currencies:', counts.currencies.count);
console.log('materials:', counts.materials.count);
console.log('products:', counts.products.count);
console.log('price_levels:', counts.price_levels.count);
console.log('price_level_items:', counts.price_level_items.count);
console.log('customers:', counts.customers.count);
console.log('special_pricing:', counts.special_pricing.count);
console.log('price_lists:', counts.price_lists.count);
console.log('activity_log:', counts.activity_log.count);

db.close();
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isDirectExecution) {
  seedDemoData({ force: true }).catch((error) => {
    console.error('Failed to seed demo database:', error);
    process.exitCode = 1;
  });
}
