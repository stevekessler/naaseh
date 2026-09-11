import { describe, expect, it } from 'vitest';
import {
  executeRestoreWorkflow,
  restoreFailureStates,
  restoreStates,
  type RestoreState,
} from '../../infra/lib/restore-workflow-stack.js';
import {
  runRestoreTestingAction,
  validateJournalAndCrisisPlanRestore,
} from '../../apps/api/src/crypto-recovery/restore-testing-validator.js';
import {
  DescribeRestoreJobCommand,
  PutRestoreValidationResultCommand,
} from '@aws-sdk/client-backup';
import { DescribeTableCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createTask, hiddenMemoAad } from '@naaseh/domain';
import { crisisPlanBackupFixture } from './fixtures/crisis-plan-backup.js';

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

const encryptedFeatureRows = (() => {
  const { plan, shares } = crisisPlanBackupFixture();
  const entryId = '22222222-2222-4222-8222-222222222222';
  const envelope = (recordKind: 'projection' | 'body') => ({
    recordKind,
    schemaVersion: 1,
    keyVersion: 1,
    iv: 'A'.repeat(16),
    ciphertext: 'B'.repeat(24),
    byteSize: 16,
  });
  return [
    {
      PK: 'USER#owner-1',
      SK: 'PROFILE',
      data: {
        id: 'owner-1',
        username: 'owner',
        displayName: 'Synthetic Owner',
        role: 'user',
        active: true,
        sessionEpoch: 0,
        credentialVersion: 0,
        tfaStatus: 'disabled',
        version: 1,
      },
    },
    {
      PK: 'JOURNAL#OWNER#owner-1',
      SK: 'KEY_ENVELOPE',
      data: {
        id: 'journal-key',
        ownerId: 'owner-1',
        version: 1,
        keyVersion: 1,
        ownerWrap: {
          algorithm: 'ARGON2ID-AES-256-GCM',
          salt: 'C'.repeat(22),
          parameters: { memoryKiB: 65_536, iterations: 2, parallelism: 1 },
          iv: 'D'.repeat(16),
          ciphertext: 'E'.repeat(24),
        },
        recoveryWrap: {
          algorithm: 'RSA-OAEP-256',
          authority: 'recovery',
          keyVersion: 1,
          ciphertext: 'F'.repeat(128),
        },
        createdAt: restoredAt,
        updatedAt: restoredAt,
      },
    },
    {
      PK: 'JOURNAL#OWNER#owner-1',
      SK: `ENTRY#${entryId}`,
      data: {
        ownerId: 'owner-1',
        entryId,
        dateToken: 'G'.repeat(43),
        version: 1,
        payload: {
          entryId,
          dateToken: 'G'.repeat(43),
          projection: envelope('projection'),
          body: envelope('body'),
        },
        createdAt: restoredAt,
        updatedAt: restoredAt,
      },
    },
    { PK: 'JOURNAL#OWNER#owner-1', SK: 'CRISIS_PLAN', data: plan },
    {
      PK: `CRISIS_PLAN#${plan.planId}`,
      SK: `SHARE#${shares[0]!.recipientId}`,
      GSI1PK: `CRISIS_PLAN_RECIPIENT#${shares[0]!.recipientId}`,
      GSI1SK: `ACTIVE#${shares[0]!.updatedAt}#${plan.planId}`,
      data: shares[0],
    },
  ];
})();

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

  it('runs Journal and Crisis Plan ciphertext, owner, generation, and index validation', async () => {
    const manifest = {
      ...restoredManifest,
      entityCounts: {
        ...restoredManifest.entityCounts,
        users: 1,
        journalEntries: 1,
        journalKeyEnvelopes: 1,
        crisisPlans: 1,
        crisisPlanShares: 1,
      },
    };
    const items = [
      { PK: `BACKUP#${manifest.manifestId}`, SK: 'MANIFEST', data: manifest },
      restoredItems[1]!,
      ...encryptedFeatureRows,
    ];
    const job = await runRestoreTestingAction(
      'ValidateRestoreJob',
      restoreEvent,
      dependencies().value,
    );
    await expect(
      runRestoreTestingAction('ValidateRestoredResource', { job }, dependencies({}, items).value),
    ).resolves.toMatchObject({
      probe: {
        integrity: {
          journalAndCrisisPlanIntegrity: {
            journal: { entryCount: 1, keyEnvelopeCount: 1, auditRows: 0 },
            crisisPlan: {
              planCount: 1,
              shareCount: 1,
              plaintextInspected: false,
              recipientIndexesVerified: true,
            },
          },
        },
      },
    });
  });

  it('fails closed on Journal key rollback and stale Crisis Plan recipient indexes', () => {
    const rollbackRows = encryptedFeatureRows.map((row) =>
      row.SK === 'KEY_ENVELOPE'
        ? {
            ...row,
            data: {
              ...(row.data as Record<string, unknown>),
              keyVersion: 2,
            },
          }
        : row,
    );
    expect(() => validateJournalAndCrisisPlanRestore(rollbackRows)).toThrow('rolls back');

    const staleIndexRows = encryptedFeatureRows.map((row) =>
      row.SK.startsWith('SHARE#') ? { ...row, GSI1PK: 'CRISIS_PLAN_RECIPIENT#other' } : row,
    );
    expect(() => validateJournalAndCrisisPlanRestore(staleIndexRows)).toThrow(
      'share index is invalid',
    );
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
