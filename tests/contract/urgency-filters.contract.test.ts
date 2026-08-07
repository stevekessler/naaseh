import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '@naaseh/contracts';

const openapi = readFileSync(
  'specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml',
  'utf8',
);

function operation(path: string, nextPath: string) {
  const start = openapi.indexOf(`  ${path}:`);
  const end = openapi.indexOf(`  ${nextPath}:`, start + 1);
  expect(start, `${path} must be published`).toBeGreaterThanOrEqual(0);
  return openapi.slice(start, end < 0 ? undefined : end);
}

describe('urgency-filtered API contract', () => {
  it('parses single/multi urgency alongside existing stack content filters', () => {
    expect(
      contracts.stackPageQuerySchema.parse({
        urgencies: 'extra_low,critical',
        contentType: 'todos',
        limit: '25',
      }),
    ).toEqual({
      urgencies: 'extra_low,critical',
      contentType: 'todos',
      limit: 25,
    });
    expect(contracts.stackPageQuerySchema.safeParse({ urgencies: 'high,high' }).success).toBe(
      false,
    );
    expect(contracts.stackPageQuerySchema.safeParse({ urgencies: 'urgent' }).success).toBe(false);
  });

  it('publishes urgency plus bounded continuation on overall, Project, archive, and drilldown reads', () => {
    const operations = [
      operation('/stacks/overall', '/stacks/overall/reorders'),
      operation('/projects/{projectId}/stack', '/projects/{projectId}/stack/reorders'),
      operation('/archive', '/reporting/organization-tree'),
      operation('/reporting/organization-tree/drilldown', '/sync/push'),
    ];
    for (const text of operations) {
      expect(text).toContain('#/components/parameters/Urgencies');
      expect(text).toContain('#/components/parameters/Cursor');
      expect(text).toContain('#/components/parameters/Limit');
      expect(text).toContain("'400':");
      expect(text).toContain("'409':");
      expect(text).toContain("'410':");
      expect(text).toMatch(/nextCursor|#\/components\/schemas\/StackPage/iu);
    }
  });

  it('keeps workload aggregates urgency-filterable without exposing raw detail rows', () => {
    const workload = operation(
      '/reporting/organization-tree',
      '/reporting/organization-tree/drilldown',
    );
    expect(workload).toContain('#/components/parameters/Urgencies');
    expect(workload).toContain('#/components/schemas/WorkloadCounts');
    expect(workload).not.toContain('CompletionEvent');
  });

  it('defines match-count limits and explicitly permits short or empty continuation pages', () => {
    const cursor = operation('/stacks/overall', '/stacks/overall/reorders');
    const archive = operation('/archive', '/reporting/organization-tree');
    const drilldown = operation('/reporting/organization-tree/drilldown', '/sync/push');
    for (const text of [cursor, archive, drilldown])
      expect(text).toContain('#/components/parameters/Limit');
    const components = openapi.slice(openapi.indexOf('components:'));
    expect(components).toMatch(/Maximum authorized matching items returned/iu);
    expect(components).toMatch(/short or empty|including empty/iu);
    expect(components).toMatch(/last candidate\s+examined/iu);
  });

  it('caps opaque cursors at 4096 bytes and documents actionable restart responses', () => {
    const components = openapi.slice(openapi.indexOf('components:'));
    expect(components).toContain('maxLength: 4096');
    expect(components).toMatch(/encrypted and signed inline/iu);
    expect(components).toMatch(/owner-scoped encrypted TTL/iu);
    expect(components).toMatch(/InvalidCursor:[\s\S]*malformed/iu);
    expect(components).toMatch(/PaginationContextChanged:[\s\S]*restart pagination/iu);
    expect(components).toMatch(/CursorExpired:[\s\S]*expired/iu);
  });
});
