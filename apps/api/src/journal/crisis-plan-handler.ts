import { DynamoCrisisPlanRepository } from './crisis-plan-repository.js';
import { CrisisPlanService } from './crisis-plan-service.js';
import {
  activeUsersForCrisisPlan,
  syncBrokerActiveProjection,
  userById,
} from '../auth/user-repository.js';
import { crisisPlanMutationSchema } from '@naaseh/domain';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { loadSharingKeyRegistry } from './sharing-key-registry.js';
import { journalHandler } from './handler.js';

export interface CrisisPlanRequest {
  method?: string;
  path?: string;
  ownerId?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  origin?: string;
  expectedCsrf?: string;
  providedCsrf?: string;
}
export interface CrisisPlanResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
const repository = new DynamoCrisisPlanRepository();
const ownerService = new CrisisPlanService(repository);
const searchWindows = new Map<string, number[]>();
const headers = { 'cache-control': 'no-store', 'content-type': 'application/json' };
const problem = (
  statusCode: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): CrisisPlanResponse => ({
  statusCode,
  headers: { ...headers, 'content-type': 'application/problem+json' },
  body: JSON.stringify({ code, message, correlationId: crypto.randomUUID(), ...details }),
});
export async function applyCrisisPlanSyncMutation(
  ownerId: string,
  input: unknown,
  service: CrisisPlanService = ownerService,
) {
  const mutation = crisisPlanMutationSchema.parse(input);
  if (!('body' in mutation.payload) || !('ownerWrap' in mutation.payload))
    return { mutationId: mutation.id, status: 'rejected' as const };
  const payload = mutation.payload;
  try {
    const record =
      mutation.operation === 'create'
        ? await service.create(ownerId, {
            mutationId: mutation.id,
            planId: mutation.planId,
            baseVersion: 0,
            keyGeneration: payload.keyGeneration,
            body: payload.body,
            ownerWrap: payload.ownerWrap,
          })
        : mutation.operation === 'replace'
          ? await service.replace(ownerId, {
              mutationId: mutation.id,
              baseVersion: mutation.baseVersion,
              keyGeneration: payload.keyGeneration,
              body: payload.body,
              ownerWrap: payload.ownerWrap,
            })
          : undefined;
    if (!record) return { mutationId: mutation.id, status: 'rejected' as const };
    return { mutationId: mutation.id, status: 'applied' as const, version: record.version };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : 'CRISIS_PLAN_INVALID';
    return {
      mutationId: mutation.id,
      status:
        code === 'CRISIS_PLAN_CONFLICT'
          ? ('conflict' as const)
          : code === 'CRISIS_PLAN_ROTATION_REQUIRED'
            ? ('conflict' as const)
            : ('rejected' as const),
      ...(typeof error === 'object' &&
      error &&
      'currentVersion' in error &&
      typeof error.currentVersion === 'number'
        ? { currentVersion: error.currentVersion }
        : {}),
    };
  }
}
export async function crisisPlanHandler(event: CrisisPlanRequest): Promise<CrisisPlanResponse> {
  if (event.path === '/journal/key-envelope') return journalHandler(event);
  if (!event.ownerId)
    return problem(401, 'AUTHENTICATION_REQUIRED', 'Sign in to access Crisis Plans.');
  try {
    if (event.path === '/journal/crisis-plan' && event.method === 'GET')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(await ownerService.read(event.ownerId)),
      };
    if (event.path === '/journal/crisis-plan' && event.method === 'POST')
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(await ownerService.create(event.ownerId, event.body)),
      };
    if (event.path === '/journal/crisis-plan' && event.method === 'PUT')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(await ownerService.replace(event.ownerId, event.body)),
      };
    if (event.path === '/journal/crisis-plan/shareable-users' && event.method === 'GET') {
      const now = Date.now();
      const recent = (searchWindows.get(event.ownerId) ?? []).filter(
        (value) => now - value < 60_000,
      );
      if (recent.length >= 30)
        return problem(
          429,
          'CRISIS_PLAN_INVALID',
          'User search is temporarily rate limited. Try again shortly.',
        );
      searchWindows.set(event.ownerId, [...recent, now]);
      const service = new CrisisPlanService(
        repository,
        undefined,
        await activeUsersForCrisisPlan(),
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          service.searchUsers(
            event.ownerId,
            event.query?.q ?? '',
            Number(event.query?.cursor ?? 0),
          ),
        ),
      };
    }
    if (event.path === '/journal/crisis-plan/shares' && event.method === 'GET')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(await ownerService.listShares(event.ownerId)),
      };
    if (event.path === '/journal/crisis-plan/shares' && event.method === 'POST') {
      const body = event.body as { recipientId?: string; baseVersion?: number; grant?: unknown };
      if (!body?.recipientId || !body.baseVersion)
        return problem(400, 'CRISIS_PLAN_INVALID', 'Select an active user.');
      const recipient = await userById(body.recipientId);
      if (recipient) await syncBrokerActiveProjection(recipient.id);
      const service = new CrisisPlanService(repository, undefined, recipient ? [recipient] : []);
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(
          await service.share(event.ownerId, body.recipientId, body.grant, body.baseVersion),
        ),
      };
    }
    const revoke = event.path?.match(/^\/journal\/crisis-plan\/shares\/([^/]+)\/revoke$/u);
    if (revoke && event.method === 'POST')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          await ownerService.rotateAccess(
            event.ownerId,
            event.body,
            decodeURIComponent(revoke[1]!),
          ),
        ),
      };
    if (event.path === '/journal/crisis-plan/rotate' && event.method === 'POST')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(await ownerService.rotateAccess(event.ownerId, event.body)),
      };
    const actor = await userById(event.ownerId);
    const recipientService = new CrisisPlanService(repository, undefined, actor ? [actor] : []);
    if (event.path === '/journal/crisis-plan/shared' && event.method === 'GET') {
      const matches = await recipientService.listShared(event.ownerId);
      const owners = new Map(
        (await Promise.all(matches.map(({ plan }) => userById(plan.ownerId))))
          .filter((user): user is NonNullable<typeof user> => Boolean(user))
          .map((user) => [user.id, user]),
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          plans: matches.map(({ share, plan }) => ({
            planId: plan.planId,
            owner: {
              id: plan.ownerId,
              displayName: owners.get(plan.ownerId)?.displayName ?? 'Crisis Plan owner',
              username: owners.get(plan.ownerId)?.username ?? 'private',
            },
            version: plan.version,
            keyGeneration: plan.keyGeneration,
            shareVersion: share.version,
          })),
        }),
      };
    }
    const sharedOpen = event.path?.match(/^\/journal\/crisis-plan\/shared\/([^/]+)$/u);
    if (sharedOpen && event.method === 'GET') {
      const { share, plan } = await recipientService.openShared(
        event.ownerId,
        decodeURIComponent(sharedOpen[1]!),
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ownerId: plan.ownerId,
          planId: plan.planId,
          version: plan.version,
          shareVersion: share.version,
          keyGeneration: plan.keyGeneration,
          body: plan.body,
        }),
      };
    }
    const remove = event.path?.match(/^\/journal\/crisis-plan\/shared\/([^/]+)\/remove-access$/u);
    if (remove && event.method === 'POST')
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          await recipientService.removeAccess(event.ownerId, decodeURIComponent(remove[1]!)),
        ),
      };
    if (event.path === '/journal/crisis-plan/sharing-key' && event.method === 'GET') {
      try {
        return { statusCode: 200, headers, body: await loadSharingKeyRegistry() };
      } catch {
        return problem(
          503,
          'CRISIS_PLAN_ONLINE_REQUIRED',
          'Sharing-key registration is temporarily unavailable.',
        );
      }
    }
    return problem(404, 'CRISIS_PLAN_NOT_FOUND', 'The requested Crisis Plan is unavailable.');
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : 'CRISIS_PLAN_INVALID';
    const status =
      code === 'CRISIS_PLAN_REQUIRED'
        ? 409
        : code === 'CRISIS_PLAN_CONFLICT' || code === 'CRISIS_PLAN_ROTATION_REQUIRED'
          ? 409
          : 400;
    const currentVersion =
      typeof error === 'object' &&
      error &&
      'currentVersion' in error &&
      typeof error.currentVersion === 'number'
        ? error.currentVersion
        : undefined;
    return problem(
      status,
      code,
      error instanceof Error ? error.message : 'The requested Crisis Plan is unavailable.',
      currentVersion ? { currentVersion } : {},
    );
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event: APIGatewayProxyEventV2) => {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: { userId?: string; csrfToken?: string } };
  };
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : undefined;
  } catch {
    return problem(400, 'CRISIS_PLAN_INVALID', 'The request body is invalid.');
  }
  return crisisPlanHandler({
    method: event.requestContext.http.method,
    path: event.rawPath.replace(/^\/api\/v1/u, ''),
    ...(context.authorizer?.lambda?.userId ? { ownerId: context.authorizer.lambda.userId } : {}),
    body,
    ...(event.queryStringParameters ? { query: event.queryStringParameters } : {}),
    ...(event.headers.origin ? { origin: event.headers.origin } : {}),
    ...(context.authorizer?.lambda?.csrfToken
      ? { expectedCsrf: context.authorizer.lambda.csrfToken }
      : {}),
    ...(event.headers['x-csrf-token'] ? { providedCsrf: event.headers['x-csrf-token'] } : {}),
  });
};
