import { LayoutDashboard } from 'lucide-react';

type WelcomeModalProps = {
  onGetStarted: () => void;
  onSkip: () => void;
};

export default function WelcomeModal({ onGetStarted, onSkip }: WelcomeModalProps) {
  return (
    <div className="welcome-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title">
      <div className="welcome-modal-card">
        <div className="welcome-modal-icon" aria-hidden="true">
          <LayoutDashboard size={48} strokeWidth={2} />
        </div>
        <h2 id="welcome-modal-title" className="welcome-modal-title">Welcome to PriceRight</h2>
        <p className="welcome-modal-subtitle">Your complete pricing management system</p>

        <p className="welcome-modal-body">
          PriceRight helps you build accurate product costs, set profitable prices, and manage what you charge every customer — all in one place.
          Let&apos;s get you set up. It takes about 10 minutes the first time.
        </p>

        <ol className="welcome-modal-steps">
          <li>Add your raw materials and costs</li>
          <li>Build products with Bill of Materials</li>
          <li>Approve your product prices</li>
          <li>Set up customer price levels</li>
          <li>Add your customers</li>
          <li>Generate price lists</li>
        </ol>

        <button type="button" className="welcome-modal-primary" onClick={onGetStarted}>
          Get Started →
        </button>
        <button type="button" className="welcome-modal-skip" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}