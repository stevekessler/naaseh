import { createUlid, userSchema, type UserRecord } from '@naaseh/domain';
import { z } from 'zod';
import { hashPassword, loadPepper } from '../auth/password.js';
import {
  canonicalUsername,
  putUser,
  userByProvisionToken,
  type StoredUser,
} from '../auth/user-repository.js';

export const provisionUserRequestSchema = z
  .object({
    version: z.literal('naaseh.provision-user/v1'),
    username: z.string().trim().min(1).max(100),
    displayName: z.string().trim().min(1).max(200),
    password: z.string().min(12).max(1024),
    pin: z.string().regex(/^\d{6,12}$/),
    role: z.enum(['user', 'admin']).default('user'),
    idempotencyToken: z.string().min(1).max(200),
    pictureKey: z.string().min(1).max(500).optional(),
  })
  .strict();

export const provisionUserResultSchema = z
  .object({
    version: z.literal('naaseh.provision-user-result/v1'),
    created: z.boolean(),
    user: userSchema,
  })
  .strict();

export type ProvisionUserRequest = z.infer<typeof provisionUserRequestSchema>;
export type ProvisionUserResult = z.infer<typeof provisionUserResultSchema>;

export class ProvisionUserError extends Error {
  constructor(
    readonly code: 'username_conflict' | 'idempotency_conflict' | 'dependency_failure',
    readonly statusCode: number,
  ) {
    super(code === 'dependency_failure' ? 'User provisioning failed.' : 'User already exists.');
    this.name = 'ProvisionUserError';
  }
}

export interface ProvisionUserDependencies {
  findByIdempotencyToken(token: string): Promise<StoredUser | undefined>;
  create(user: StoredUser, token: string): Promise<void>;
  hashSecret(secret: string, pepper: string): Promise<string>;
  newId(): string;
}

const safeUser = (user: StoredUser): UserRecord => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  ...(user.pictureKey ? { pictureKey: user.pictureKey } : {}),
  role: user.role,
  active: user.active,
  sessionEpoch: user.sessionEpoch,
});

export function createProvisionUserService(dependencies: ProvisionUserDependencies) {
  return async (
    unknownInput: unknown,
    pepper: string,
    pepperVersion: string,
  ): Promise<ProvisionUserResult> => {
    const input = provisionUserRequestSchema.parse(unknownInput);
    const username = canonicalUsername(input.username);
    const prior = await dependencies.findByIdempotencyToken(input.idempotencyToken);
    if (prior) {
      if (prior.username !== username || prior.role !== input.role)
        throw new ProvisionUserError('idempotency_conflict', 409);
      return provisionUserResultSchema.parse({
        version: 'naaseh.provision-user-result/v1',
        created: false,
        user: safeUser(prior),
      });
    }
    const [passwordHash, pinHash] = await Promise.all([
      dependencies.hashSecret(input.password, pepper),
      dependencies.hashSecret(input.pin, pepper),
    ]);
    const user: StoredUser = {
      id: dependencies.newId(),
      username,
      displayName: input.displayName,
      ...(input.pictureKey ? { pictureKey: input.pictureKey } : {}),
      role: input.role,
      active: true,
      sessionEpoch: 0,
      passwordHash,
      pinHash,
      pepperVersion,
    };
    try {
      await dependencies.create(user, input.idempotencyToken);
    } catch (error) {
      const raced = await dependencies.findByIdempotencyToken(input.idempotencyToken);
      if (raced?.username === username && raced.role === input.role)
        return provisionUserResultSchema.parse({
          version: 'naaseh.provision-user-result/v1',
          created: false,
          user: safeUser(raced),
        });
      if ((error as { name?: string }).name === 'TransactionCanceledException')
        throw new ProvisionUserError('username_conflict', 409);
      throw new ProvisionUserError('dependency_failure', 503);
    }
    return provisionUserResultSchema.parse({
      version: 'naaseh.provision-user-result/v1',
      created: true,
      user: safeUser(user),
    });
  };
}

export const provisionUser = createProvisionUserService({
  findByIdempotencyToken: userByProvisionToken,
  create: putUser,
  hashSecret: hashPassword,
  newId: createUlid,
});

export async function provisionUserWithConfiguredPepper(input: unknown) {
  const pepper = await loadPepper();
  return provisionUser(input, pepper.value, pepper.version);
}
