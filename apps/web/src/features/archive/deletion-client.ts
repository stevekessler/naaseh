import type { DeletionJob, DeletionPreview } from '@naaseh/domain';

export interface DeletionTarget {
  resourceType: 'task' | 'list' | 'category' | 'project';
  resourceId: string;
  version: number;
}

const pathFor = (target: DeletionTarget) => {
  const collection = {
    task: 'tasks',
    list: 'lists',
    category: 'categories',
    project: 'projects',
  }[target.resourceType];
  return `/api/v1/${collection}/${encodeURIComponent(target.resourceId)}`;
};

export async function fetchDeletionPreview(target: DeletionTarget): Promise<DeletionPreview> {
  if (!navigator.onLine) throw new Error('Permanent deletion requires an internet connection.');
  const response = await fetch(`${pathFor(target)}/deletion-preview`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The deletion preview could not be loaded.');
  return response.json() as Promise<DeletionPreview>;
}

export async function startPermanentDeletion(
  target: DeletionTarget,
  confirmationToken: string,
  csrfToken: string,
): Promise<DeletionJob> {
  if (!navigator.onLine) throw new Error('Permanent deletion requires an internet connection.');
  const mutationId = crypto.randomUUID();
  const response = await fetch(pathFor(target), {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'if-match': String(target.version),
      'idempotency-key': mutationId,
    },
    body: JSON.stringify({ confirmationToken }),
  });
  if (!response.ok) throw new Error('Permanent deletion could not be started.');
  return response.json() as Promise<DeletionJob>;
}

export async function waitForDeletion(job: DeletionJob): Promise<DeletionJob> {
  let current = job;
  for (let attempt = 0; attempt < 120 && current.status !== 'complete'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const response = await fetch(`/api/v1/deletion-jobs/${encodeURIComponent(job.id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Deletion progress could not be loaded.');
    current = (await response.json()) as DeletionJob;
    if (current.status === 'failed') throw new Error('Permanent deletion did not finish.');
  }
  if (current.status !== 'complete') throw new Error('Permanent deletion is still in progress.');
  return current;
}
