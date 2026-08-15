import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '@naaseh/contracts';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';

const openapi = readFileSync(
  'specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml',
  'utf8',
);
const asOf = '2026-08-05T12:00:00.000Z';
const eventId = '01K00000000000000000000050';
const taskId = '01K00000000000000000000030';
const urgencyCounts = { low: 1, medium: 0, high: 0, critical: 0 };

function operation(path: string, nextPath: string) {
  const start = openapi.indexOf(`  ${path}:`);
  const end = openapi.indexOf(`  ${nextPath}:`, start + 1);
  expect(start, `${path} must be published`).toBeGreaterThanOrEqual(0);
  return openapi.slice(start, end < 0 ? undefined : end);
}

describe('completion report contract', () => {
  it('validates snapshot completion-export scope, browser zone, and owner-safe job status', () => {
    const request = contracts.completionExportRequestSchema.parse({
      filters: { period: 'day', weekStartsOn: 0, urgencies: ['high'] },
      browserTimeZone: 'America/Denver',
      asOf,
      idempotencyKey: 'stable-idempotency-key-0001',
      scope: 'self',
    });
    expect(request.browserTimeZone).toBe('America/Denver');
    expect(request.adminConfirmed).toBe(false);
    expect(
      contracts.completionExportJobResponseSchema.parse({
        id: 'job',
        status: 'completed',
        schemaVersion: 'naaseh.completed-tasks/v1',
        asOf,
        rowCount: 1,
        checksum: 'a'.repeat(64),
        downloadAvailable: true,
        downloadUrl: 'https://download.example.test/result',
      }),
    ).toMatchObject({ status: 'completed', rowCount: 1 });
  });
  it('returns bounded zero-filled personal buckets and historical filters', () => {
    const report = calculateCompletionReport([], {
      userId: 'owner',
      timeZone: 'UTC',
      period: 'day',
      from: '2026-07-01',
      to: '2026-07-03',
      categoryId: 'unassigned',
    });
    expect(report).toMatchObject({ userId: 'owner', total: 0 });
    expect(report.buckets).toHaveLength(3);
    expect(report.buckets.every(({ count }) => Number.isInteger(count) && count >= 0)).toBe(true);
    expect(report.buckets.reduce((sum, { count }) => sum + count, 0)).toBe(report.total);
  });

  it('preserves period, week-start, assignment, user, and urgency query filters', () => {
    const reportQuerySchema = (contracts as Record<string, unknown>).completionReportQuerySchema as
      | { parse(value: unknown): unknown }
      | undefined;
    expect(reportQuerySchema, 'completion report query validator must be exported').toBeDefined();
    expect(
      reportQuerySchema?.parse({
        period: 'week',
        weekStartsOn: '1',
        assignment: 'project',
        userId: 'owner',
        categoryId: 'category-a',
        projectId: 'project-a',
        urgencies: 'low,critical',
        from: '2026-08-01',
        to: '2026-08-31',
        timeZone: 'America/Denver',
      }),
    ).toEqual({
      period: 'week',
      weekStartsOn: 1,
      assignment: 'project',
      userId: 'owner',
      categoryId: 'category-a',
      projectId: 'project-a',
      urgencies: 'low,critical',
      from: '2026-08-01',
      to: '2026-08-31',
      timeZone: 'America/Denver',
    });

    const detailQuerySchema = (contracts as Record<string, unknown>).completionDetailQuerySchema as
      | { parse(value: unknown): unknown }
      | undefined;
    expect(detailQuerySchema, 'completion detail query validator must be exported').toBeDefined();
    expect(
      detailQuerySchema?.parse({
        weekStartsOn: '1',
        assignment: 'project',
        userId: 'owner',
        projectId: 'project-a',
        urgencies: 'low,critical',
        cursor: 'opaque-continuation',
        limit: '50',
      }),
    ).toMatchObject({
      weekStartsOn: 1,
      assignment: 'project',
      userId: 'owner',
      projectId: 'project-a',
      urgencies: 'low,critical',
      cursor: 'opaque-continuation',
      limit: 50,
    });
  });

  it('returns asOf and zero-filled urgency counts without raw events in aggregate responses', () => {
    const aggregate = {
      period: 'day' as const,
      timeZone: 'UTC',
      from: '2026-08-05',
      to: '2026-08-05',
      asOf,
      buckets: [{ key: '2026-08-05', count: 1, urgencyCounts }],
      total: 1,
      urgencyCounts,
    };
    expect(contracts.completionReportSchema.parse(aggregate)).toEqual(aggregate);
    expect(
      contracts.completionReportSchema.safeParse({ ...aggregate, events: [eventId] }).success,
    ).toBe(false);
    expect(
      contracts.completionReportSchema.safeParse({
        ...aggregate,
        urgencyCounts: { low: 1 },
      }).success,
    ).toBe(false);
  });

  it('defines a separate authorized paginated drilldown with short and empty continuation pages', () => {
    const detail = {
      eventId,
      workId: taskId,
      workType: 'task' as const,
      completedAt: '2026-08-05T11:00:00.000Z',
      urgencyAtCompletion: 'high' as const,
      reversedAt: '2026-08-06T11:00:00.000Z',
    };
    expect(
      contracts.completionDetailPageSchema.parse({
        asOf,
        items: [detail],
        nextCursor: 'short-page-cursor',
      }),
    ).toMatchObject({ items: [detail], nextCursor: 'short-page-cursor' });
    expect(
      contracts.completionDetailPageSchema.parse({
        asOf,
        items: [],
        nextCursor: 'empty-page-cursor',
      }),
    ).toMatchObject({ items: [], nextCursor: 'empty-page-cursor' });

    const drilldown = operation('/reporting/completion-report/drilldown', '/archive');
    expect(drilldown).toContain('authorized completion-event details');
    expect(drilldown).toContain('#/components/parameters/Cursor');
    expect(drilldown).toContain('#/components/parameters/Limit');
    expect(drilldown).toMatch(/reversal[\s\S]*asOf|asOf[\s\S]*reversal/iu);
  });

  it('documents actionable invalid, changed-context, and expired cursor responses', () => {
    const drilldown = operation('/reporting/completion-report/drilldown', '/archive');
    expect(drilldown).toContain("'400':\n          $ref: '#/components/responses/InvalidCursor'");
    expect(drilldown).toContain(
      "'409':\n          $ref: '#/components/responses/PaginationContextChanged'",
    );
    expect(drilldown).toContain("'410':\n          $ref: '#/components/responses/CursorExpired'");
  });
});
