export function migrateLaborCost(db) {
    try {
        const productCols = db.prepare('PRAGMA table_info(products)').all();
        if (!productCols.some((c) => c.name === 'labor_cost')) {
            db.prepare('ALTER TABLE products ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0').run();
            console.log('[migration] Added labor_cost to products');
        }
        const materialCols = db.prepare('PRAGMA table_info(materials)').all();
        if (!materialCols.some((c) => c.name === 'labor_cost')) {
            db.prepare('ALTER TABLE materials ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0').run();
            console.log('[migration] Added labor_cost to materials');
        }
    }
    catch (err) {
        console.error('[migration] labor_cost failed:', err);
    }
}
