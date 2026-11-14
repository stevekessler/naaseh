import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getMembership } from '../groups/group-repository.js';
import { SafeApiError } from '../shared/http.js';
import { FinanceUnitOfWork } from './unit-of-work.js';
import { loadCurrentFinanceTaskAccess, type FinanceSyncSourceGuard } from './sync-source-guard.js';

const id = z.string().min(1).max(256);
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const taskSchema = z
  .object({ id, ownerId: id, visibility: z.enum(['public', 'private']), groupId: id.optional() })
  .strict();
const snapshotSchema = z
  .object({
    userId: id,
    scopes: z
      .array(
        z
          .object({
            PK: z
              .string()
              .max(300)
              .regex(/^(?:FINANCE#CATALOG|FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+)$/u),
            authorizationRevision: sequence,
          })
          .strict(),
      )
      .max(64),
    members: z
      .array(
        z
          .object({
            groupId: id,
            role: z.enum(['owner', 'manager', 'member']),
            version: sequence.optional(),
          })
          .strict(),
      )
      .max(64),
    tasks: z.array(taskSchema).max(128),
  })
  .strict();
export type FinanceCacheAuthorizationSnapshot = z.infer<typeof snapshotSchema>;
const claimsSchema = z
  .object({
    semantics: z.literal(2),
    snapshot: snapshotSchema,
    issuedAt: sequence,
    expiresAt: sequence,
  })
  .strict();
const lifetime = 15 * 60000;
const maximumBytes = 32768;
const refresh = () =>
  new SafeApiError(
    409,
    'finance_cache_refresh_required',
    'Refresh Finance before using saved records.',
    'authorization',
  );
const taskAuthority = (task: {
  ownerId: string;
  visibility: 'public' | 'private';
  groupId?: string | undefined;
}) => ({
  ownerId: task.ownerId,
  visibility: task.visibility,
  ...(task.groupId ? { groupId: task.groupId } : {}),
});

/** Stateless dependency evidence only. Never a session, PIN grant or offline unlock token. */
export class FinanceCacheProofService {
  constructor(
    private readonly options: {
      userId: string;
      role: 'user' | 'admin';
      secret: string;
      authorize: () => Promise<unknown>;
      work?: () => FinanceUnitOfWork;
      membership?:
        | typeof getMembership
        | ((
            groupId: string,
            userId: string,
          ) => Promise<
            | { userId: string; groupId: string; status: string; role: string; version?: number }
            | undefined
          >);
      task?: typeof loadCurrentFinanceTaskAccess;
      now?: () => number;
    },
  ) {}
  private key() {
    if (this.options.secret.length < 32)
      throw new Error('Finance cache proof secret is unavailable.');
    return createHash('sha256')
      .update(`naaseh-finance-cache-proof-v1:${this.options.secret}`)
      .digest();
  }
  private async authorize() {
    await this.options.authorize();
    if (!this.options.userId) throw refresh();
  }
  async issue(
    guard: Pick<FinanceSyncSourceGuard, 'cacheAuthorizationSnapshot'>,
    previous?: string | readonly string[],
  ): Promise<string> {
    await this.authorize();
    const parsed = snapshotSchema.safeParse(await guard.cacheAuthorizationSnapshot());
    if (!parsed.success || parsed.data.userId !== this.options.userId) throw refresh();
    let snapshot = parsed.data;
    const priorTokens =
      typeof previous === 'string' ? [previous] : Array.isArray(previous) ? previous : [];
    if (previous !== undefined && (!priorTokens.length || priorTokens.length > 64)) throw refresh();
    for (const token of priorTokens) {
      // Authenticate every prior envelope, then check the complete merged set in two rounds.
      // Contradictory generations must never let a later proof bless an older response.
      const prior = this.decode(token).snapshot;
      const join = <T>(before: T[], after: T[], key: (value: T) => string): T[] => {
        const values = new Map(before.map((value) => [key(value), value]));
        for (const value of after) {
          const existing = values.get(key(value));
          if (existing && JSON.stringify(existing) !== JSON.stringify(value)) throw refresh();
          values.set(key(value), value);
        }
        return [...values.values()];
      };
      const merged = snapshotSchema.safeParse({
        userId: snapshot.userId,
        scopes: join(prior.scopes, snapshot.scopes, (value) => value.PK),
        members: join(prior.members, snapshot.members, (value) => value.groupId),
        tasks: join(prior.tasks, snapshot.tasks, (value) => value.id),
      });
      if (!merged.success) throw refresh();
      snapshot = merged.data;
    }
    // Reuse authenticated catalogue dependencies before seeding an empty cache.
    // Every dependency still receives both fresh verification rounds below.
    // Source-bearing snapshots retain their original revision, never a newer one.
    if (!snapshot.scopes.some(({ PK }) => PK === 'FINANCE#CATALOG')) {
      const work = this.options.work?.() ?? new FinanceUnitOfWork();
      const meta = await work.get({ PK: 'FINANCE#CATALOG', SK: 'META' });
      const authorizationRevision =
        meta?.financeAuthorizationRevision === undefined ? 0 : meta.financeAuthorizationRevision;
      const complete = snapshotSchema.safeParse({
        ...snapshot,
        scopes: [...snapshot.scopes, { PK: 'FINANCE#CATALOG', authorizationRevision }],
      });
      if (!complete.success) throw refresh();
      snapshot = complete.data;
    }
    for (let round = 0; round < 2; round++) await this.checkCurrent(snapshot);
    const issuedAt = this.options.now?.() ?? Date.now();
    const claims = claimsSchema.parse({
      semantics: 2,
      snapshot,
      issuedAt,
      expiresAt: issuedAt + lifetime,
    });
    await this.authorize();
    const plaintext = Buffer.from(JSON.stringify(claims));
    if (plaintext.length > maximumBytes - 256) throw refresh();
    // Conceal identifiers, and avoid exposing exact dependency JSON length.
    const padded = Buffer.alloc(Math.ceil((plaintext.length + 1) / 256) * 256, 32);
    plaintext.copy(padded);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(`finance-cache-proof:v1:${this.options.userId}`));
    const body = Buffer.concat([cipher.update(padded), cipher.final()]);
    return `fc1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
  }
  async verify(token: string): Promise<void> {
    await this.authorize();
    const claims = this.decode(token);
    // Independent rounds prevent an old cached UoW snapshot hiding a mid-check change.
    for (let round = 0; round < 2; round++) await this.checkCurrent(claims.snapshot);
    await this.authorize();
  }
  private decode(token: string): z.infer<typeof claimsSchema> {
    let claims: z.infer<typeof claimsSchema>;
    try {
      if (typeof token !== 'string' || token.length > 45000) throw refresh();
      const [version, nonce, encoded, signature, extra] = token.split('.');
      if (version !== 'fc1' || !nonce || !encoded || !signature || extra) throw refresh();
      if (![nonce, encoded, signature].every((value) => /^[A-Za-z0-9_-]+$/u.test(value)))
        throw refresh();
      const iv = Buffer.from(nonce, 'base64url'),
        body = Buffer.from(encoded, 'base64url'),
        tag = Buffer.from(signature, 'base64url');
      if (
        iv.length !== 12 ||
        tag.length !== 16 ||
        !body.length ||
        body.length > maximumBytes ||
        body.length % 256 !== 0
      )
        throw refresh();
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAAD(Buffer.from(`finance-cache-proof:v1:${this.options.userId}`));
      decipher.setAuthTag(tag);
      claims = claimsSchema.parse(
        JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')),
      );
      const now = this.options.now?.() ?? Date.now();
      if (
        claims.snapshot.userId !== this.options.userId ||
        !claims.snapshot.scopes.some(({ PK }) => PK === 'FINANCE#CATALOG') ||
        claims.issuedAt > now ||
        claims.expiresAt <= now ||
        claims.expiresAt !== claims.issuedAt + lifetime
      )
        throw refresh();
    } catch {
      throw refresh();
    }
    return claims;
  }
  private async checkCurrent(snapshot: FinanceCacheAuthorizationSnapshot) {
    const work = this.options.work?.() ?? new FinanceUnitOfWork();
    const members = new Map(snapshot.members.map((member) => [member.groupId, member]));
    if (
      members.size !== snapshot.members.length ||
      new Set(snapshot.scopes.map((scope) => scope.PK)).size !== snapshot.scopes.length ||
      new Set(snapshot.tasks.map((task) => task.id)).size !== snapshot.tasks.length
    )
      throw refresh();
    for (const { PK, authorizationRevision } of snapshot.scopes) {
      const owner = PK.startsWith('FINANCE#SCOPE#OWNER#');
      const scopeId = PK.slice(
        owner ? 'FINANCE#SCOPE#OWNER#'.length : 'FINANCE#SCOPE#GROUP#'.length,
      );
      if (
        PK !== 'FINANCE#CATALOG' &&
        (owner ? scopeId !== this.options.userId : !members.has(scopeId))
      )
        throw refresh();
      const row = await work.get({ PK, SK: 'META' });
      if (
        (!row && PK !== 'FINANCE#CATALOG') ||
        (row?.financeAuthorizationRevision === undefined ? 0 : row.financeAuthorizationRevision) !==
          authorizationRevision
      )
        throw refresh();
    }
    for (const expected of snapshot.members) {
      const current = await (this.options.membership ?? getMembership)(
        expected.groupId,
        this.options.userId,
      );
      if (
        !current ||
        current.userId !== this.options.userId ||
        current.groupId !== expected.groupId ||
        current.status !== 'active' ||
        current.role !== expected.role ||
        current.version !== expected.version
      )
        throw refresh();
    }
    for (const expected of snapshot.tasks) {
      const current = await (this.options.task ?? loadCurrentFinanceTaskAccess)(expected.id);
      if (
        !current ||
        JSON.stringify(taskAuthority(current)) !== JSON.stringify(taskAuthority(expected))
      )
        throw refresh();
    }
  }
}
