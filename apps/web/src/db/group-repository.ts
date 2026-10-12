import type { GroupView } from '@naaseh/domain';
import { db } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

const localGroupRecord = async (group: GroupView) => ({
  id: group.id,
  updatedAt: String(group.version),
  value: await encryptLocalValue('group', group.id, group),
});

export async function saveLocalGroups(groups: GroupView[]) {
  const records = await Promise.all(groups.map(localGroupRecord));
  await db.transaction('rw', db.secureGroups, async () => {
    await db.secureGroups.clear();
    await db.secureGroups.bulkPut(records);
  });
}

export async function saveLocalGroup(group: GroupView) {
  await db.secureGroups.put(await localGroupRecord(group));
}

export async function removeLocalGroup(groupId: string) {
  await db.secureGroups.delete(groupId);
}

export async function listLocalGroups(): Promise<GroupView[]> {
  const records = await db.secureGroups.toArray();
  return Promise.all(
    records.map((record) => decryptLocalValue<GroupView>('group', record.id, record.value)),
  );
}
