import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { API_BASE, backupApi, demoModeApi } from '../api';

const REMINDER_DAYS = 7;
const SNOOZE_DAYS = 3;
const STORAGE_KEY = 'backupReminderSnoozedUntil';

export function BackupReminderBanner() {
  const [show, setShow] = useState(false);
  const [daysSinceBackup, setDaysSinceBackup] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void checkBackupStatus();
  }, []);

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
      const snoozedUntil = localStorage.getItem(STORAGE_KEY);
      if (snoozedUntil) {
        const snoozeDate = new Date(snoozedUntil);
        if (snoozeDate > new Date()) return;
      }

      const status = await backupApi.getStatus();

      if (!status.lastBackupTime) {
        setDaysSinceBackup(999);
        setShow(true);
        return;
      }

      const lastBackup = new Date(status.lastBackupTime);
      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays >= REMINDER_DAYS) {
        setDaysSinceBackup(diffDays);
        setShow(true);
      }
    } catch {
      // Silently fail — do not show banner if status check fails
    }
  }

  function handleSnooze() {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + SNOOZE_DAYS);
    localStorage.setItem(STORAGE_KEY, snoozeUntil.toISOString());
    setShow(false);
  }

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
      setShow(false);
    } catch {
      // Silent fail
    } finally {
      setDownloading(false);
    }
  }

  if (!show) return null;

  const message = daysSinceBackup === 999
    ? 'You have never backed up your data.'
    : daysSinceBackup === 1
    ? 'You last backed up 1 day ago.'
    : `You last backed up ${daysSinceBackup} days ago.`;

  return (
    <div style={{
      background: '#FFFBEB',
      borderBottom: '1px solid #FDE68A',
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexShrink: 0,
    }}>
      <div style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: '#F59E0B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          color: 'white',
          fontSize: '12px',
          fontWeight: 700,
          lineHeight: 1,
        }}>!</span>
      </div>

      <span style={{
        fontSize: '13px',
        color: '#92400E',
        flex: 1,
      }}>
        {message} Back up your data to avoid losing it.
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
          background: '#D97706',
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
        onClick={handleSnooze}
        style={{
          fontSize: '12px',
          color: '#92400E',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          padding: '4px 6px',
          borderRadius: '4px',
        }}
      >
        Remind me later
      </button>

      <button
        type="button"
        onClick={handleSnooze}
        aria-label="Dismiss backup reminder"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#D97706',
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
