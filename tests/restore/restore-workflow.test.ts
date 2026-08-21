import { describe, expect, it } from 'vitest';
import {
  executeRestoreWorkflow,
  restoreFailureStates,
  restoreStates,
  type RestoreState,
} from '../../infra/lib/restore-workflow-stack.js';
import { runRestoreTestingAction } from '../../apps/api/src/crypto-recovery/restore-testing-validator.js';
import {
  DescribeRestoreJobCommand,
  PutRestoreValidationResultCommand,
} from '@aws-sdk/client-backup';
import { DescribeTableCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createTask, hiddenMemoAad } from '@naaseh/domain';

const planArn = 'arn:aws:backup:us-west-2:111111111111:restore-testing-plan:plan-1';
const tableArn = 'arn:aws:dynamodb:us-west-2:111111111111:table/awsbackup-restore-test-table-1';
const restoreEvent = {
  source: 'aws.backup',
  'detail-type': 'Restore Job State Change',
  detail: {
    restoreJobId: 'restore-job-1',
    restoreTestingPlanArn: planArn,
    resourceType: 'DynamoDB',
    createdResourceArn: tableArn,
    status: 'COMPLETED',
  },
};

const recoveryPointArn = 'arn:aws:backup:us-west-2:111111111111:recovery-point:rp-1';
const restoredAt = '2026-07-23T11:59:00.000Z';
const baseTask = createTask(
  { label: 'hidden', memoHidden: true, encryptedMemo: 'placeholder' },
  'owner-1',
  new Date(restoredAt),
);
const hiddenPackage = {
  version: 1,
  taskId: baseTask.id,
  memoId: 'memo-1',
  ciphertext: 'ciphertext',
  iv: 'iv',
  aad: hiddenMemoAad(baseTask.id, 'memo-1'),
  pinSalt: 'salt',
  pinWrap: { version: 'pin-v1', algorithm: 'AES-256-GCM', ciphertext: 'pin-wrap' },
  recoveryWraps: [
    {
      keyVersion: 'memo-v1',
      authority: 'recovery',
      kmsKeyId: 'arn:aws:kms:us-west-2:111111111111:key/recovery',
      algorithm: 'RSA-OAEP-256',
      ciphertext: 'recovery-wrap',
    },
  ],
  createdAt: restoredAt,
  updatedAt: restoredAt,
};
const restoredTask = { ...baseTask, encryptedMemo: JSON.stringify(hiddenPackage) };
const restoredManifest = {
  version: 1,
  region: 'us-west-2',
  manifestId: 'manifest-1',
  createdAt: restoredAt,
  recoveryPointArn,
  backupIds: ['backup-1'],
  dataRange: { earliestAt: restoredAt, latestAt: restoredAt },
  entityCounts: { tasks: 1, hiddenMemos: 1 },
  keyVersions: ['memo-v1'],
  recoveryWrapVersions: ['memo-v1'],
  artifactHashes: { configuration: 'a'.repeat(64) },
  hash: 'b'.repeat(64),
  signature: 'c2ln',
};
const restoredItems = [
  { PK: `BACKUP#${restoredManifest.manifestId}`, SK: 'MANIFEST', data: restoredManifest },
  { PK: `TASK#${restoredTask.id}`, SK: 'CURRENT', data: restoredTask },
];

const restoredStackRows = [
  {
    PK: 'STACK#USER#owner-1#OVERALL',
    SK: 'META',
    data: {
      userId: 'owner-1',
      scopeType: 'overall',
      version: 0,
      snapshotThroughVersion: 0,
      currentSnapshotGeneration: 1,
    },
  },
  {
    PK: 'STACK#USER#owner-1#OVERALL',
    SK: `MEMBERSHIP#task#${restoredTask.id}`,
    data: {
      userId: 'owner-1',
      scopeType: 'overall',
      workType: 'task',
      workId: restoredTask.id,
      membershipEpoch: 'epoch-1',
      admittedSequence: 1,
      active: true,
    },
  },
  {
    PK: 'STACK#USER#owner-1#OVERALL',
    SK: 'SNAPSHOT#000000000001#CHUNK#000000000000',
    data: {
      userId: 'owner-1',
      scopeType: 'overall',
      throughVersion: 0,
      workRefs: [],
      checksum: 'corrupt-derived-snapshot',
    },
  },
];

