import type { CrisisPlanRecord } from '@naaseh/domain';
export function assertCrisisPlanOwner(actorId: string, ownerId: string): void {
  if (actorId !== ownerId) throw new Error('The requested Crisis Plan is unavailable.');
}
export function assertJournalCreationAllowed(
  plan: CrisisPlanRecord | undefined,
  baseVersion: number,
): void {
  if (baseVersion === 0 && !plan) {
    const error = new Error('Create a Crisis Plan before your first journal entry.');
    Object.assign(error, { code: 'CRISIS_PLAN_REQUIRED' });
    throw error;
  }
}
