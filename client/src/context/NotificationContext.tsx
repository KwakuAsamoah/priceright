import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface Notification {
  id: string;
  type: 'update' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  updateInfo?: UpdateInfo;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead: () => void;
  clearAll: () => void;
  updateInfo: UpdateInfo | null;
  isDownloading: boolean;
  isUpdateReady: boolean;
  setUpdateAvailable: (info: UpdateInfo) => void;
  setUpdateReady: (info: UpdateInfo) => void;
  setUpdateDownloadFailed: (info: { currentVersion: string }) => void;
  restartAndUpdate: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAllRead: () => {},
  clearAll: () => {},
  updateInfo: null,
  isDownloading: false,
  isUpdateReady: false,
  setUpdateAvailable: () => {},
  setUpdateReady: () => {},
  setUpdateDownloadFailed: () => {},
  restartAndUpdate: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length + (isUpdateReady ? 1 : 0);

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications(prev => [{
      ...n,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    }, ...prev]);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const setUpdateAvailable = useCallback((info: UpdateInfo) => {
    setUpdateInfo(info);
    setIsDownloading(true);
  }, []);

  const setUpdateReady = useCallback((info: UpdateInfo) => {
    setUpdateInfo(info);
    setIsDownloading(false);
    setIsUpdateReady(true);
    addNotification({
      type: 'update',
      title: `Update ready — v${info.version}`,
      message: `PriceRight v${info.version} has been downloaded and is ready to install.`,
      updateInfo: info,
    });
  }, [addNotification]);

  const setUpdateDownloadFailed = useCallback((info: { currentVersion: string }) => {
    setIsDownloading(false);
    setIsUpdateReady(false);
    setUpdateInfo(null);
    addNotification({
      type: 'info',
      title: 'Update not installed yet',
      message: `Update download didn't complete. You're still running version ${info.currentVersion}. We'll try again next time you open PriceRight.`,
    });
  }, [addNotification]);

  const restartAndUpdate = useCallback(() => {
    window.electronAPI?.restartAndUpdate?.();
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAllRead,
      clearAll,
      updateInfo,
      isDownloading,
      isUpdateReady,
      setUpdateAvailable,
      setUpdateReady,
      setUpdateDownloadFailed,
      restartAndUpdate,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
