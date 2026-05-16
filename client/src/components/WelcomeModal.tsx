import { LayoutDashboard } from 'lucide-react';

type WelcomeModalProps = {
  onGetStarted: () => void;
};

const GUIDE_POINTS = [
  'Add your raw materials and costs.',
  'Build products with bills of materials.',
  'Approve base prices for your products.',
  'Create price levels for customer groups.',
  'Export a price list to Excel or PDF.',
];

function openPrintableGuide() {
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!printWindow) {
    return;
  }

  const pointsHtml = GUIDE_POINTS.map((point) => `<li>${point}</li>`).join('');
  printWindow.document.write(`
    <html>
      <head>
        <title>PriceRight Welcome Guide</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
          .page { max-width: 720px; margin: 0 auto; }
          .header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
          .icon { width: 52px; height: 52px; border-radius: 16px; background: #111111; color: #ffffff; display: flex; align-items: center; justify-content: center; }
          h1 { margin: 0; font-size: 28px; }
          .subtitle { margin: 4px 0 0; color: #475569; font-size: 14px; }
          p { line-height: 1.7; font-size: 14px; color: #334155; }
          ol { margin: 18px 0 0 20px; padding: 0; }
          li { margin: 0 0 10px; line-height: 1.6; font-size: 14px; }
          .note { margin-top: 18px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="icon">PR</div>
            <div>
              <h1>PriceRight Welcome Guide</h1>
              <div class="subtitle">Simple setup instructions for first-time users</div>
            </div>
          </div>
          <p>PriceRight helps you cost products accurately, approve base prices, and manage customer pricing in one place.</p>
          <ol>${pointsHtml}</ol>
          <div class="note">
            Downloading sample data is optional. If you want to explore first, go to Settings and download the bundled sample files.
          </div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

export default function WelcomeModal({ onGetStarted }: WelcomeModalProps) {
  return (
    <div className="welcome-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title">
      <div className="welcome-modal-card welcome-modal-card-simple">
        <div className="welcome-modal-icon" aria-hidden="true">
          <LayoutDashboard size={48} strokeWidth={2} />
        </div>
        <h2 id="welcome-modal-title" className="welcome-modal-title">Welcome to PriceRight</h2>
        <p className="welcome-modal-subtitle">Pricing management for food manufacturers</p>

        <p className="welcome-modal-body">
          PriceRight helps you build accurate product costs from your raw materials, set profitable prices, and manage what
          you charge different customer groups - all in one place. Start by adding your materials and products, or explore
          first using our built-in sample data.
        </p>

        <div className="welcome-modal-actions welcome-modal-actions-simple">
          <button type="button" className="welcome-modal-secondary" onClick={openPrintableGuide}>
            Download starter guide
          </button>
          <button type="button" className="welcome-modal-primary" onClick={onGetStarted}>
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}
