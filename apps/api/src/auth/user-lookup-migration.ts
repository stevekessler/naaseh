import type { StoredUser } from './user-repository.js';
import { putUsernameLookup } from './user-repository.js';

export async function migrateUsernameLookupPointers(
  users: readonly StoredUser[],
  write = putUsernameLookup,
) {
  let migrated = 0;
  for (const user of users) {
    await write(user);
    migrated += 1;
  }
  return { migrated, completed: true as const };
}
