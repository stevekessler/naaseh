import { useEffect, useState, type FormEvent } from 'react';
import {
  forgetRememberedBrowser,
  readRememberedBrowsers,
  renameRememberedBrowser,
  type RememberedBrowser,
} from '../auth/security-client.js';

export function RememberedBrowsers({ csrfToken }: { csrfToken: string }) {
  const [devices, setDevices] = useState<RememberedBrowser[]>();
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => {
    let active = true;
    void readRememberedBrowsers(csrfToken)
      .then(({ devices: result }) => {
        if (active) setDevices(result);
      })
      .catch(() => {
        if (active) setStatus('Remembered browsers are unavailable right now.');
      });
    return () => {
      active = false;
    };
  }, [csrfToken]);

  async function forget(device: RememberedBrowser) {
    setBusyId(device.id);
    setStatus('');
    try {
      await forgetRememberedBrowser(csrfToken, device.id);
      setDevices((current) => current?.filter((candidate) => candidate.id !== device.id));
      setStatus(
        device.current
          ? 'This browser is forgotten. Your current sign-in remains active, but the next sign-in will require a code.'
          : `${device.label} is forgotten. Its next sign-in will require a code.`,
      );
    } catch {
      setStatus('Unable to forget the browser. Please try again.');
    } finally {
      setBusyId(undefined);
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>, device: RememberedBrowser) {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get('label') ?? '').trim();
    if (!label || label.length > 80) return;
    setBusyId(device.id);
    setStatus('');
    try {
      await renameRememberedBrowser(csrfToken, device.id, label);
      setDevices((current) =>
        current?.map((candidate) =>
          candidate.id === device.id ? { ...candidate, label } : candidate,
        ),
      );
      setStatus('Browser name saved.');
    } catch {
      setStatus('Unable to rename the browser. Please try again.');
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section aria-labelledby="remembered-browsers-title">
      <h3 id="remembered-browsers-title">Remembered browsers</h3>
      <p>
        These browsers can skip the authentication code for 30 days, but still need your password.
        Name them to distinguish devices such as an iPad and a MacBook Pro.
      </p>
      <p role="status">{status}</p>
      {devices === undefined && !status && <p>Loading remembered browsers…</p>}
      {devices?.length === 0 && <p>No browsers are currently remembered.</p>}
      {devices && devices.length > 0 && (
        <ul className="remembered-browsers">
          {devices.map((device) => (
            <li key={device.id}>
              <strong>{device.label}</strong> {device.current && <span>(this browser)</span>}
              <p>
                Last used {new Date(device.lastUsedAt).toLocaleString()} · Expires{' '}
                {new Date(device.expiresAt).toLocaleString()}
              </p>
              <form onSubmit={(event) => void rename(event, device)}>
                <label>
                  Browser name{' '}
                  <input name="label" defaultValue={device.label} maxLength={80} required />
                </label>
                <button type="submit" disabled={busyId === device.id}>
                  Save name
                </button>
              </form>
              <button
                type="button"
                disabled={busyId === device.id}
                onClick={() => void forget(device)}
              >
                {device.current ? 'Forget this browser' : `Forget ${device.label}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
