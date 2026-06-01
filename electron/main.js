const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const { pathToFileURL } = require('url');
const { machineIdSync } = require('node-machine-id');

const LICENCE_SERVER_URL =
  process.env.LICENCE_SERVER_URL ||
  'https://web-production-136f6.up.railway.app';
const LICENCE_STATE_FILE = path.join(
  app.getPath('userData'), 'licence.json'
);
const MAX_OFFLINE_LAUNCHES = 3;

const SERVER_PORT = 3000;
const isProd = app.isPackaged;

// ---------------------------------------------------------------------------
// Licence helpers
// ---------------------------------------------------------------------------

function readLicenceState() {
  try {
    if (fs.existsSync(LICENCE_STATE_FILE)) {
      const raw = fs.readFileSync(LICENCE_STATE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function writeLicenceState(state) {
  try {
    fs.writeFileSync(LICENCE_STATE_FILE, JSON.stringify(state), 'utf8');
  } catch (err) {
    console.error('[licence] Failed to write state:', err);
  }
}

function getMachineId() {
  try {
    return machineIdSync();
  } catch (err) {
    console.error('[licence] Failed to get machine ID:', err);
    const fallbackFile = path.join(app.getPath('userData'), 'machine.id');
    if (fs.existsSync(fallbackFile)) {
      return fs.readFileSync(fallbackFile, 'utf8').trim();
    }
    const { randomUUID } = require('crypto');
    const newId = randomUUID();
    fs.writeFileSync(fallbackFile, newId, 'utf8');
    return newId;
  }
}

async function checkLicenceWithServer(machineId) {
  try {
    const url = new URL(LICENCE_SERVER_URL + '/api/trial/status');
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const body = JSON.stringify({ machineId });

    return await new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 8000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('[licence] Server check failed:', err.message);
    return null;
  }
}

let serverProcess = null;
let mainWindow = null;
let serverModulePromise = null;

async function startServer() {
  const serverEntry = isProd
    ? path.join(process.resourcesPath, 'server-dist', 'index.js')
    : path.join(__dirname, '..', 'server', 'src', 'index.ts');

  const serverEnv = {
    ...process.env,
    PORT: String(SERVER_PORT),
    ELECTRON: 'true',
    USER_DATA_PATH: app.getPath('userData'),
    NODE_ENV: isProd ? 'production' : 'development',
    CLIENT_DIST_PATH: isProd
      ? path.join(process.resourcesPath, 'client-dist')
      : path.join(__dirname, '..', 'client-dist'),
    LICENCE_SERVER_URL: LICENCE_SERVER_URL,
  };

  if (isProd) {
    Object.assign(process.env, serverEnv);
    if (!serverModulePromise) {
      serverModulePromise = import(pathToFileURL(serverEntry).href);
    }
    await serverModulePromise;
    return;
  }

  const devTsxCli = path.join(__dirname, '..', 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const executable = process.execPath;
  const args = [devTsxCli, serverEntry];

  serverProcess = spawn(executable, args, {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => {
    console.log('[server]', d.toString().trim());
  });

  serverProcess.stderr.on('data', (d) => {
    console.error('[server]', d.toString().trim());
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`[server] exited with code=${code} signal=${signal || 'none'}`);
  });
}

function waitForServer(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          return resolve(true);
        }
        res.resume();
        schedule();
      });

      req.on('error', schedule);
      req.setTimeout(1000, () => {
        req.destroy();
        schedule();
      });
    };

    const schedule = () => {
      attempts += 1;
      if (attempts >= maxAttempts) {
        reject(new Error('Server did not start in time'));
        return;
      }
      setTimeout(check, 500);
    };

    check();
  });
}

function checkServerOnce() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
      const healthy = res.statusCode === 200;
      res.resume();
      resolve(healthy);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PriceRight',
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#0f172a',
  });

  const localBuiltIndex = path.join(__dirname, '..', 'client-dist', 'index.html');
  const externalProdIndex = path.join(process.resourcesPath, 'client-dist', 'index.html');

  if (isProd) {
    if (fs.existsSync(externalProdIndex)) {
      mainWindow.loadFile(externalProdIndex);
    } else {
      mainWindow.loadFile(localBuiltIndex);
    }
  } else if (fs.existsSync(localBuiltIndex)) {
    mainWindow.loadFile(localBuiltIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!isProd) {
    mainWindow.webContents.openDevTools();
  }
}

