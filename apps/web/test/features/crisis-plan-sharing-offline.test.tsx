// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrisisPlanShareManager } from '../../src/features/journal/CrisisPlanShareManager.js';
import { crisisPlanGrantFixture } from '../../../../tests/fixtures/crisis-plan.js';

afterEach(cleanup);
describe('offline Crisis Plan sharing state', () => {
  it('labels encrypted revocation intents as pending without claiming remote access ended', () => {
    const grant = crisisPlanGrantFixture();
    const view = render(
      <CrisisPlanShareManager
        online={false}
        pendingRecipientIds={['recipient-1']}
        shares={[
          {
            planId: grant.planId,
            ownerId: grant.ownerId,
            recipientId: grant.recipientId,
            version: 1,
            state: 'active',
            grant,
            updatedAt: new Date().toISOString(),
          },
        ]}
        search={vi.fn(async () => [])}
        onShare={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
      />,
    );
    expect(
      view.getByText(/Revocation pending connection; remote access may continue/u),
    ).toBeTruthy();
    expect(view.queryByText(/access revoked/u)).toBeNull();
    expect((view.getByLabelText('Select a user') as HTMLSelectElement).disabled).toBe(true);
  });
});
