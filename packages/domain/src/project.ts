import { z } from 'zod';
import { ulidSchema } from './primitives.js';
import { createUlid } from './primitives.js';

export const organizationLifecycleSchema = z.enum(['active', 'archived']);
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parts = value.split('-').map(Number);
    if (parts.length !== 3) return false;
    const [year, month, day] = parts as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Expected a valid calendar date.');

export const projectSchema = z
  .object({
    id: ulidSchema,
    categoryId: ulidSchema,
    name: z.string().trim().min(1).max(80),
    endDate: calendarDateSchema.optional(),
    groupId: z.string().min(1).optional(),
    lifecycle: organizationLifecycleSchema,
    archivedAt: z.string().datetime().optional(),
    archivedBy: z.string().min(1).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((project, context) => {
    const archivedMetadata = Boolean(project.archivedAt && project.archivedBy);
    if ((project.lifecycle === 'archived') !== archivedMetadata)
      context.addIssue({
        code: 'custom',
        path: ['archivedAt'],
        message:
          'Archived Projects require archive actor and time; active Projects cannot retain them.',
      });
  });

export type Project = z.infer<typeof projectSchema>;

export const canonicalProjectName = (name: string) =>
  name.trim().normalize('NFKC').toLocaleLowerCase('en-US');

export const projectNameReservation = (categoryId: string, name: string) =>
  `PROJECTNAME#${categoryId}#${canonicalProjectName(name)}`;

export const projectEffectivelyAssignable = (
  project: Pick<Project, 'lifecycle'>,
  category: {
    lifecycle?: 'active' | 'archived' | undefined;
    archived?: boolean | undefined;
  },
) =>
  project.lifecycle === 'active' &&
  (category.lifecycle ?? (category.archived ? 'archived' : 'active')) === 'active';

export function createProject(
  input: { categoryId: string; name: string; endDate?: string; groupId?: string },
  now = new Date(),
): Project {
  const timestamp = now.toISOString();
  return projectSchema.parse({
    id: createUlid(now.getTime()),
    ...input,
    lifecycle: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
}

export function updateProject(
  project: Project,
  patch: Partial<Pick<Project, 'name' | 'categoryId' | 'endDate' | 'groupId'>>,
  now = new Date(),
): Project {
  return projectSchema.parse({
    ...project,
    ...patch,
    updatedAt: now.toISOString(),
    version: project.version + 1,
  });
}

export const moveProject = (project: Project, categoryId: string, now = new Date()) =>
  updateProject(project, { categoryId }, now);

export function archiveProject(project: Project, actorId: string, now = new Date()): Project {
  if (project.lifecycle === 'archived') throw new Error('Project is already archived.');
  const timestamp = now.toISOString();
  return projectSchema.parse({
    ...project,
    lifecycle: 'archived',
    archivedAt: timestamp,
    archivedBy: actorId,
    updatedAt: timestamp,
    version: project.version + 1,
  });
}

export function restoreProject(project: Project, now = new Date()): Project {
  if (project.lifecycle !== 'archived') throw new Error('Project is not archived.');
  return projectSchema.parse({
    ...project,
    lifecycle: 'active',
    archivedAt: undefined,
    archivedBy: undefined,
    updatedAt: now.toISOString(),
    version: project.version + 1,
  });
}

export type DeadlineState = 'undated' | 'upcoming' | 'today' | 'overdue';
export function deadlineState(endDate: string | undefined, today: string): DeadlineState {
  if (!endDate) return 'undated';
  if (endDate === today) return 'today';
  return endDate < today ? 'overdue' : 'upcoming';
}
