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
  };
}
