import {
  dbtSkillsResponseSchema,
  journalDocumentSchema,
  journalEntryProjectionSchema,
  journalMutationOperationSchema,
  journalProfileSchema,
} from '@naaseh/domain';
import { describe, expect, it } from 'vitest';

const baseProjection = {
  schemaVersion: 1,
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'owner-1',
  date: '2026-08-29',
  suicidalThoughts: null,
  suicidalBehaviors: null,
  selfHarmThoughts: null,
  selfHarmBehaviors: null,
  alcoholicDrinks: null,
  otherDrugs: null,
  medicationsAsPrescribed: null,
  hoursOfSleep: null,
  urgeToAvoidCommitments: null,
  conflictWithOthers: null,
  balancedEating: null,
  selfCare: null,
  emotions: {
    anger: null,
    fear: null,
    anxiety: null,
    pain: null,
    sadness: null,
    shame: null,
    guilt: null,
    loneliness: null,
    joy: null,
    contentment: null,
  },
  dbt: null,
  createdAt: '2026-08-29T12:00:00.000Z',
  updatedAt: '2026-08-29T12:00:00.000Z',
};

describe('journal domain', () => {
  it('keeps every answer optional while enforcing numeric ranges and steps', () => {
    expect(journalEntryProjectionSchema.parse(baseProjection)).toMatchObject({
      date: '2026-08-29',
    });
    expect(
      journalEntryProjectionSchema.safeParse({ ...baseProjection, hoursOfSleep: 7.25 }).success,
    ).toBe(false);
    expect(
      journalEntryProjectionSchema.safeParse({ ...baseProjection, suicidalThoughts: 11 }).success,
    ).toBe(false);
  });

  it('accepts only the specified DBT values and unique selections', () => {
    expect(
      dbtSkillsResponseSchema.safeParse({
        practiceOutcome: 'Used skills and they helped.',
        mindfulness: ['Wise Mind'],
        emotionRegulation: ['PLEASE'],
        interpersonalEffectiveness: [],
        distressTolerance: ['STOP'],
      }).success,
    ).toBe(true);
    expect(
      dbtSkillsResponseSchema.safeParse({
        practiceOutcome: 'invented',
        mindfulness: ['Wise Mind', 'Wise Mind'],
        emotionRegulation: [],
        interpersonalEffectiveness: [],
        distressTolerance: [],
      }).success,
    ).toBe(false);
  });

  it('validates structural rich text and permits HTTPS links only', () => {
    const document = {
      version: 1,
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Safe', marks: ['bold'] },
            {
              type: 'link',
              href: 'https://example.com',
              children: [{ type: 'text', text: 'link' }],
            },
          ],
        },
      ],
    };
    expect(journalDocumentSchema.safeParse(document).success).toBe(true);
    expect(
      journalDocumentSchema.safeParse({
        ...document,
        blocks: [
          { type: 'paragraph', children: [{ type: 'link', href: 'javascript:x', children: [] }] },
        ],
      }).success,
    ).toBe(false);
  });

  it('defaults both private preferences on and exposes no delete operation', () => {
    expect(journalProfileSchema.parse({ schemaVersion: 1, ownerId: 'owner-1' })).toMatchObject({
      suicidalSelfHarmEnabled: true,
      dbtSkillsEnabled: true,
    });
    expect(journalMutationOperationSchema.safeParse('upsert').success).toBe(true);
    expect(journalMutationOperationSchema.safeParse('delete').success).toBe(false);
  });
});
