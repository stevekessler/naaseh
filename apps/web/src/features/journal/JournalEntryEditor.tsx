import { useState } from 'react';
import type { JournalDocument, JournalEntryProjection, JournalProfile, Task } from '@naaseh/domain';
import { JournalNumericField } from './JournalNumericField.js';
import { JournalYesNoField } from './JournalYesNoField.js';
import { JournalRichTextEditor } from './JournalRichTextEditor.js';
import { JournalDbtFields } from './JournalDbtFields.js';
import { JournalTaskReflection } from './JournalTaskReflection.js';
import { TriggeredCrisisPlan } from './TriggeredCrisisPlan.js';

export type JournalEntryDraft = {
  projection: JournalEntryProjection;
  generalNotes: JournalDocument | null;
  taskReflection: { taskId: string; notes: JournalDocument | null } | null;
};
export function emptyJournalEntry(
  ownerId: string,
  date = new Date().toLocaleDateString('en-CA'),
): JournalEntryDraft {
  const now = new Date().toISOString();
  return {
    projection: {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      ownerId,
      date,
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
      createdAt: now,
      updatedAt: now,
    },
    generalNotes: null,
    taskReflection: null,
  };
}
const numeric = [
  { key: 'suicidalThoughts', label: 'Suicidal thoughts', maximum: 10 },
  { key: 'selfHarmThoughts', label: 'Self-harm thoughts', maximum: 10 },
  { key: 'alcoholicDrinks', label: 'Alcoholic drinks', maximum: 10 },
  { key: 'hoursOfSleep', label: 'Hours of sleep', maximum: 24, step: 0.5 },
  { key: 'urgeToAvoidCommitments', label: 'Urge to avoid commitments', maximum: 100 },
] as const;
const yesNo = [
  { key: 'suicidalBehaviors', label: 'Suicidal behaviors' },
  { key: 'selfHarmBehaviors', label: 'Self-harm behaviors' },
  { key: 'otherDrugs', label: 'Other drugs' },
  { key: 'medicationsAsPrescribed', label: 'Medications as prescribed' },
  { key: 'conflictWithOthers', label: 'Conflict with others' },
  { key: 'balancedEating', label: 'Balanced eating' },
  { key: 'selfCare', label: 'Self care' },
] as const;
const emotions = [
  'anger',
  'fear',
  'anxiety',
  'pain',
  'sadness',
  'shame',
  'guilt',
  'loneliness',
  'joy',
  'contentment',
] as const;
export const shouldShowCrisisPlan = (
  suicidalBehaviors: boolean | null,
  selfHarmBehaviors: boolean | null,
) => suicidalBehaviors === true || selfHarmBehaviors === true;
export function JournalEntryEditor({
  initial,
  profile,
  tasks = [],
  crisisPlan = null,
  onEditCrisisPlan,
  onSave,
}: {
  initial: JournalEntryDraft;
  profile: JournalProfile;
  tasks?: Task[];
  crisisPlan?: JournalDocument | null;
  onEditCrisisPlan?: () => void;
  onSave: (draft: JournalEntryDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState('');
  const patch = (key: keyof JournalEntryProjection, value: unknown) =>
    setDraft((current) => ({
      ...current,
      projection: { ...current.projection, [key]: value, updatedAt: new Date().toISOString() },
    }));
  const submit = async () => {
    try {
      setStatus('Saving encrypted entry…');
      await onSave(draft);
      setStatus('Saved locally; synchronization pending.');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'The entry could not be saved. Your draft is preserved.',
      );
    }
  };
  const crisisTriggered = shouldShowCrisisPlan(
    draft.projection.suicidalBehaviors,
    draft.projection.selfHarmBehaviors,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2>Journal entry</h2>
      <label>
        Date
        <input
          aria-label="Journal date"
          type="date"
          required
          value={draft.projection.date}
          onChange={(event) => patch('date', event.target.value)}
        />
      </label>
      {numeric
        .filter(
          (field) =>
            profile.suicidalSelfHarmEnabled ||
            !['suicidalThoughts', 'selfHarmThoughts'].includes(field.key),
        )
        .map((field) => (
          <JournalNumericField
            key={field.key}
            id={field.key}
            label={field.label}
            minimum={1}
            maximum={field.maximum}
            step={'step' in field ? field.step : 1}
            value={draft.projection[field.key]}
            onChange={(value) => patch(field.key, value)}
          />
        ))}
      <fieldset>
        <legend>Emotions</legend>
        {emotions.map((emotion) => (
          <JournalNumericField
            key={emotion}
            id={emotion}
            label={emotion[0]!.toUpperCase() + emotion.slice(1)}
            minimum={1}
            maximum={100}
            step={1}
            value={draft.projection.emotions[emotion]}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                projection: {
                  ...current.projection,
                  emotions: { ...current.projection.emotions, [emotion]: value },
                },
              }))
            }
          />
        ))}
      </fieldset>
      {yesNo
        .filter(
          (field) =>
            profile.suicidalSelfHarmEnabled ||
            !['suicidalBehaviors', 'selfHarmBehaviors'].includes(field.key),
        )
        .map((field) => (
          <JournalYesNoField
            key={field.key}
            id={field.key}
            label={field.label}
            value={draft.projection[field.key]}
            onChange={(value) => patch(field.key, value)}
          />
        ))}
      {crisisTriggered && (
        <TriggeredCrisisPlan
          document={crisisPlan}
          {...(crisisPlan
            ? {}
            : {
                error:
                  'Your Crisis Plan could not be decrypted. Your journal answers are preserved.',
              })}
          {...(onEditCrisisPlan ? { onEdit: onEditCrisisPlan } : {})}
        />
      )}
      {profile.dbtSkillsEnabled && (
        <JournalDbtFields value={draft.projection.dbt} onChange={(value) => patch('dbt', value)} />
      )}
      <JournalTaskReflection
        tasks={tasks}
        taskId={draft.taskReflection?.taskId ?? null}
        notes={draft.taskReflection?.notes ?? null}
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            taskReflection: value.taskId ? { taskId: value.taskId, notes: value.notes } : null,
          }))
        }
      />
      <JournalRichTextEditor
        label="General notes"
        value={draft.generalNotes}
        onChange={(generalNotes) => setDraft((current) => ({ ...current, generalNotes }))}
      />
      <button type="submit">Save encrypted entry</button>
      <p aria-live="polite">{status}</p>
    </form>
  );
}
