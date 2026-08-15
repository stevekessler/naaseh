import { z } from 'zod';
import { urgencySchema } from '@naaseh/domain';

export const COMPLETED_TASK_CSV_SCHEMA_VERSION = 'naaseh.completed-tasks/v1' as const;
export const COMPLETED_TASK_CSV_HEADERS = [
  'schema_version',
  'export_as_of',
  'record_kind',
  'task_id',
  'parent_task_id',
  'root_task_id',
  'label',
  'link',
  'memo_text',
  'memo_document_json',
  'memo_protected',
  'created_at',
  'updated_at',
  'due_kind',
  'due_date',
  'due_at',
  'due_time_precision',
  'completed_at',
  'completion_event_id',
  'completed_by_user_id',
  'completion_reversed_at',
  'archived_at',
  'archive_reason',
  'status',
  'lifecycle',
  'completion_state',
  'priority',
  'owner_user_id',
  'assignee_user_id',
  'category_id',
  'category_label',
  'project_id',
  'project_label',
  'group_id',
  'group_label',
  'visibility',
  'shared_with_json',
  'lock_state',
  'locked_by_user_id',
  'recurrence_json',
  'reminders_json',
  'list_id',
  'list_item_id',
  'list_amount_minor',
  'post_it_color',
  'post_it_effective_color',
  'google_task_id',
  'google_task_list_id',
  'google_sync_state',
  'google_last_synced_at',
  'attachments_json',
  'task_version',
  'completion_version',
  'sync_state',
  'viewer_overall_rank',
  'viewer_project_rank',
] as const;

export const completionExportFiltersSchema = z
  .object({
    period: z.enum(['day', 'week', 'month']).default('day'),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    weekStartsOn: z.number().int().min(0).max(6).default(0),
    categoryId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    urgencies: z.array(urgencySchema).max(4).default([]),
  })
  .strict();

export const completionExportRequestSchema = z
  .object({
    filters: completionExportFiltersSchema,
    browserTimeZone: z.string().min(1).max(128),
    asOf: z.string().datetime(),
    idempotencyKey: z.string().min(16).max(128),
    scope: z.enum(['self', 'all_users']),
    adminConfirmed: z.boolean().default(false),
  })
  .strict();

export const completionExportJobResponseSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['pending', 'running', 'validating', 'completed', 'failed']),
    schemaVersion: z.literal(COMPLETED_TASK_CSV_SCHEMA_VERSION),
    asOf: z.string().datetime(),
    rowCount: z.number().int().nonnegative().optional(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    downloadAvailable: z.boolean(),
    downloadUrl: z.string().url().optional(),
    errorClass: z.string().optional(),
  })
  .strict();

export type CompletionExportRequest = z.infer<typeof completionExportRequestSchema>;
