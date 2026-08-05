import type {
  CompletionEvent,
  ContentActor,
  List,
  Project,
  Task,
  UserRecord,
} from '@naaseh/domain';

export const urgencyFixtureValues = ['extra_low', 'low', 'medium', 'high', 'critical'] as const;

export type UrgencyFixtureValue = (typeof urgencyFixtureValues)[number];

export type UrgencyFixtureTask = Task & { urgency: UrgencyFixtureValue };
export type UrgencyFixtureList = List & { urgency: UrgencyFixtureValue };
export type UrgencyFixtureCompletionEvent = CompletionEvent & {
  urgencyAtCompletion: UrgencyFixtureValue;
};

export const urgencyStackRankingIds = {
  categoryWork: '01K00000000000000000000001',
  projectDelivery: '01K00000000000000000000010',
  projectOperations: '01K00000000000000000000011',
  taskExtraLow: '01K00000000000000000000100',
  taskMedium: '01K00000000000000000000101',
  subtaskHigh: '01K00000000000000000000102',
  taskCompletedCritical: '01K00000000000000000000103',
  subtaskCompletedLow: '01K00000000000000000000104',
  listLow: '01K00000000000000000000200',
  listCritical: '01K00000000000000000000201',
  taskCompletionCritical: '01K00000000000000000000300',
  subtaskCompletionLow: '01K00000000000000000000301',
} as const;

export const urgencyStackRankingUsers: Record<
  'owner' | 'collaborator' | 'outsider' | 'admin',
  UserRecord
> = {
  owner: {
    id: 'urgency-owner',
    username: 'urgency-owner',
    displayName: 'Urgency Owner',
    role: 'user',
    active: true,
    sessionEpoch: 0,
  },
  collaborator: {
    id: 'urgency-collaborator',
    username: 'urgency-collaborator',
    displayName: 'Urgency Collaborator',
    role: 'user',
    active: true,
    sessionEpoch: 0,
  },
  outsider: {
    id: 'urgency-outsider',
    username: 'urgency-outsider',
    displayName: 'Urgency Outsider',
    role: 'user',
    active: true,
    sessionEpoch: 0,
  },
  admin: {
    id: 'urgency-admin',
    username: 'urgency-admin',
    displayName: 'Urgency Administrator',
    role: 'admin',
    active: true,
    sessionEpoch: 0,
  },
};

export const urgencyStackRankingActors: Record<
  keyof typeof urgencyStackRankingUsers,
  ContentActor
> = {
  owner: { ...urgencyStackRankingUsers.owner, groupIds: ['urgency-team'] },
  collaborator: { ...urgencyStackRankingUsers.collaborator, groupIds: ['urgency-team'] },
  outsider: { ...urgencyStackRankingUsers.outsider, groupIds: [] },
  admin: { ...urgencyStackRankingUsers.admin, groupIds: [] },
};

export const urgencyStackRankingProjects = [
  {
    id: urgencyStackRankingIds.projectDelivery,
    categoryId: urgencyStackRankingIds.categoryWork,
    name: 'Delivery',
    groupId: 'urgency-team',
    lifecycle: 'active',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    version: 1,
  },
  {
    id: urgencyStackRankingIds.projectOperations,
    categoryId: urgencyStackRankingIds.categoryWork,
    name: 'Operations',
    lifecycle: 'active',
    createdAt: '2026-08-01T12:01:00.000Z',
    updatedAt: '2026-08-01T12:01:00.000Z',
    version: 1,
  },
] as const satisfies readonly Project[];

const activeTaskDefaults = {
  ownerId: urgencyStackRankingUsers.owner.id,
  memo: '',
  memoHidden: false,
  visibility: 'public',
  status: 'open',
  lifecycle: 'active',
  completionState: 'open',
  version: 1,
} as const;

