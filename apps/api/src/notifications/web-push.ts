import { createHash } from 'node:crypto';
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from '@aws-sdk/client-scheduler';
import webPush, { type PushSubscription } from 'web-push';

const scheduler = new SchedulerClient({});

export interface StoredPushSubscription {
  userId: string;
  clientId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiresAt?: string;
}

export const genericPushPayload = (taskId: string) =>
  JSON.stringify({
    type: 'task-reminder',
    taskId,
    title: "Na'aseh reminder",
    body: 'A task is due.',
  });

export function reminderScheduleName(taskId: string, userId: string) {
  const digest = createHash('sha256').update(`${userId}\0${taskId}`).digest('hex').slice(0, 32);
  return `naaseh-reminder-${digest}`;
}

export const subscriptionExpired = (status: number) => status === 404 || status === 410;

export async function scheduleGenericReminder(
  input: {
    taskId: string;
    userId: string;
    dueAt: string;
    targetArn: string;
    schedulerRoleArn: string;
  },
  client: { send(command: unknown): Promise<unknown> } = scheduler,
) {
  const dueAt = new Date(input.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now())
    throw new Error('Reminder due time must be in the future.');
  const name = reminderScheduleName(input.taskId, input.userId);
  const schedule: CreateScheduleCommandInput = {
    Name: name,
    ScheduleExpression: `at(${dueAt.toISOString().replace(/\.\d{3}Z$/, '')})`,
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    Target: {
      Arn: input.targetArn,
      RoleArn: input.schedulerRoleArn,
      Input: JSON.stringify({
        type: 'task-reminder',
        taskId: input.taskId,
        userId: input.userId,
      }),
    },
  };
  try {
    await client.send(new CreateScheduleCommand(schedule));
  } catch (error) {
    if (
      !(error && typeof error === 'object' && 'name' in error && error.name === 'ConflictException')
    )
      throw error;
    await client.send(new UpdateScheduleCommand(schedule));
  }
  return name;
}

export async function cancelGenericReminder(
  taskId: string,
  userId: string,
  client: { send(command: unknown): Promise<unknown> } = scheduler,
) {
  try {
    await client.send(new DeleteScheduleCommand({ Name: reminderScheduleName(taskId, userId) }));
  } catch (error) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'ResourceNotFoundException'
      )
    )
      throw error;
  }
}

export async function syncTaskReminder(task: {
  id: string;
  ownerId: string;
  dueAt?: string | undefined;
  status: string;
}) {
  const targetArn = process.env.NOTIFICATION_TARGET_ARN;
  const schedulerRoleArn = process.env.NOTIFICATION_SCHEDULER_ROLE_ARN;
  if (!targetArn || !schedulerRoleArn) return;
  if (task.dueAt && task.status === 'open' && new Date(task.dueAt).getTime() > Date.now())
    await scheduleGenericReminder({
      taskId: task.id,
      userId: task.ownerId,
      dueAt: task.dueAt,
      targetArn,
      schedulerRoleArn,
    });
  else await cancelGenericReminder(task.id, task.ownerId);
}

export async function deliverGenericReminder(input: {
  taskId: string;
  subscription: StoredPushSubscription;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}) {
  webPush.setVapidDetails(input.vapidSubject, input.vapidPublicKey, input.vapidPrivateKey);
  const subscription: PushSubscription = {
    endpoint: input.subscription.endpoint,
    keys: { p256dh: input.subscription.p256dh, auth: input.subscription.auth },
  };
  return webPush.sendNotification(subscription, genericPushPayload(input.taskId), {
    TTL: 60 * 60,
    urgency: 'normal',
  });
}
