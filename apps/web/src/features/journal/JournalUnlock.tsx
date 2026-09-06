import { useState } from 'react';
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
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      setError('');
      await (enrolled ? onUnlock(pin) : onEnroll(pin));
      setPin('');
    } catch (error) {
      setError(
        enrolled
          ? 'The journal could not be unlocked. Check the PIN and try again.'
          : error instanceof JournalEnrollmentError
            ? error.message
            : 'The Journal could not be created. No enrollment was saved. Refresh and try again.',
      );
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
        Journal PIN
        <input
          aria-label="Journal PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          minLength={6}
          onChange={(event) => setPin(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={!/^\d{6,32}$/u.test(pin)} onClick={() => void submit()}>
        {enrolled ? 'Unlock' : 'Create Journal'}
      </button>
    </section>
  );
}
