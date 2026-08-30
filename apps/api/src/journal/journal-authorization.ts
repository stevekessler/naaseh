export function assertJournalOwner(authenticatedOwnerId: string, recordOwnerId: string) {
  if (!authenticatedOwnerId || authenticatedOwnerId !== recordOwnerId)
    throw new Error('The journal resource is unavailable.');
}
