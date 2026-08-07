import { describe, expect, it } from 'vitest';
import type { Task } from '@naaseh/domain';
import { CSV_HEADERS, transformTodosToCsv } from '../../apps/api/src/exports/csv-transformer.js';

const work = (patch: Partial<Task>): Task =>
  ({
    id: '01J00000000000000000000001',
    ownerId: 'owner',
    label: 'Authorized work',
    memo: '',
    memoHidden: false,
    urgency: 'critical',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    visibility: 'public',
    status: 'open',
    lifecycle: 'active',
    version: 1,
    ...patch,
  }) as Task;

describe('urgency and viewer-rank export boundary', () => {
  it('exports categorical urgency and only the requesting viewer rank overlay', () => {
    expect(CSV_HEADERS).toContain('urgency');
    expect(CSV_HEADERS).toContain('overallRank');
    expect(CSV_HEADERS).toContain('projectRank');

    const csv = transformTodosToCsv(
      [work({})],
      new Map(),
      new Map([
        [
          '01J00000000000000000000001',
          { overallRank: 5, projectRank: 1, viewerId: 'requesting-viewer' },
        ],
      ]),
    );
    expect(csv).toContain('critical');
    expect(csv).toMatch(/,5,1,/);
    expect(csv).not.toContain('requesting-viewer');
    expect(csv).not.toContain('other-user');
  });

  it('omits ranks for archived work even if a stale overlay is supplied', () => {
    const archived = work({
      id: '01J00000000000000000000002',
      status: 'archived',
      lifecycle: 'archived',
      urgency: 'extra_low',
    });
    const csv = transformTodosToCsv(
      [archived],
      new Map(),
      new Map([[archived.id, { overallRank: 9, projectRank: 2 }]]),
    );
    const row = csv.trimEnd().split('\r\n')[1]!.split(',');
    expect(row[CSV_HEADERS.indexOf('urgency')]).toBe('extra_low');
    expect(row[CSV_HEADERS.indexOf('overallRank')]).toBe('');
    expect(row[CSV_HEADERS.indexOf('projectRank')]).toBe('');
  });

  it('never adds rows outside the already-authorized input collection', () => {
    const authorized = work({ id: '01J00000000000000000000003', label: 'Visible' });
    const csv = transformTodosToCsv(
      [authorized],
      new Map(),
      new Map([
        [authorized.id, { overallRank: 1 }],
        ['01J00000000000000000000004', { overallRank: 2 }],
      ]),
    );
    expect(csv).toContain('Visible');
    expect(csv).not.toContain('01J00000000000000000000004');
  });
});
