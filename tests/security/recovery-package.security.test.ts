import {
  completeRecoveryPackage,
  missingRecoveryAccountWrapPackage,
  unknownKeyVersionPackage,
} from '@naaseh/test-fixtures';
import { describe, expect, it } from 'vitest';
import { assertRecoveryInventory } from '../../apps/api/src/crypto-recovery/manifest-service.js';

describe('recovery package fail-closed boundary', () => {
  it('accepts exactly one us-west-2 recovery wrap for every retained generation', () => {
    expect(() =>
      assertRecoveryInventory(
        completeRecoveryPackage.requiredKeyVersions,
        completeRecoveryPackage.wraps,
      ),
    ).not.toThrow();
  });

  it('rejects a package missing the recovery authority for any retained generation', () => {
    expect(() =>
      assertRecoveryInventory(
        missingRecoveryAccountWrapPackage.requiredKeyVersions,
        missingRecoveryAccountWrapPackage.wraps,
      ),
    ).toThrow('incomplete');
  });

  it('rejects unregistered wrap generations and duplicate authority wraps', () => {
    expect(() =>
      assertRecoveryInventory(
        unknownKeyVersionPackage.requiredKeyVersions,
        unknownKeyVersionPackage.wraps,
      ),
    ).toThrow('unregistered');
    expect(() =>
      assertRecoveryInventory(completeRecoveryPackage.requiredKeyVersions, [
        ...completeRecoveryPackage.wraps,
        completeRecoveryPackage.wraps[0]!,
      ]),
    ).toThrow('duplicate');
  });

  it('does not include plaintext memo or key material in fixture inventory', () => {
    const serialized = JSON.stringify(completeRecoveryPackage);
    expect(serialized).not.toMatch(/plaintext|privateKey|decryptedDek|password|pin/i);
  });
});
