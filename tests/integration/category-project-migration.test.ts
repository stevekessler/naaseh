import { describe, expect, it } from 'vitest';
import { generalProjectIdentity } from '../../apps/api/src/projects/migration-service.js';

describe('legacy Category migration', () => {
  it('creates one deterministic General Project per Category across retries', () => {
    expect(generalProjectIdentity('category-a')).toBe(generalProjectIdentity('category-a'));
    expect(generalProjectIdentity('category-a')).not.toBe(generalProjectIdentity('category-b'));
  });
});
