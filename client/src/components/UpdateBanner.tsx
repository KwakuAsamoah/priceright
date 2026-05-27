import { useEffect, useState } from 'react';

export function UpdateBanner() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable?.((version: string) => {
      setUpdateVersion(version);
    });

    window.electronAPI.onUpdateDownloaded?.((version: string) => {
      setUpdateVersion(version);
      setDownloaded(true);
    });
  }, []);

  if (!updateVersion) return null;

  return (
    <div style={{
      background: '#f0fdf4',
      borderBottom: '1px solid #bbf7d0',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '13px',
      gap: '12px',
    }}>
      <div style={{ color: '#166534', fontWeight: 600 }}>
        {downloaded
          ? `PriceRight v${updateVersion} is ready — will install on next restart`
          : `PriceRight v${updateVersion} is available — downloading...`
        }
      </div>
      {downloaded && (
        <button
          type="button"
          onClick={() => window.electronAPI?.restartAndUpdate()}
          style={{
            padding: '4px 12px',
            background: '#166534',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Restart to update
        </button>
      )}
    </div>
  );
}
