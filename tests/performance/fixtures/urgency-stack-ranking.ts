import { createHash } from 'node:crypto';
import {
  urgencyValues,
  type CompletionEvent,
  type Urgency,
  type WorkReference,
} from '@naaseh/domain';

export const URGENCY_STACK_RANKING_PROFILE = {
  version: 'urgency-stack-ranking-v1',
  seed: 'urgency-stack-ranking-v1',
  fixedNow: '2026-08-05T12:00:00.000Z',
  overallWorkCount: 50_000,
  projectWorkCount: 10_000,
  completionEventCount: 40_000,
  sparseSelectorEvery: 100,
  state: {
    outboxCount: 0,
    overall: { version: 120, snapshotThroughVersion: 100 },
    project: { version: 40, snapshotThroughVersion: 30 },
  },
} as const;

export const PERFORMANCE_OWNER_ID = 'performance-owner';
export const PERFORMANCE_GROUP_ID = 'performance-group';
export const PERFORMANCE_PROJECT_ID = '01K00200000000000000000000';

export type PerformanceWorkKind = 'task' | 'subtask' | 'list';
export type PerformanceAudienceKind = 'owner' | 'group' | 'public';

export interface UrgencyStackRankingPerformanceWork {
  [key: string]: unknown;
  id: string;
  reference: WorkReference;
  kind: PerformanceWorkKind;
  urgency: Urgency;
  audienceKind: PerformanceAudienceKind;
  audience: string;
  authorized: true;
  lifecycle: 'active';
  canonicalPosition: number;
  overallPosition: number;
  projectPosition?: number;
  sourcePage: number;
  projectId: string;
  categoryId: string;
  assigneeId: string;
  dueDate: string;
  contentType: 'todos' | 'lists';
  sparseSelector: boolean;
  label: string;
}

export interface UrgencyStackRankingPerformanceFixture {
  profile: typeof URGENCY_STACK_RANKING_PROFILE;
  projects: Array<{ id: string; categoryId: string }>;
  overallWork: UrgencyStackRankingPerformanceWork[];
  projectWork: UrgencyStackRankingPerformanceWork[];
  overallStack: WorkReference[];
  projectStack: WorkReference[];
  completionEvents: CompletionEvent[];
  checksum: string;
}

const ulid = (namespace: number, index: number) =>
  `01K${String(namespace).padStart(3, '0')}${String(index).padStart(20, '0')}`;

function seedHash(seed: string) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

const kindPattern: readonly PerformanceWorkKind[] = ['task', 'task', 'task', 'subtask', 'list'];
const audiencePattern: readonly PerformanceAudienceKind[] = [
  'owner',
  'owner',
  'owner',
  'group',
  'public',
];

function checksumFixture(input: {
  overallWork: readonly UrgencyStackRankingPerformanceWork[];
  projectStack: readonly WorkReference[];
  completionEvents: readonly CompletionEvent[];
}) {
  const digest = createHash('sha256');
  for (const item of input.overallWork) {
    digest.update(
      `${item.id}|${item.kind}|${item.urgency}|${item.audienceKind}|${item.projectId}|${item.sparseSelector ? 1 : 0}\n`,
    );
  }
  for (const reference of input.projectStack)
    digest.update(`${reference.workType}|${reference.workId}|${reference.membershipEpoch}\n`);
  for (const event of input.completionEvents)
    digest.update(`${event.id}|${event.taskId}|${event.occurredAt}|${event.urgencyAtCompletion}\n`);
  return digest.digest('hex');
}

/**
 * Construct the canonical performance data without randomness or wall-clock reads.
 * Five-record blocks are rotated by the versioned seed so urgency, work kind, and
 * audience stay interleaved while retaining exact target cardinalities.
 */
