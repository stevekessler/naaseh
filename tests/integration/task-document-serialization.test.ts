import { expect, it, vi } from 'vitest';
import {
  completeAndArchiveTask,
  createTask,
  createUlid,
  restoreArchivedTask,
  type TaskRevision,
} from '@naaseh/domain';

const wire = vi.hoisted(() => ({ requests: [] as Record<string, any>[] }));
// Keep the real document translation, signing, and serialization middleware;
// substitute only the HTTP transport so this test cannot write to AWS.
vi.mock('@aws-sdk/client-dynamodb', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@aws-sdk/client-dynamodb')>();
  return {
    ...sdk,
    DynamoDBClient: class extends sdk.DynamoDBClient {
      constructor() {
        super({
          region: 'us-west-2',
          credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' },
          requestHandler: {
            handle: async (request: { body?: unknown }) => {
              wire.requests.push(JSON.parse(String(request.body)));
              return {
                response: {
                  statusCode: 200,
                  headers: {},
                  body: new TextEncoder().encode('{}'),
                },
              };
            },
          },
        });
      }
    },
  };
});
import { commitTask } from '../../apps/api/src/shared/store.js';

it('serializes task restore and cleared fields through the real DynamoDB document client', async () => {
  const initial = createTask({ label: 'Synthetic task' }, 'owner');
  const completed = completeAndArchiveTask(initial, 'owner');
  const restored = restoreArchivedTask(completed.task, completed.completionEvent, 'owner');
  const task = { ...restored.task, projectId: undefined, dueDate: undefined };
  expect(Object.keys(task)).toContain('archivedAt');
  expect(task.archivedAt).toBeUndefined();
  const mutationId = createUlid();
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId,
    actorId: 'owner',
    version: task.version,
    changedAt: task.updatedAt,
    operation: 'reopenAndRestore',
    changedFields: ['status', 'archivedAt', 'projectId', 'dueDate'],
  };
  await commitTask(task, revision, mutationId, [
    {
      expectedSequence: 1,
      change: {
        audience: 'OWNER#owner',
        sequence: 2,
        entityId: task.id,
        entityType: 'task',
        operation: 'upsert',
        payload: task,
        changedAt: task.updatedAt,
      },
    },
  ]);
  expect(wire.requests).toHaveLength(1);
  const writes = wire.requests[0]!.TransactItems;
  for (const item of [
    writes[0].Put.Item.data.M,
    writes[2].Put.Item.data.M.entity.M,
    writes[4].Put.Item.data.M.payload.M,
  ]) {
    expect(item.status).toEqual({ S: 'open' });
    expect(item).not.toHaveProperty('archivedAt');
    expect(item).not.toHaveProperty('currentCompletionEventId');
    expect(item).not.toHaveProperty('projectId');
    expect(item).not.toHaveProperty('dueDate');
  }
});
