import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { DynamoCrisisPlanBrokerRepository } from './crisis-plan-broker-repository.js';
import {
  CrisisPlanKeyBroker,
  crisisPlanBrokerHeaders,
  kmsGrantDecryptor,
  type BrokerBinding,
} from './crisis-plan-key-broker-handler.js';

const brokerRepository = new DynamoCrisisPlanBrokerRepository();
const requestSchema = z
  .object({
    requestId: z.string().uuid(),
    ownerId: z.string().min(1).max(200),
    planId: z.string().uuid(),
    shareVersion: z.number().int().positive(),
    keyGeneration: z.number().int().positive(),
    ephemeralPublicKeySpki: z.string().min(1).max(2048),
  })
  .strict();
const keyId = process.env.CRISIS_PLAN_SHARING_KEY_ID;
const broker = keyId
  ? new CrisisPlanKeyBroker({
      now: Date.now,
      currentGrant: async (binding) => {
        if (!(await brokerRepository.isRecipientActive(binding.recipientId))) return undefined;
        const share = await brokerRepository.currentShare(binding.planId, binding.recipientId);
        const grant = share?.state === 'active' ? share.grant : undefined;
        return grant &&
          share?.ownerId === binding.ownerId &&
          grant.ownerId === binding.ownerId &&
          grant.recipientId === binding.recipientId &&
          grant.planId === binding.planId &&
          grant.shareVersion === binding.shareVersion &&
          grant.keyGeneration === binding.keyGeneration
          ? grant
          : undefined;
      },
      claimRequest: (binding, expiresAt) => brokerRepository.claimRequest(binding, expiresAt),
      decryptGrant: kmsGrantDecryptor(keyId),
    })
  : undefined;

const response = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: crisisPlanBrokerHeaders,
  body: JSON.stringify(body),
});

export const handler: APIGatewayProxyHandlerV2 = async (event: APIGatewayProxyEventV2) => {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: { userId?: string } };
  };
  const recipientId = context.authorizer?.lambda?.userId;
  if (!recipientId)
    return response(401, { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required.' });
  if (!broker)
    return response(503, {
      code: 'CRISIS_PLAN_ONLINE_REQUIRED',
      message: 'Shared Crisis Plans are temporarily unavailable.',
    });
  try {
    const input = requestSchema.parse(JSON.parse(event.body ?? '{}'));
    const result = await broker.rewrap({ ...input, recipientId } satisfies BrokerBinding);
    return response(200, result);
  } catch {
    return response(403, {
      code: 'CRISIS_PLAN_ACCESS_DENIED',
      message: 'The shared Crisis Plan is unavailable.',
    });
  }
};
