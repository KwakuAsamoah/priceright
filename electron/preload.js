'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  downloadFile: (url, defaultFilename) =>
    ipcRenderer.invoke('download-file', url, defaultFilename),
});
