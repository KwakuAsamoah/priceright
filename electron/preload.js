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
});
