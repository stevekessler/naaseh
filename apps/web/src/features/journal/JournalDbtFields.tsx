import {
  dbtPracticeOutcomes,
  distressToleranceSkills,
  emotionRegulationSkills,
  interpersonalEffectivenessSkills,
  mindfulnessSkills,
  type DbtSkillsResponse,
} from '@naaseh/domain';

const groups = [
  { key: 'mindfulness', label: 'Mindfulness', values: mindfulnessSkills },
  { key: 'emotionRegulation', label: 'Emotion regulation', values: emotionRegulationSkills },
  {
    key: 'interpersonalEffectiveness',
    label: 'Interpersonal effectiveness',
    values: interpersonalEffectivenessSkills,
  },
  { key: 'distressTolerance', label: 'Distress tolerance', values: distressToleranceSkills },
] as const;
const empty: DbtSkillsResponse = {
  practiceOutcome: null,
  mindfulness: [],
  emotionRegulation: [],
  interpersonalEffectiveness: [],
  distressTolerance: [],
};
export function JournalDbtFields({
  value,
  onChange,
}: {
  value: DbtSkillsResponse | null;
  onChange: (value: DbtSkillsResponse | null) => void;
}) {
  const current = value ?? empty;
  const toggle = (key: (typeof groups)[number]['key'], skill: never, checked: boolean) =>
    onChange({
      ...current,
      [key]: checked ? [...current[key], skill] : current[key].filter((item) => item !== skill),
    } as DbtSkillsResponse);
  return (
    <fieldset>
      <legend>DBT skills (optional)</legend>
      <label>
        Practice outcome
        <select
          value={current.practiceOutcome ?? ''}
          onChange={(event) =>
            onChange({
              ...current,
              practiceOutcome: event.target.value
                ? (event.target.value as DbtSkillsResponse['practiceOutcome'])
                : null,
            })
          }
        >
          <option value="">Unanswered</option>
          {dbtPracticeOutcomes.map((outcome) => (
            <option key={outcome}>{outcome}</option>
          ))}
        </select>
      </label>
      {groups.map((group) => (
        <fieldset key={group.key}>
          <legend>{group.label}</legend>
          {group.values.map((skill) => (
            <label key={skill}>
              <input
                type="checkbox"
                checked={(current[group.key] as readonly string[]).includes(skill)}
                onChange={(event) => toggle(group.key, skill as never, event.target.checked)}
              />
              {skill}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange(null)}>
        Clear DBT response
      </button>
    </fieldset>
  );
}
