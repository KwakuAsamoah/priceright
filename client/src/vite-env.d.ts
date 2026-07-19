/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
    getMachineId: () => Promise<string>;
    checkLicence: () => Promise<{
      status: 'not_activated' | 'active' | 'expired' | 'licensed';
      daysRemaining?: number;
      expiresAt?: string;
      email?: string;
      offline?: boolean;
      offlineLaunches?: number;
      forceOnline?: boolean;
      isConverted?: boolean;
    }>;
    activateTrial: (email: string) => Promise<{
      success: boolean;
      status?: string;
      daysRemaining?: number;
      expiresAt?: string;
      email?: string;
      alreadyActivated?: boolean;
      error?: string;
    }>;
    validateLicence: (key: string) => Promise<{
      valid: boolean;
      email?: string;
      reason?: string;
      message?: string;
      error?: string;
    }>;
    licenceServerUrl: string;
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void;
    onUpdateDownloadFailed: (callback: (info: UpdateDownloadFailedInfo) => void) => void;
    restartAndUpdate: () => void;
    refocusWindow: () => Promise<boolean>;
    getAppVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<boolean>;
    print: (options?: { landscape?: boolean }) => Promise<{ success: boolean; error?: string }>;
  };
}

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface UpdateDownloadFailedInfo {
  attemptedVersion: string;
  currentVersion: string;
  reason: string;
}
