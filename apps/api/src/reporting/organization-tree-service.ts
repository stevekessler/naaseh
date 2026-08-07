import {
  canReadTaskAs,
  deadlineState,
  includeInWorkload,
  urgencyCountsSchema,
  zeroUrgencyCounts,
  type ContentActor,
  type List,
  type Task,
  type Urgency,
} from '@naaseh/domain';
import { z } from 'zod';
import { listCategories } from '../categories/category-repository.js';
import { authorizeList } from '../lists/list-authorization.js';
import { listProjects } from '../projects/project-repository.js';
import { listProjectedWork, readProjectedWorkPage } from './work-view-repository.js';
import { readFilteredStackPage } from '../ranking/filtered-stack-reader.js';
import { recordFilteredRead } from './telemetry.js';
import type { PersonalStackService } from '../ranking/stack-service.js';
import type { PaginationCursorCodec } from '../shared/persistent-pagination-cursor.js';

const countSchema = z.object({
  taskCount: z.number().int().nonnegative(),
  listCount: z.number().int().nonnegative(),
  urgencyCounts: urgencyCountsSchema.default(zeroUrgencyCounts),
});
export const organizationTreeResponseSchema = z.object({
  asOf: z.string().datetime(),
  categories: z.array(
    countSchema.extend({
      id: z.string().min(1),
      name: z.string().min(1),
      projects: z.array(
        countSchema.extend({
          id: z.string().min(1),
          name: z.string().min(1),
          endDate: z.string().optional(),
          deadlineState: z.enum(['undated', 'upcoming', 'today', 'overdue']),
          remainingTotal: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
  unassigned: countSchema,
});
export type OrganizationTreeResponse = z.infer<typeof organizationTreeResponseSchema>;

const queryCurrentWork = (actor: ContentActor, urgencies?: readonly Urgency[]) =>
  listProjectedWork({ actor, lifecycle: 'active', ...(urgencies?.length ? { urgencies } : {}) });

export interface ViewerRankOverlay {
  overallRank: number;
  projectRank?: number | undefined;
}

type WorkloadRankOverlayReader = (input: {
  actor: ContentActor;
  work: Array<{ id: string; workType: 'task' | 'list'; projectId?: string | undefined }>;
}) => Promise<Map<string, ViewerRankOverlay>>;

let readViewerRankOverlays: WorkloadRankOverlayReader = async () => new Map();

/** Install the owner-private rank adapter at application composition time. */
export function configureWorkloadRankOverlayReader(reader: WorkloadRankOverlayReader) {
  const previous = readViewerRankOverlays;
  readViewerRankOverlays = reader;
  return () => {
    readViewerRankOverlays = previous;
  };
}

export function createPersonalStackRankOverlayReader(
  service: PersonalStackService,
): WorkloadRankOverlayReader {
  return async ({ actor, work }) => {
    const overall = await service.read({
      actorId: actor.id,
      actor,
      scope: { userId: actor.id, scopeType: 'overall' },
    });
    const overlays = new Map<string, ViewerRankOverlay>();
    overall.items.forEach((item, index) => {
      overlays.set(`${item.workType}:${item.workId}`, { overallRank: index + 1 });
    });
    const projectIds = [
      ...new Set(work.flatMap((item) => (item.projectId ? [item.projectId] : []))),
    ];
    await Promise.all(
      projectIds.map(async (projectId) => {
        const project = await service.read({
          actorId: actor.id,
          actor,
          scope: { userId: actor.id, scopeType: 'project', scopeId: projectId },
        });
        project.items.forEach((item, index) => {
          const key = `${item.workType}:${item.workId}`;
          const overallRank = overlays.get(key)?.overallRank;
          if (overallRank !== undefined) overlays.set(key, { overallRank, projectRank: index + 1 });
        });
      }),
    );
    return overlays;
  };
}

const visibleOrganization = (value: { groupId?: string | undefined }, actor: ContentActor) =>
  actor.role === 'admin' || !value.groupId || actor.groupIds.includes(value.groupId);

export async function buildAuthorizedOrganizationTree(
  actor: ContentActor,
  today = new Date().toISOString().slice(0, 10),
  urgencies?: readonly Urgency[],
) {
  const [categories, projects, work] = await Promise.all([
    listCategories(),
    listProjects(),
    queryCurrentWork(actor, urgencies),
  ]);
  const visibleCategories = categories.filter((category) => visibleOrganization(category, actor));
  const categoryIds = new Set(visibleCategories.map((category) => category.id));
  const visibleProjects = projects.filter(
    (project) => categoryIds.has(project.categoryId) && visibleOrganization(project, actor),
  );
  const projectIds = new Set(visibleProjects.map((project) => project.id));
  const tasks = work.tasks.filter(
    (task) => includeInWorkload(task) && canReadTaskAs(task, actor).allowed,
  );
  const lists = work.lists.filter(
    (list) => includeInWorkload(list) && authorizeList(list, actor).allowed,
  );
  const count = (projectId: string | undefined) => {
    const matchingTasks = tasks.filter((task) =>
      projectId ? task.projectId === projectId : !task.projectId,
    );
    const matchingLists = lists.filter((list) =>
      projectId ? list.projectId === projectId : !list.projectId,
    );
    const urgencyCounts = zeroUrgencyCounts();
    for (const item of [...matchingTasks, ...matchingLists]) urgencyCounts[item.urgency] += 1;
    return {
      taskCount: matchingTasks.length,
      listCount: matchingLists.length,
      urgencyCounts,
    };
  };
  const response: OrganizationTreeResponse = {
    asOf: new Date().toISOString(),
    categories: visibleCategories.map((category) => {
      const children = visibleProjects
        .filter((project) => project.categoryId === category.id)
        .map((project) => {
          const counts = count(project.id);
          return {
            id: project.id,
            name: project.name,
            ...counts,
            ...(project.endDate ? { endDate: project.endDate } : {}),
            deadlineState: deadlineState(project.endDate, today),
            remainingTotal: counts.taskCount + counts.listCount,
          };
        });
      return {
        id: category.id,
        name: category.name,
        taskCount: children.reduce((sum, child) => sum + child.taskCount, 0),
        listCount: children.reduce((sum, child) => sum + child.listCount, 0),
        urgencyCounts: children.reduce((counts, child) => {
          for (const urgency of Object.keys(counts) as Urgency[])
            counts[urgency] += child.urgencyCounts[urgency];
          return counts;
        }, zeroUrgencyCounts()),
        projects: children,
      };
    }),
    unassigned: count(undefined),
  };
  // Ignore dangling project identifiers rather than disclosing inaccessible organization nodes.
  void projectIds;
  return organizationTreeResponseSchema.parse(response);
}

export async function authorizedWorkloadDrilldown(
  actor: ContentActor,
  scope: {
    projectId?: string;
    categoryId?: string;
    unassigned?: boolean;
    urgencies?: Urgency[];
    orderBy?: 'overallRank' | 'projectRank';
    cursor?: string;
    limit?: number;
    accessEpoch?: number;
    cursorSecret?: string;
    cursorCodec?: PaginationCursorCodec;
  },
) {
  if (scope.orderBy === 'projectRank' && !scope.projectId)
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['orderBy'],
        message: 'Project-rank ordering requires one Project.',
      },
    ]);
  if (scope.cursorCodec)
    return boundedAuthorizedWorkloadDrilldown(actor, {
      ...scope,
      cursorCodec: scope.cursorCodec,
    });
  const [tree, work, projects] = await Promise.all([
    buildAuthorizedOrganizationTree(actor),
    queryCurrentWork(actor, scope.urgencies),
    listProjects(),
  ]);
  const allowedProjectIds = new Set(
    tree.categories.flatMap((category) => category.projects.map((project) => project.id)),
  );
  const matches = (projectId?: string) => {
    if (scope.unassigned) return !projectId;
    if (scope.projectId) return projectId === scope.projectId && allowedProjectIds.has(projectId);
    if (scope.categoryId)
      return Boolean(
        projectId &&
          allowedProjectIds.has(projectId) &&
          projects.some(
            (project) => project.id === projectId && project.categoryId === scope.categoryId,
          ),
      );
    return false;
  };
  const tasks = work.tasks.filter(
    (task) =>
      includeInWorkload(task) && matches(task.projectId) && canReadTaskAs(task, actor).allowed,
  );
  const lists = work.lists.filter(
    (list) =>
      includeInWorkload(list) && matches(list.projectId) && authorizeList(list, actor).allowed,
  );
  const rankedWork = [
    ...tasks.map((work) => ({ work, workType: 'task' as const })),
    ...lists.map((work) => ({ work, workType: 'list' as const })),
  ];
  const ranks = await readViewerRankOverlays({
    actor,
    work: rankedWork.map(({ work: item, workType }) => ({
      id: item.id,
      workType,
      ...(item.projectId ? { projectId: item.projectId } : {}),
    })),
  });
  const orderBy = scope.orderBy ?? 'overallRank';
  const candidates = rankedWork
    .map(({ work: item, workType }, index) => {
      const rank = ranks.get(`${workType}:${item.id}`);
      const canonicalPosition =
        orderBy === 'projectRank'
          ? (rank?.projectRank ?? Number.MAX_SAFE_INTEGER)
          : (rank?.overallRank ?? Number.MAX_SAFE_INTEGER);
      return {
        id: `${workType}:${item.id}`,
        work: item as Task | List,
        workType,
        urgency: item.urgency,
        lifecycle: 'active' as const,
        projectId: item.projectId,
        categoryId:
          'categoryId' in item
            ? item.categoryId
            : projects.find((project) => project.id === item.projectId)?.categoryId,
        contentType: workType === 'task' ? ('todos' as const) : ('lists' as const),
        canonicalPosition,
        sourcePage: Math.floor(index / 250),
        rank,
      };
    })
    .sort(
      (left, right) =>
        left.canonicalPosition - right.canonicalPosition || left.id.localeCompare(right.id),
    );
  const startedAt = performance.now();
  const page = await readFilteredStackPage({
    context: {
      actorId: actor.id,
      accessEpoch: scope.accessEpoch ?? 0,
      endpoint: 'drilldown',
      scope: scope.projectId
        ? `project:${scope.projectId}`
        : scope.categoryId
          ? `category:${scope.categoryId}`
          : 'unassigned',
      orderBy,
      filters: {
        lifecycle: 'active',
        contentType: 'all',
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.categoryId ? { categoryId: scope.categoryId } : {}),
        ...(scope.urgencies?.length ? { urgencies: scope.urgencies } : {}),
      },
      sourceEpochs: { workload: 0, personalStack: 0 },
      now: Date.now(),
    },
    candidates,
    limit: scope.limit ?? 50,
    ...(scope.cursor ? { cursor: scope.cursor } : {}),
    ...((scope.cursorSecret ?? process.env.CURSOR_SIGNING_SECRET)
      ? { cursorSecret: scope.cursorSecret ?? process.env.CURSOR_SIGNING_SECRET }
      : {}),
    ...(scope.cursorCodec ? { cursorCodec: scope.cursorCodec } : {}),
  });
  recordFilteredRead({
    endpointClass: 'drilldown',
    outcome: 'success',
    durationMs: performance.now() - startedAt,
    examinedCandidates: page.examinedCandidates,
    returnedRows: page.items.length,
    sourcePages: page.sourcePagesRead,
  });
  return {
    asOf: tree.asOf,
    items: page.items.map(({ work: item, workType, rank }) => ({
      ...item,
      workType,
      ...(rank ?? {}),
    })),
    nextCursor: page.nextCursor,
    // Preserve the established split collections while clients move to the paginated item shape.
    tasks: page.items.filter((item) => item.workType === 'task').map((item) => item.work as Task),
    lists: page.items.filter((item) => item.workType === 'list').map((item) => item.work as List),
  };
}

async function boundedAuthorizedWorkloadDrilldown(
  actor: ContentActor,
  scope: Parameters<typeof authorizedWorkloadDrilldown>[1] & {
    cursorCodec: PaginationCursorCodec;
  },
) {
  const [categories, projects] = await Promise.all([listCategories(), listProjects()]);
  const visibleCategoryIds = new Set(
    categories.filter((category) => visibleOrganization(category, actor)).map(({ id }) => id),
  );
  const allowedProjectIds = new Set(
    projects
      .filter(
        (project) =>
          visibleCategoryIds.has(project.categoryId) && visibleOrganization(project, actor),
      )
      .map(({ id }) => id),
  );
  const matches = (projectId?: string) => {
    if (scope.unassigned) return !projectId;
    if (scope.projectId) return projectId === scope.projectId && allowedProjectIds.has(projectId);
    if (scope.categoryId)
      return Boolean(
        projectId &&
          allowedProjectIds.has(projectId) &&
          projects.some(
            (project) => project.id === projectId && project.categoryId === scope.categoryId,
          ),
      );
    return false;
  };
  const orderBy = scope.orderBy ?? 'overallRank';
  const startedAt = performance.now();
  const page = await readProjectedWorkPage({
    actor,
    lifecycle: 'active',
    ...(scope.urgencies?.length ? { urgencies: scope.urgencies } : {}),
    ...(scope.projectId
      ? { scopeType: 'project' as const, scopeId: scope.projectId }
      : scope.categoryId
        ? { scopeType: 'category' as const, scopeId: scope.categoryId }
        : { scopeType: 'unassigned' as const, scopeId: 'unassigned' }),
    endpoint: 'drilldown',
    orderBy,
    accessEpoch: scope.accessEpoch ?? 0,
    filters: {
      lifecycle: 'active',
      contentType: 'all',
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.categoryId ? { categoryId: scope.categoryId } : {}),
      ...(scope.urgencies?.length ? { urgencies: scope.urgencies } : {}),
    },
    ...(scope.cursor ? { cursor: scope.cursor } : {}),
    limit: scope.limit ?? 50,
    cursorCodec: scope.cursorCodec,
    accept: (work, workType) =>
      includeInWorkload(work) &&
      matches(work.projectId) &&
      (workType === 'task'
        ? canReadTaskAs(work as Task, actor).allowed
        : authorizeList(work as List, actor).allowed),
  });
  const ranks = await readViewerRankOverlays({
    actor,
    work: page.items.map(({ work, workType }) => ({
      id: work.id,
      workType,
      ...(work.projectId ? { projectId: work.projectId } : {}),
    })),
  });
  const items = page.items
    .map(({ work, workType }) => ({
      ...work,
      workType,
      ...ranks.get(`${workType}:${work.id}`),
    }))
    .sort((left, right) => {
      const leftRank = orderBy === 'projectRank' ? left.projectRank : left.overallRank;
      const rightRank = orderBy === 'projectRank' ? right.projectRank : right.overallRank;
      return (
        (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER) ||
        `${left.workType}:${left.id}`.localeCompare(`${right.workType}:${right.id}`)
      );
    });
  recordFilteredRead({
    endpointClass: 'drilldown',
    outcome: 'success',
    durationMs: performance.now() - startedAt,
    examinedCandidates: page.examinedCandidates,
    returnedRows: items.length,
    sourcePages: page.sourcePagesRead,
  });
  return {
    asOf: page.asOf,
    items,
    nextCursor: page.nextCursor,
    tasks: items.filter((item) => item.workType === 'task'),
    lists: items.filter((item) => item.workType === 'list'),
  };
}
