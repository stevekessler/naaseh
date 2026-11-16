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
  archiveProjectMigrationMode: 'off' | 'dual-write' | 'backfill' | 'verify' | 'complete';
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
    archiveProjectMigrationMode: (() => {
      const value = source.NAASEH_ARCHIVE_PROJECT_MIGRATION_MODE ?? 'off';
      if (!['off', 'dual-write', 'backfill', 'verify', 'complete'].includes(value))
        throw new Error('NAASEH_ARCHIVE_PROJECT_MIGRATION_MODE is invalid.');
      return value as DeploymentConfig['archiveProjectMigrationMode'];
    })(),
  };
}
import { NAASEH_AWS_REGION, requireNaasehRegion } from './environments.js';

const productionAccount = '093733938983';
const productionDomain = 'gsd.thepandas.link';
const productionZoneId = 'Z03233042WRAYW9S16I7T';
const productionZoneName = 'thepandas.link';
const dnsName =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

type StackContext = (key: string) => string | undefined;

export function deploymentTarget(
  stage: DeploymentConfig['stage'],
  source: Record<string, string | undefined>,
  context: StackContext,
) {
  const account = source.CDK_DEFAULT_ACCOUNT;
  if (stage !== 'staging') {
    return {
      account,
      edgeId: 'NaasehEdge',
      applicationId: 'NaasehProd',
      domainName: context('domainName') ?? source.NAASEH_DOMAIN_NAME ?? productionDomain,
      hostedZoneId: context('hostedZoneId') ?? source.NAASEH_HOSTED_ZONE_ID ?? productionZoneId,
      hostedZoneName:
        context('hostedZoneName') ?? source.NAASEH_HOSTED_ZONE_NAME ?? productionZoneName,
      breakGlassRoleArn:
        context('breakGlassRoleArn') ??
        `arn:aws:iam::${account ?? '111111111111'}:role/naaseh-recovery-break-glass`,
      alertEmail: context('alertEmail') ?? source.NAASEH_ALERT_EMAIL ?? 'steve.kessler18@gmail.com',
    };
  }

  if (!account || !/^\d{12}$/u.test(account) || account !== source.NAASEH_STAGING_ACCOUNT_ID)
    throw new Error('Staging requires the CDK account to match NAASEH_STAGING_ACCOUNT_ID.');
  if (account === productionAccount)
    throw new Error('Staging requires an AWS account separate from production.');

  const domainName = source.NAASEH_STAGING_DOMAIN_NAME;
  const hostedZoneName = source.NAASEH_STAGING_HOSTED_ZONE_NAME;
  const hostedZoneId = source.NAASEH_STAGING_HOSTED_ZONE_ID;
  if (
    !domainName ||
    !dnsName.test(domainName) ||
    !hostedZoneName ||
    !dnsName.test(hostedZoneName) ||
    !hostedZoneId ||
    !/^Z[A-Z0-9]+$/u.test(hostedZoneId) ||
    (domainName !== hostedZoneName && !domainName.endsWith(`.${hostedZoneName}`))
  )
    throw new Error(
      'Staging requires an explicit lowercase hostname and its delegated hosted zone.',
    );
  if (
    domainName === productionDomain ||
    domainName.endsWith(`.${productionDomain}`) ||
    hostedZoneName === productionZoneName ||
    hostedZoneId === productionZoneId
  )
    throw new Error('Staging cannot use the production hostname or hosted zone.');

  const breakGlassRoleArn = source.NAASEH_STAGING_BREAK_GLASS_ROLE_ARN;
  if (
    !breakGlassRoleArn?.startsWith(`arn:aws:iam::${account}:role/`) ||
    !/role\/[A-Za-z0-9+=,.@_/-]+$/u.test(breakGlassRoleArn)
  )
    throw new Error('Staging requires a recovery role ARN in the isolated staging account.');

  return {
    account,
    edgeId: 'NaasehStagingEdge',
    applicationId: 'NaasehStaging',
    domainName,
    hostedZoneId,
    hostedZoneName,
    breakGlassRoleArn,
    alertEmail: source.NAASEH_STAGING_ALERT_EMAIL,
  };
}
