import { describe, expect, it } from 'vitest';
import { contentAudienceFor } from '@naaseh/domain';

describe('workload count boundaries', () => {
  it('uses one exclusive ordinary audience so counts cannot leak across scopes', () => {
    expect(contentAudienceFor({ ownerId: 'owner', locked: true, groupId: 'g' }).ordinary).toBe(
      'OWNER#owner',
    );
    expect(contentAudienceFor({ ownerId: 'owner', locked: false, groupId: 'g' }).ordinary).toBe(
      'GROUP#g',
    );
    expect(contentAudienceFor({ ownerId: 'owner', locked: false }).ordinary).toBe('PUBLIC');
  });
});
