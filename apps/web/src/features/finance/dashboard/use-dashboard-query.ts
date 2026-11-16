import { useEffect, useState, useSyncExternalStore } from 'react';
import { peekFinanceAccess, subscribeFinanceAccess } from '../security/finance-access.js';

type State<T> = { key: string; value?: T; status: 'loading' | 'ready' | 'unavailable' };
const getAccess = () => {
  const access = peekFinanceAccess();
  return access?.canRead() ? access : undefined;
};

export function useDashboardQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const access = useSyncExternalStore(subscribeFinanceAccess, getAccess, () => undefined);
  const [result, setResult] = useState<State<T> & { access?: typeof access }>({
    key,
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener('online', retry);
    window.addEventListener('offline', retry);
    window.addEventListener('focus', retry);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', retry);
      window.removeEventListener('focus', retry);
    };
  }, []);
  useEffect(() => {
    if (!access) return;
    const controller = new AbortController();
    const { signal } = controller;
    const clear = () => {
      controller.abort();
      setResult({ key, status: 'unavailable', access });
    };
    const stop = access.onLock(clear);
    setResult({ key, status: 'loading', access });
    void load(signal).then(
      (value) => {
        if (!signal.aborted && getAccess() === access)
          setResult({ key, status: 'ready', value, access });
      },
      () => {
        if (!signal.aborted) setResult({ key, status: 'unavailable', access });
      },
    );
    return () => {
      stop();
      controller.abort();
    };
  }, [access, key, load, attempt]);
  return {
    ...(access && result.access === access && result.key === key
      ? result
      : { status: access ? ('loading' as const) : ('unavailable' as const), value: undefined }),
    retry: () => setAttempt((value) => value + 1),
  };
}
