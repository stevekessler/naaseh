import type { ContentActor } from '@naaseh/domain';

export const archiveProjectIds = {
  categoryPaao: '01J00000000000000000000010',
  categoryOther: '01J00000000000000000000011',
  projectApi: '01J00000000000000000000020',
  projectNetwork: '01J00000000000000000000021',
  projectOtherApi: '01J00000000000000000000022',
  taskPublic: '01J00000000000000000000030',
  taskGroup: '01J00000000000000000000031',
  taskLocked: '01J00000000000000000000032',
  listPublic: '01J00000000000000000000040',
} as const;

export const archiveProjectActors: Record<
  'owner' | 'member' | 'outsider' | 'admin' | 'inactive',
  ContentActor
> = {
  owner: { id: 'owner-a', role: 'user', active: true, groupIds: ['group-a'] },
  member: { id: 'member-a', role: 'user', active: true, groupIds: ['group-a'] },
  outsider: { id: 'outsider-a', role: 'user', active: true, groupIds: [] },
  admin: { id: 'admin-a', role: 'admin', active: true, groupIds: [] },
  inactive: { id: 'inactive-a', role: 'user', active: false, groupIds: ['group-a'] },
};

export const archiveProjectClock = {
  beforeDst: '2026-03-08T08:30:00.000Z',
  afterDst: '2026-03-08T09:30:00.000Z',
  now: '2026-07-24T12:00:00.000Z',
} as const;

export function archiveProjectReportingScenario() {
  return {
    categories: [
      { id: archiveProjectIds.categoryPaao, name: 'PAAO', color: '#336699' },
      { id: archiveProjectIds.categoryOther, name: 'Another Category', color: '#663399' },
    ],
    projects: [
      { id: archiveProjectIds.projectApi, categoryId: archiveProjectIds.categoryPaao, name: 'API' },
      {
        id: archiveProjectIds.projectNetwork,
        categoryId: archiveProjectIds.categoryPaao,
        name: 'Network',
      },
      {
        id: archiveProjectIds.projectOtherApi,
        categoryId: archiveProjectIds.categoryOther,
        name: 'API',
      },
    ],
    work: [
      {
        id: archiveProjectIds.taskPublic,
        kind: 'task',
        projectId: archiveProjectIds.projectApi,
        audience: 'PUBLIC',
      },
      {
        id: archiveProjectIds.taskGroup,
        kind: 'task',
        projectId: archiveProjectIds.projectNetwork,
        audience: 'GROUP#group-a',
      },
      {
        id: archiveProjectIds.taskLocked,
        kind: 'task',
        projectId: undefined,
        audience: 'OWNER#owner-a',
      },
      {
        id: archiveProjectIds.listPublic,
        kind: 'list',
        projectId: archiveProjectIds.projectApi,
        audience: 'PUBLIC',
      },
    ],
  } as const;
}
