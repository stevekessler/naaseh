import { z } from 'zod';

export const nativeClientPlatformSchema = z.enum(['ios', 'ipados', 'macos']);
export type NativeClientPlatform = z.infer<typeof nativeClientPlatformSchema>;

const positiveIntegerHeader = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform((value) => Number(value));

export interface NativeClientDescriptor {
  platform: NativeClientPlatform;
  buildNumber: number;
  contractVersion: number;
}

export interface NativeCompatibilityConfiguration {
  minimumBuilds: Record<NativeClientPlatform, number>;
  latestBuilds: Record<NativeClientPlatform, number>;
  supportedContractVersions: number[];
  temporarilyUnavailable: boolean;
  betaExpiresAt?: string;
}

export interface NativeCompatibilityDecision {
  mode: 'supported' | 'upgradeRequired' | 'temporarilyUnavailable';
  minimumBuild: number;
  latestBuild: number;
  supportedContractVersions: number[];
  messageCode: 'ok' | 'update_required' | 'beta_expired' | 'service_temporarily_unavailable';
}

type HeaderMap = Record<string, string | undefined>;

function header(headers: HeaderMap, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
}

export function isNativeClientRequest(headers: HeaderMap): boolean {
  return (
    header(headers, 'x-naaseh-client-platform') !== undefined ||
    header(headers, 'x-naaseh-client-build') !== undefined ||
    header(headers, 'x-naaseh-contract-version') !== undefined
  );
}

export function parseNativeClientHeaders(headers: HeaderMap): NativeClientDescriptor {
  return {
    platform: nativeClientPlatformSchema.parse(header(headers, 'x-naaseh-client-platform')),
    buildNumber: positiveIntegerHeader.parse(header(headers, 'x-naaseh-client-build')),
    contractVersion: positiveIntegerHeader.parse(header(headers, 'x-naaseh-contract-version')),
  };
}

export function evaluateCompatibility(
  client: NativeClientDescriptor,
  configuration: NativeCompatibilityConfiguration,
  now = new Date(),
): NativeCompatibilityDecision {
  const common = {
    minimumBuild: configuration.minimumBuilds[client.platform],
    latestBuild: configuration.latestBuilds[client.platform],
    supportedContractVersions: [...configuration.supportedContractVersions],
  };
  if (configuration.temporarilyUnavailable)
    return {
      ...common,
      mode: 'temporarilyUnavailable',
      messageCode: 'service_temporarily_unavailable',
    };
  if (
    configuration.betaExpiresAt !== undefined &&
    now.getTime() >= new Date(configuration.betaExpiresAt).getTime()
  )
    return { ...common, mode: 'upgradeRequired', messageCode: 'beta_expired' };
  if (
    client.buildNumber < common.minimumBuild ||
    !configuration.supportedContractVersions.includes(client.contractVersion)
  )
    return { ...common, mode: 'upgradeRequired', messageCode: 'update_required' };
  return { ...common, mode: 'supported', messageCode: 'ok' };
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`Invalid native compatibility setting: ${name}`);
  return parsed;
}

export function nativeCompatibilityConfigurationFromEnvironment(): NativeCompatibilityConfiguration {
  const minimumBuilds = {
    ios: positiveIntegerEnvironment('NAASEH_NATIVE_MINIMUM_BUILD_IOS', 1),
    ipados: positiveIntegerEnvironment('NAASEH_NATIVE_MINIMUM_BUILD_IPADOS', 1),
    macos: positiveIntegerEnvironment('NAASEH_NATIVE_MINIMUM_BUILD_MACOS', 1),
  };
  return {
    minimumBuilds,
    latestBuilds: {
      ios: positiveIntegerEnvironment('NAASEH_NATIVE_LATEST_BUILD_IOS', minimumBuilds.ios),
      ipados: positiveIntegerEnvironment('NAASEH_NATIVE_LATEST_BUILD_IPADOS', minimumBuilds.ipados),
      macos: positiveIntegerEnvironment('NAASEH_NATIVE_LATEST_BUILD_MACOS', minimumBuilds.macos),
    },
    supportedContractVersions: (process.env.NAASEH_NATIVE_SUPPORTED_CONTRACTS ?? '4')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
    temporarilyUnavailable: process.env.NAASEH_NATIVE_TEMPORARILY_UNAVAILABLE === 'true',
    ...(process.env.NAASEH_NATIVE_BETA_EXPIRES_AT
      ? { betaExpiresAt: process.env.NAASEH_NATIVE_BETA_EXPIRES_AT }
      : {}),
  };
}
