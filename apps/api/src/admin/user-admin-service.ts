import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { UserRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import { listUserMemberships } from '../groups/group-repository.js';

export type AdminUserView = Pick<
  UserRecord,
  'id' | 'username' | 'displayName' | 'pictureKey' | 'role' | 'active' | 'sessionEpoch'
> & {
  version: number;
  tfaStatus: 'disabled' | 'enrollment_required' | 'enabled' | 'recovery_required';
  groupSummary: string[];
};

export interface AdminUserPage {
  items: AdminUserView[];
  nextCursor?: string;
}

export interface UserAdminRepository {
  list(): Promise<UserRecord[]>;
  page?(input: { limit: number; afterSortKey?: string }): Promise<{
    users: UserRecord[];
    nextSortKey?: string;
  }>;
  groupsForUser?(id: string): Promise<string[]>;
  get(id: string): Promise<UserRecord | undefined>;
  setStatus(
    id: string,
    active: boolean,
    expectedEpoch: number,
    expectedVersion?: number,
  ): Promise<UserRecord>;
}

function view(user: UserRecord, groupSummary: string[] = []): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(user.pictureKey ? { pictureKey: user.pictureKey } : {}),
    role: user.role,
    active: user.active,
    sessionEpoch: user.sessionEpoch,
    version: user.version ?? 1,
    tfaStatus: user.tfaStatus ?? 'disabled',
    groupSummary: groupSummary.slice(0, 5),
  };
}

const encodeCursor = (sortKey: string) =>
  Buffer.from(JSON.stringify({ version: 1, sortKey }), 'utf8').toString('base64url');
// This unsigned cursor is intentionally untrusted input. It is only a validated
// DynamoDB position hint; it never grants access or changes the query partition.
const decodeCursor = (cursor: string) => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      version?: unknown;
      sortKey?: unknown;
    };
    if (parsed.version !== 1 || typeof parsed.sortKey !== 'string' || parsed.sortKey.length > 400)
      throw new Error('invalid');
    return parsed.sortKey;
  } catch {
    throw Object.assign(new Error('Invalid administrator user cursor.'), { statusCode: 400 });
  }
};

export function createUserAdminService(repository: UserAdminRepository) {
  return {
    async listUsers() {
      return Promise.all(
        (await repository.list()).map(async (user) =>
          view(user, (await repository.groupsForUser?.(user.id)) ?? []),
        ),
      );
    },
    async pageUsers(input: { limit?: number; cursor?: string } = {}): Promise<AdminUserPage> {
      const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 100)));
      const afterSortKey = input.cursor ? decodeCursor(input.cursor) : undefined;
      const page = repository.page
        ? await repository.page({ limit, ...(afterSortKey ? { afterSortKey } : {}) })
        : await (async () => {
            const remaining = (await repository.list())
              .sort((a, b) => `${a.username}#${a.id}`.localeCompare(`${b.username}#${b.id}`))
              .filter((user) => !afterSortKey || `${user.username}#${user.id}` > afterSortKey);
            const users = remaining.slice(0, limit);
            return {
              users,
              ...(remaining.length > limit && users.length
                ? { nextSortKey: `${users.at(-1)!.username}#${users.at(-1)!.id}` }
                : {}),
            };
          })();
      const items = await Promise.all(
        page.users.map(async (user) =>
          view(user, (await repository.groupsForUser?.(user.id)) ?? []),
        ),
      );
      return {
        items,
        ...(page.nextSortKey ? { nextCursor: encodeCursor(page.nextSortKey) } : {}),
      };
    },
    async setUserActive(
      actorId: string,
      targetId: string,
      active: boolean,
      expectedVersion?: number,
    ) {
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
      if (expectedVersion !== undefined && (current.version ?? 1) !== expectedVersion)
        throw Object.assign(new Error('The user changed before this action was saved.'), {
          statusCode: 409,
        });
      // Incrementing the epoch makes every previously issued session fail the
      // authorizer immediately while retaining task/revision actor references.
      return view(
        await repository.setStatus(targetId, active, current.sessionEpoch, current.version ?? 1),
      );
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
  async page({ limit, afterSortKey }) {
    const afterId = afterSortKey?.split('#').at(-1);
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :partition',
        ExpressionAttributeValues: { ':partition': 'ADMIN#USER' },
        Limit: limit,
        ...(afterSortKey && afterId
          ? {
              ExclusiveStartKey: {
                ...keys.user(afterId),
                GSI1PK: 'ADMIN#USER',
                GSI1SK: afterSortKey,
              },
            }
          : {}),
      }),
    );
    return {
      users: (result.Items ?? []).map((item) => item.data as UserRecord),
      ...(typeof result.LastEvaluatedKey?.GSI1SK === 'string'
        ? { nextSortKey: result.LastEvaluatedKey.GSI1SK }
        : {}),
    };
  },
  async groupsForUser(id) {
    return (await listUserMemberships(id))
      .filter((membership) => membership.status === 'active')
      .map((membership) => membership.groupId)
      .sort();
  },
  async get(id) {
    const result = await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: keys.user(id), ConsistentRead: true }),
    );
    return result.Item?.data as UserRecord | undefined;
  },
  async setStatus(id, active, expectedEpoch, expectedVersion = 1) {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: keys.user(id),
        UpdateExpression:
          'SET #data.#active = :active, #data.#sessionEpoch = #data.#sessionEpoch + :one, #data.#version = :nextVersion',
        ConditionExpression:
          '#data.#sessionEpoch = :expectedEpoch AND (attribute_not_exists(#data.#version) OR #data.#version = :expectedVersion)',
        ExpressionAttributeNames: {
          '#data': 'data',
          '#active': 'active',
          '#sessionEpoch': 'sessionEpoch',
          '#version': 'version',
        },
        ExpressionAttributeValues: {
          ':active': active,
          ':one': 1,
          ':expectedEpoch': expectedEpoch,
          ':expectedVersion': expectedVersion,
          ':nextVersion': expectedVersion + 1,
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