function setupAutoUpdater() {
  // Write updater events to a log file in userData so we can diagnose issues
  const logFile = path.join(app.getPath('userData'), 'updater.log');
  function ulog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try { fs.appendFileSync(logFile, line); } catch (_) { /* ignore */ }
  }

  // Wire electron-updater's internal logger to our file
  autoUpdater.logger = { info: ulog, warn: ulog, error: ulog, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    ulog('[updater] Checking for update...');
  });

  autoUpdater.on('update-not-available', (info) => {
    ulog(`[updater] No update available. Current: ${info.version}`);
  });

  autoUpdater.on('update-available', (info) => {
    ulog(`[updater] Update available: ${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate || '',
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    ulog(`[updater] Update downloaded: ${info.version}`);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate || '',
      });
    }
  });

  autoUpdater.on('error', (err) => {
    ulog(`[updater] Error: ${err && err.message ? err.message : String(err)}`);
  });

  // Check for updates 10 seconds after launch to not slow down startup
  setTimeout(() => {
    ulog(`[updater] Starting check (app version: ${app.getVersion()})`);
    autoUpdater.checkForUpdatesAndNotify()
      .catch((err) => ulog(`[updater] Check failed: ${err.message}`));
  }, 10000);
}

ipcMain.handle('download-file', async (_event, url, defaultFilename) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  function fetchAndSave(targetUrl, redirectCount) {
    console.log('[download] fetching:', targetUrl);
    if (redirectCount > 5) {
      console.log('[download] too many redirects');
      return Promise.resolve({
        success: false,
        error: 'Too many redirects',
      });
    }

    return new Promise((resolve) => {
      http.get(targetUrl, (response) => {
        console.log('[download] status:', response.statusCode);
        console.log('[download] content-type:', response.headers['content-type']);

        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          console.log('[download] redirect to:', response.headers.location);
          const location = response.headers.location;
          if (!location) {
            resolve({ success: false, error: 'Redirect with no location' });
            return;
          }

          response.resume();
          resolve(fetchAndSave(location, redirectCount + 1));
          return;
        }

        if (response.statusCode !== 200) {
          console.log('[download] non-200, failing');
          response.resume();
          try { fs.unlinkSync(filePath); } catch {}
          resolve({
            success: false,
            error: 'Server returned status ' + response.statusCode,
          });
          return;
        }

        console.log('[download] 200 OK, saving to:', filePath);
        const file = fs.createWriteStream(filePath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ success: true, filePath });
        });
        file.on('error', (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          resolve({ success: false, error: err.message });
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(filePath); } catch {}
        resolve({ success: false, error: err.message });
      });
    });
  }

  return fetchAndSave(url, 0);
});

ipcMain.handle('save-backup-file', async (_event, base64Data, defaultFilename) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: [
      { name: 'PriceRight Backup', extensions: ['db'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    title: 'Save PriceRight Backup',
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-restore-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select PriceRight Backup',
    filters: [
      { name: 'PriceRight Backup', extensions: ['db'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) return { canceled: true };

  try {
    const data = fs.readFileSync(filePaths[0]);
    return {
      canceled: false,
      base64: data.toString('base64'),
      filename: path.basename(filePaths[0]),
    };
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Auto-updater IPC handler
// ---------------------------------------------------------------------------

ipcMain.on('restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

// ---------------------------------------------------------------------------
// Licence IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('get-machine-id', async () => {
  return getMachineId();
});

ipcMain.handle('check-licence', async () => {
  const machineId = getMachineId();
  const cached = readLicenceState();

  const serverResult = await checkLicenceWithServer(machineId);

  if (serverResult) {
    const state = {
      ...serverResult,
      machineId,
      lastChecked: new Date().toISOString(),
      offlineLaunches: 0,
    };
    writeLicenceState(state);
    return state;
  }

  if (cached) {
    const offlineLaunches = (cached.offlineLaunches || 0) + 1;
    const updatedCache = { ...cached, offline: true, offlineLaunches };
    writeLicenceState(updatedCache);

    if (offlineLaunches <= MAX_OFFLINE_LAUNCHES) {
      return updatedCache;
    }

    return { ...cached, offline: true, offlineLaunches, forceOnline: true };
  }

  return { status: 'not_activated', offline: true, offlineLaunches: 1 };
});

ipcMain.handle('activate-trial', async (_event, email) => {
  const machineId = getMachineId();
  try {
    const url = new URL(LICENCE_SERVER_URL + '/api/trial/activate');
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const body = JSON.stringify({ email, machineId });

    const result = await new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });

    writeLicenceState({
      ...result,
      machineId,
      lastChecked: new Date().toISOString(),
      offlineLaunches: 0,
    });

    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('validate-licence', async (_event, key) => {
  const machineId = getMachineId();
  try {
    const url = new URL(LICENCE_SERVER_URL + '/api/licence/validate');
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const body = JSON.stringify({ key, machineId });

    const result = await new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });

    if (result.valid) {
      writeLicenceState({
        status: 'licensed',
        email: result.email,
        machineId,
        lastChecked: new Date().toISOString(),
        offlineLaunches: 0,
      });
    }

    return result;
  } catch (err) {
    return { valid: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  const serverAlreadyRunning = await checkServerOnce();

  // Copy demo.db from package resources to userData, replacing if version changed
  const DEMO_DB_VERSION = '1.0.1';
  if (app.isPackaged) {
    const packagedDemoDb = path.join(process.resourcesPath, 'server', 'demo.db');
    const userDemoDb = path.join(app.getPath('userData'), 'demo.db');
    const demoVersionFile = path.join(app.getPath('userData'), 'demo.db.version');
    const currentDemoVersion = fs.existsSync(demoVersionFile)
      ? fs.readFileSync(demoVersionFile, 'utf8').trim()
      : '0';
    if (fs.existsSync(packagedDemoDb) && (
      !fs.existsSync(userDemoDb) || currentDemoVersion !== DEMO_DB_VERSION
    )) {
      try {
        fs.copyFileSync(packagedDemoDb, userDemoDb);
        fs.writeFileSync(demoVersionFile, DEMO_DB_VERSION, 'utf8');
        console.log('[startup] demo.db updated to version', DEMO_DB_VERSION);
      } catch (copyErr) {
        console.error('[startup] Failed to update demo.db:', copyErr);
      }
    }
  }

  if (!serverAlreadyRunning) {
    try {
      await startServer();
    } catch (error) {
      console.error('[server] failed to start:', error);
      dialog.showErrorBox(
        'PriceRight - Startup Error',
        'The PriceRight server could not start.\n\nPlease restart the application.\n\nIf this continues, reinstall PriceRight.'
      );
      app.quit();
      return;
    }
  }

  try {
    await waitForServer();
  } catch (_err) {
    dialog.showErrorBox(
      'PriceRight - Startup Error',
      'The PriceRight server could not start.\n\nPlease restart the application.\n\nIf this continues, reinstall PriceRight.'
    );
    app.quit();
    return;
  }

  createWindow();

  if (isProd) {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