export function buildUrgencyStackRankingPerformanceFixture(): UrgencyStackRankingPerformanceFixture {
  const seed = seedHash(URGENCY_STACK_RANKING_PROFILE.seed);
  const urgencyOffset = seed % urgencyValues.length;
  const kindOffset = Math.floor(seed / 5) % kindPattern.length;
  const audienceOffset = Math.floor(seed / 25) % audiencePattern.length;
  const projects = Array.from({ length: 1_001 }, (_, index) => ({
    id: index === 0 ? PERFORMANCE_PROJECT_ID : ulid(2, index),
    categoryId: ulid(3, index % 100),
  }));
  const overallWork = Array.from(
    { length: URGENCY_STACK_RANKING_PROFILE.overallWorkCount },
    (_, index): UrgencyStackRankingPerformanceWork => {
      const block = Math.floor(index / 5);
      const urgency = urgencyValues[(index + urgencyOffset) % urgencyValues.length]!;
      const kind = kindPattern[(index + block + kindOffset) % kindPattern.length]!;
      const audienceKind =
        audiencePattern[(index + block * 2 + audienceOffset) % audiencePattern.length]!;
      const id = ulid(0, index);
      const project =
        index < URGENCY_STACK_RANKING_PROFILE.projectWorkCount
          ? projects[0]!
          : projects[1 + ((index - URGENCY_STACK_RANKING_PROFILE.projectWorkCount) % 1_000)]!;
      const reference: WorkReference = {
        workType: kind === 'list' ? 'list' : 'task',
        workId: id,
        membershipEpoch: `active:${String(index).padStart(12, '0')}`,
      };
      return {
        id,
        reference,
        kind,
        urgency,
        audienceKind,
        audience:
          audienceKind === 'owner'
            ? `OWNER#${PERFORMANCE_OWNER_ID}`
            : audienceKind === 'group'
              ? `GROUP#${PERFORMANCE_GROUP_ID}`
              : 'PUBLIC',
        authorized: true,
        lifecycle: 'active',
        canonicalPosition: index + 1,
        overallPosition: index + 1,
        sourcePage: Math.floor(index / 1_000),
        projectId: project.id,
        categoryId: project.categoryId,
        assigneeId: index % 2 === 0 ? PERFORMANCE_OWNER_ID : 'performance-assignee',
        dueDate: `2026-08-${String((index % 31) + 1).padStart(2, '0')}`,
        contentType: kind === 'list' ? 'lists' : 'todos',
        sparseSelector: index % URGENCY_STACK_RANKING_PROFILE.sparseSelectorEvery === 0,
        label: `Seeded ${kind} ${String(index).padStart(5, '0')}`,
      };
    },
  );

  const projectWork = overallWork.slice(0, URGENCY_STACK_RANKING_PROFILE.projectWorkCount);
  // The independent Project stack deliberately starts with overall position 5.
  const projectStackWork = [projectWork[4]!, ...projectWork.slice(0, 4), ...projectWork.slice(5)];
  projectStackWork.forEach((work, index) => {
    work.projectPosition = index + 1;
  });
  const overallStack = overallWork.map(({ reference }) => reference);
  const projectStack = projectStackWork.map(({ reference }) => reference);
  const completionEvents = overallWork
    .filter(({ kind }) => kind !== 'list')
    .map(
      (work, index): CompletionEvent => ({
        id: ulid(1, index),
        taskId: work.id,
        completedBy: PERFORMANCE_OWNER_ID,
        occurredAt: `2026-08-${String((index % 31) + 1).padStart(2, '0')}T12:00:00.000Z`,
        urgencyAtCompletion: work.urgency,
        projectIdAtCompletion: work.projectId,
        projectNameAtCompletion:
          work.projectId === PERFORMANCE_PROJECT_ID ? 'Performance Project' : 'Seeded Project',
        categoryIdAtCompletion: work.categoryId,
        categoryNameAtCompletion: 'Seeded Category',
        counted: true,
        createdAt: URGENCY_STACK_RANKING_PROFILE.fixedNow,
      }),
    );
  return {
    profile: URGENCY_STACK_RANKING_PROFILE,
    projects,
    overallWork,
    projectWork,
    overallStack,
    projectStack,
    completionEvents,
    checksum: checksumFixture({ overallWork, projectStack, completionEvents }),
  };
}

export function withPerformanceSourcePageSize<T extends { canonicalPosition: number }>(
  candidates: readonly T[],
  pageSize: number,
): Array<T & { sourcePage: number }> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new Error('Performance source-page size must be a positive integer.');
  return candidates.map((candidate) => ({
    ...candidate,
    sourcePage: Math.floor((candidate.canonicalPosition - 1) / pageSize),
  }));
}

export const urgencyStackRankingPerformanceFixture = buildUrgencyStackRankingPerformanceFixture();
