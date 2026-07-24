import { z } from 'zod';

const uniqueNonEmptyStrings = z
  .array(z.string().min(1))
  .min(1)
  .refine((values) => new Set(values).size === values.length, 'Inventory entries must be unique.');

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const backupManifestContentSchema = z
  .object({
    version: z.literal(1),
    manifestId: z.string().min(1),
    createdAt: z.string().datetime(),
    recoveryPointArn: z.string().min(1),
    region: z.literal('us-west-2'),
    backupIds: uniqueNonEmptyStrings,
    dataRange: z
      .object({ earliestAt: z.string().datetime(), latestAt: z.string().datetime() })
      .strict(),
    entityCounts: z.record(z.number().int().nonnegative()),
    keyVersions: uniqueNonEmptyStrings,
    recoveryWrapVersions: uniqueNonEmptyStrings,
    artifactHashes: z.record(sha256Schema),
  })
  .strict();

export const backupManifestSchema = backupManifestContentSchema
  .extend({
    hash: sha256Schema,
    signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Signature must be canonical base64.'),
  })
  .strict();

export const restoreEvidenceSchema = z
  .object({
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    rpoSeconds: z.number().nonnegative(),
    rtoSeconds: z.number().nonnegative(),
    authorizationPassed: z.boolean(),
    decryptPassed: z.boolean(),
    discrepancies: z.array(z.string()),
  })
  .strict()
  .refine(
    ({ startedAt, completedAt }) => Date.parse(completedAt) >= Date.parse(startedAt),
    'Restore completion must not precede its start.',
  );

export const recoveryPackageInventorySchema = z
  .object({
    manifestId: z.string().min(1),
    entityCounts: z.record(z.number().int().nonnegative()),
    requiredKeyVersions: uniqueNonEmptyStrings,
    recoveryWraps: z
      .array(
        z
          .object({
            keyVersion: z.string().min(1),
            authority: z.literal('recovery'),
            kmsKeyId: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    verifiedAt: z.string().datetime(),
  })
  .strict()
  .superRefine(({ requiredKeyVersions, recoveryWraps }, context) => {
    const required = new Set(requiredKeyVersions);
    const seen = new Set<string>();
    for (const wrap of recoveryWraps) {
      const identity = `${wrap.keyVersion}:${wrap.authority}`;
      if (!required.has(wrap.keyVersion))
        context.addIssue({
          code: 'custom',
          path: ['recoveryWraps'],
          message: 'Unregistered key version.',
        });
      if (seen.has(identity))
        context.addIssue({
          code: 'custom',
          path: ['recoveryWraps'],
          message: 'Duplicate authority wrap.',
        });
      seen.add(identity);
    }
    for (const version of required)
      if (!seen.has(`${version}:recovery`))
        context.addIssue({
          code: 'custom',
          path: ['recoveryWraps'],
          message: 'Every required generation needs the recovery authority.',
        });
  });

export const keyLifecycleSchema = z
  .object({
    version: z.string().min(1),
    purpose: z.enum(['data', 'password-pepper', 'memo-recovery', 'backup']),
    state: z.enum(['active', 'decrypt-only', 'retired']),
    createdAt: z.string().datetime(),
    retiredAt: z.string().datetime().optional(),
    recoveryCopyVerifiedAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === 'retired' && !value.retiredAt)
      context.addIssue({
        code: 'custom',
        path: ['retiredAt'],
        message: 'Retired keys require a retirement timestamp.',
      });
    if (value.state !== 'retired' && value.retiredAt)
      context.addIssue({
        code: 'custom',
        path: ['retiredAt'],
        message: 'Only retired keys may have a retirement timestamp.',
      });
    if (value.state !== 'active' && !value.recoveryCopyVerifiedAt)
      context.addIssue({
        code: 'custom',
        path: ['recoveryCopyVerifiedAt'],
        message: 'A verified recovery copy is required before a key leaves active service.',
      });
    if (value.retiredAt && Date.parse(value.retiredAt) < Date.parse(value.createdAt))
      context.addIssue({
        code: 'custom',
        path: ['retiredAt'],
        message: 'Retirement cannot precede key creation.',
      });
  });

export type BackupManifestContent = z.infer<typeof backupManifestContentSchema>;
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export type RestoreEvidence = z.infer<typeof restoreEvidenceSchema>;
export type RecoveryPackageInventory = z.infer<typeof recoveryPackageInventorySchema>;
export type KeyLifecycle = z.infer<typeof keyLifecycleSchema>;
