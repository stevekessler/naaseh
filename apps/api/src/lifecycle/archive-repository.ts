import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { List, Task } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { listItemsForList } from '../lists/list-repository.js';

export interface ArchivedListResult {
  list: List;
  items: Awaited<ReturnType<typeof listItemsForList>>;
}

export async function scanArchivedWork(): Promise<{ tasks: Task[]; lists: ArchivedListResult[] }> {
  const result = await dynamodb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression:
        '(begins_with(PK,:task) OR begins_with(PK,:list)) AND SK=:current AND #data.#lifecycle=:archived',
      ExpressionAttributeNames: { '#data': 'data', '#lifecycle': 'lifecycle' },
      ExpressionAttributeValues: {
        ':task': 'TASK#',
        ':list': 'LIST#',
        ':current': 'CURRENT',
        ':archived': 'archived',
      },
    }),
  );
  const tasks: Task[] = [];
  const lists: List[] = [];
  for (const item of result.Items ?? []) {
    if (String(item.PK).startsWith('TASK#')) tasks.push(item.data as Task);
    if (String(item.PK).startsWith('LIST#')) lists.push(item.data as List);
  }
  return {
    tasks,
    lists: await Promise.all(
      lists.map(async (list) => ({ list, items: await listItemsForList(list.id) })),
    ),
  };
}
