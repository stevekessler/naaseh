import { peekFinanceAccess } from '../features/finance/security/finance-access.js';

export const ordinaryConflictVisible = (record: { entityType?: string }) =>
  Boolean(record.entityType && !record.entityType.startsWith('finance'));

/** Ordinary task review never delivers Finance conflicts, even during an unlocked visit.
 * Old unclassified records stay encrypted until a permitted local visit can classify them.
 */
export async function readOrdinaryConflict<T extends { mutation?: { entityType?: string } }>(
  record: { entityType?: string },
  decrypt: () => Promise<T>,
  classify?: (entityType: string) => Promise<unknown>,
): Promise<T | undefined> {
  if (record.entityType?.startsWith('finance')) return undefined;
  if (record.entityType) {
    const value = await decrypt();
    return value.mutation?.entityType?.startsWith('finance') ? undefined : value;
  }
  const access = peekFinanceAccess();
  if (!access?.canRead()) return undefined;
  try {
    const value = await access.read(decrypt);
    const entityType = value.mutation?.entityType;
    if (!entityType) return undefined;
    await classify?.(entityType);
    return entityType?.startsWith('finance') ? undefined : value;
  } catch {
    // Unreadable legacy formats have no safe classification. Retain their ciphertext;
    // an ordinary review must not reveal even an unavailable Finance conflict/count.
    return undefined;
  }
}
