import { useState } from 'react';
import { getClientId } from '../../db/client-id.js';
import { enablePush, savePushSubscription } from '../../notifications/push.js';

function decodeVapidKey(value: string) {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function ReminderSettings({ csrfToken }: { csrfToken: string }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true);
    setStatus('');
    try {
      const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
      if (!publicKey) throw new Error('Push reminders are not configured for this deployment.');
      const subscription = await enablePush(decodeVapidKey(publicKey));
      await savePushSubscription(subscription, await getClientId(), csrfToken);
      setStatus(
        'Connected reminders are enabled. Offline reminders still require Na’aseh to be open.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Push reminders could not be enabled.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reminder-settings">
      <button className="quiet" disabled={busy} onClick={() => void enable()}>
        {busy ? 'Enabling reminders…' : 'Enable reminders'}
      </button>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
