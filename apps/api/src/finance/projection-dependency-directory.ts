import { createHash } from 'node:crypto';
import { isFinanceScopePartition } from './publication-change-journal.js';

export const projectionDependencyFormat = 'finance-projection-dependency-v1';
export function projectionDependencyPartition(scopePK: string) {
  if (!isFinanceScopePartition(scopePK)) throw new Error('Invalid Finance dependency scope.');
  return `FINANCE#PROJECTION_DEPENDENCY#${createHash('sha256').update(scopePK).digest('hex')}`;
}
export function projectionDependencyKey(scopePK: string, accountId: string) {
  if (!accountId || accountId.length > 200) throw new Error('Invalid Finance dependency account.');
  return { PK: projectionDependencyPartition(scopePK), SK: `ACCOUNT#${accountId}` };
}
