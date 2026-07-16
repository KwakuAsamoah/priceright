import { useState, useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { API_BASE, backupApi, demoModeApi, materialsApi, productsApi } from '../api';

const REMINDER_DAYS = 7;
const RESHOW_MS = 2 * 24 * 60 * 60 * 1000;
const AUTO_DISMISS_MS = 15_000;
const LAST_SHOWN_KEY = 'backupReminderLastShownAt';

export function BackupReminderBanner() {
  const [show, setShow] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void checkBackupStatus();
    return () => {
      if (dismissTimerRef.current != null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  function markShown() {
    try {
      localStorage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
    } catch {
      // localStorage unavailable
    }
  }

  function dismiss() {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setShow(false);
  }

  function revealBanner() {
    markShown();
    setShow(true);
    dismissTimerRef.current = window.setTimeout(() => {
      setShow(false);
      dismissTimerRef.current = null;
    }, AUTO_DISMISS_MS);
  }

  async function checkBackupStatus() {
    const isElectron = Boolean(window.electronAPI?.isElectron);
    if (!isElectron) return;

    try {
      const demoState = await demoModeApi.get();
      if (demoState.demoMode) return;
    } catch {
      // Continue if demo mode check fails
    }

    try {
      const lastShownRaw = localStorage.getItem(LAST_SHOWN_KEY);
      if (lastShownRaw) {
        const lastShown = new Date(lastShownRaw);
        if (!Number.isNaN(lastShown.getTime()) && Date.now() - lastShown.getTime() < RESHOW_MS) {
          return;
        }
      }

      // Same count pattern as App.tsx navCounts / Dashboard loadData
      const [productsData, materialsData] = await Promise.all([
        productsApi.getAll(),
        materialsApi.getAll(),
      ]);
      const productCount = Array.isArray(productsData) ? productsData.length : 0;
      const materialCount = Array.isArray(materialsData) ? materialsData.length : 0;
      if (productCount + materialCount === 0) return;

      const status = await backupApi.getStatus();

      if (!status.lastBackupTime) {
        revealBanner();
        return;
      }

      const lastBackup = new Date(status.lastBackupTime);
      const diffDays = Math.floor(
        (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays >= REMINDER_DAYS) {
        revealBanner();
      }
    } catch {
      // Silently fail — do not show banner if status check fails
    }
  }

  /** Same download path as Settings handleBackup / previous banner action. */
  async function handleDownload() {
    setDownloading(true);
    try {
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `priceright_backup_${date}.db`;

      if (window.electronAPI?.isElectron) {
        const response = await fetch(`${API_BASE}/backup/download`);
        if (!response.ok) throw new Error('Backup download failed');
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const result = await window.electronAPI.saveBackupFile(base64, filename);
        if (!result.canceled && !result.success) {
          throw new Error(result.error ?? 'Save failed');
        }
      } else {
        const link = document.createElement('a');
        link.href = `${API_BASE}/backup/download`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      dismiss();
    } catch {
      // Silent fail
    } finally {
      setDownloading(false);
    }
  }

  if (!show) return null;

  return (
    <div
      className="backup-reminder-banner"
      style={{
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: '13px',
          color: '#334155',
          flex: 1,
        }}
      >
        Remember to back up your data
      </span>

      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={downloading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 12px',
          background: '#0F2847',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: downloading ? 'default' : 'pointer',
          flexShrink: 0,
          opacity: downloading ? 0.7 : 1,
        }}
      >
        <Download size={13} />
        {downloading ? 'Downloading...' : 'Back up now'}
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss backup reminder"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          padding: '2px',
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
