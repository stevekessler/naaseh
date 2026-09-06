import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { journalProfileSchema } from '@naaseh/domain';
import { JournalSettings } from '../../src/features/journal/JournalSettings.js';

describe('journal preferences', () => {
  it('defaults both independent owner preferences on and offers encrypted-pending feedback', () => {
    const profile = journalProfileSchema.parse({ schemaVersion: 1, ownerId: 'owner' });
    const html = renderToStaticMarkup(
      <JournalSettings
        profile={profile}
        pending
        onChange={() => undefined}
        onLock={() => undefined}
      />,
    );
    expect(profile).toMatchObject({ suicidalSelfHarmEnabled: true, dbtSkillsEnabled: true });
    expect(html.match(/type="checkbox"/gu)).toHaveLength(2);
    expect(html).toContain('pending synchronization');
  });
});
