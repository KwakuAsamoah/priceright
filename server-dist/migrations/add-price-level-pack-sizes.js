export function migratePriceLevelPackSizes(db) {
    try {
        const tables = db.prepare('SELECT name FROM sqlite_master '
            + 'WHERE type=\'table\'').all();
        const exists = tables.some((t) => t.name === 'price_level_pack_sizes');
        if (!exists) {
            db.prepare(`
          CREATE TABLE price_level_pack_sizes (
            id INTEGER PRIMARY KEY
              AUTOINCREMENT,
            price_level_item_id INTEGER
              NOT NULL REFERENCES
              price_level_items(id)
              ON DELETE CASCADE,
            pack_quantity INTEGER NOT NULL,
            created_at INTEGER NOT NULL
              DEFAULT (unixepoch())
          )
        `).run();
            console.log('[migration] Created '
                + 'price_level_pack_sizes table');
        }
    }
    catch (err) {
        console.error('[migration] pack sizes failed:', err);
    }
}
