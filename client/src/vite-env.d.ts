/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    platform: string;
    isElectron: boolean;
    downloadFile: (
      url: string,
      defaultFilename: string
    ) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
      error?: string;
    }>;
    saveBackupFile: (
      base64Data: string,
      defaultFilename: string
    ) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
      error?: string;
    }>;
    selectRestoreFile: () => Promise<{
      canceled: boolean;
      base64?: string;
      filename?: string;
      error?: string;
    }>;
  };
}
