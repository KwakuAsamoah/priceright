const { app, BrowserWindow, dialog, ipcMain, Notification, shell } = require('electron');
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
const UPDATE_CHECK_TIMEOUT_MS = 10000;
const GITHUB_RELEASES_URL = 'https://github.com/KwakuAsamoah/priceright/releases';

const SERVER_PORT = 3000;
const isProd = app.isPackaged;

const DEFAULT_WINDOW_STATE = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined,
  isMaximized: false,
};

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const statePath = getWindowStatePath();
    if (fs.existsSync(statePath)) {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return {
        width: Number(parsed.width) || DEFAULT_WINDOW_STATE.width,
        height: Number(parsed.height) || DEFAULT_WINDOW_STATE.height,
        x: Number.isFinite(parsed.x) ? parsed.x : undefined,
        y: Number.isFinite(parsed.y) ? parsed.y : undefined,
        isMaximized: Boolean(parsed.isMaximized),
      };
    }
  } catch {}
  return { ...DEFAULT_WINDOW_STATE };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(
      getWindowStatePath(),
      JSON.stringify({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized,
      }),
      'utf8',
    );
  } catch {}
}

function debounce(fn, delay) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function devLog(...args) {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    console.log(...args);
  }
}

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
    : path.join(__dirname, '..', 'server-dist', 'index.js');

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

  Object.assign(process.env, serverEnv);

  if (isProd) {
    if (!serverModulePromise) {
      serverModulePromise = import(pathToFileURL(serverEntry).href);
    }
    await serverModulePromise;
    return;
  }

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      'server-dist/index.js not found. Run "npm run build:server" before starting Electron.',
    );
  }

  if (!serverModulePromise) {
    serverModulePromise = import(pathToFileURL(serverEntry).href);
  }
  await serverModulePromise;
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

function fetchHealthStatus() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function checkServerOnce() {
  return fetchHealthStatus().then((health) => Boolean(health?.status === 'ok'));
}

const SERVER_STARTUP_ERROR_TITLE = 'PriceRight could not start';
const SERVER_STARTUP_ERROR_MESSAGE = [
  'The PriceRight server failed to start. This may be because:',
  '• Another application is using the required port',
  '• The application files are damaged',
  '• Your antivirus software is blocking PriceRight',
  '',
  'Please try restarting the application. If the problem continues contact support at support@therighthub.com',
].join('\n');

function showServerStartupErrorDialog() {
  dialog.showErrorBox(SERVER_STARTUP_ERROR_TITLE, SERVER_STARTUP_ERROR_MESSAGE);
}

function showReconnectNotification() {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'PriceRight',
      body: 'Trying to reconnect...',
    });
    notification.show();
    return;
  }

  devLog('[startup] Trying to reconnect...');
}

async function waitForServerWithRetry() {
  try {
    await waitForServer();
    return true;
  } catch (firstError) {
    console.error('[server] initial health check failed:', firstError);
    showReconnectNotification();
    serverModulePromise = null;

    try {
      await startServer();
      await waitForServer();
      return true;
    } catch (retryError) {
      console.error('[server] retry failed:', retryError);
      return false;
    }
  }
}

