/**
 * electron-builder beforePack hook.
 * Downloads the correct prebuilt better-sqlite3 binary for Electron's Node ABI.
 *
 * @electron/rebuild alone is not reliable here — it can report success while
 * leaving a system-Node binary in place. prebuild-install fetches the exact
 * Electron-matched binary that customer machines need.
 */
const { execSync } = require('child_process');
const path = require('path');

const ELECTRON_VERSION = require('electron/package.json').version;

function installElectronSqlite(moduleDir, label) {
  console.log(`[pack] Installing better-sqlite3 prebuild for Electron ${ELECTRON_VERSION} (${label})...`);
  execSync(
    `npx prebuild-install --runtime electron --target ${ELECTRON_VERSION} --arch x64 --force`,
    { cwd: moduleDir, stdio: 'inherit' },
  );
}

exports.default = async function beforePack() {
  const root = path.join(__dirname, '..');
  const sqliteDir = path.join(root, 'server', 'node_modules', 'better-sqlite3');
  installElectronSqlite(sqliteDir, 'server');
};
