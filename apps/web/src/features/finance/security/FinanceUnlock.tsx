import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { refreshFinanceSecurity } from './finance-access-session.js';
import { peekFinanceAccess, subscribeFinanceAccess } from './finance-access.js';
import type { FinanceAccessController } from './finance-access-controller.js';

export function FinanceUnlock({
  controller,
  onUnlocked,
  onCancel,
}: {
  controller: FinanceAccessController;
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState('Enter your separate Finance PIN.');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const mounted = useRef(true);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      // A successful grant emits before its promise resumes; the boundary may already
      // have replaced this form. Navigation/embedded-visit cleanup owns that open visit.
      if (pending.current && !controller.canRead()) controller.lock();
      pending.current = false;
    };
  }, [controller]);
  function cancel() {
    generation.current++;
    pending.current = false;
    controller.lock();
    setBusy(false);
    onCancel();
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const pin = String(new FormData(form).get('financePin') ?? '');
    form.reset();
    const operation = ++generation.current;
    pending.current = true;
    setBusy(true);
    try {
      if (navigator.onLine) await controller.unlockOnline(pin);
      else await controller.unlockOffline(pin);
      if (mounted.current && generation.current === operation) {
        pending.current = false;
        onUnlocked();
      }
    } catch (error) {
      if (mounted.current && generation.current === operation)
        setStatus(error instanceof Error ? error.message : 'Unable to unlock Finance.');
    } finally {
      if (mounted.current && generation.current === operation) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section aria-labelledby={titleId}>
      <h1 id={titleId}>Unlock Finance</h1>
      <p role="status">{status}</p>
      <form onSubmit={unlock}>
        <label>
          Finance PIN{' '}
          <input
            name="financePin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,32}"
            minLength={6}
            maxLength={32}
            required
            disabled={busy}
          />
        </label>
        <button disabled={busy}>{busy ? 'Unlocking…' : 'Unlock Finance'}</button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </form>
      <p>
        Forgotten your Finance PIN? Set a replacement with your current password in Account
        security. Your saved changes remain on this device.
      </p>
    </section>
  );
}

/** Children mount only after the gate; lock unmounts every protected plaintext view. */
export function FinanceAccessBoundary({
  ownerId,
  children,
  onCancel,
}: {
  ownerId: string;
  csrfToken: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const [, changed] = useState(0);
  const [status, setStatus] = useState('Checking Finance security…');
  useEffect(() => subscribeFinanceAccess(() => changed((value) => value + 1)), []);
  const controller = peekFinanceAccess();
  async function refresh() {
    if (!controller) return;
    setStatus('Checking Finance security…');
    try {
      await controller.markStale();
      await refreshFinanceSecurity(controller, ownerId);
    } catch {
      setStatus('Connect to refresh Finance security.');
    }
  }
  if (!controller || !controller.securityReady)
    return (
      <section>
        <h1>Finance</h1>
        <p role="status">{status}</p>
        <button onClick={() => void refresh()}>Refresh Finance security</button>
        <button onClick={onCancel}>Cancel</button>
      </section>
    );
  if (!controller.canRead())
    return (
      <>
        <FinanceUnlock
          controller={controller}
          onUnlocked={() => changed((value) => value + 1)}
          onCancel={onCancel}
        />
        <p role="status">{status}</p>
        <button onClick={() => void refresh()}>Refresh Finance security</button>
      </>
    );
  return (
    <>
      {controller.requiresPin ? (
        <button onClick={() => controller.lock()}>Lock Finance</button>
      ) : null}
      {children}
    </>
  );
}
