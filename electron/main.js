const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { pathToFileURL } = require('url');

const SERVER_PORT = 3000;
const isProd = app.isPackaged;

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
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `PriceRight ${info.version} is available.`,
        detail: 'Download and install the update now?',
        buttons: ['Download update', 'Remind me later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'PriceRight will restart to install the update.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err && err.message ? err.message : err);
  });

  setTimeout(() => autoUpdater.checkForUpdates(), 10000);
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

  return new Promise((resolve) => {
    const file = fs.createWriteStream(filePath);
    http.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve({ success: true, filePath });
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      resolve({ success: false, error: err.message });
    });
  });
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

app.whenReady().then(async () => {
  const serverAlreadyRunning = await checkServerOnce();
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
