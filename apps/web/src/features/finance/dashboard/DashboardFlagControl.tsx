import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { financeDashboardPreferencesResponseSchema } from '@naaseh/contracts';
import type { FinanceDashboardTargetKind } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess, subscribeFinanceAccess } from '../security/finance-access.js';

const path = '/finance/dashboard-preferences';
const readableAccess = () => {
  const access = peekFinanceAccess();
  return access?.canRead() ? access : undefined;
};
type Flags = ReturnType<typeof financeDashboardPreferencesResponseSchema.parse>['flags'];
const readFlags = async (signal: AbortSignal) => {
  const response = await financeRequest(path, { signal });
  const { financeDashboardPreferencesResponseSchema: schema } = await import('@naaseh/contracts');
  return schema.parse(response).flags;
};

export function useDashboardFlags(csrfToken: string) {
  const access = useSyncExternalStore(subscribeFinanceAccess, readableAccess, () => undefined);
  const visit = useRef<
    { access: NonNullable<typeof access>; controller: AbortController } | undefined
  >(undefined);
  const writing = useRef(false);
  const [flags, setFlags] = useState<Flags>();
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: FinanceDashboardTargetKind;
    id: string;
    text: string;
  }>();
  useEffect(() => {
    setFlags(undefined);
    setPending(false);
    setFeedback(undefined);
    setStatus('checking');
    if (!access) return;
    const controller = new AbortController();
    const { signal } = controller;
    visit.current = { access, controller };
    const clear = () => {
      controller.abort();
      setFlags(undefined);
      setFeedback(undefined);
      setPending(false);
      setStatus('unavailable');
    };
    const unsubscribe = access.onLock(clear);
    void readFlags(signal).then(
      (result) => {
        if (!signal.aborted && readableAccess() === access) {
          setFlags(result);
          setStatus('ready');
        }
      },
      () => {
        if (!signal.aborted) setStatus('unavailable');
      },
    );
    return () => {
      unsubscribe();
      controller.abort();
      writing.current = false;
    };
  }, [access, reload]);

  const change = async (kind: FinanceDashboardTargetKind, id: string, included: boolean) => {
    const signal = visit.current?.controller.signal;
    if (
      !access ||
      !signal ||
      signal.aborted ||
      readableAccess() !== access ||
      !flags ||
      writing.current
    )
      return;
    writing.current = true;
    setPending(true);
    setFeedback(undefined);
    const current = () => !signal.aborted && readableAccess() === access;
    const previous = flags.find((flag) => flag.targetKind === kind && flag.targetId === id);
    try {
      await financeRequest(`${path}/${kind}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ included, expectedVersion: previous?.version ?? 0 }),
        signal,
      });
      if (!current()) return;
      const result = await readFlags(signal);
      if (!current()) return;
      setFlags(result);
      const saved = result.find((flag) => flag.targetKind === kind && flag.targetId === id);
      setFeedback({
        kind,
        id,
        text:
          saved && saved.included === included && saved.version > (previous?.version ?? 0)
            ? 'Dashboard preference saved.'
            : 'The preference changed. Review the current setting.',
      });
    } catch (error) {
      if (!current()) return;
      try {
        const result = await readFlags(signal);
        if (!current()) return;
        setFlags(result);
        const conflict =
          (error as { problem?: { status?: number } } | null)?.problem?.status === 409;
        setFeedback({
          kind,
          id,
          text: conflict
            ? 'The preference changed. Review the current setting and try again.'
            : 'The update could not be confirmed. Review the current setting before trying again.',
        });
      } catch {
        if (current()) {
          setFlags(undefined);
          setStatus('unavailable');
        }
      }
    } finally {
      if (current()) {
        writing.current = false;
        setPending(false);
      }
    }
  };

  const activeVisit =
    access && visit.current?.access === access && !visit.current.controller.signal.aborted;
  return {
    status: activeVisit ? status : access ? 'checking' : 'unavailable',
    flags: activeVisit ? flags : undefined,
    pending: Boolean(activeVisit && pending),
    feedback: activeVisit ? feedback : undefined,
    refresh: () => setReload((value) => value + 1),
    change,
  };
}

type DashboardFlags = ReturnType<typeof useDashboardFlags>;

export function DashboardFlagControl({
  preferences,
  kind,
  id,
  name,
}: {
  preferences: DashboardFlags;
  kind: FinanceDashboardTargetKind;
  id: string;
  name: string;
}) {
  const { flags, pending, change, feedback } = preferences;
  const flag = flags?.find(
    (candidate) => candidate.targetKind === kind && candidate.targetId === id,
  );
  return (
    <div>
      <label>
        <input
          type="checkbox"
          aria-label={`Include on my Finance dashboard: ${name}`}
          checked={flag?.included ?? false}
          disabled={!flags || pending}
          onChange={(event) => void change(kind, id, event.target.checked)}
        />
        Include on my Finance dashboard
      </label>
      {feedback?.kind === kind && feedback.id === id ? <p role="status">{feedback.text}</p> : null}
    </div>
  );
}

export function DashboardFlagStatus({ preferences }: { preferences: DashboardFlags }) {
  if (preferences.status === 'checking')
    return <p role="status">Checking dashboard preferences…</p>;
  if (preferences.status === 'unavailable') {
    return (
      <div>
        <p role="status">Dashboard preferences are unavailable.</p>
        <button type="button" onClick={preferences.refresh}>
          Refresh dashboard preferences
        </button>
      </div>
    );
  }
  return preferences.pending ? <p role="status">Saving dashboard preference…</p> : null;
}
