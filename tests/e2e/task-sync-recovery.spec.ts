import { expect, test, type Page } from '@playwright/test';
import { createList, createListItem, createTask } from '@naaseh/domain';

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
    const [outbox, settings, tasks, conflicts] = await Promise.all(
      ['outbox', 'settings', 'secureTasks', 'secureConflicts'].map(read),
    );
    database.close();
    return {
      outbox,
      conflicts,
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
    let organizationSnapshotAvailable = false;
    let listSnapshotAvailable = false;
    let serverLists: ReturnType<typeof createList>[] = [];
    let serverListItems: ReturnType<typeof createListItem>[] = [];
    const category = {
      id: '01J00000000000000000000010',
      name: 'Recovered category',
      color: '#336699',
      archived: false,
      lifecycle: 'active' as const,
      version: 1,
    };
    const project = {
      id: '01J00000000000000000000011',
      categoryId: category.id,
      name: 'Recovered project',
      lifecycle: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    };
    await page.route('**/api/v1/sync/bootstrap', (route) =>
      route.fulfill({
        json: {
          tasks: serverTasks,
          ...(organizationSnapshotAvailable ? { categories: [category], projects: [project] } : {}),
          ...(listSnapshotAvailable ? { lists: serverLists, listItems: serverListItems } : {}),
        },
      }),
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
    const serverList = createList({ name: 'Recovered owned list' }, ownerId);
    const serverListItem = createListItem(serverList.id, { name: 'Recovered list item' }, ownerId);
    serverTasks = [serverTask, { ...pendingTask, label: 'Older server wording' }];
    serverLists = [serverList];
    serverListItems = [serverListItem];
    organizationSnapshotAvailable = true;
    listSnapshotAvailable = true;
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
          tx.objectStore('settings').put({
            key: 'organization-snapshot-bootstrapped-v1',
            value: 'true',
          });
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
    await page.getByRole('button', { name: 'Lists', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recovered owned list' })).toBeVisible();
    await page.getByRole('button', { name: 'Recovered owned list' }).click();
    await expect(page.getByText('Recovered list item', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Personal Stack' }).click();
    const filters = page.getByRole('region', { name: 'Search and filters' });
    const categoryFilter = filters.getByRole('combobox', { name: 'Category', exact: true });
    const projectFilter = filters.getByRole('combobox', { name: 'Project', exact: true });
    await expect(categoryFilter).toContainText(category.name);
    await categoryFilter.selectOption(category.id);
    await expect(categoryFilter).toHaveValue(category.id);
    await expect(projectFilter).toContainText(project.name);
    await projectFilter.selectOption(project.id);
    await expect(projectFilter).toHaveValue(project.id);
    await categoryFilter.selectOption('');
    await projectFilter.selectOption('');
    await page.getByRole('button', { name: 'Lists', exact: true }).click();
    const listProject = page.locator('.task-form').first().getByLabel('Project');
    await expect(listProject).toContainText(project.name);
    await listProject.selectOption(project.id);
    await expect(listProject).toHaveValue(project.id);
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByText("Na'aseh hit a problem")).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review conflicts (1)' })).toBeVisible();
    if (brokenCache) {
      await expect(
        page.getByRole('alert').filter({ hasText: 'Fixture validation failure' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Unsent local wording' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Older server wording' })).toHaveCount(0);
    }
    const recovered = await readRecoveryState(page);
    expect(recovered.outbox).toHaveLength(brokenCache ? 1 : 0);
    expect(recovered.conflicts).toHaveLength(1);
    expect(recovered.backups).toHaveLength(brokenCache ? 1 : 0);
    if (brokenCache)
      expect(JSON.parse(recovered.backups[0].value)).toEqual(
        before.tasks.find((task) => task.id === serverTask.id),
      );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Recovered server task' })).toBeVisible();
    expect((await readRecoveryState(page)).outbox).toHaveLength(brokenCache ? 1 : 0);
    expect((await readRecoveryState(page)).conflicts).toHaveLength(1);
    expect(JSON.parse((await readRecoveryState(page)).cursor!)).toEqual({ owner: 10 });
    if (brokenCache) expect((await readRecoveryState(page)).replay).toBeDefined();
    if (!brokenCache) {
      await expect(page.getByRole('heading', { name: 'Older server wording' })).toBeVisible();
      return;
    }
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
    expect((await readRecoveryState(page)).conflicts).toHaveLength(1);
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
