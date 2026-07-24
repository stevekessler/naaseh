import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { UserRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export type AdminUserView = Pick<
  UserRecord,
  'id' | 'username' | 'displayName' | 'pictureKey' | 'role' | 'active' | 'sessionEpoch'
>;

export interface UserAdminRepository {
  list(): Promise<UserRecord[]>;
  get(id: string): Promise<UserRecord | undefined>;
  setStatus(id: string, active: boolean, expectedEpoch: number): Promise<UserRecord>;
}

function view(user: UserRecord): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(user.pictureKey ? { pictureKey: user.pictureKey } : {}),
    role: user.role,
    active: user.active,
    sessionEpoch: user.sessionEpoch,
  };
}

export function createUserAdminService(repository: UserAdminRepository) {
  return {
    async listUsers() {
      return (await repository.list()).map(view);
    },
    async setUserActive(actorId: string, targetId: string, active: boolean) {
      const current = await repository.get(targetId);
      if (!current) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      if (actorId === targetId && !active)
        throw Object.assign(new Error('Administrators cannot disable their own account.'), {
          statusCode: 409,
        });
      if (!active && current.active && current.role === 'admin') {
        const activeAdmins = (await repository.list()).filter(
          (user) => user.active && user.role === 'admin',
        );
        if (activeAdmins.length <= 1)
          throw Object.assign(new Error('The last active administrator cannot be disabled.'), {
            statusCode: 409,
          });
      }
      if (current.active === active) return view(current);
      // Incrementing the epoch makes every previously issued session fail the
      // authorizer immediately while retaining task/revision actor references.
      return view(await repository.setStatus(targetId, active, current.sessionEpoch));
    },
  };
}

export const dynamoUserAdminRepository: UserAdminRepository = {
  async list() {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :partition',
        ExpressionAttributeValues: { ':partition': 'ADMIN#USER' },
      }),
    );
    return (result.Items ?? []).map((item) => item.data as UserRecord);
  },
  async get(id) {
    const result = await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: keys.user(id), ConsistentRead: true }),
    );
    return result.Item?.data as UserRecord | undefined;
  },
  async setStatus(id, active, expectedEpoch) {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: keys.user(id),
        UpdateExpression:
          'SET #data.#active = :active, #data.#sessionEpoch = #data.#sessionEpoch + :one',
        ConditionExpression: '#data.#sessionEpoch = :expectedEpoch',
        ExpressionAttributeNames: {
          '#data': 'data',
          '#active': 'active',
          '#sessionEpoch': 'sessionEpoch',
        },
        ExpressionAttributeValues: {
          ':active': active,
          ':one': 1,
          ':expectedEpoch': expectedEpoch,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return result.Attributes?.data as UserRecord;
  },
};

export const userAdminService = createUserAdminService(dynamoUserAdminRepository);

export const setUserActive = (id: string, active: boolean, actorId = 'system-admin') =>
  userAdminService.setUserActive(actorId, id, active);
