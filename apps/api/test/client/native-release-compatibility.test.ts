import { describe, expect, it } from 'vitest';
import {
  evaluateCompatibility,
  type NativeCompatibilityConfiguration,
} from '../../src/client/compatibility.js';

const policy: NativeCompatibilityConfiguration = {
  minimumBuilds: { ios: 10, ipados: 10, macos: 8 },
  latestBuilds: { ios: 12, ipados: 12, macos: 9 },
  supportedContractVersions: [4, 5],
  temporarilyUnavailable: false,
};

describe('native release compatibility safety', () => {
  it('blocks builds below the platform floor and contracts outside the additive window', () => {
    expect(
      evaluateCompatibility({ platform: 'ios', buildNumber: 9, contractVersion: 4 }, policy).mode,
    ).toBe('upgradeRequired');
    expect(
      evaluateCompatibility({ platform: 'macos', buildNumber: 9, contractVersion: 6 }, policy).mode,
    ).toBe('upgradeRequired');
    expect(
      evaluateCompatibility({ platform: 'ipados', buildNumber: 10, contractVersion: 5 }, policy)
        .mode,
    ).toBe('supported');
  });

  it('distinguishes outage and unsafe-build expiry without returning a mutation capability', () => {
    const client = { platform: 'ios' as const, buildNumber: 12, contractVersion: 4 };
    expect(
      evaluateCompatibility(client, { ...policy, temporarilyUnavailable: true }).messageCode,
    ).toBe('service_temporarily_unavailable');
    expect(
      evaluateCompatibility(
        client,
        { ...policy, betaExpiresAt: '2026-10-01T00:00:00Z' },
        new Date('2026-10-02T00:00:00Z'),
      ).messageCode,
    ).toBe('beta_expired');
    expect(Object.keys(evaluateCompatibility(client, policy))).not.toContain('canMutate');
  });
});
