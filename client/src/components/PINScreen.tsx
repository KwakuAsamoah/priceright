import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Delete } from 'lucide-react';
import { pinApi } from '../api';
import PriceRightLogoIcon from './PriceRightLogoIcon';

type PinScreenMode = 'loading' | 'set' | 'enter' | 'forgot';
type SetPinField = 'pin' | 'confirmPin';
type PinTarget = 'pin' | 'confirmPin';

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;
const PIN_VALIDATION_REGEX = /^\d{4,6}$/;

function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH);
}

function getPinDotSlotCount(length: number): number {
  if (length >= PIN_MAX_LENGTH) return PIN_MAX_LENGTH;
  if (length >= PIN_MIN_LENGTH) return length + 1;
  return PIN_MIN_LENGTH;
}

function PinScreenBrandHeader() {
  return (
    <div className="pin-screen-brand">
      <div className="pin-screen-brand-icon">
        <PriceRightLogoIcon size={52} className="pin-screen-brand-logo" />
      </div>
      <div className="pin-screen-brand-title">PriceRight</div>
      <div className="pin-screen-brand-subtitle">Pricing management</div>
    </div>
  );
}

function PinDotRow({
  filledCount,
  hasError,
  shake,
}: {
  filledCount: number;
  hasError?: boolean;
  shake?: boolean;
}) {
  const slotCount = getPinDotSlotCount(filledCount);

  return (
    <div
      className={[
        'pin-screen-dots',
        hasError ? 'pin-screen-dots-error' : '',
        shake ? 'pin-screen-dots-shake' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: slotCount }, (_, index) => (
        <span
          key={index}
          className={`pin-screen-dot ${index < filledCount ? 'is-filled' : ''}`}
        />
      ))}
    </div>
  );
}

function PinCaretInput({
  inputRef,
  disabled,
  ariaLabel,
  onKeyDown,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  ariaLabel: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      ref={inputRef}
      className="pin-screen-caret-input"
      type="tel"
      inputMode="numeric"
      autoComplete="off"
      value=""
      disabled={disabled}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onChange={onChange}
    />
  );
}