function dependencies(
  overrides: Record<string, unknown> = {},
  items: Array<{ PK: string; SK: string; data: unknown }> = restoredItems,
  manifestValid = true,
) {
  const backupCommands: object[] = [];
  const dynamoCommands: object[] = [];
  return {
    backupCommands,
    dynamoCommands,
    value: {
      expectedPlanArn: planArn,
      backup: {
        async send(command: object) {
          backupCommands.push(command);
          if (command instanceof DescribeRestoreJobCommand)
            return {
              Status: 'COMPLETED',
              ResourceType: 'DynamoDB',
              CreatedResourceArn: tableArn,
              RecoveryPointArn: recoveryPointArn,
              RestoreTestingPlanArn: planArn,
              CreationDate: new Date('2026-07-23T12:00:00.000Z'),
              CompletionDate: new Date('2026-07-23T12:05:00.000Z'),
              ...overrides,
            };
          return {};
        },
      },
      dynamodb: {
        async send(command: object) {
          dynamoCommands.push(command);
          if (command instanceof DescribeTableCommand)
            return { Table: { TableStatus: 'ACTIVE', TableArn: tableArn } };
          if (command instanceof ScanCommand)
            return { Items: items.map((item) => marshall(item)), Count: items.length };
          return {};
        },
      },
      manifestSigningKeyId: 'arn:manifest-signing-key',
      recoveryKeyIds: {
        recovery: 'arn:aws:kms:us-west-2:111111111111:key/recovery',
      },
      async verifyManifest() {
        return manifestValid;
      },
      async decryptRecoveryWrap() {
        return new Uint8Array(32).fill(7);
      },
      s3: {
        async send() {
          return {};
        },
      },
    },
  };
}

