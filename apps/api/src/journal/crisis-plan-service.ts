import {
  crisisPlanCreateRequestSchema,
  crisisPlanReplaceRequestSchema,
  crisisPlanRotationRequestSchema,
} from '@naaseh/contracts';
import {
  assertCrisisPlanRecipientLimit,
  assertCrisisPlanVersion,
  crisisPlanRecordSchema,
  crisisPlanRecipientGrantSchema,
  type CrisisPlanRecord,
  type CrisisPlanShare,
} from '@naaseh/domain';
import {
  assertCrisisPlanOwner,
  assertJournalCreationAllowed,
} from './crisis-plan-authorization.js';
import type { CrisisPlanRepository } from './crisis-plan-repository.js';

export class CrisisPlanService {
  constructor(
    private readonly repository: CrisisPlanRepository,
    private readonly now = () => new Date().toISOString(),
    private readonly activeUsers: Array<{
      id: string;
      displayName: string;
      username: string;
      active: boolean;
    }> = [],
  ) {}
  async read(ownerId: string, actorId = ownerId) {
    assertCrisisPlanOwner(actorId, ownerId);
    const record = await this.repository.readOwner(ownerId);
    if (!record)
      throw Object.assign(new Error('Create a Crisis Plan before your first journal entry.'), {
        code: 'CRISIS_PLAN_REQUIRED',
      });
    return record;
  }
  async create(ownerId: string, input: unknown) {
    const parsed = crisisPlanCreateRequestSchema.parse(input);
    const receipt = await this.repository.receipt(ownerId, parsed.mutationId);
    if (receipt) return this.read(ownerId);
    if (await this.repository.readOwner(ownerId))
      throw Object.assign(new Error('A Crisis Plan already exists. Reload it to make changes.'), {
        code: 'CRISIS_PLAN_CONFLICT',
      });
    const now = this.now();
    return this.repository.saveOwner(
      crisisPlanRecordSchema.parse({
        planId: parsed.planId,
        ownerId,
        version: 1,
        keyGeneration: parsed.keyGeneration,
        rotationState: 'current',
        body: parsed.body,
        ownerWrap: parsed.ownerWrap,
        createdAt: now,
        updatedAt: now,
      }),
      parsed.mutationId,
      'create',
    );
  }
  async replace(ownerId: string, input: unknown) {
    const parsed = crisisPlanReplaceRequestSchema.parse(input);
    const receipt = await this.repository.receipt(ownerId, parsed.mutationId);
    if (receipt) return this.read(ownerId);
    const current = await this.read(ownerId);
    assertCrisisPlanVersion(current.version, parsed.baseVersion);
    if (current.rotationState === 'rotation_required')
      throw Object.assign(new Error('Rotate Crisis Plan access before saving another change.'), {
        code: 'CRISIS_PLAN_ROTATION_REQUIRED',
      });
    return this.repository.saveOwner(
      {
        ...current,
        version: current.version + 1,
        keyGeneration: parsed.keyGeneration,
        body: parsed.body,
        ownerWrap: parsed.ownerWrap,
        updatedAt: this.now(),
      },
      parsed.mutationId,
      'replace',
    );
  }
  async assertJournalCreation(ownerId: string, baseVersion: number) {
    assertJournalCreationAllowed(await this.repository.readOwner(ownerId), baseVersion);
  }
  searchUsers(ownerId: string, query: string, cursor = 0) {
    if (query.trim().length < 2) return { users: [], nextCursor: undefined };
    const matches = this.activeUsers.filter(
      (user) =>
        user.active &&
        user.id !== ownerId &&
        `${user.displayName} ${user.username}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    );
    const users = matches
      .slice(cursor, cursor + 20)
      .map(({ id, displayName, username }) => ({ id, displayName, username }));
    return { users, ...(cursor + 20 < matches.length ? { nextCursor: String(cursor + 20) } : {}) };
  }
  async share(ownerId: string, recipientId: string, grantInput: unknown, baseVersion?: number) {
    const plan = await this.read(ownerId);
    if (baseVersion !== undefined) assertCrisisPlanVersion(plan.version, baseVersion);
    if (plan.rotationState === 'rotation_required')
      throw Object.assign(new Error('Rotate Crisis Plan access before sharing.'), {
        code: 'CRISIS_PLAN_ROTATION_REQUIRED',
      });
    const recipient = this.activeUsers.find((user) => user.id === recipientId && user.active);
    if (!recipient || recipientId === ownerId)
      throw Object.assign(new Error('The selected user is unavailable.'), {
        code: 'CRISIS_PLAN_ACCESS_DENIED',
      });
    const current = await this.repository.readShare(ownerId, recipientId);
    if (current?.state === 'active') return current;
    assertCrisisPlanRecipientLimit(
      (await this.repository.listShares(ownerId)).filter((share) => share.state === 'active')
        .length + 1,
    );
    const grant = crisisPlanRecipientGrantSchema.parse(grantInput);
    if (
      grant.ownerId !== ownerId ||
      grant.recipientId !== recipientId ||
      grant.planId !== plan.planId ||
      grant.keyGeneration !== plan.keyGeneration
    )
      throw Object.assign(
        new Error('The encrypted sharing grant does not match this Crisis Plan.'),
        { code: 'CRISIS_PLAN_INVALID' },
      );
    const now = this.now();
    return this.repository.saveShare({
      planId: plan.planId,
      ownerId,
      recipientId,
      version: (current?.version ?? 0) + 1,
      state: 'active',
      grant,
      updatedAt: now,
    });
  }
  async listShares(ownerId: string) {
    const plan = await this.read(ownerId);
    return { shares: await this.repository.listShares(ownerId), rotationState: plan.rotationState };
  }
  async listShared(recipientId: string) {
    const active = this.activeUsers.some((user) => user.id === recipientId && user.active);
    if (!active) return [];
    return (await this.repository.listSharedForRecipient(recipientId)).map(({ share, plan }) => ({
      share,
      plan,
    }));
  }
  async openShared(recipientId: string, planId: string) {
    const match = (await this.listShared(recipientId)).find(
      (value) => value.plan.planId === planId,
    );
    if (!match || match.share.state !== 'active' || !match.share.grant)
      throw Object.assign(new Error('The shared Crisis Plan is unavailable.'), {
        code: 'CRISIS_PLAN_ACCESS_DENIED',
      });
    return match;
  }
  async revoke(ownerId: string, recipientId: string) {
    await this.read(ownerId);
    const revoked = await this.repository.revoke(ownerId, recipientId, this.now());
    if (!revoked)
      throw Object.assign(new Error('The share is unavailable.'), {
        code: 'CRISIS_PLAN_ACCESS_DENIED',
      });
    return revoked;
  }
  async removeAccess(recipientId: string, ownerId: string) {
    const removed = await this.repository.removeAccess(ownerId, recipientId, this.now());
    if (!removed)
      throw Object.assign(new Error('The shared Crisis Plan is unavailable.'), {
        code: 'CRISIS_PLAN_ACCESS_DENIED',
      });
    return removed;
  }
  async rotate(
    ownerId: string,
    mutationId: string,
    replacement: CrisisPlanRecord,
    remainingShares: CrisisPlanShare[],
  ) {
    const current = await this.read(ownerId);
    assertCrisisPlanVersion(current.version, replacement.version - 1);
    if (
      replacement.keyGeneration !== current.keyGeneration + 1 ||
      replacement.rotationState !== 'current'
    )
      throw Object.assign(new Error('Crisis Plan access rotation is incomplete.'), {
        code: 'CRISIS_PLAN_INVALID',
      });
    const activeRecipients = new Set(
      (await this.repository.listShares(ownerId))
        .filter((share) => share.state === 'active')
        .map((share) => share.recipientId),
    );
    if (
      remainingShares.length !== activeRecipients.size ||
      remainingShares.some(
        (share) =>
          !activeRecipients.has(share.recipientId) ||
          share.grant?.keyGeneration !== replacement.keyGeneration,
      )
    )
      throw Object.assign(
        new Error('Every remaining recipient requires a current encrypted grant.'),
        { code: 'CRISIS_PLAN_INVALID' },
      );
    return this.repository.rotate(replacement, remainingShares, mutationId);
  }
  async rotateAccess(ownerId: string, input: unknown, revokedRecipientId?: string) {
    const parsed = crisisPlanRotationRequestSchema.parse(input);
    const priorReceipt = await this.repository.receipt(ownerId, parsed.mutationId);
    if (priorReceipt)
      return { plan: await this.read(ownerId), shares: await this.repository.listShares(ownerId) };
    const current = await this.read(ownerId);
    assertCrisisPlanVersion(current.version, parsed.baseVersion);
    if (
      parsed.keyGeneration !== current.keyGeneration + 1 ||
      parsed.body.keyGeneration !== parsed.keyGeneration ||
      parsed.ownerWrap.keyGeneration !== parsed.keyGeneration
    )
      throw Object.assign(new Error('Crisis Plan access rotation is incomplete.'), {
        code: 'CRISIS_PLAN_INVALID',
      });
    const active = (await this.repository.listShares(ownerId)).filter(
      (share) => share.state === 'active' && share.recipientId !== revokedRecipientId,
    );
    const grantByRecipient = new Map(
      parsed.grants.map((value) => [value.recipientId, value.grant]),
    );
    if (
      grantByRecipient.size !== active.length ||
      active.some((share) => !grantByRecipient.has(share.recipientId))
    )
      throw Object.assign(
        new Error('Every remaining recipient requires a current encrypted grant.'),
        { code: 'CRISIS_PLAN_INVALID' },
      );
    const updatedAt = this.now();
    const remaining = active.map((share): CrisisPlanShare => {
      const grant = grantByRecipient.get(share.recipientId)!;
      if (
        grant.ownerId !== ownerId ||
        grant.planId !== current.planId ||
        grant.recipientId !== share.recipientId ||
        grant.keyGeneration !== parsed.keyGeneration ||
        grant.shareVersion !== share.version + 1
      )
        throw Object.assign(new Error('A replacement sharing grant is invalid.'), {
          code: 'CRISIS_PLAN_INVALID',
        });
      return { ...share, version: share.version + 1, grant, updatedAt };
    });
    const plan: CrisisPlanRecord = {
      ...current,
      version: current.version + 1,
      keyGeneration: parsed.keyGeneration,
      rotationState: 'current',
      body: parsed.body,
      ownerWrap: parsed.ownerWrap,
      updatedAt,
    };
    const saved = await this.repository.rotate(
      plan,
      remaining,
      parsed.mutationId,
      revokedRecipientId,
    );
    if (!saved)
      throw Object.assign(new Error('The share is unavailable.'), {
        code: 'CRISIS_PLAN_ACCESS_DENIED',
      });
    return { plan: saved, shares: await this.repository.listShares(ownerId) };
  }
}