export const urgencyStackRankingTasks = [
  {
    ...activeTaskDefaults,
    id: urgencyStackRankingIds.taskExtraLow,
    label: 'Document optional cleanup ideas',
    urgency: 'extra_low',
    projectId: urgencyStackRankingIds.projectDelivery,
    groupId: 'urgency-team',
    createdAt: '2026-08-01T13:00:00.000Z',
    updatedAt: '2026-08-01T13:00:00.000Z',
  },
  {
    ...activeTaskDefaults,
    id: urgencyStackRankingIds.taskMedium,
    label: 'Prepare the weekly work plan',
    urgency: 'medium',
    projectId: urgencyStackRankingIds.projectOperations,
    createdAt: '2026-08-01T13:01:00.000Z',
    updatedAt: '2026-08-01T13:01:00.000Z',
  },
  {
    ...activeTaskDefaults,
    id: urgencyStackRankingIds.subtaskHigh,
    parentId: urgencyStackRankingIds.taskMedium,
    label: 'Confirm the deployment window',
    urgency: 'high',
    projectId: urgencyStackRankingIds.projectOperations,
    createdAt: '2026-08-01T13:02:00.000Z',
    updatedAt: '2026-08-01T13:02:00.000Z',
  },
  {
    id: urgencyStackRankingIds.taskCompletedCritical,
    ownerId: urgencyStackRankingUsers.owner.id,
    label: 'Restore the production service',
    memo: '',
    memoHidden: false,
    urgency: 'critical',
    projectId: urgencyStackRankingIds.projectDelivery,
    groupId: 'urgency-team',
    visibility: 'public',
    status: 'archived',
    lifecycle: 'archived',
    completionState: 'completed',
    archiveReason: 'completed',
    archivedAt: '2026-08-02T15:00:00.000Z',
    archivedBy: urgencyStackRankingUsers.owner.id,
    completedAt: '2026-08-02T15:00:00.000Z',
    completedBy: urgencyStackRankingUsers.owner.id,
    currentCompletionEventId: urgencyStackRankingIds.taskCompletionCritical,
    createdAt: '2026-08-01T13:03:00.000Z',
    updatedAt: '2026-08-02T15:00:00.000Z',
    version: 2,
  },
  {
    id: urgencyStackRankingIds.subtaskCompletedLow,
    ownerId: urgencyStackRankingUsers.owner.id,
    parentId: urgencyStackRankingIds.taskExtraLow,
    label: 'File the follow-up notes',
    memo: '',
    memoHidden: false,
    urgency: 'low',
    projectId: urgencyStackRankingIds.projectDelivery,
    groupId: 'urgency-team',
    visibility: 'public',
    status: 'archived',
    lifecycle: 'archived',
    completionState: 'completed',
    archiveReason: 'completed',
    archivedAt: '2026-08-02T16:00:00.000Z',
    archivedBy: urgencyStackRankingUsers.collaborator.id,
    completedAt: '2026-08-02T16:00:00.000Z',
    completedBy: urgencyStackRankingUsers.collaborator.id,
    currentCompletionEventId: urgencyStackRankingIds.subtaskCompletionLow,
    createdAt: '2026-08-01T13:04:00.000Z',
    updatedAt: '2026-08-02T16:00:00.000Z',
    version: 2,
  },
] as const satisfies readonly UrgencyFixtureTask[];

export const urgencyStackRankingLists = [
  {
    id: urgencyStackRankingIds.listLow,
    ownerId: urgencyStackRankingUsers.owner.id,
    name: 'Office supplies',
    urgency: 'low',
    projectId: urgencyStackRankingIds.projectOperations,
    locked: false,
    status: 'active',
    lifecycle: 'active',
    createdAt: '2026-08-01T14:00:00.000Z',
    updatedAt: '2026-08-01T14:00:00.000Z',
    version: 1,
  },
  {
    id: urgencyStackRankingIds.listCritical,
    ownerId: urgencyStackRankingUsers.owner.id,
    name: 'Emergency response supplies',
    urgency: 'critical',
    projectId: urgencyStackRankingIds.projectDelivery,
    groupId: 'urgency-team',
    locked: false,
    status: 'active',
    lifecycle: 'active',
    createdAt: '2026-08-01T14:01:00.000Z',
    updatedAt: '2026-08-01T14:01:00.000Z',
    version: 1,
  },
] as const satisfies readonly UrgencyFixtureList[];

/** Completion history intentionally contains Tasks and Subtasks only, never Lists. */
export const urgencyStackRankingTaskCompletionEvents = [
  {
    id: urgencyStackRankingIds.taskCompletionCritical,
    taskId: urgencyStackRankingIds.taskCompletedCritical,
    completedBy: urgencyStackRankingUsers.owner.id,
    occurredAt: '2026-08-02T15:00:00.000Z',
    projectIdAtCompletion: urgencyStackRankingIds.projectDelivery,
    projectNameAtCompletion: 'Delivery',
    categoryIdAtCompletion: urgencyStackRankingIds.categoryWork,
    categoryNameAtCompletion: 'Work',
    urgencyAtCompletion: 'critical',
    counted: true,
    createdAt: '2026-08-02T15:00:00.000Z',
  },
  {
    id: urgencyStackRankingIds.subtaskCompletionLow,
    taskId: urgencyStackRankingIds.subtaskCompletedLow,
    completedBy: urgencyStackRankingUsers.collaborator.id,
    occurredAt: '2026-08-02T16:00:00.000Z',
    projectIdAtCompletion: urgencyStackRankingIds.projectDelivery,
    projectNameAtCompletion: 'Delivery',
    categoryIdAtCompletion: urgencyStackRankingIds.categoryWork,
    categoryNameAtCompletion: 'Work',
    urgencyAtCompletion: 'low',
    counted: true,
    createdAt: '2026-08-02T16:00:00.000Z',
  },
] as const satisfies readonly UrgencyFixtureCompletionEvent[];

export type UrgencyStackRankingWorkFixture =
  | { workType: 'task'; work: (typeof urgencyStackRankingTasks)[number] }
  | { workType: 'list'; work: (typeof urgencyStackRankingLists)[number] };

export const urgencyStackRankingActiveWork: readonly UrgencyStackRankingWorkFixture[] = [
  ...urgencyStackRankingTasks
    .filter((task) => task.lifecycle === 'active')
    .map((work) => ({ workType: 'task' as const, work })),
  ...urgencyStackRankingLists.map((work) => ({ workType: 'list' as const, work })),
];

export function urgencyStackRankingFixture() {
  return {
    values: urgencyFixtureValues,
    ids: urgencyStackRankingIds,
    users: urgencyStackRankingUsers,
    actors: urgencyStackRankingActors,
    projects: urgencyStackRankingProjects,
    tasks: urgencyStackRankingTasks,
    lists: urgencyStackRankingLists,
    activeWork: urgencyStackRankingActiveWork,
    taskCompletionEvents: urgencyStackRankingTaskCompletionEvents,
  } as const;
}
