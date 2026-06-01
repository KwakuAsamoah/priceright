import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { settingsApi } from '../api';

export type OnboardingStep =
  | 'welcome'
  | 'materials'
  | 'products'
  | 'prices'
  | 'price-levels'
  | 'complete';

interface OnboardingContextValue {
  isActive: boolean;
  currentStep: OnboardingStep;
  startOnboarding: () => void;
  resumeOnboarding: () => void;
  nextStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  isActive: false,
  currentStep: 'welcome',
  startOnboarding: () => {},
  resumeOnboarding: () => {},
  nextStep: () => {},
  skipOnboarding: () => {},
  completeOnboarding: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

const STEP_ORDER: OnboardingStep[] = [
  'materials',
  'products',
  'prices',
  'price-levels',
  'complete',
];

export function OnboardingProvider({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: (path: string) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');

  const completeOnboarding = useCallback(async () => {
    setIsActive(false);
    setCurrentStep('complete');
    try {
      await settingsApi.save({
        settingKey: 'onboardingCompleted',
        settingValue: 'true',
      });
    } catch {
      // Non-blocking.
    }
    navigate('/');
  }, [navigate]);

  const startOnboarding = useCallback(() => {
    setIsActive(true);
    setCurrentStep('materials');
    navigate('/materials');
  }, [navigate]);

  const resumeOnboarding = useCallback(() => {
    setIsActive(true);
    setCurrentStep('materials');
    navigate('/materials');
  }, [navigate]);

  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex === -1) {
      return;
    }

    const next = STEP_ORDER[currentIndex + 1];

    if (!next || next === 'complete') {
      void completeOnboarding();
      return;
    }

    setCurrentStep(next);

    const pageMap: Partial<Record<OnboardingStep, string>> = {
      products: '/products',
      prices: '/products',
      'price-levels': '/price-levels',
    };

    const nextPath = pageMap[next];
    if (nextPath) {
      navigate(nextPath);
    }
  }, [currentStep, navigate, completeOnboarding]);

  const skipOnboarding = useCallback(async () => {
    setIsActive(false);
    setCurrentStep('complete');
    try {
      await settingsApi.save({
        settingKey: 'onboardingCompleted',
        settingValue: 'true',
      });
    } catch {
      // Non-blocking.
    }
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        startOnboarding,
        resumeOnboarding,
        nextStep,
        skipOnboarding,
        completeOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
