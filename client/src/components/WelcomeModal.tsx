import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { settingsApi } from '../api';
import { useOnboarding } from '../context/OnboardingContext';

interface WelcomeModalProps {
  onDismiss: () => void;
}

export function WelcomeModal({ onDismiss }: WelcomeModalProps) {
  const { startOnboarding } = useOnboarding();
  const [saving, setSaving] = useState(false);

  async function handleDismiss() {
    setSaving(true);
    try {
      await settingsApi.save({
        settingKey: 'onboardingCompleted',
        settingValue: 'true',
      });
    } catch {
      // Non-blocking.
    }
    setSaving(false);
    onDismiss();
  }

  async function handleStartMaterials() {
    setSaving(true);
    try {
      await settingsApi.save({
        settingKey: 'onboardingCompleted',
        settingValue: 'in_progress',
      });
    } catch {
      // Non-blocking.
    }
    setSaving(false);
    onDismiss();
    startOnboarding();
  }

  const steps = [
    {
      number: '0',
      title: 'Set your base currency',
      description: 'Go to Settings → Currencies & Rates and choose your base currency first.',
      color: '#0F2847',
    },
    {
      number: '1',
      title: 'Add your materials',
      description: 'Enter your raw materials and current prices.',
      color: '#0F2847',
    },
    {
      number: '2',
      title: 'Build your products',
      description: 'Define your product recipes — what goes in and how much.',
      color: '#0F2847',
    },
    {
      number: '3',
      title: 'Approve your prices',
      description: 'Review calculated costs and approve your selling prices.',
      color: '#0F2847',
    },
    {
      number: '4',
      title: 'Export your price list',
      description: 'Share approved prices with your sales team via price levels.',
      color: '#059669',
    },
  ];

  return (
    <div className="welcome-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title">
      <div className="welcome-modal-card welcome-modal-card-onboarding" style={{ position: 'relative' }}>
        <button className="btn-close-x" onClick={() => { void handleDismiss(); }} aria-label="Close" disabled={saving}>
          &times;
        </button>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div className="welcome-modal-icon" aria-hidden="true">
            <ClipboardList size={32} strokeWidth={2} />
          </div>
          <h2 id="welcome-modal-title" className="welcome-modal-title">Welcome to PriceRight</h2>
          <p className="welcome-modal-subtitle" style={{ maxWidth: '420px', margin: '8px auto 0' }}>
            You are minutes away from knowing your true production cost.
            Set your base currency first, then follow these steps:
          </p>
        </div>

        <div className="welcome-modal-step-grid">
          {steps.map((step) => (
            <div key={step.number} className="welcome-modal-step-card">
              <div className="welcome-modal-step-number" style={{ backgroundColor: step.color }}>
                {step.number}
              </div>
              <div>
                <div className="welcome-modal-step-title">{step.title}</div>
                <div className="welcome-modal-step-description">{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="welcome-modal-tip">
          💡 Tip: Set your base currency in Settings → Currencies & Rates before adding materials.
        </div>

        <div className="welcome-modal-actions welcome-modal-actions-onboarding">
          <button
            type="button"
            className="welcome-modal-primary"
            onClick={() => { void handleStartMaterials(); }}
            disabled={saving}
          >
            Start with Materials →
          </button>
          <button
            type="button"
            className="welcome-modal-secondary"
            onClick={() => { void handleDismiss(); }}
            disabled={saving}
          >
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeModal;
