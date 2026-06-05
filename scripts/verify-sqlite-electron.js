/**
 * Runs inside Electron. Loads better-sqlite3 from BETTER_SQLITE3_PATH and opens
 * an in-memory database to prove the native binary matches Electron's Node ABI.
 */
const path = process.env.BETTER_SQLITE3_PATH;
if (!path) {
  console.error('[verify] BETTER_SQLITE3_PATH is not set');
  process.exit(1);
}

try {
  const Database = require(path);
  const db = new Database(':memory:');
  db.prepare('SELECT 1').get();
  db.close();
  console.log('[verify] better-sqlite3 OK under Electron', process.versions.node);
  process.exit(0);
} catch (err) {
  console.error('[verify] better-sqlite3 FAILED under Electron:', err.message);
  process.exit(1);
}
