/**
 * Downloads a file from the given URL.
 * In Electron: uses native save dialog via IPC (avoids cross-origin restrictions).
 * In browser: uses fetch + blob URL so the download attribute always works.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  // Electron: delegate to main process via IPC
  if (window.electronAPI?.isElectron) {
    try {
      const result = await window.electronAPI.downloadFile(url, filename);
      if (!result.success && !result.canceled) {
        console.error('Download failed:', result.error);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
    return;
  }

  // Browser: fetch + blob URL (download attribute works for same-origin blobs)
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch {
    // Fallback: direct navigation
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
