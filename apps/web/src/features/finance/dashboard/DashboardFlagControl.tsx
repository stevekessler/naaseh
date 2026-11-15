import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { financeDashboardPreferencesResponseSchema } from '@naaseh/contracts';
import type { FinanceDashboardTargetKind, FinanceDashboardUpcomingCount } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess, subscribeFinanceAccess } from '../security/finance-access.js';

const path = '/finance/dashboard-preferences';
const readableAccess = () => {
  const access = peekFinanceAccess();
  return access?.canRead() ? access : undefined;
};
type Preferences = ReturnType<typeof financeDashboardPreferencesResponseSchema.parse>;
const readPreferences = async (signal: AbortSignal) => {
  const response = await financeRequest(path, { signal });
  const { financeDashboardPreferencesResponseSchema: schema } = await import('@naaseh/contracts');
  return schema.parse(response);
};

export function useDashboardPreferences(csrfToken: string) {
  const access = useSyncExternalStore(subscribeFinanceAccess, readableAccess, () => undefined);
  const visit = useRef<
    { access: NonNullable<typeof access>; controller: AbortController } | undefined
  >(undefined);
  const writing = useRef(false);
  const [preferences, setPreferences] = useState<Preferences>();
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: FinanceDashboardTargetKind | 'settings';
    id?: string;
    text: string;
  }>();
  useEffect(() => {
    setPreferences(undefined);
    setPending(false);
    setFeedback(undefined);
    setStatus('checking');
    if (!access) return;
    const controller = new AbortController();
    const { signal } = controller;
    visit.current = { access, controller };
    const clear = () => {
      controller.abort();
      setPreferences(undefined);
      setFeedback(undefined);
      setPending(false);
      setStatus('unavailable');
    };
    const unsubscribe = access.onLock(clear);
    void readPreferences(signal).then(
      (result) => {
        if (!signal.aborted && readableAccess() === access) {
          setPreferences(result);
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

  const save = async (
    target: { kind: FinanceDashboardTargetKind; id: string } | { kind: 'settings' },
    request: { path: string; method: 'PUT' | 'PATCH'; body: object },
    confirmed: (result: Preferences) => boolean,
  ) => {
    const signal = visit.current?.controller.signal;
    if (
      !access ||
      !signal ||
      signal.aborted ||
      readableAccess() !== access ||
      !preferences ||
      writing.current
    )
      return;
    writing.current = true;
    setPending(true);
    setFeedback(undefined);
    const current = () => !signal.aborted && readableAccess() === access;
    try {
      await financeRequest(request.path, {
        method: request.method,
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify(request.body),
        signal,
      });
      if (!current()) return;
      const result = await readPreferences(signal);
      if (!current()) return;
      setPreferences(result);
      setFeedback({
        ...target,
        text: confirmed(result)
          ? 'Dashboard preference saved.'
          : 'The preference changed. Review the current setting.',
      });
    } catch (error) {
      if (!current()) return;
      try {
        const result = await readPreferences(signal);
        if (!current()) return;
        setPreferences(result);
        const conflict =
          (error as { problem?: { status?: number } } | null)?.problem?.status === 409;
        setFeedback({
          ...target,
          text: conflict
            ? 'The preference changed. Review the current setting and try again.'
            : 'The update could not be confirmed. Review the current setting before trying again.',
        });
      } catch {
        if (current()) {
          setPreferences(undefined);
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

  const change = (kind: FinanceDashboardTargetKind, id: string, included: boolean) => {
    const previous = preferences?.flags.find(
      (flag) => flag.targetKind === kind && flag.targetId === id,
    );
    const expectedVersion = previous?.version ?? 0;
    return save(
      { kind, id },
      {
        path: `${path}/${kind}/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: { included, expectedVersion },
      },
      ({ flags }) =>
        flags.some(
          (flag) =>
            flag.targetKind === kind &&
            flag.targetId === id &&
            flag.included === included &&
            flag.version > expectedVersion,
        ),
    );
  };
  const changeUpcomingCount = (upcomingCount: FinanceDashboardUpcomingCount) => {
    if (!preferences || upcomingCount === preferences.settings.upcomingCount) return;
    const expectedVersion = preferences.settings.version;
    return save(
      { kind: 'settings' },
      { path, method: 'PATCH', body: { upcomingCount, expectedVersion } },
      ({ settings }) =>
        settings.upcomingCount === upcomingCount && settings.version > expectedVersion,
    );
  };

  const activeVisit =
    access && visit.current?.access === access && !visit.current.controller.signal.aborted;
  return {
    status: activeVisit ? status : access ? 'checking' : 'unavailable',
    flags: activeVisit ? preferences?.flags : undefined,
    settings: activeVisit ? preferences?.settings : undefined,
    pending: Boolean(activeVisit && pending),
    feedback: activeVisit ? feedback : undefined,
    refresh: () => setReload((value) => value + 1),
    change,
    changeUpcomingCount,
  };
}

export type DashboardPreferences = ReturnType<typeof useDashboardPreferences>;

export function DashboardFlagControl({
  preferences,
  kind,
  id,
  name,
}: {
  preferences: DashboardPreferences;
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
      {feedback?.kind === kind && 'id' in feedback && feedback.id === id ? (
        <p role="status">{feedback.text}</p>
      ) : null}
    </div>
  );
}

export function DashboardFlagStatus({ preferences }: { preferences: DashboardPreferences }) {
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
