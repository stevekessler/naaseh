import { z } from 'zod';

export const journalSyncContractVersion = 6 as const;
export const compatibleJournalSyncContractVersions = Object.freeze([5, 6] as const);

export const journalMutationOperationSchema = z.literal('upsert');
export const journalLocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const uniqueEnumArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).superRefine((items, context) => {
    if (new Set(items).size !== items.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Selections must be unique' });
  });

export const dbtPracticeOutcomes = [
  "Didn't think about or use skills",
  "Thought about skills, didn't use them, didn't want to use them",
  "Thought about skills, didn't think I needed them",
  "Thought about skills, didn't use them, wanted to",
  "Tried but couldn't use skills",
  "Used skills but they didn't help",
  'Used skills and they helped.',
] as const;
export const mindfulnessSkills = [
  'Wise Mind',
  'Observe',
  'Describe',
  'Participate',
  'Nonjudgmentally',
  'Effectively',
  'One-mindfully',
  'Dialectics/Middle Path',
] as const;
export const emotionRegulationSkills = [
  'Check the Facts',
  'Opposite Action',
  'Problem Solving',
  'Accumulating Positives',
  'Values-based actions',
  'Building Mastery',
  'Cope Ahead',
  'PLEASE',
  'Mindfulness of current emotions',
  'Riding the emotion wave',
] as const;
export const interpersonalEffectivenessSkills = [
  'DEAR MAN (Objectives Effectiveness)',
  'GIVE (Relationship Effectiveness)',
  'FAST (Self-Respect Effectiveness)',
  'Validating self or others',
  'Mindfulness of others',
] as const;
export const distressToleranceSkills = [
  'STOP',
  'Pros and Cons',
  'TIPP',
  'Distracting with ACCEPTS',
  'Self-Soothing',
  'IMPROVE the Moment',
  'Radical Acceptance',
  'Turning the Mind',
  'Willing Hands',
  'Half-Smiling',
  'Mindfulness of thoughts',
] as const;

export const dbtSkillsResponseSchema = z
  .object({
    practiceOutcome: z.enum(dbtPracticeOutcomes).nullable(),
    mindfulness: uniqueEnumArray(mindfulnessSkills),
    emotionRegulation: uniqueEnumArray(emotionRegulationSkills),
    interpersonalEffectiveness: uniqueEnumArray(interpersonalEffectivenessSkills),
    distressTolerance: uniqueEnumArray(distressToleranceSkills),
  })
  .strict();
export type DbtSkillsResponse = z.infer<typeof dbtSkillsResponseSchema>;

const marksSchema = z
  .array(z.enum(['bold', 'italic', 'underline', 'strikethrough']))
  .max(4)
  .superRefine((marks, context) => {
    if (new Set(marks).size !== marks.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Marks must be unique' });
  });
const textRunSchema = z
  .object({ type: z.literal('text'), text: z.string(), marks: marksSchema.optional() })
  .strict();
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Only absolute HTTPS links are supported',
  });
const linkRunSchema = z
  .object({
    type: z.literal('link'),
    href: httpsUrlSchema,
    children: z.array(textRunSchema).max(10_000),
  })
  .strict();
const inlineSchema = z.discriminatedUnion('type', [textRunSchema, linkRunSchema]);
const paragraphSchema = z
  .object({ type: z.literal('paragraph'), children: z.array(inlineSchema).max(10_000) })
  .strict();
const listItemSchema = z.object({ children: z.array(inlineSchema).max(10_000) }).strict();
const listSchema = z
  .object({
    type: z.enum(['ordered-list', 'unordered-list']),
    items: z.array(listItemSchema).max(10_000),
  })
  .strict();
export const journalDocumentSchema = z
  .object({
    version: z.literal(1),
    blocks: z.array(z.union([paragraphSchema, listSchema])).max(10_000),
  })
  .strict();
export type JournalDocument = z.infer<typeof journalDocumentSchema>;

const nullableInt = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum).nullable();
const nullableBoolean = z.boolean().nullable();
const emotionSchema = z
  .object({
    anger: nullableInt(1, 100),
    fear: nullableInt(1, 100),
    anxiety: nullableInt(1, 100),
    pain: nullableInt(1, 100),
    sadness: nullableInt(1, 100),
    shame: nullableInt(1, 100),
    guilt: nullableInt(1, 100),
    loneliness: nullableInt(1, 100),
    joy: nullableInt(1, 100),
    contentment: nullableInt(1, 100),
  })
  .strict();

export const journalEntryProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    ownerId: z.string().min(1),
    date: journalLocalDateSchema,
    suicidalThoughts: nullableInt(1, 10),
    suicidalBehaviors: nullableBoolean,
    selfHarmThoughts: nullableInt(1, 10),
    selfHarmBehaviors: nullableBoolean,
    alcoholicDrinks: nullableInt(1, 10),
    otherDrugs: nullableBoolean,
    medicationsAsPrescribed: nullableBoolean,
    hoursOfSleep: z
      .number()
      .min(1)
      .max(24)
      .refine((value) => value * 2 === Math.round(value * 2))
      .nullable(),
    urgeToAvoidCommitments: nullableInt(1, 100),
    conflictWithOthers: nullableBoolean,
    balancedEating: nullableBoolean,
    selfCare: nullableBoolean,
    emotions: emotionSchema,
    dbt: dbtSkillsResponseSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type JournalEntryProjection = z.infer<typeof journalEntryProjectionSchema>;

export const taskReflectionSchema = z
  .object({ taskId: z.string().min(1), notes: journalDocumentSchema.nullable() })
  .strict();
export const journalEntryBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    entryId: z.string().uuid(),
    generalNotes: journalDocumentSchema.nullable(),
    taskReflection: taskReflectionSchema.nullable(),
  })
  .strict();
export type JournalEntryBody = z.infer<typeof journalEntryBodySchema>;
export const journalProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerId: z.string().min(1),
    suicidalSelfHarmEnabled: z.boolean().default(true),
    dbtSkillsEnabled: z.boolean().default(true),
  })
  .strict();
export type JournalProfile = z.infer<typeof journalProfileSchema>;
export const journalFieldDefinitions = Object.freeze({
  suicidalThoughts: { minimum: 1, maximum: 10, step: 1 },
  selfHarmThoughts: { minimum: 1, maximum: 10, step: 1 },
  alcoholicDrinks: { minimum: 1, maximum: 10, step: 1 },
  hoursOfSleep: { minimum: 1, maximum: 24, step: 0.5 },
  urgeToAvoidCommitments: { minimum: 1, maximum: 100, step: 1 },
});
