import type { Context, Handler } from 'aws-lambda';
import { createLogger } from '@naaseh/observability';
import { ZodError } from 'zod';
import { loadPepper } from '../auth/password.js';
import { ProvisionUserError, provisionUser } from './provision-user.js';

export const handler: Handler = async (event: unknown, context: Context) => {
  const logger = createLogger(process.env);
  let failureStage: 'pepper' | 'provision' = 'pepper';
  try {
    const pepper = await loadPepper();
    failureStage = 'provision';
    const result = await provisionUser(event, pepper.value, pepper.version);
    logger.info('user.provisioned', {
      correlationId: context.awsRequestId,
      principalSource: 'CloudTrail InvokeFunction event',
      userId: result.user.id,
      role: result.user.role,
      created: result.created,
    });
    logger.metric('UsersProvisioned', result.created ? 1 : 0, 'Count', {
      role: result.user.role,
    });
    return result;
  } catch (error) {
    const code =
      error instanceof ProvisionUserError
        ? error.code
        : error instanceof ZodError
          ? 'invalid_request'
          : 'dependency_failure';
    logger.error('user.provision_failed', {
      correlationId: context.awsRequestId,
      principalSource: 'CloudTrail InvokeFunction event',
      errorCode: code,
      failureStage,
    });
    logger.metric('UserProvisionFailures', 1, 'Count', { errorCode: code });
    return { error: { code, message: 'User provisioning could not be completed.' } };
  }
};
