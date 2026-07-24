/* global self */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const taskId = typeof data.taskId === 'string' ? data.taskId : '';
  event.waitUntil(
    self.registration.showNotification("Na'aseh reminder", {
      body: 'A task is due.',
      tag: taskId ? `task-reminder-${taskId}` : 'task-reminder',
      data: { taskId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  const path = taskId ? `/tasks/${encodeURIComponent(taskId)}` : '/';
  event.waitUntil(self.clients.openWindow(path));
});