function PinKeypad({
  disabled,
  onDigit,
  onBackspace,
}: {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="pin-screen-keypad" role="group" aria-label="PIN keypad">
      {digits.map((digit) => (
        <button
          key={digit}
          type="button"
          className="pin-screen-key"
          disabled={disabled}
          onClick={() => onDigit(digit)}
          aria-label={`Digit ${digit}`}
        >
          {digit}
        </button>
      ))}
      <span className="pin-screen-key pin-screen-key-spacer" aria-hidden="true" />
      <button
        type="button"
        className="pin-screen-key"
        disabled={disabled}
        onClick={() => onDigit('0')}
        aria-label="Digit 0"
      >
        0
      </button>
      <button
        type="button"
        className="pin-screen-key pin-screen-key-backspace"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Backspace"
      >
        <Delete size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function PINScreen({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<PinScreenMode>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [activeSetField, setActiveSetField] = useState<SetPinField>('pin');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinEntryError, setPinEntryError] = useState(false);
  const [pinEntryShake, setPinEntryShake] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const focusPinInput = useCallback(() => {
    window.setTimeout(() => pinInputRef.current?.focus(), 0);
  }, []);

  const triggerPinEntryError = useCallback(() => {
    setPinEntryError(true);
    setPinEntryShake(true);
    window.setTimeout(() => setPinEntryShake(false), 520);
    window.setTimeout(() => setPinEntryError(false), 520);
  }, []);

  useEffect(() => {
    let isMounted = true;

    pinApi.getStatus()
      .then((status) => {
        if (!isMounted) {
          return;
        }
        setMode(status.hasPIN ? 'enter' : 'set');
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setErrorMessage('Could not load PIN settings. Please restart PriceRight.');
        setMode('enter');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode === 'set' || mode === 'enter') {
      const timer = window.setTimeout(() => {
        pinInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mode, activeSetField]);

  const appendDigit = useCallback((target: PinTarget, digit: string) => {
    if (isSubmitting) return;

    setErrorMessage('');
    setPinEntryError(false);

    if (target === 'pin') {
      setPin((current) => sanitizePinInput(current + digit));
      return;
    }

    setConfirmPin((current) => sanitizePinInput(current + digit));
  }, [isSubmitting]);

  const removeLastDigit = useCallback((target: PinTarget) => {
    if (isSubmitting) return;

    setErrorMessage('');
    setPinEntryError(false);

    if (target === 'pin') {
      setPin((current) => current.slice(0, -1));
      return;
    }

    setConfirmPin((current) => current.slice(0, -1));
  }, [isSubmitting]);

  const clearPinField = useCallback((target: PinTarget) => {
    if (isSubmitting) return;

    setErrorMessage('');
    setPinEntryError(false);

    if (target === 'pin') {
      setPin('');
      return;
    }

    setConfirmPin('');
  }, [isSubmitting]);

  const createPinInputHandlers = useCallback((target: PinTarget) => ({
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (isSubmitting) return;

      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        appendDigit(target, event.key);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeLastDigit(target);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearPinField(target);
      }
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const digits = sanitizePinInput(event.target.value);
      event.target.value = '';
      if (!digits || isSubmitting) return;

      setErrorMessage('');
      setPinEntryError(false);

      if (target === 'pin') {
        setPin((current) => sanitizePinInput(current + digits));
        return;
      }

      setConfirmPin((current) => sanitizePinInput(current + digits));
    },
  }), [isSubmitting, appendDigit, removeLastDigit, clearPinField]);

  async function handleSetPin(event: FormEvent) {
    event.preventDefault();
    setErrorMessage('');

    if (!PIN_VALIDATION_REGEX.test(pin)) {
      setErrorMessage('PIN must be 4 to 6 digits.');
      setActiveSetField('pin');
      triggerPinEntryError();
      focusPinInput();
      return;
    }

    if (pin !== confirmPin) {
      setErrorMessage('PINs do not match.');
      setActiveSetField('confirmPin');
      triggerPinEntryError();
      focusPinInput();
      return;
    }

    setIsSubmitting(true);
    try {
      await pinApi.set(pin);
      onUnlock();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to set PIN.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyPin(event?: FormEvent) {
    event?.preventDefault();
    setErrorMessage('');

    if (!PIN_VALIDATION_REGEX.test(pin)) {
      setErrorMessage('Enter a 4 to 6 digit PIN.');
      triggerPinEntryError();
      focusPinInput();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await pinApi.verify(pin);
      if (result.valid) {
        onUnlock();
        return;
      }

      setErrorMessage('Incorrect PIN. Please try again.');
      setPin('');
      triggerPinEntryError();
      focusPinInput();
    } catch {
      setErrorMessage('Incorrect PIN. Please try again.');
      setPin('');
      triggerPinEntryError();
      focusPinInput();
    } finally {
      setIsSubmitting(false);
    }
  }

  const enterPinInputHandlers = createPinInputHandlers('pin');
  const setPinInputHandlers = createPinInputHandlers(activeSetField);
  const setKeypadTarget: SetPinField = activeSetField;

  function activateSetField(field: SetPinField) {
    setActiveSetField(field);
    focusPinInput();
  }

  return (
    <div className="pin-screen-backdrop">
      <div className="pin-screen-card">
        <PinScreenBrandHeader />

        {mode === 'loading' && (
          <div style={{ fontSize: '16px', textAlign: 'center', color: '#334155' }}>Loading security settings...</div>
        )}

        {mode === 'set' && (
          <form onSubmit={handleSetPin} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F2847' }}>Create your PIN</div>
              <div style={{ marginTop: '6px', fontSize: '15px', lineHeight: 1.5, color: '#64748b' }}>Choose a 4-6 digit PIN to protect your data</div>
              <p className="pin-screen-keyboard-hint">Type or tap to enter your PIN</p>
            </div>

            <div className="pin-screen-entry-block">
              <button
                type="button"
                className={`pin-screen-entry-label ${activeSetField === 'pin' ? 'is-active' : ''}`}
                onClick={() => activateSetField('pin')}
              >
                New PIN
              </button>
              <div className="pin-screen-dots-row">
                <PinDotRow
                  filledCount={pin.length}
                  hasError={pinEntryError && activeSetField === 'pin'}
                  shake={pinEntryShake && activeSetField === 'pin'}
                />
                {activeSetField === 'pin' ? (
                  <PinCaretInput
                    inputRef={pinInputRef}
                    disabled={isSubmitting}
                    ariaLabel="New PIN entry"
                    onKeyDown={setPinInputHandlers.onKeyDown}
                    onChange={setPinInputHandlers.onChange}
                  />
                ) : null}
              </div>
            </div>

            <div className="pin-screen-entry-block">
              <button
                type="button"
                className={`pin-screen-entry-label ${activeSetField === 'confirmPin' ? 'is-active' : ''}`}
                onClick={() => activateSetField('confirmPin')}
              >
                Confirm PIN
              </button>
              <div className="pin-screen-dots-row">
                <PinDotRow
                  filledCount={confirmPin.length}
                  hasError={pinEntryError && activeSetField === 'confirmPin'}
                  shake={pinEntryShake && activeSetField === 'confirmPin'}
                />
                {activeSetField === 'confirmPin' ? (
                  <PinCaretInput
                    inputRef={pinInputRef}
                    disabled={isSubmitting}
                    ariaLabel="Confirm PIN entry"
                    onKeyDown={setPinInputHandlers.onKeyDown}
                    onChange={setPinInputHandlers.onChange}
                  />
                ) : null}
              </div>
            </div>

            <PinKeypad
              disabled={isSubmitting}
              onDigit={(digit) => appendDigit(setKeypadTarget, digit)}
              onBackspace={() => removeLastDigit(setKeypadTarget)}
            />

            {errorMessage && <div style={{ fontSize: '15px', color: '#dc2626', textAlign: 'center' }}>{errorMessage}</div>}

            <button
              type="submit"
              className="pin-screen-btn-primary"
              disabled={isSubmitting || pin.length === 0 || confirmPin.length === 0}
            >
              {isSubmitting ? '...' : 'Set PIN'}
            </button>
          </form>
        )}

        {mode === 'enter' && (
          <form onSubmit={handleVerifyPin} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F2847' }}>Welcome back</div>
              <div style={{ marginTop: '6px', fontSize: '15px', lineHeight: 1.5, color: '#64748b' }}>Enter your PIN to continue</div>
              <p className="pin-screen-keyboard-hint">Type or tap to enter your PIN</p>
            </div>

            <div className="pin-screen-entry-block pin-screen-entry-block-enter">
              <div className="pin-screen-dots-row">
                <PinDotRow
                  filledCount={pin.length}
                  hasError={pinEntryError}
                  shake={pinEntryShake}
                />
                <PinCaretInput
                  inputRef={pinInputRef}
                  disabled={isSubmitting}
                  ariaLabel="PIN entry"
                  onKeyDown={enterPinInputHandlers.onKeyDown}
                  onChange={enterPinInputHandlers.onChange}
                />
              </div>
            </div>

            <PinKeypad
              disabled={isSubmitting}
              onDigit={(digit) => appendDigit('pin', digit)}
              onBackspace={() => removeLastDigit('pin')}
            />

            {errorMessage && <div style={{ fontSize: '15px', color: '#dc2626', textAlign: 'center' }}>{errorMessage}</div>}

            <button
              type="submit"
              className="pin-screen-btn-primary"
              disabled={isSubmitting || pin.length === 0}
            >
              {isSubmitting ? '...' : 'Unlock'}
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setMode('forgot');
              }}
              style={{ border: 'none', background: 'transparent', padding: 0, color: '#64748b', fontSize: '15px', textDecoration: 'underline', cursor: 'pointer', justifySelf: 'center' }}
            >
              Forgot your PIN?
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F2847' }}>Reset your PIN</div>
              <div style={{ marginTop: '10px', fontSize: '16px', lineHeight: 1.6, color: '#334155' }}>
                To reset your PIN, contact PriceRight support with your licence key.
              </div>
              <a href="mailto:support@priceright.app" style={{ display: 'inline-block', marginTop: '10px', fontSize: '16px', color: '#0F2847', fontWeight: 600 }}>
                support@priceright.app
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setPin('');
                setMode('enter');
              }}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', background: '#ffffff', color: '#0F2847', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
