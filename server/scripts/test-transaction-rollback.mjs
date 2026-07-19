import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

const billOfMaterials = sqliteTable('bill_of_materials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull(),
  materialId: integer('material_id').notNull(),
  quantity: real('quantity').notNull(),
});

const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE bill_of_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantity REAL NOT NULL
  );
`);

const db = drizzle(sqlite, { schema: { products, billOfMaterials } });

let rolledBack = false;
try {
  await db.transaction(async (tx) => {
    const created = await tx.insert(products).values({ name: 'Rollback Test Product' }).returning();
    await tx.insert(billOfMaterials).values({
      productId: created[0].id,
      materialId: 999,
      quantity: 1,
    });
    throw new Error('Simulated failure');
  });
} catch {
  rolledBack = true;
}

const productCount = sqlite.prepare('SELECT COUNT(*) AS count FROM products').get().count;
const bomCount = sqlite.prepare('SELECT COUNT(*) AS count FROM bill_of_materials').get().count;

if (!rolledBack || productCount !== 0 || bomCount !== 0) {
  console.error('FAIL: expected rollback with zero rows, got', { rolledBack, productCount, bomCount });
  process.exit(1);
}

console.log('PASS: drizzle db.transaction rollback verified (0 products, 0 BOM rows after forced failure)');
process.exit(0);
