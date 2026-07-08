export type PrintPageOptions = {
  landscape?: boolean;
};

const PRINT_ROOT_ID = 'priceright-print-root';

export async function printPage(options: PrintPageOptions = {}): Promise<{ success: boolean; error?: string }> {
  if (window.electronAPI?.print) {
    return window.electronAPI.print(options);
  }
  window.print();
  return { success: true };
}

export async function printHtmlContent(
  html: string,
  options: PrintPageOptions = {},
): Promise<boolean> {
  if (window.electronAPI?.isElectron) {
    let root = document.getElementById(PRINT_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PRINT_ROOT_ID;
      document.body.appendChild(root);
    }

    root.innerHTML = html;

    try {
      const result = await printPage(options);
      return result.success;
    } finally {
      root.remove();
    }
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  printWindow.print();
  return true;
}
