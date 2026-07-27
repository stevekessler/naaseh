import type { ScheduledHandler } from 'aws-lambda';
import { listRunnableGoogleConnections } from './repository.js';
import { runGoogleSynchronization } from './run-service.js';

export const handler: ScheduledHandler = async () => {
  for (const connection of await listRunnableGoogleConnections(10))
    await runGoogleSynchronization({ connection, trigger: 'scheduled' }).catch(() => undefined);
};
