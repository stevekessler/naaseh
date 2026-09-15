import { expect, test, type Page } from '@playwright/test';
import { createTask } from '@naaseh/domain';

test.use({ serviceWorkers: 'block' });

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

async function readRecoveryState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
    });
    const read = (store: string) =>
      new Promise<any[]>((resolve) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
      });
    const [outbox, settings, tasks] = await Promise.all(
      ['outbox', 'settings', 'secureTasks'].map(read),
    );
    database.close();
    return {
      outbox,
      backups: settings.filter((row) => row.key.startsWith('task-recovery:')),
      tasks,
      cursor: settings.find((row) => row.key === 'sync-cursor')?.value,
      replay: settings.find((row) => row.key === 'pending-sync-replay-cursor')?.value,
    };
  });
}

for (const brokenCache of [false, true]) {
  test(`downloads tasks despite rejected edits with ${brokenCache ? 'unreadable' : 'empty'} cache`, async ({
    page,
  }) => {
    let serverTasks: ReturnType<typeof createTask>[] = [];
    await page.route('**/api/v1/sync/bootstrap', (route) =>
      route.fulfill({ json: { tasks: serverTasks } }),
    );
    await page.route('**/api/v1/sync/pull', (route) =>
      route.fulfill({
        json: {
          changes: (Number(route.request().postDataJSON().cursor?.owner ?? 0) < 10
            ? serverTasks
            : []
          ).map((task) => ({
            entityType: 'task',
            entityId: task.id,
            operation: 'upsert',
            payload: task,
          })),
          cursor: { owner: serverTasks.length ? 10 : 0 },
        },
      }),
    );
    await page.route('**/api/v1/sync/push', (route) => {
      const { mutations } = route.request().postDataJSON();
      return route.fulfill({
        json: {
          results: mutations.map((mutation: { id: string }) => ({
            mutationId: mutation.id,
            status: mutation.id === 'independent-change' ? 'applied' : 'rejected',
            problem: { message: 'Fixture validation failure', correlationId: 'fixture-reference' },
          })),
        },
      });
    });
    await signIn(page);
    const ownerId = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('naaseh-session-view')!).userId as string,
    );
    const serverTask = createTask({ label: 'Recovered server task' }, ownerId);
    const pendingTask = createTask({ label: 'Unsent local wording' }, ownerId);
    serverTasks = [serverTask, { ...pendingTask, label: 'Older server wording' }];
    await page.evaluate(
      async ({ serverTask, pendingTask, brokenCache }) => {
        const database = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('naaseh');
          request.onsuccess = () => resolve(request.result);
        });
        const key = await new Promise<CryptoKey>((resolve) => {
          const request = database
            .transaction('cryptoKeys')
            .objectStore('cryptoKeys')
            .get('device');
          request.onsuccess = () => resolve(request.result.key);
        });
        const encrypt = async (task: typeof serverTask, encryptionKey: CryptoKey) => {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`task:${task.id}`) },
            encryptionKey,
            new TextEncoder().encode(JSON.stringify(task)),
          );
          const encode = (buffer: ArrayBuffer) =>
            btoa(String.fromCharCode(...new Uint8Array(buffer)));
          return {
            id: task.id,
            ownerId: task.ownerId,
            status: task.status,
            visibility: task.visibility,
            updatedAt: task.updatedAt,
            value: { iv: encode(iv.buffer), ciphertext: encode(ciphertext) },
          };
        };
        const pendingRecord = await encrypt(pendingTask, key);
        const wrongKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        const brokenRecord = await encrypt(serverTask, wrongKey);
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['secureTasks', 'outbox', 'settings'], 'readwrite');
          tx.objectStore('secureTasks').clear();
          tx.objectStore('settings').put({ key: 'task-snapshot-bootstrapped', value: 'true' });
          tx.objectStore('outbox').put({
            id: 'independent-change',
            entityId: 'independent-category',
            entityType: 'category',
            operation: 'create',
            baseVersion: 0,
            payload: {},
            createdAt: '2026-01-03',
            attempts: 0,
          });
          tx.objectStore('outbox').put({
            id: 'rejected-category',
            entityId: 'category-x',
            entityType: 'category',
            operation: 'create',
            baseVersion: 0,
            payload: {},
            createdAt: '2026-01-01',
            attempts: 0,
          });
          if (brokenCache) {
            tx.objectStore('secureTasks').put(brokenRecord);
            tx.objectStore('secureTasks').put(pendingRecord);
            tx.objectStore('outbox').put({
              id: 'pending-task',
              entityId: pendingTask.id,
              entityType: 'task',
              operation: 'update',
              baseVersion: 1,
              payload: { label: pendingTask.label },
              createdAt: '2026-01-02',
              attempts: 0,
            });
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { serverTask, pendingTask, brokenCache },
    );
    const before = await readRecoveryState(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Recovered server task' })).toBeVisible();
    await expect(page.getByText("Na'aseh hit a problem")).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Fixture validation failure' }),
    ).toBeVisible();
    if (brokenCache) {
      await expect(page.getByRole('heading', { name: 'Unsent local wording' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Older server wording' })).toHaveCount(0);
    }
    const recovered = await readRecoveryState(page);
    expect(recovered.outbox).toHaveLength(brokenCache ? 2 : 1);
    expect(recovered.backups).toHaveLength(brokenCache ? 1 : 0);
    if (brokenCache)
      expect(JSON.parse(recovered.backups[0].value)).toEqual(
        before.tasks.find((task) => task.id === serverTask.id),
      );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Recovered server task' })).toBeVisible();
    expect((await readRecoveryState(page)).outbox).toHaveLength(brokenCache ? 2 : 1);
    expect(JSON.parse((await readRecoveryState(page)).cursor!)).toEqual({ owner: 10 });
    expect((await readRecoveryState(page)).replay).toBeDefined();
    await page.route('**/api/v1/sync/push', (route) =>
      route.fulfill({
        json: {
          results: route
            .request()
            .postDataJSON()
            .mutations.map((mutation: { id: string }) => ({
              mutationId: mutation.id,
              status: 'alreadyApplied',
            })),
        },
      }),
    );
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Older server wording' })).toBeVisible();
    await expect.poll(async () => (await readRecoveryState(page)).outbox.length).toBe(0);
    await expect.poll(async () => (await readRecoveryState(page)).replay).toBeUndefined();
  });
}

test('uses the new durable device key after another tab resets account storage', async ({
  page,
}) => {
  await signIn(page);
  await page.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const transaction = database.transaction('cryptoKeys', 'readwrite');
      transaction.objectStore('cryptoKeys').put({ id: 'device', key });
      transaction.oncomplete = () => resolve();
    });
    database.close();
  });
  await page.getByLabel('Task label').fill('Task after key reset');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Task after key reset' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Task after key reset' })).toBeVisible();
});
