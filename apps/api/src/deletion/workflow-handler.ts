import type { Handler } from 'aws-lambda';
import { executeDeletionStep } from './deletion-service.js';
import { findDeletionJob } from './deletion-repository.js';

export const handler: Handler<{ jobId: string }> = async ({ jobId }) => {
  const job = await findDeletionJob(jobId);
  if (!job) throw new Error('Deletion job not found.');
  let next = job;
  for (let index = 0; index < 10 && next.status !== 'complete'; index += 1)
    next = await executeDeletionStep(next);
  return { jobId, status: next.status, complete: next.status === 'complete' };
};
