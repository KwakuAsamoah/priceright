import { useCallback, useState } from 'react';
import { downloadTemplate } from '../api';

export function useTemplateDownload() {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = useCallback(async (filename: string) => {
    setDownloading(filename);
    try {
      await downloadTemplate(filename);
    } finally {
      setDownloading(null);
    }
  }, []);

  return { downloading, handleDownload };
}
