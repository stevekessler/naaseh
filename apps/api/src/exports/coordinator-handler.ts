import type { APIGatewayProxyEventV2, Handler } from 'aws-lambda';
import { acknowledgeExport, readyExportResult } from './result-service.js';
import {
  findExportJob,
  publicCompletionExportJob,
  publicExportJob,
  startCompletionExport,
  startExport,
} from './export-service.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { log, metric } from '@naaseh/observability';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { recordCompletionExport } from '../reporting/telemetry.js';
const sfn = new SFNClient({});
type Request = {
  version: 'naaseh.export-todos/v1';
  action: 'start' | 'status' | 'acknowledge';
  jobId?: string;
  idempotencyKey?: string;
  principalId?: string;
};
async function beginExecution(job: { id: string; snapshotTime: string }) {
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
}

async function httpHandler(event: APIGatewayProxyEventV2) {
  const correlationId = event.requestContext.requestId;
  const actor = (event.requestContext as any).authorizer?.lambda as
    | {
        userId?: string;
        role?: 'admin' | 'user';
        csrfToken?: string;
        sessionEpoch?: number;
        groupIds?: string;
      }
    | undefined;
  if (!actor?.userId || !Number.isSafeInteger(actor.sessionEpoch))
    return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    const method = event.requestContext.http.method;
    const jobId = event.pathParameters?.jobId;
    if (method === 'POST' && !jobId) {
      requireMutationSecurity(
        event.headers.origin,
        actor.csrfToken ?? '',
        event.headers['x-csrf-token'],
      );
      const job = await startCompletionExport(
        JSON.parse(event.body ?? '{}'),
        actor.userId,
        actor.role === 'admin',
        actor.groupIds?.split(',').filter(Boolean) ?? [],
      );
      await beginExecution(job);
      if (job.scope === 'all_users')
        log('completion-export.admin-confirmed', {
          operation: 'start',
          outcome: 'success',
          correlationId,
        });
      metric('CompletionExportStarts', 1);
      recordCompletionExport({ phase: 'request', outcome: 'success', scope: job.scope ?? 'self' });
      return json(202, publicCompletionExportJob(job));
    }
    if (method === 'GET' && jobId) {
      const job = await findExportJob(jobId);
      if (!job || job.requestedByPrincipal !== actor.userId || job.exportKind !== 'completed_tasks')
        return problem(404, 'not_found', 'Export not found.', correlationId);
      const currentGroups = (actor.groupIds?.split(',').filter(Boolean) ?? []).sort();
      if (
        job.scope === 'self' &&
        JSON.stringify(currentGroups) !== JSON.stringify(job.authorizedGroupIds ?? [])
      )
        return problem(
          409,
          'authorization_changed',
          'Export authorization changed.',
          correlationId,
        );
      const result = job.status === 'ready' ? await readyExportResult(job) : undefined;
      return json(200, publicCompletionExportJob(job, result?.downloadUrl));
    }
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'completion-export.request',
      actorId: actor.userId,
    });
  }
}

export const handler: Handler<Request | APIGatewayProxyEventV2, unknown> = async (request) => {
  if ('requestContext' in request) return httpHandler(request);
  if (request.version !== 'naaseh.export-todos/v1') return { error: { code: 'invalid_request' } };
  const principal = request.principalId ?? 'iam-operator';
  if (request.action === 'start') {
    if (!request.idempotencyKey) return { error: { code: 'invalid_request' } };
    const job = await startExport(request.idempotencyKey, principal);
    await beginExecution(job);
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
