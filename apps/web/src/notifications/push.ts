export async function enablePush(vapidPublicKey: Uint8Array) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error('Push reminders are not supported in this browser.');
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIos && !standalone)
    throw new Error(
      'On iPhone and iPad, install Na’aseh on the Home Screen before enabling push reminders.',
    );
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  });
}

export async function savePushSubscription(
  subscription: PushSubscription,
  clientId: string,
  csrfToken: string,
) {
  const response = await fetch('/api/v1/push-subscriptions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({
      clientId,
      ...subscription.toJSON(),
      capabilities: { genericOnly: true },
    }),
  });
  if (!response.ok) throw new Error('The push subscription could not be saved.');
}

export function overdueFallback(dueAt: string, delivered: boolean, now = Date.now()) {
  return !delivered && new Date(dueAt).getTime() <= now;
}
