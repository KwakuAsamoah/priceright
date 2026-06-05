/**
 * Install the Electron-matched better-sqlite3 prebuild into server/node_modules.
 * Run before electron:build and after rebuild:server-dev if dev server breaks.
 */
const { execSync } = require('child_process');
const path = require('path');

const ELECTRON_VERSION = require('electron/package.json').version;
const sqliteDir = path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3');

console.log(`Installing better-sqlite3 prebuild for Electron ${ELECTRON_VERSION}...`);
execSync(
  `npx prebuild-install --runtime electron --target ${ELECTRON_VERSION} --arch x64 --force`,
  { cwd: sqliteDir, stdio: 'inherit' },
);
console.log('Done.');
