import { crisisPlanProblemSchema } from '@naaseh/contracts';
import type { CrisisPlanMutation } from '@naaseh/domain';
import {
  acknowledgeCrisisPlanMutation,
  listPendingCrisisPlanMutations,
  preserveCrisisPlanConflict,
} from '../db/crisis-plan-repository.js';
import { crisisPlanRecordSchema } from '@naaseh/domain';

export async function drainCrisisPlanOutbox(
  ownerId: string,
  csrfToken: string,
  fetcher: typeof fetch = fetch,
) {
  if (!navigator.onLine) return;
  for (const row of await listPendingCrisisPlanMutations(ownerId)) {
    const mutation = row.value as CrisisPlanMutation;
    const response = await fetcher('/api/v1/sync/push', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ version: 6, clientId: 'crisis-plan-browser', mutations: [mutation] }),
    });
    if (!response.ok) {
      const problem = crisisPlanProblemSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      throw new Error(
        problem.success
          ? problem.data.message
          : 'Crisis Plan synchronization is unavailable; encrypted changes remain pending.',
      );
    }
    const result = (await response.json()) as {
      results: Array<{ status: string; version?: number }>;
    };
    const first = result.results[0];
    if (first?.status === 'applied' || first?.status === 'alreadyApplied')
      await acknowledgeCrisisPlanMutation(
        ownerId,
        mutation.id,
        first.version ?? mutation.baseVersion + 1,
      );
    else if (first?.status === 'conflict') {
      const remoteResponse = await fetcher('/api/v1/journal/crisis-plan', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!remoteResponse.ok)
        throw new Error(
          'The Crisis Plan changed on another device. The encrypted local version remains pending.',
        );
      const remote = crisisPlanRecordSchema.parse(await remoteResponse.json());
      await preserveCrisisPlanConflict(ownerId, mutation, remote);
      throw new Error(
        'The Crisis Plan changed on another device. Both encrypted versions remain available for resolution.',
      );
    } else
      throw new Error(
        'Crisis Plan synchronization was rejected; encrypted changes remain pending.',
      );
  }
}

export async function drainJournalDataInDependencyOrder(
  ownerId: string,
  csrfToken: string,
  drainJournal: (ownerId: string, csrfToken: string) => Promise<void>,
  drainPlan: (ownerId: string, csrfToken: string) => Promise<void> = drainCrisisPlanOutbox,
) {
  await drainPlan(ownerId, csrfToken);
  await drainJournal(ownerId, csrfToken);
}
