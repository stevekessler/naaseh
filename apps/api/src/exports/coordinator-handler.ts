import type { Handler } from 'aws-lambda';
import { acknowledgeExport, readyExportResult } from './result-service.js';
import { findExportJob, publicExportJob, startExport } from './export-service.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { log, metric } from '@naaseh/observability';
const sfn = new SFNClient({});
type Request = {
  version: 'naaseh.export-todos/v1';
  action: 'start' | 'status' | 'acknowledge';
  jobId?: string;
  idempotencyKey?: string;
  principalId?: string;
};
export const handler: Handler<Request, unknown> = async (request) => {
  if (request.version !== 'naaseh.export-todos/v1') return { error: { code: 'invalid_request' } };
  const principal = request.principalId ?? 'iam-operator';
  if (request.action === 'start') {
    if (!request.idempotencyKey) return { error: { code: 'invalid_request' } };
    const job = await startExport(request.idempotencyKey, principal);
    try {
      await sfn.send(
        new StartExecutionCommand({
          stateMachineArn: process.env.NAASEH_EXPORT_STATE_MACHINE_ARN,
          name: job.id,
          input: JSON.stringify({
            jobId: job.id,
            snapshotTime: job.snapshotTime,
            snapshotEpochSeconds: Math.floor(new Date(job.snapshotTime).getTime() / 1000),
          }),
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== 'ExecutionAlreadyExists') throw error;
    }
    log('export.lifecycle', { operation: 'start', outcome: 'success', jobId: job.id });
    metric('ExportStarts', 1);
    return { version: 'naaseh.export-todos-result/v1', job: publicExportJob(job) };
  }
  if (!request.jobId) return { error: { code: 'invalid_request' } };
  const job = await findExportJob(request.jobId);
  if (!job || job.requestedByPrincipal !== principal) return { error: { code: 'not_found' } };
  if (request.action === 'acknowledge') {
    const acknowledged = await acknowledgeExport(job);
    log('export.lifecycle', { operation: 'acknowledge', outcome: 'success', jobId: job.id });
    metric('ExportCleanups', 1);
    return {
      version: 'naaseh.export-todos-result/v1',
      job: publicExportJob(acknowledged),
    };
  }
  return {
    version: 'naaseh.export-todos-result/v1',
    job: publicExportJob(job),
    ...(job.status === 'ready' ? { result: await readyExportResult(job) } : {}),
  };
};
