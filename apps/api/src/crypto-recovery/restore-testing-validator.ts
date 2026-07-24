import {
  BackupClient,
  DescribeRestoreJobCommand,
  PutRestoreValidationResultCommand,
} from '@aws-sdk/client-backup';
import {
  DescribeTableCommand,
  DynamoDBClient,
  ScanCommand,
  type AttributeValue,
  type ScanCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import {
  backupManifestSchema,
  hiddenMemoPackageSchema,
  taskSchema,
  type BackupManifest,
  type HiddenMemoPackage,
} from '@naaseh/domain';
import { createLogger } from '@naaseh/observability';
import { z } from 'zod';
import { verifyStoredManifest } from './manifest-service.js';
import { MAX_RTO_SECONDS } from './restore-validator.js';
import { validateEnhancedRecoveryRows } from './backup-manifest.js';

const restoreEventSchema = z
  .object({
    source: z.literal('aws.backup'),
    'detail-type': z.literal('Restore Job State Change'),
    detail: z
      .object({
        restoreJobId: z.string().min(1),
        restoreTestingPlanArn: z.string().min(1),
        resourceType: z.enum(['DynamoDB', 'S3']),
        createdResourceArn: z.string().min(1),
        status: z.literal('COMPLETED'),
      })
      .passthrough(),
  })
  .passthrough();

const workflowEventSchema = z
  .object({
    action: z.enum([
      'ValidateRestoreJob',
      'ValidateRestoredResource',
      'RecordEvidence',
      'RecordFailure',
    ]),
    input: z.record(z.unknown()),
  })
  .strict();

const restoreEvidenceSchema = z
  .object({
    region: z.literal('us-west-2'),
    restoreJobId: z.string().min(1),
    restoreTestingPlanArn: z.string().min(1),
    resourceType: z.enum(['DynamoDB', 'S3']),
    createdResourceArn: z.string().min(1),
    recoveryPointArn: z.string().min(1),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    rtoSeconds: z.number().nonnegative(),
  })
  .strict();

type CommandClient = { send(command: object): Promise<unknown> };

export type RestoreTestingDependencies = {
  backup: CommandClient;
  dynamodb: CommandClient;
  s3: CommandClient;
  kms: CommandClient;
  expectedPlanArn: string;
  manifestSigningKeyId: string;
  recoveryKeyIds: Record<'recovery', string>;
  verifyManifest(manifest: BackupManifest, keyId: string): Promise<boolean>;
  decryptRecoveryWrap(wrap: HiddenMemoPackage['recoveryWraps'][number]): Promise<Uint8Array>;
};

const defaultDependencies = (): RestoreTestingDependencies => ({
  backup: new BackupClient({}),
  dynamodb: new DynamoDBClient({}),
  s3: new S3Client({}),
  kms: new KMSClient({}),
  expectedPlanArn: process.env.RESTORE_TESTING_PLAN_ARN ?? '',
  manifestSigningKeyId: process.env.MANIFEST_SIGNING_KEY_ARN ?? '',
  recoveryKeyIds: {
    recovery: process.env.RECOVERY_MEMO_WRAPPING_KEY_ARN ?? '',
  },
  verifyManifest: verifyStoredManifest,
  async decryptRecoveryWrap(wrap) {
    const response = (await this.kms.send(
      new DecryptCommand({
        KeyId: wrap.kmsKeyId,
        CiphertextBlob: Buffer.from(wrap.ciphertext, 'base64'),
        EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
      }),
    )) as { Plaintext?: Uint8Array };
    if (!response.Plaintext?.length) throw new Error('Recovery wrap decryption returned no key.');
    return response.Plaintext;
  },
});

/**
 * Validates an AWS Backup Restore Testing job, rather than attempting a second restore.
 * AWS Backup owns creation and deletion of the isolated resource; this Lambda has read-only
 * access to that resource and reports a content-free validation result back to AWS Backup.
 */
export async function runRestoreTestingAction(
  action: 'ValidateRestoreJob' | 'ValidateRestoredResource' | 'RecordEvidence' | 'RecordFailure',
  input: Record<string, unknown>,
  dependencies: RestoreTestingDependencies,
) {
  if (action === 'ValidateRestoreJob') return inspectCompletedRestore(input, dependencies);

  if (action === 'RecordFailure') {
    const restoreJobId = restoreJobIdFromInput(input);
    if (restoreJobId === 'unknown') throw new Error('Restore job identifier is missing.');
    await dependencies.backup.send(
      new PutRestoreValidationResultCommand({
        RestoreJobId: restoreJobId,
        ValidationStatus: 'FAILED',
        ValidationStatusMessage: 'Naaseh isolated resource validation failed; inspect safe logs',
      }),
    );
    return { restoreJobId, status: 'FAILED' as const };
  }

  const evidence = restoreEvidenceSchema.parse(input.job);
  if (action === 'ValidateRestoredResource') {
    const probe = await probeRestoredResource(evidence, dependencies);
    return { ...evidence, probe };
  }

  if (!input.resourceValidation)
    throw new Error('Restored resource validation evidence is missing.');
  await dependencies.backup.send(
    new PutRestoreValidationResultCommand({
      RestoreJobId: evidence.restoreJobId,
      ValidationStatus: 'SUCCESSFUL',
      ValidationStatusMessage: `Naaseh ${evidence.resourceType} isolation validation passed`,
    }),
  );
  return { restoreJobId: evidence.restoreJobId, status: 'SUCCESSFUL' as const };
}

export async function handler(event: unknown) {
  const parsed = workflowEventSchema.parse(event);
  const logger = createLogger(process.env);
  try {
    const result = await runRestoreTestingAction(
      parsed.action,
      parsed.input,
      defaultDependencies(),
    );
    logger.info('restore-testing-validation', {
      operation: parsed.action,
      outcome: 'success',
      restoreJobId: restoreJobIdFromInput(parsed.input),
    });
    return result;
  } catch (error) {
    logger.error('restore-testing-validation', {
      operation: parsed.action,
      outcome: 'failure',
      restoreJobId: restoreJobIdFromInput(parsed.input),
      errorClass: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}

async function inspectCompletedRestore(
  input: Record<string, unknown>,
  dependencies: RestoreTestingDependencies,
) {
  const event = restoreEventSchema.parse(input);
  if (
    !dependencies.expectedPlanArn ||
    event.detail.restoreTestingPlanArn !== dependencies.expectedPlanArn
  )
    throw new Error('Restore job is not associated with the approved restore testing plan.');
  assertIsolatedResource(event.detail.createdResourceArn, event.detail.resourceType);

  const response = (await dependencies.backup.send(
    new DescribeRestoreJobCommand({ RestoreJobId: event.detail.restoreJobId }),
  )) as {
    Status?: string;
    ResourceType?: string;
    CreatedResourceArn?: string;
    RecoveryPointArn?: string;
    RestoreTestingPlanArn?: string;
    CreationDate?: Date;
    CompletionDate?: Date;
  };
  if (
    response.Status !== 'COMPLETED' ||
    response.ResourceType !== event.detail.resourceType ||
    response.CreatedResourceArn !== event.detail.createdResourceArn ||
    response.RestoreTestingPlanArn !== dependencies.expectedPlanArn ||
    !response.RecoveryPointArn ||
    !response.CreationDate ||
    !response.CompletionDate
  )
    throw new Error('AWS Backup restore job evidence is incomplete or inconsistent.');
  assertUsWest2Arn(response.CreatedResourceArn);
  assertUsWest2Arn(response.RecoveryPointArn);

  const rtoSeconds = (response.CompletionDate.getTime() - response.CreationDate.getTime()) / 1_000;
  if (!Number.isFinite(rtoSeconds) || rtoSeconds < 0 || rtoSeconds > MAX_RTO_SECONDS)
    throw new Error('Restore job exceeded the four-hour recovery time objective.');

  return restoreEvidenceSchema.parse({
    region: 'us-west-2',
    restoreJobId: event.detail.restoreJobId,
    restoreTestingPlanArn: dependencies.expectedPlanArn,
    resourceType: response.ResourceType,
    createdResourceArn: response.CreatedResourceArn,
    recoveryPointArn: response.RecoveryPointArn,
    startedAt: response.CreationDate.toISOString(),
    completedAt: response.CompletionDate.toISOString(),
    rtoSeconds,
  });
}

function assertUsWest2Arn(arn: string) {
  const region = arn.split(':')[3];
  if (region !== 'us-west-2') throw new Error('Restore resources must remain in us-west-2.');
}

async function probeRestoredResource(
  evidence: z.infer<typeof restoreEvidenceSchema>,
  dependencies: RestoreTestingDependencies,
) {
  assertIsolatedResource(evidence.createdResourceArn, evidence.resourceType);
  if (evidence.resourceType === 'DynamoDB') {
    const tableName = resourceName(evidence.createdResourceArn, 'table');
    const description = (await dependencies.dynamodb.send(
      new DescribeTableCommand({ TableName: tableName }),
    )) as { Table?: { TableStatus?: string; TableArn?: string } };
    if (
      description.Table?.TableStatus !== 'ACTIVE' ||
      description.Table.TableArn !== evidence.createdResourceArn
    )
      throw new Error('Restored DynamoDB table is not active or does not match the restore job.');
    const items = await readDynamoItems(tableName, dependencies.dynamodb);
    const integrity = await validateRestoredInventory(items, evidence, dependencies);
    return { resourceType: 'DynamoDB' as const, itemCount: items.length, integrity };
  }

  const bucketName = resourceName(evidence.createdResourceArn, 's3:::');
  const response = (await dependencies.s3.send(
    new ListObjectVersionsCommand({ Bucket: bucketName, MaxKeys: 1 }),
  )) as { Versions?: unknown[]; DeleteMarkers?: unknown[] };
  return {
    resourceType: 'S3' as const,
    objectVersionObserved: Boolean(response.Versions?.length || response.DeleteMarkers?.length),
  };
}

type RestoredItem = { PK?: unknown; SK?: unknown; data?: unknown };

async function readDynamoItems(tableName: string, client: CommandClient) {
  const items: RestoredItem[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const page = (await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK, #data',
        ExpressionAttributeNames: { '#data': 'data' },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )) as ScanCommandOutput;
    items.push(
      ...(page.Items ?? []).map(
        (item) => unmarshall(item as Record<string, AttributeValue>) as RestoredItem,
      ),
    );
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

export async function validateRestoredInventory(
  items: RestoredItem[],
  evidence: z.infer<typeof restoreEvidenceSchema>,
  dependencies: Pick<
    RestoreTestingDependencies,
    'manifestSigningKeyId' | 'verifyManifest' | 'recoveryKeyIds' | 'decryptRecoveryWrap'
  >,
) {
  if (!dependencies.manifestSigningKeyId)
    throw new Error('Backup manifest signing key is unavailable.');
  const manifests = items
    .filter((item) => item.SK === 'MANIFEST')
    .map((item) => backupManifestSchema.safeParse(item.data))
    .filter((result): result is { success: true; data: BackupManifest } => result.success)
    .map((result) => result.data)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const manifest = manifests.find(
    (candidate) => candidate.recoveryPointArn === evidence.recoveryPointArn,
  );
  if (!manifest) throw new Error('Signed manifest for the restored recovery point is missing.');
  if (!(await dependencies.verifyManifest(manifest, dependencies.manifestSigningKeyId)))
    throw new Error('Restored backup manifest signature or hash is invalid.');

  const actualCounts = countRestoredEntities(items);
  const enhancedIntegrity = validateEnhancedRecoveryRows(items);
  const discrepancies = Object.entries(manifest.entityCounts)
    .filter(([name, expected]) => (actualCounts[normalizeEntityName(name)] ?? 0) !== expected)
    .map(([name]) => name)
    .sort();
  if (discrepancies.length)
    throw new Error(`Restored entity count mismatch for: ${discrepancies.join(', ')}.`);

  const packages = items.flatMap((item) => {
    const result = taskSchema.safeParse(item.data);
    if (!result.success || !result.data.memoHidden) return [];
    if (!result.data.encryptedMemo) throw new Error('A hidden memo recovery package is missing.');
    return [hiddenMemoPackageSchema.parse(JSON.parse(result.data.encryptedMemo))];
  });
  const observedVersions = new Set<string>();
  const representativeByVersion = new Map<string, HiddenMemoPackage>();
  for (const memoPackage of packages)
    for (const wrap of memoPackage.recoveryWraps) {
      observedVersions.add(wrap.keyVersion);
      if (!representativeByVersion.has(wrap.keyVersion))
        representativeByVersion.set(wrap.keyVersion, memoPackage);
    }
  const requiredVersions = [
    ...new Set([...manifest.keyVersions, ...manifest.recoveryWrapVersions]),
  ];
  const missingVersions = requiredVersions.filter((version) => !observedVersions.has(version));
  if (missingVersions.length)
    throw new Error(
      `Restored recovery wrap generations are incomplete: ${missingVersions.join(', ')}.`,
    );
  for (const version of requiredVersions)
    await validateRecoveryDecryptability(
      representativeByVersion.get(version)!,
      version,
      dependencies,
    );

  return {
    manifestId: manifest.manifestId,
    entityCounts: Object.fromEntries(
      Object.keys(manifest.entityCounts)
        .sort()
        .map((name) => [name, actualCounts[normalizeEntityName(name)] ?? 0]),
    ),
    recoveryWrapVersions: [...observedVersions].sort(),
    manifestVerified: true as const,
    enhancedIntegrity,
  };
}

async function validateRecoveryDecryptability(
  memoPackage: HiddenMemoPackage,
  version: string,
  dependencies: Pick<RestoreTestingDependencies, 'recoveryKeyIds' | 'decryptRecoveryWrap'>,
) {
  const recovery = memoPackage.recoveryWraps.find(
    (wrap) => wrap.keyVersion === version && wrap.authority === 'recovery',
  )!;
  if (
    !dependencies.recoveryKeyIds.recovery ||
    recovery.kmsKeyId !== dependencies.recoveryKeyIds.recovery
  )
    throw new Error('Recovery wrap references an unapproved KMS authority.');

  const recoveryKey = Buffer.from(await dependencies.decryptRecoveryWrap(recovery));
  try {
    if (recoveryKey.length !== 32)
      throw new Error('Recovery authority must return a 32-byte data key.');
  } finally {
    recoveryKey.fill(0);
  }
}

function countRestoredEntities(items: RestoredItem[]) {
  const counts: Record<string, number> = {};
  const add = (name: string) => {
    counts[name] = (counts[name] ?? 0) + 1;
  };
  for (const item of items) {
    const pk = typeof item.PK === 'string' ? item.PK : '';
    const sk = typeof item.SK === 'string' ? item.SK : '';
    if (pk.startsWith('TASK#') && sk === 'CURRENT') {
      add('tasks');
      const task = taskSchema.safeParse(item.data);
      if (task.success && task.data.memoHidden) add('hiddenmemos');
    } else if (pk.startsWith('TASK#') && sk.startsWith('REV#')) add('revisions');
    else if (pk.startsWith('USER#') && sk === 'PROFILE') add('users');
    else if (pk.startsWith('CATEGORY#') && sk === 'CURRENT') add('categories');
    else if (pk.startsWith('GROUP#') && sk === 'CURRENT') add('groups');
    else if (pk.startsWith('GROUP#') && sk.startsWith('MEMBER#')) add('memberships');
    else if (pk.startsWith('REMINDER#')) add('reminders');
    else if (pk.startsWith('FEED#') && sk.startsWith('CHANGE#')) add('syncchanges');
    else if (pk.startsWith('LIST#') && sk === 'CURRENT') add('lists');
    else if (pk.startsWith('LISTITEM#') && sk === 'CURRENT') add('listitems');
    else if (pk.startsWith('DIRECTORY#') && sk === 'CURRENT') add('directoryitems');
    else if (pk.startsWith('ATTACHMENT#') && sk === 'CURRENT') add('attachments');
    else if (pk.startsWith('BLOB#') && sk === 'CURRENT') add('attachmentblobs');
    else if (pk.startsWith('BLOB#') && sk.startsWith('REF#')) add('blobreferences');
    else if (pk.startsWith('COPYJOB#') && sk === 'CURRENT') add('copyjobs');
    else if (pk.startsWith('EXPORTJOB#') && sk === 'CURRENT') add('exportjobs');
  }
  return counts;
}

function normalizeEntityName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    task: 'tasks',
    taskrevision: 'revisions',
    taskrevisions: 'revisions',
    hiddenmemo: 'hiddenmemos',
    user: 'users',
    category: 'categories',
    group: 'groups',
    groupmembership: 'memberships',
    groupmemberships: 'memberships',
    reminder: 'reminders',
    syncchange: 'syncchanges',
    list: 'lists',
    listitem: 'listitems',
    directoryitem: 'directoryitems',
    attachment: 'attachments',
    attachmentblob: 'attachmentblobs',
    blobreference: 'blobreferences',
    copyjob: 'copyjobs',
    exportjob: 'exportjobs',
  };
  return aliases[normalized] ?? normalized;
}

function assertIsolatedResource(resourceArn: string, resourceType: 'DynamoDB' | 'S3') {
  const name = resourceName(resourceArn, resourceType === 'DynamoDB' ? 'table' : 's3:::');
  if (!name.toLowerCase().startsWith('awsbackup-restore-test'))
    throw new Error(
      'Restore validation refuses to inspect a resource outside AWS Backup isolation.',
    );
}

function resourceName(arn: string, marker: 'table' | 's3:::') {
  const delimiter = marker === 'table' ? ':table/' : ':s3:::';
  const index = arn.indexOf(delimiter);
  const value = index >= 0 ? arn.slice(index + delimiter.length) : '';
  if (!value || value.includes('/')) throw new Error('Restore resource ARN is invalid.');
  return value;
}

function restoreJobIdFromInput(input: Record<string, unknown>) {
  const detail = input.detail as Record<string, unknown> | undefined;
  const job = input.job as Record<string, unknown> | undefined;
  return typeof detail?.restoreJobId === 'string'
    ? detail.restoreJobId
    : typeof job?.restoreJobId === 'string'
      ? job.restoreJobId
      : 'unknown';
}
