import { z } from 'zod';

export const nativeInstallationSchema = z
  .object({
    kind: z.literal('apple'),
    clientId: z.string().min(1).max(200),
    platform: z.enum(['ios', 'ipados', 'macos']),
    environment: z.enum(['sandbox', 'production']),
    token: z.string().regex(/^[0-9a-f]{64}$/i),
    topic: z.enum(['link.thepandas.naaseh', 'link.thepandas.naaseh.macos']),
    previewPolicy: z.enum(['generic', 'private']).default('generic'),
  })
  .strict();

export const nativeUnregisterSchema = z.object({ clientId: z.string().min(1).max(200) }).strict();
export type NativeInstallationInput = z.infer<typeof nativeInstallationSchema>;
export type StoredNativeInstallation = NativeInstallationInput & {
  userId: string;
  updatedAt: string;
};

export const nativeInstallationKey = (userId: string, clientId: string) => ({
  PK: `PUSH#USER#${userId}`,
  SK: `APPLE#${clientId}`,
});