function createWindow() {
  const savedState = readWindowState();
  const windowOptions = {
    width: savedState.width,
    height: savedState.height,
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
  };

  if (savedState.x !== undefined) {
    windowOptions.x = savedState.x;
  }
  if (savedState.y !== undefined) {
    windowOptions.y = savedState.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  const debouncedSaveWindowState = debounce(saveWindowState, 500);
  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);
  mainWindow.on('close', saveWindowState);

  const savedZoom = (() => {
    try {
      const zoomPath = path.join(app.getPath('userData'), 'windowZoom.json');
      if (fs.existsSync(zoomPath)) {
        const data = JSON.parse(fs.readFileSync(zoomPath, 'utf8'));
        return data.zoomFactor ?? 1;
      }
    } catch {}
    return 1;
  })();

  mainWindow.webContents.setZoomFactor(savedZoom);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && String(input.key).toLowerCase() === 'p') {
      event.preventDefault();
      mainWindow.webContents.print({
        silent: false,
        printBackground: true,
        color: true,
        margins: { marginType: 'printableArea' },
        pageSize: 'A4',
      });
    }
  });

  mainWindow.webContents.on('zoom-changed', (_event, zoomDirection) => {
    const current = mainWindow.webContents.getZoomFactor();
    const newZoom = zoomDirection === 'in'
      ? Math.min(current * 1.1, 3)
      : Math.max(current / 1.1, 0.5);
    mainWindow.webContents.setZoomFactor(newZoom);
    try {
      const zoomPath = path.join(app.getPath('userData'), 'windowZoom.json');
      fs.writeFileSync(zoomPath, JSON.stringify({ zoomFactor: newZoom }), 'utf8');
    } catch {}
  });

  const localBuiltIndex = path.join(__dirname, '..', 'client-dist', 'index.html');
  const externalProdIndex = path.join(process.resourcesPath, 'client-dist', 'index.html');

  if (isProd) {
    if (fs.existsSync(externalProdIndex)) {
      mainWindow.loadFile(externalProdIndex);
    } else {
      mainWindow.loadFile(localBuiltIndex);
    }
  } else {
    const devClientUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.webContents.on('did-fail-load', (_event, _code, _desc, validatedURL) => {
      if (validatedURL === devClientUrl && fs.existsSync(localBuiltIndex)) {
        mainWindow.loadFile(localBuiltIndex);
      }
    });
    mainWindow.loadURL(devClientUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('show', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    }, 100);
  });

  mainWindow.on('restore', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    }, 100);
  });

  mainWindow.on('focus', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    }, 50);
  });

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
    devLog(msg);
    try { fs.appendFileSync(logFile, line); } catch (_) { /* ignore */ }
  }

  function checkForUpdatesWithTimeout() {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Update check timed out')), UPDATE_CHECK_TIMEOUT_MS);
    });
    const updatePromise = autoUpdater.checkForUpdates();
    return Promise.race([updatePromise, timeoutPromise]);
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
      const title = 'PriceRight Update Available';
      const message = `Version ${info.version} is ready to download. It includes improvements and fixes.`;
      mainWindow.webContents.send('update-available', {
        version: info.version,
        title,
        message,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate || '',
      });
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title,
        message,
        buttons: ['Update Now', 'Later', 'View release history'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 2) {
          shell.openExternal(GITHUB_RELEASES_URL);
        }
      }).catch(() => {});
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    ulog(`[updater] Update downloaded: ${info.version}`);
    if (mainWindow) {
      const title = 'PriceRight Update Ready';
      const message = `PriceRight ${info.version} has been downloaded and is ready to install. Restart now to apply the update.`;
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        title,
        message,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate || '',
      });
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title,
        message,
        buttons: ['Restart and update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      }).catch(() => {});
    }
  });

  autoUpdater.on('error', (err) => {
    if (!app.isPackaged) {
      console.log('Auto-updater error:', err && err.message ? err.message : String(err));
    }
    ulog(`[updater] Error: ${err && err.message ? err.message : String(err)}`);
  });

  // Check for updates 10 seconds after launch to not slow down startup
  setTimeout(() => {
    ulog(`[updater] Starting check (app version: ${app.getVersion()})`);
    checkForUpdatesWithTimeout()
      .catch((err) => {
        if (!app.isPackaged) {
          console.log('[updater] Check failed:', err.message);
        }
      });
  }, 10000);
}

ipcMain.handle('refocus-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.focus();
    return true;
  }
  return false;
});

ipcMain.handle('print-page', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'No window found' };

  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: false,
        printBackground: true,
        color: true,
        margins: { marginType: 'printableArea' },
        pageSize: 'A4',
        landscape: options.landscape || false,
        ...options,
      },
      (success, failureReason) => {
        if (success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: failureReason });
        }
      },
    );
  });
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-external-url', async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

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
    devLog('[download] fetching:', targetUrl);
    if (redirectCount > 5) {
      devLog('[download] too many redirects');
      return Promise.resolve({
        success: false,
        error: 'Too many redirects',
      });
    }

    return new Promise((resolve) => {
      http.get(targetUrl, (response) => {
        devLog('[download] status:', response.statusCode);
        devLog('[download] content-type:', response.headers['content-type']);

        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          devLog('[download] redirect to:', response.headers.location);
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
          devLog('[download] non-200, failing');
          response.resume();
          try { fs.unlinkSync(filePath); } catch {}
          resolve({
            success: false,
            error: 'Server returned status ' + response.statusCode,
          });
          return;
        }

        devLog('[download] 200 OK, saving to:', filePath);
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
  const existingHealth = await fetchHealthStatus();
  const serverAlreadyRunning = existingHealth?.status === 'ok';

  if (serverAlreadyRunning && existingHealth?.runtime !== 'electron') {
    dialog.showErrorBox(
      'PriceRight - Wrong Server Running',
      'A development server is already running on port 3000.\n\n'
        + 'The desktop app needs its own server to load your saved data from AppData.\n\n'
        + 'Please close any "npm run dev:server" terminal, then restart PriceRight.'
    );
    app.quit();
    return;
  }

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
        devLog('[startup] demo.db updated to version', DEMO_DB_VERSION);
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
      showServerStartupErrorDialog();
      app.quit();
      return;
    }

    const serverReady = await waitForServerWithRetry();
    if (!serverReady) {
      showServerStartupErrorDialog();
      app.quit();
      return;
    }
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
