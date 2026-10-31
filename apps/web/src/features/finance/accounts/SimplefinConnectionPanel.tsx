import { useEffect, useState } from 'react';

export interface SimplefinConnectionView {
  id: string;
  status: 'active' | 'attention' | 'revoked' | 'archived';
  lastAttemptAt?: string;
  lastSuccessfulAt?: string;
  lastErrorClass?: string;
  importStatus?: 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';
}

export function SimplefinConnectionPanel({
  connection,
  onClaim,
  onRefresh,
}: {
  connection?: SimplefinConnectionView;
  onClaim: (token: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  const cooldownUntil = connection?.lastAttemptAt
    ? new Date(Date.parse(connection.lastAttemptAt) + 3_600_000)
    : undefined;
  const coolingDown = cooldownUntil ? cooldownUntil > new Date() : false;
  const claim = async () => {
    setWorking(true);
    try {
      await onClaim(token);
      setToken('');
      setStatus('Connected. The credential is encrypted and cannot be redisplayed.');
    } catch {
      setStatus('Connection needs attention. Check the setup token and try again.');
    } finally {
      setWorking(false);
    }
  };
  const refresh = async () => {
    if (!onRefresh) return;
    setWorking(true);
    try {
      await onRefresh();
      setStatus('Refresh queued.');
    } catch {
      setStatus('Refresh failed safely. Your existing data is unchanged; retry when ready.');
    } finally {
      setWorking(false);
    }
  };
  return (
    <section>
      <h2>SimpleFIN Bridge</h2>
      <p>
        Paste the one-time Setup Token from SimpleFIN Bridge. The returned Access URL is encrypted
        and will not be shown again.
      </p>
      {!connection ? (
        <>
          <label>
            Setup token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button disabled={!token || !online || working} onClick={() => void claim()}>
            Connect SimpleFIN Bridge
          </button>
        </>
      ) : (
        <>
          <p>
            Connection: {connection.status}
            {connection.importStatus ? ` · Import ${connection.importStatus}` : ''}
          </p>
          {connection.importStatus === 'partial' ? (
            <p>Some accounts imported. Review attention items before retrying.</p>
          ) : null}
          <button
            disabled={!online || working || coolingDown || connection.status === 'revoked'}
            onClick={() => void refresh()}
          >
            {coolingDown
              ? `Refresh available ${cooldownUntil?.toLocaleTimeString()}`
              : 'Refresh SimpleFIN Bridge'}
          </button>
        </>
      )}
      {!online ? <p>Connect to the internet to manage SimpleFIN Bridge.</p> : null}
      <p role="status">{status}</p>
    </section>
  );
}
