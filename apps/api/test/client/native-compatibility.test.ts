import { describe, expect, it } from 'vitest';
import {
  evaluateCompatibility,
  isNativeClientRequest,
  parseNativeClientHeaders,
  type NativeCompatibilityConfiguration,
} from '../../src/client/compatibility.js';

const configuration: NativeCompatibilityConfiguration = {
  minimumBuilds: { ios: 20, ipados: 20, macos: 12 },
  latestBuilds: { ios: 25, ipados: 25, macos: 15 },
  supportedContractVersions: [4],
  temporarilyUnavailable: false,
};

describe('native compatibility contract', () => {
  it('supports a current build and fails closed for old builds or contracts', () => {
    expect(
      evaluateCompatibility(
        { platform: 'ios', buildNumber: 25, contractVersion: 4 },
        configuration,
      ),
    ).toEqual({
      mode: 'supported',
      minimumBuild: 20,
      latestBuild: 25,
      supportedContractVersions: [4],
      messageCode: 'ok',
    });
    expect(
      evaluateCompatibility({ platform: 'ios', buildNumber: 19, contractVersion: 4 }, configuration)
        .messageCode,
    ).toBe('update_required');
    expect(
      evaluateCompatibility(
        { platform: 'macos', buildNumber: 15, contractVersion: 3 },
        configuration,
      ).mode,
    ).toBe('upgradeRequired');
  });

  it('distinguishes beta expiry and a temporary service pause', () => {
    expect(
      evaluateCompatibility(
        { platform: 'ipados', buildNumber: 25, contractVersion: 4 },
        { ...configuration, betaExpiresAt: '2026-01-01T00:00:00.000Z' },
        new Date('2026-01-02T00:00:00.000Z'),
      ).messageCode,
    ).toBe('beta_expired');
    expect(
      evaluateCompatibility(
        { platform: 'ipados', buildNumber: 25, contractVersion: 4 },
        { ...configuration, temporarilyUnavailable: true },
      ).mode,
    ).toBe('temporarilyUnavailable');
  });

  it('strictly parses native headers without changing browser requests', () => {
    const headers = {
      'x-naaseh-client-platform': 'ios',
      'x-naaseh-client-build': '25',
      'x-naaseh-contract-version': '4',
    };
    expect(parseNativeClientHeaders(headers)).toEqual({
      platform: 'ios',
      buildNumber: 25,
      contractVersion: 4,
    });
    expect(() =>
      parseNativeClientHeaders({ ...headers, 'x-naaseh-client-build': '2.5' }),
    ).toThrow();
    expect(() =>
      parseNativeClientHeaders({ ...headers, 'x-naaseh-client-platform': 'web' }),
    ).toThrow();
    expect(isNativeClientRequest({})).toBe(false);
    expect(isNativeClientRequest({ cookie: '__Host-naaseh=browser-session' })).toBe(false);
  });
});
