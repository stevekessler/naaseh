import { z } from 'zod';
import { memoDocumentSchema } from '../memo-document.js';

const pinWrapSchema = z
  .object({
    version: z.string().min(1),
    algorithm: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

const recoveryWrapSchema = z
  .object({
    keyVersion: z.string().min(1),
    authority: z.literal('recovery'),
    kmsKeyId: z.string().min(1),
    algorithm: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

export const hiddenMemoPackageSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    taskId: z.string().min(1),
    memoId: z.string().min(1),
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    aad: z.string().min(1),
    pinSalt: z.string().min(1),
    pinWrap: pinWrapSchema,
    recoveryWraps: z.array(recoveryWrapSchema).min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine(({ recoveryWraps }, context) => {
    const identities = new Set<string>();
    for (const wrap of recoveryWraps) {
      const identity = `${wrap.keyVersion}:${wrap.authority}`;
      if (identities.has(identity))
        context.addIssue({
          code: 'custom',
          path: ['recoveryWraps'],
          message: 'Recovery wrap authority and key version must be unique.',
        });
      identities.add(identity);
    }
    for (const version of new Set(recoveryWraps.map((wrap) => wrap.keyVersion)))
      if (!identities.has(`${version}:recovery`))
        context.addIssue({
          code: 'custom',
          path: ['recoveryWraps'],
          message: 'Every recovery key version requires the recovery authority.',
        });
  });

export type HiddenMemoPackage = z.infer<typeof hiddenMemoPackageSchema>;

export const hiddenMemoPayloadV2Schema = z
  .object({ version: z.literal(2), text: z.string().max(20_000), document: memoDocumentSchema })
  .strict();

export const hiddenMemoAad = (taskId: string, memoId: string, version = 1) =>
  `naaseh:hidden-memo:${version}:${taskId}:${memoId}`;
