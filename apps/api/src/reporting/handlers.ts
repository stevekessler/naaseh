import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { errorResponse, json, problem } from '../shared/http.js';
import {
  authorizedWorkloadDrilldown,
  buildAuthorizedOrganizationTree,
  configureWorkloadRankOverlayReader,
  createPersonalStackRankOverlayReader,
} from './organization-tree-service.js';
import { getCompletionReport, type ReportPeriod } from './completion-report-service.js';
import { reportingTelemetry } from './telemetry.js';
import { log, metric } from '@naaseh/observability';
import { parseUrgencySet } from '@naaseh/domain';
import { readCompletionDetailPage } from './completion-event-repository.js';
import { defaultPersonalStackService } from '../ranking/runtime.js';
import {
  createPaginationCursorCodec,
  dynamoPersistedCursorRepository,
} from '../shared/persistent-pagination-cursor.js';

configureWorkloadRankOverlayReader(
  createPersonalStackRankOverlayReader(defaultPersonalStackService),
);
const reportingCursorCodec = createPaginationCursorCodec(
  process.env.CURSOR_SIGNING_SECRET ?? 'local-reporting-cursor-secret',
  dynamoPersistedCursorRepository,
);

const todayUtc = () => new Date().toISOString().slice(0, 10);
const defaultFrom = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  const claims = (event.requestContext as any).authorizer?.lambda as
    | { userId?: string; role?: 'admin' | 'user'; groupIds?: string; accessEpoch?: number }
    | undefined;
  if (!claims?.userId)
    return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  const actor = {
    id: claims.userId,
    role: claims.role ?? ('user' as const),
    active: true,
    groupIds: claims.groupIds?.split(',').filter(Boolean) ?? [],
  };
  try {
    if (event.rawPath.endsWith('/completion-report/drilldown')) {
      const query = event.queryStringParameters ?? {};
      const targetUserId = query.userId ?? actor.id;
      if (targetUserId !== actor.id && actor.role !== 'admin')
        return problem(404, 'not_found', 'Report not found.', correlationId);
      const urgencies = parseUrgencySet(query.urgencies);
      if (query.urgencies && !urgencies.length)
        return problem(400, 'invalid_urgency', 'Urgency filter is invalid.', correlationId);
      return json(
        200,
        await readCompletionDetailPage({
          actorId: actor.id,
          targetUserId,
          accessEpoch: claims.accessEpoch ?? 0,
          limit: query.limit ? Number(query.limit) : 50,
          ...(query.from ? { from: query.from } : {}),
          ...(query.to ? { to: query.to } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.projectId ? { projectId: query.projectId } : {}),
          ...(urgencies.length ? { urgencies } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
        }),
      );
    }
    if (event.rawPath.endsWith('/completion-report')) {
      const query = event.queryStringParameters ?? {};
      const targetUserId = query.userId ?? actor.id;
      if (targetUserId !== actor.id && actor.role !== 'admin')
        return problem(404, 'not_found', 'Report not found.', correlationId);
      const period = (query.period ?? 'day') as ReportPeriod;
      if (!['day', 'week', 'month'].includes(period))
        return problem(400, 'invalid_period', 'Report period is invalid.', correlationId);
      const started = performance.now();
      const urgencies = parseUrgencySet(query.urgencies);
      if (query.urgencies && !urgencies.length)
        return problem(400, 'invalid_urgency', 'Urgency filter is invalid.', correlationId);
      const report = await getCompletionReport({
        userId: targetUserId,
        timeZone: query.browserTimeZone ?? query.timeZone ?? 'UTC',
        period,
        from: query.from ?? defaultFrom(),
        to: query.to ?? todayUtc(),
        ...(query.weekStartsOn ? { weekStartsOn: Number(query.weekStartsOn) } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(urgencies.length ? { urgencies } : {}),
      });
      const detail = reportingTelemetry('completion-report.success', {
        actorId: actor.id,
        targetUserId,
        period,
        durationMs: Math.round(performance.now() - started),
      });
      log(detail.operation, { ...detail, outcome: 'success' });
      metric('CompletionReportLatency', detail.durationMs ?? 0, 'Milliseconds');
      return json(200, report);
    }
    if (event.rawPath.endsWith('/drilldown')) {
      const query = event.queryStringParameters ?? {};
      const urgencies = parseUrgencySet(query.urgencies);
      if (query.urgencies && !urgencies.length)
        return problem(400, 'invalid_urgency', 'Urgency filter is invalid.', correlationId);
      const orderBy = query.orderBy ?? 'overallRank';
      if (orderBy !== 'overallRank' && orderBy !== 'projectRank')
        return problem(400, 'invalid_order', 'Report order is invalid.', correlationId);
      if (orderBy === 'projectRank' && !query.projectId)
        return problem(
          400,
          'invalid_order',
          'Project rank is available only when one Project is selected.',
          correlationId,
        );
      return json(
        200,
        await authorizedWorkloadDrilldown(actor, {
          ...(query.projectId ? { projectId: query.projectId } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.scope === 'unassigned' ? { unassigned: true } : {}),
          ...(urgencies.length ? { urgencies } : {}),
          orderBy,
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.limit ? { limit: Number(query.limit) } : {}),
          accessEpoch: claims.accessEpoch ?? 0,
          ...(process.env.CURSOR_SIGNING_SECRET
            ? { cursorSecret: process.env.CURSOR_SIGNING_SECRET }
            : {}),
          cursorCodec: reportingCursorCodec,
        }),
      );
    }
    const urgencies = parseUrgencySet(event.queryStringParameters?.urgencies);
    if (event.queryStringParameters?.urgencies && !urgencies.length)
      return problem(400, 'invalid_urgency', 'Urgency filter is invalid.', correlationId);
    return json(200, await buildAuthorizedOrganizationTree(actor, todayUtc(), urgencies));
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'reporting.organization-tree',
      actorId: actor.id,
    });
  }
};
