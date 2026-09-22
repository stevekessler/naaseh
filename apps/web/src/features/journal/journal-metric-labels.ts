import type { JournalDashboardMetric, JournalDashboardMetricName } from '@naaseh/domain';

const metricLabels: Record<JournalDashboardMetricName, string> = {
  daysJournaled: 'Days journaled',
  suicidalThoughts: 'Suicidal thoughts',
  suicidalBehaviors: 'Suicidal behaviors',
  selfHarmThoughts: 'Self-harm thoughts',
  selfHarmBehaviors: 'Self-harm behaviors',
  hoursOfSleep: 'Hours of sleep',
  urgeToAvoidCommitments: 'Urge to avoid commitments or obligations',
  medicationsAsPrescribed: 'Medications as prescribed',
  conflictWithOthers: 'Conflict with others',
  balancedEating: 'Balanced eating',
  selfCare: 'Self-care',
  anger: 'Anger',
  fear: 'Fear',
  anxiety: 'Anxiety',
  pain: 'Pain',
  sadness: 'Sadness',
  shame: 'Shame',
  guilt: 'Guilt',
  loneliness: 'Loneliness',
  joy: 'Joy',
  contentment: 'Contentment',
};

const kindLabels: Record<JournalDashboardMetric['kind'], string> = {
  dayCount: 'Days',
  yesDayCount: 'Yes days',
  average: 'Average',
};

export const journalMetricLabel = (metric: JournalDashboardMetricName) => metricLabels[metric];

export const journalMetricKindLabel = (kind: JournalDashboardMetric['kind']) => kindLabels[kind];
