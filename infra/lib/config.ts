export interface DeploymentConfig {
  region: 'us-west-2';
  stage: 'dev' | 'staging' | 'production';
  verboseLogging: boolean;
  currency: string;
  attachmentMaxBytes: number;
  attachmentMaxPerParent: number;
  attachmentUploadExpirySeconds: number;
  attachmentDownloadExpirySeconds: number;
  exportStagingExpirySeconds: number;
}

function boundedInteger(
  source: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(source[name] ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return parsed;
}

export function deploymentConfig(source: Record<string, string | undefined>): DeploymentConfig {
  const stage = source.NAASEH_STAGE ?? 'dev';
  if (!['dev', 'staging', 'production'].includes(stage))
    throw new Error('NAASEH_STAGE must be dev, staging, or production.');
  const region = requireNaasehRegion(source.NAASEH_AWS_REGION ?? NAASEH_AWS_REGION);
  return {
    region,
    stage: stage as DeploymentConfig['stage'],
    verboseLogging: source.VERBOSE_LOGGING === 'true',
    currency: (source.NAASEH_CURRENCY ?? 'USD').toUpperCase().replace(/[^A-Z]/g, ''),
    attachmentMaxBytes: boundedInteger(
      source,
      'NAASEH_ATTACHMENT_MAX_BYTES',
      25 * 1024 * 1024,
      1,
      100 * 1024 * 1024,
    ),
    attachmentMaxPerParent: boundedInteger(source, 'NAASEH_ATTACHMENT_MAX_PER_PARENT', 10, 1, 100),
    attachmentUploadExpirySeconds: boundedInteger(
      source,
      'NAASEH_ATTACHMENT_UPLOAD_EXPIRY_SECONDS',
      300,
      60,
      900,
    ),
    attachmentDownloadExpirySeconds: boundedInteger(
      source,
      'NAASEH_ATTACHMENT_DOWNLOAD_EXPIRY_SECONDS',
      60,
      15,
      300,
    ),
    exportStagingExpirySeconds: boundedInteger(
      source,
      'NAASEH_EXPORT_STAGING_EXPIRY_SECONDS',
      86_400,
      3_600,
      86_400,
    ),
  };
}
import { NAASEH_AWS_REGION, requireNaasehRegion } from './environments.js';
