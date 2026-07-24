import { z } from 'zod';
export const reminderSchema = z
  .object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    userId: z.string().min(1).optional(),
    dueAt: z.string().datetime(),
    deliveredAt: z.string().datetime().optional(),
    status: z.enum(['scheduled', 'shown', 'delivered', 'overdue', 'cancelled']),
    remoteScheduleName: z.string().optional(),
    pushSubscriptionId: z.string().optional(),
    version: z.number().int().positive().default(1),
  })
  .strict();
export type Reminder = z.infer<typeof reminderSchema>;
export const updateReminderStatus = (
  reminder: Reminder,
  status: Reminder['status'],
  now = new Date(),
): Reminder =>
  reminderSchema.parse({
    ...reminder,
    status,
    version: reminder.version + 1,
    ...(status === 'shown' || status === 'delivered' ? { deliveredAt: now.toISOString() } : {}),
  });
