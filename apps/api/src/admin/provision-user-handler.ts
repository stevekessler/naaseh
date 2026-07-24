import type { Context, Handler } from 'aws-lambda';
import { createLogger } from '@naaseh/observability';
import { ProvisionUserError, provisionUserWithConfiguredPepper } from './provision-user.js';

export const handler: Handler = async (event: unknown, context: Context) => {
  const logger = createLogger(process.env);
  try {
    const result = await provisionUserWithConfiguredPepper(event);
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
    const code = error instanceof ProvisionUserError ? error.code : 'invalid_request';
    logger.error('user.provision_failed', {
      correlationId: context.awsRequestId,
      principalSource: 'CloudTrail InvokeFunction event',
      errorCode: code,
    });
    logger.metric('UserProvisionFailures', 1, 'Count', { errorCode: code });
    return { error: { code, message: 'User provisioning could not be completed.' } };
  }
};
