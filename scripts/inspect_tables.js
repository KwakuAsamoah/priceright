const path = require('path');
const Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
const db = new Database(path.join(__dirname, '..', 'server', 'priceright.db'));

for (const table of ['price_levels', 'special_pricing', 'price_lists', 'price_list_items']) {
  console.log(`TABLE ${table}`);
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  console.log(rows);
}
