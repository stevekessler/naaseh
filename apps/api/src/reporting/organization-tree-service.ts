import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  canReadTaskAs,
  deadlineState,
  includeInWorkload,
  type ContentActor,
  type List,
  type Task,
} from '@naaseh/domain';
import { z } from 'zod';
import { listCategories } from '../categories/category-repository.js';
import { authorizeList } from '../lists/list-authorization.js';
import { listProjects } from '../projects/project-repository.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';

const countSchema = z.object({
  taskCount: z.number().int().nonnegative(),
  listCount: z.number().int().nonnegative(),
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

async function scanCurrentWork() {
  const result = await dynamodb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: '(begins_with(PK,:task) OR begins_with(PK,:list)) AND SK=:current',
      ExpressionAttributeValues: { ':task': 'TASK#', ':list': 'LIST#', ':current': 'CURRENT' },
    }),
  );
  const tasks: Task[] = [];
  const lists: List[] = [];
  for (const item of result.Items ?? []) {
    if (String(item.PK).startsWith('TASK#')) tasks.push(item.data as Task);
    if (String(item.PK).startsWith('LIST#')) lists.push(item.data as List);
  }
  return { tasks, lists };
}

const visibleOrganization = (value: { groupId?: string | undefined }, actor: ContentActor) =>
  actor.role === 'admin' || !value.groupId || actor.groupIds.includes(value.groupId);

export async function buildAuthorizedOrganizationTree(
  actor: ContentActor,
  today = new Date().toISOString().slice(0, 10),
) {
  const [categories, projects, work] = await Promise.all([
    listCategories(),
    listProjects(),
    scanCurrentWork(),
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
  const count = (projectId: string | undefined) => ({
    taskCount: tasks.filter((task) => (projectId ? task.projectId === projectId : !task.projectId))
      .length,
    listCount: lists.filter((list) => (projectId ? list.projectId === projectId : !list.projectId))
      .length,
  });
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
  scope: { projectId?: string; categoryId?: string; unassigned?: boolean },
) {
  const [tree, work, projects] = await Promise.all([
    buildAuthorizedOrganizationTree(actor),
    scanCurrentWork(),
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
  return {
    asOf: tree.asOf,
    tasks: work.tasks.filter(
      (task) =>
        includeInWorkload(task) && matches(task.projectId) && canReadTaskAs(task, actor).allowed,
    ),
    lists: work.lists.filter(
      (list) =>
        includeInWorkload(list) && matches(list.projectId) && authorizeList(list, actor).allowed,
    ),
  };
}
