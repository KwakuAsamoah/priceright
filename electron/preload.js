'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  downloadFile: (url, defaultFilename) =>
    ipcRenderer.invoke('download-file', url, defaultFilename),
  saveBackupFile: (base64Data, defaultFilename) =>
    ipcRenderer.invoke('save-backup-file', base64Data, defaultFilename),
  selectRestoreFile: () =>
    ipcRenderer.invoke('select-restore-file'),
  getMachineId: () =>
    ipcRenderer.invoke('get-machine-id'),
  checkLicence: () =>
    ipcRenderer.invoke('check-licence'),
  activateTrial: (email) =>
    ipcRenderer.invoke('activate-trial', email),
  validateLicence: (key) =>
    ipcRenderer.invoke('validate-licence', key),
  licenceServerUrl:
    process.env.LICENCE_SERVER_URL ||
    'https://priceright-licence-server.up.railway.app',
});
