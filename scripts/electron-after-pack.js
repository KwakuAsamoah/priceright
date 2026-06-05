/**
 * electron-builder afterPack hook.
 * Ensures the shipped better-sqlite3 binary matches Electron, then verifies it.
 */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ELECTRON_VERSION = require('electron/package.json').version;

exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources');
  const sqliteModuleDir = path.join(resourcesDir, 'node_modules', 'better-sqlite3');

  if (!fs.existsSync(sqliteModuleDir)) {
    throw new Error(
      `[pack] better-sqlite3 not found at ${sqliteModuleDir}. ` +
      'Check electron-builder extraResources configuration.',
    );
  }

  console.log(`[pack] Ensuring packaged better-sqlite3 matches Electron ${ELECTRON_VERSION}...`);
  execSync(
    `npx prebuild-install --runtime electron --target ${ELECTRON_VERSION} --arch x64 --force`,
    { cwd: sqliteModuleDir, stdio: 'inherit' },
  );

  const electronBinary = require('electron');
  const verifyScript = path.join(__dirname, 'verify-sqlite-electron.js');

  console.log('[pack] Verifying better-sqlite3 loads under Electron...');
  const result = spawnSync(
    electronBinary,
    [verifyScript],
    {
      env: {
        ...process.env,
        BETTER_SQLITE3_PATH: sqliteModuleDir,
      },
      encoding: 'utf8',
      timeout: 30_000,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      '[pack] Native module verification failed. ' +
      'The installer would crash on customer machines. Do not publish this build.',
    );
  }

  console.log('[pack] Native module verification passed.');
};
