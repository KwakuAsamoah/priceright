import { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import type { UpdateInfo } from '../context/NotificationContext';

export function UpdateModal() {
  const { setUpdateAvailable, setUpdateReady } = useNotifications();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateAvailable({
        version: info.version,
        releaseNotes: info.releaseNotes ?? '',
        releaseDate: info.releaseDate ?? '',
      });
    });

    api.onUpdateDownloaded?.((info: UpdateInfo) => {
      setUpdateReady({
        version: info.version,
        releaseNotes: info.releaseNotes ?? '',
        releaseDate: info.releaseDate ?? '',
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
