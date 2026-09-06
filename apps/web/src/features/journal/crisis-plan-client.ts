import type { CrisisPlanRecipientGrant, CrisisPlanRecord, CrisisPlanShare } from '@naaseh/domain';
import type { SharingKeyRegistryEntry } from '../../crypto/crisis-plan-crypto.js';
import {
  createOneUseRecipientKeyPair,
  decryptCrisisPlanBody,
  unwrapBrokerCpk,
  zeroizeCrisisPlanKey,
} from '../../crypto/crisis-plan-crypto.js';
import type { CrisisPlanCiphertext, JournalDocument } from '@naaseh/domain';
import { readLocalCrisisPlan } from '../../db/crisis-plan-repository.js';

export const crisisPlanPaths = Object.freeze({
  owner: '/api/v1/journal/crisis-plan',
  page: '/journal/crisis-plans',
});
export class CrisisPlanClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
  }
}
async function response<T>(request: Promise<Response>): Promise<T> {
  const result = await request;
  const body = (await result.json()) as {
    code?: string;
    message?: string;
    currentVersion?: number;
  };
  if (!result.ok)
    throw new CrisisPlanClientError(
      body.code ?? 'CRISIS_PLAN_INVALID',
      body.message ?? 'The Crisis Plan request failed.',
      body.currentVersion,
    );
  return body as T;
}
export const createRemoteCrisisPlan = (value: unknown, csrfToken: string) =>
  response<CrisisPlanRecord>(
    fetch(crisisPlanPaths.owner, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(value),
    }),
  );
export const replaceRemoteCrisisPlan = (value: unknown, csrfToken: string) =>
  response<CrisisPlanRecord>(
    fetch(crisisPlanPaths.owner, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(value),
    }),
  );
export const fetchRemoteCrisisPlan = () =>
  response<CrisisPlanRecord>(
    fetch(crisisPlanPaths.owner, { credentials: 'include', cache: 'no-store' }),
  );
export async function hasCurrentCrisisPlan(ownerId: string): Promise<boolean> {
  if (await readLocalCrisisPlan(ownerId)) return true;
  if (!navigator.onLine) return false;
  try {
    await fetchRemoteCrisisPlan();
    return true;
  } catch {
    return false;
  }
}
export const crisisPlanErrorMessage = (code: string) =>
  ({
    CRISIS_PLAN_REQUIRED: 'Create a Crisis Plan before your first journal entry.',
    CRISIS_PLAN_CONFLICT: 'Your Crisis Plan changed on another device. Reload it and try again.',
    CRISIS_PLAN_ROTATION_REQUIRED: 'Refresh Crisis Plan sharing access before saving.',
    CRISIS_PLAN_ONLINE_REQUIRED: 'Shared Crisis Plans require an internet connection.',
  })[code] ?? 'The Crisis Plan request could not be completed.';
export interface CrisisPlanActiveUser {
  id: string;
  displayName: string;
  username: string;
}
export const searchCrisisPlanUsers = (query: string, cursor?: string) =>
  response<{ users: CrisisPlanActiveUser[]; nextCursor?: string }>(
    fetch(
      `/api/v1/journal/crisis-plan/shareable-users?q=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { credentials: 'include', cache: 'no-store' },
    ),
  );
export const fetchSharingKeyRegistry = () =>
  response<SharingKeyRegistryEntry>(
    fetch('/api/v1/journal/crisis-plan/sharing-key', { credentials: 'include', cache: 'no-store' }),
  );
export const createCrisisPlanShare = (
  recipientId: string,
  baseVersion: number,
  grant: CrisisPlanRecipientGrant,
  csrfToken: string,
) =>
  response<CrisisPlanShare>(
    fetch('/api/v1/journal/crisis-plan/shares', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ mutationId: crypto.randomUUID(), recipientId, baseVersion, grant }),
    }),
  );
export const listCrisisPlanShares = () =>
  response<{ shares: CrisisPlanShare[]; rotationState: 'current' | 'rotation_required' }>(
    fetch('/api/v1/journal/crisis-plan/shares', { credentials: 'include', cache: 'no-store' }),
  );
export interface CrisisPlanRotationResult {
  plan: CrisisPlanRecord;
  shares: CrisisPlanShare[];
}
export const revokeCrisisPlanShare = (recipientId: string, rotation: unknown, csrfToken: string) =>
  response<CrisisPlanRotationResult>(
    fetch(`/api/v1/journal/crisis-plan/shares/${encodeURIComponent(recipientId)}/revoke`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(rotation),
    }),
  );
export const rotateCrisisPlanAccess = (rotation: unknown, csrfToken: string) =>
  response<CrisisPlanRotationResult>(
    fetch('/api/v1/journal/crisis-plan/rotate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(rotation),
    }),
  );
export const listSharedCrisisPlans = () =>
  response<{
    plans: Array<{
      planId: string;
      owner: CrisisPlanActiveUser;
      version: number;
      keyGeneration: number;
    }>;
  }>(fetch('/api/v1/journal/crisis-plan/shared', { credentials: 'include', cache: 'no-store' }));
export const removeSharedCrisisPlanAccess = (planId: string, csrfToken: string) =>
  response<void>(
    fetch(`/api/v1/journal/crisis-plan/shared/${encodeURIComponent(planId)}/remove-access`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrfToken },
    }),
  );
export async function openSharedCrisisPlan(planId: string): Promise<JournalDocument> {
  if (!navigator.onLine)
    throw new CrisisPlanClientError(
      'CRISIS_PLAN_ONLINE_REQUIRED',
      'Shared Crisis Plans require an internet connection.',
    );
  const shared = await response<{
    ownerId: string;
    planId: string;
    version: number;
    shareVersion: number;
    keyGeneration: number;
    body: CrisisPlanCiphertext;
  }>(
    fetch(`/api/v1/journal/crisis-plan/shared/${encodeURIComponent(planId)}`, {
      credentials: 'include',
      cache: 'no-store',
    }),
  );
  const ephemeral = await createOneUseRecipientKeyPair();
  const broker = await response<{ wrappedCpk: string }>(
    fetch('/api/v1/journal/crisis-plan/broker', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        ownerId: shared.ownerId,
        planId: shared.planId,
        shareVersion: shared.shareVersion,
        keyGeneration: shared.keyGeneration,
        ephemeralPublicKeySpki: ephemeral.publicKeySpki,
      }),
    }),
  );
  const cpk = await unwrapBrokerCpk(broker.wrappedCpk, ephemeral.privateKey);
  try {
    return await decryptCrisisPlanBody<JournalDocument>(shared.body, cpk, shared);
  } finally {
    zeroizeCrisisPlanKey(cpk);
  }
}
