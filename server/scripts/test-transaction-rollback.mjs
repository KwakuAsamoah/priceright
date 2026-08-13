/**
 * Verifies synchronous Drizzle/better-sqlite3 transaction rollback.
 * Failure is forced AFTER the product insert (inside the transaction) via FK violation.
 * Waits for async work to settle before counting rows — no process.exit() before checks.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

const materials = sqliteTable('materials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

const billOfMaterials = sqliteTable('bill_of_materials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull(),
  materialId: integer('material_id').notNull().references(() => materials.id),
  quantity: real('quantity').notNull(),
});

const sqlite = new Database(':memory:');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
  CREATE TABLE materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE bill_of_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL REFERENCES materials(id),
    quantity REAL NOT NULL
  );
`);

const db = drizzle(sqlite, { schema: { products, materials, billOfMaterials } });

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

let caughtError = null;
try {
  db.transaction((tx) => {
    const created = tx.insert(products).values({ name: 'Rollback Test Product' }).returning().all();
    // Product row exists inside txn; BOM insert fails on missing material FK
    tx.insert(billOfMaterials).values({
      productId: created[0].id,
      materialId: 999,
      quantity: 1,
    }).run();
  });
} catch (error) {
  caughtError = error;
}

await settle();

const productCount = sqlite.prepare('SELECT COUNT(*) AS count FROM products').get().count;
const bomCount = sqlite.prepare('SELECT COUNT(*) AS count FROM bill_of_materials').get().count;
const materialCount = sqlite.prepare('SELECT COUNT(*) AS count FROM materials').get().count;

const passed = caughtError != null && productCount === 0 && bomCount === 0 && materialCount === 0;

console.log(JSON.stringify({
  passed,
  caughtError: caughtError ? String(caughtError.message || caughtError) : null,
  productCount,
  bomCount,
  materialCount,
}, null, 2));

if (!passed) {
  process.exitCode = 1;
}
