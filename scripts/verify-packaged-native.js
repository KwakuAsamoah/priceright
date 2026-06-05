/**
 * Manual check: verify better-sqlite3 in a built (unpacked) app loads under Electron.
 * Usage: npm run verify:electron-native
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appOutDir = path.join(__dirname, '..', 'dist-electron', 'win-unpacked');
const sqliteModuleDir = path.join(appOutDir, 'resources', 'node_modules', 'better-sqlite3');

if (!fs.existsSync(sqliteModuleDir)) {
  console.error('[verify] Build not found. Run npm run electron:build first.');
  process.exit(1);
}

const electronBinary = require('electron');
const verifyScript = path.join(__dirname, 'verify-sqlite-electron.js');

const result = spawnSync(electronBinary, [verifyScript], {
  env: { ...process.env, BETTER_SQLITE3_PATH: sqliteModuleDir },
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
