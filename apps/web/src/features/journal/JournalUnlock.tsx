import { useEffect, useRef, useState } from 'react';
import { JournalEnrollmentError } from './journal-enrollment.js';

export function JournalUnlock({
  enrolled,
  onEnroll,
  onUnlock,
}: {
  enrolled: boolean;
  onEnroll: (pin: string) => Promise<void>;
  onUnlock: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const lastAttempt = useRef('');
  const unlockRef = useRef(onUnlock);
  unlockRef.current = onUnlock;
  useEffect(() => {
    if (!enrolled || busy || !/^\d{6,32}$/u.test(pin) || lastAttempt.current === pin) return;
    const timer = setTimeout(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastAttempt.current = pin;
      setBusy(true);
      setError('');
      void unlockRef
        .current(pin)
        .catch(() => {
          // A pause while entering a longer PIN is not a submitted failure.
        })
        .finally(() => {
          inFlight.current = false;
          setBusy(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [pin, enrolled, busy]);
  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastAttempt.current = pin;
    setBusy(true);
    try {
      setError('');
      if (!enrolled && pin !== confirmation) return;
      await (enrolled ? onUnlock(pin) : onEnroll(pin));
      setPin('');
      setConfirmation('');
    } catch (error) {
      setError(
        enrolled
          ? 'The journal could not be unlocked. Check the PIN and try again.'
          : error instanceof JournalEnrollmentError
            ? error.message
            : 'The Journal could not be created. No enrollment was saved. Refresh and try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="journal-unlock">
      <h1>{enrolled ? 'Unlock Journal' : 'Create your private Journal'}</h1>
      <p>
        Your entries are encrypted before leaving this browser. Your Journal PIN is separate from
        your password.
      </p>
      <label>
        Journal PIN *
        <input
          aria-label="Journal PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          minLength={6}
          maxLength={32}
          required
          onChange={(event) => setPin(event.target.value)}
        />
      </label>
      {!enrolled && (
        <label>
          Confirm Journal PIN *
          <input
            aria-label="Confirm Journal PIN"
            required
            maxLength={32}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      )}
      {!enrolled && confirmation && pin !== confirmation && <p role="status">PINs must match.</p>}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy || !/^\d{6,32}$/u.test(pin) || (!enrolled && pin !== confirmation)}
        onClick={() => void submit()}
      >
        {busy ? 'Checking…' : enrolled ? 'Unlock' : 'Create Journal'}
      </button>
    </section>
  );
}
