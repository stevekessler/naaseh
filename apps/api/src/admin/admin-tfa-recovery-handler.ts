import { log, metric } from '@naaseh/observability';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { userByUsername } from '../auth/user-repository.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface AdminTfaRecoveryRequest {
  principalArn: string;
  username: string;
  reason: string;
  idempotencyToken: string;
}

export function createAdminTfaRecoveryHandler(dependencies: {
  authorizeOperator: (principalArn: string) => Promise<boolean>;
  findPriorResult: (idempotencyToken: string) => Promise<unknown>;
  recover: (request: {
    username: string;
    reason: string;
    idempotencyToken: string;
    principalArn: string;
    revokeSessions: true;
    removeFactorMaterial: true;
  }) => Promise<unknown>;
}) {
  return async (request: AdminTfaRecoveryRequest) => {
    if (!(await dependencies.authorizeOperator(request.principalArn)))
      throw new Error('Recovery operator is not authorized');
    const prior = await dependencies.findPriorResult(request.idempotencyToken);
    if (prior) return prior;
    if (!request.reason.trim() || request.idempotencyToken.length < 16)
      throw new Error('Recovery request is invalid');
    return dependencies.recover({
      ...request,
      revokeSessions: true,
      removeFactorMaterial: true,
    });
  };
}

export async function handler(event: AdminTfaRecoveryRequest) {
  const operatorArn = process.env.ADMIN_TFA_RECOVERY_OPERATOR_ARN;
  const execute = createAdminTfaRecoveryHandler({
    authorizeOperator: async (principalArn) => Boolean(operatorArn && principalArn === operatorArn),
    findPriorResult: async (idempotencyToken) => {
      const response = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: keys.adminTfaRecoveryAudit(idempotencyToken),
          ConsistentRead: true,
        }),
      );
      return response.Item?.data;
    },
    recover: async (request) => {
      const user = await userByUsername(request.username);
      if (!user || user.role !== 'admin') throw new Error('Recovery target is unavailable');
      const now = new Date().toISOString();
      const result = {
        auditId: randomUUID(),
        status: 'recovery_required' as const,
        userId: user.id,
        occurredAt: now,
      };
      await dynamodb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: keys.user(user.id),
                UpdateExpression:
                  'SET #data.tfaStatus=:status, #data.sessionEpoch=:epoch, #data.securityUpdatedAt=:now, #data.#version=:nextVersion REMOVE #data.tfaEnrolledAt',
                ConditionExpression:
                  '#data.#role=:admin AND #data.sessionEpoch=:expectedEpoch AND #data.#version=:expectedVersion',
                ExpressionAttributeNames: {
                  '#data': 'data',
                  '#role': 'role',
                  '#version': 'version',
                },
                ExpressionAttributeValues: {
                  ':status': 'recovery_required',
                  ':epoch': user.sessionEpoch + 1,
                  ':now': now,
                  ':nextVersion': user.version + 1,
                  ':admin': 'admin',
                  ':expectedEpoch': user.sessionEpoch,
                  ':expectedVersion': user.version,
                },
              },
            },
            { Delete: { TableName: tableName, Key: keys.tfaFactor(user.id) } },
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...keys.adminTfaRecoveryAudit(request.idempotencyToken),
                  data: {
                    ...result,
                    principalArn: request.principalArn,
                    reason: request.reason,
                    idempotencyToken: request.idempotencyToken,
                  },
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return result;
    },
  });
  try {
    const result = await execute(event);
    log('admin.tfa-recovery', {
      operation: 'admin_tfa_recovery',
      outcome: 'success',
      principalArn: event.principalArn,
    });
    metric('AdminTfaRecoveries', 1);
    return result;
  } catch (error) {
    log('admin.tfa-recovery', {
      operation: 'admin_tfa_recovery',
      outcome: 'failure',
      principalArn: event.principalArn,
      errorClass: error instanceof Error ? error.name : 'UnknownError',
    });
    metric('AdminTfaRecoveryFailures', 1);
    throw error;
  }
}