describe('isolated restore workflow', () => {
  it('validates authorization, inventory, boundaries, and decryptability before evidence', () => {
    expect(restoreStates).toEqual([
      'ValidateRestoreJob',
      'ValidateRestoredResource',
      'RecoverAuthentication',
      'RecordEvidence',
    ]);
    expect(restoreStates.indexOf('ValidateRestoredResource')).toBeLessThan(
      restoreStates.indexOf('RecordEvidence'),
    );
  });

  it('records evidence after validating the AWS-managed isolated resource', () => {
    expect(executeRestoreWorkflow()).toEqual({ status: 'SUCCEEDED', executed: restoreStates });
  });

  it('fails closed for a forged plan or non-isolated restored resource', async () => {
    const forged = dependencies();
    await expect(
      runRestoreTestingAction('ValidateRestoreJob', restoreEvent, {
        ...forged.value,
        expectedPlanArn: `${planArn}-forged`,
      }),
    ).rejects.toThrow('approved restore testing plan');
    await expect(
      runRestoreTestingAction(
        'ValidateRestoreJob',
        {
          ...restoreEvent,
          detail: {
            ...restoreEvent.detail,
            createdResourceArn: 'arn:aws:dynamodb:us-west-2:111111111111:table/production',
          },
        },
        dependencies().value,
      ),
    ).rejects.toThrow('outside AWS Backup isolation');
  });

  it('describes, probes, and reports the actual completed restore job', async () => {
    const deps = dependencies();
    const job = await runRestoreTestingAction('ValidateRestoreJob', restoreEvent, deps.value);
    expect(job).toMatchObject({ restoreJobId: 'restore-job-1', rtoSeconds: 300 });
    const resourceValidation = await runRestoreTestingAction(
      'ValidateRestoredResource',
      { job },
      deps.value,
    );
    expect(resourceValidation).toMatchObject({
      probe: {
        resourceType: 'DynamoDB',
        itemCount: 2,
        integrity: {
          manifestVerified: true,
          entityCounts: { hiddenMemos: 1, tasks: 1 },
          recoveryWrapVersions: ['memo-v1'],
        },
      },
    });
    await expect(
      runRestoreTestingAction('RecordEvidence', { job, resourceValidation }, deps.value),
    ).resolves.toEqual({ restoreJobId: 'restore-job-1', status: 'SUCCESSFUL' });
    expect(
      deps.backupCommands.some((command) => command instanceof PutRestoreValidationResultCommand),
    ).toBe(true);
    expect(deps.dynamoCommands).toEqual([
      expect.any(DescribeTableCommand),
      expect.any(ScanCommand),
    ]);
  });

  it('rebuilds derived personal-stack snapshots while requiring canonical continuity', async () => {
    const job = await runRestoreTestingAction(
      'ValidateRestoreJob',
      restoreEvent,
      dependencies().value,
    );
    const rebuildable = dependencies({}, [...restoredItems, ...restoredStackRows]);
    await expect(
      runRestoreTestingAction('ValidateRestoredResource', { job }, rebuildable.value),
    ).resolves.toMatchObject({
      probe: {
        integrity: {
          personalStackIntegrity: {
            canonicalOperationsVerified: true,
            snapshotsRebuildable: true,
            snapshotRepairRequired: true,
          },
        },
      },
    });

    const versionGapRows = restoredStackRows.map((row) =>
      row.SK === 'META' ? { ...row, data: { ...row.data, version: 1 } } : row,
    );
    await expect(
      runRestoreTestingAction(
        'ValidateRestoredResource',
        { job },
        dependencies({}, [...restoredItems, ...versionGapRows]).value,
      ),
    ).rejects.toThrow(/version gap|continuity/iu);
  });

  it('rejects inconsistent job evidence and an RTO over four hours', async () => {
    await expect(
      runRestoreTestingAction(
        'ValidateRestoreJob',
        restoreEvent,
        dependencies({ CreatedResourceArn: `${tableArn}-other` }).value,
      ),
    ).rejects.toThrow('incomplete or inconsistent');
    await expect(
      runRestoreTestingAction(
        'ValidateRestoreJob',
        restoreEvent,
        dependencies({ CompletionDate: new Date('2026-07-23T16:00:01.000Z') }).value,
      ),
    ).rejects.toThrow('four-hour');
  });

  it('fails closed for an invalid manifest, count mismatch, or missing recovery wrap', async () => {
    const job = await runRestoreTestingAction(
      'ValidateRestoreJob',
      restoreEvent,
      dependencies().value,
    );
    await expect(
      runRestoreTestingAction(
        'ValidateRestoredResource',
        { job },
        dependencies({}, restoredItems, false).value,
      ),
    ).rejects.toThrow('signature or hash');
    await expect(
      runRestoreTestingAction(
        'ValidateRestoredResource',
        { job },
        dependencies({}, [
          { ...restoredItems[0]!, data: { ...restoredManifest, entityCounts: { tasks: 2 } } },
          restoredItems[1]!,
        ]).value,
      ),
    ).rejects.toThrow('count mismatch');
    const incompletePackage = {
      ...hiddenPackage,
      recoveryWraps: [],
    };
    await expect(
      runRestoreTestingAction(
        'ValidateRestoredResource',
        { job },
        dependencies({}, [
          restoredItems[0]!,
          {
            ...restoredItems[1]!,
            data: { ...restoredTask, encryptedMemo: JSON.stringify(incompletePackage) },
          },
        ]).value,
      ),
    ).rejects.toThrow();

    const mismatchedKeys = dependencies();
    mismatchedKeys.value.decryptRecoveryWrap = async () => new Uint8Array(16);
    await expect(
      runRestoreTestingAction('ValidateRestoredResource', { job }, mismatchedKeys.value),
    ).rejects.toThrow('32-byte data key');
  });

  it.each(
    restoreStates
      .filter((state) => state !== 'RecordEvidence')
      .map((state) => [state] as [RestoreState]),
  )('routes a %s failure through failure evidence, cleanup, and notification', (state) => {
    const result = executeRestoreWorkflow(state);
    expect(result.status).toBe('FAILED');
    expect(result.failedAt).toBe(state);
    expect(result.executed).toEqual(expect.arrayContaining([...restoreFailureStates]));
    expect(result.executed.indexOf('RecordEvidence')).toBe(-1);
    expect(result.executed.indexOf('RecordFailure')).toBeLessThan(
      result.executed.indexOf('NotifyFailure'),
    );
  });
});
