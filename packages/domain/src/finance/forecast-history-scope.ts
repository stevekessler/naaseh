/** Classification must come from canonical allocation/budget resolution, not absent DTO fields. */
export type BudgetHistoryAssignment =
  | { kind: 'budget'; budgetId: string }
  | { kind: 'unbudgeted' }
  | { kind: 'unresolved' };

/** One canonical allocation row, or a whole transaction proven to have no budget assignment. */
export interface BudgetHistoryCandidate<T> {
  accountId: string;
  assignment: BudgetHistoryAssignment;
  value: T;
}

export interface BudgetHistoryScope {
  budgetId: string;
  /** All authorization/link sets must be resolved by trusted current-source checks. */
  authorizedBudgetIds: ReadonlySet<string>;
  authorizedAccountIds: ReadonlySet<string>;
  linkedAccountIds: ReadonlySet<string>;
  includeNonBudgetedHistory?: boolean;
}

export interface BudgetHistorySelection<T> {
  budgetRows: T[];
  nonBudgetedRows: T[];
  /** Completeness of supplied candidates only; the reader must also prove full query coverage. */
  inputsComplete: boolean;
}

/** Forecast-only opt-in never widens budget report rows and never grants source access. */
export function selectBudgetHistoryRows<T>(
  candidates: readonly BudgetHistoryCandidate<T>[],
  scope: BudgetHistoryScope,
): BudgetHistorySelection<T> {
  if (!scope.budgetId.trim()) throw new Error('A budget is required for history selection.');
  const result: BudgetHistorySelection<T> = {
    budgetRows: [],
    nonBudgetedRows: [],
    inputsComplete: scope.authorizedBudgetIds.has(scope.budgetId),
  };
  if (!result.inputsComplete) return result;
  for (const candidate of candidates) {
    const assignment = candidate.assignment;
    if (assignment.kind !== 'budget' && assignment.kind !== 'unbudgeted') {
      result.inputsComplete = false;
      continue;
    }
    if (assignment.kind === 'budget') {
      if (!assignment.budgetId.trim()) {
        result.inputsComplete = false;
        continue;
      }
      if (assignment.budgetId !== scope.budgetId) continue;
      if (!scope.authorizedAccountIds.has(candidate.accountId)) {
        result.inputsComplete = false;
        continue;
      }
      result.budgetRows.push(candidate.value);
    } else if (
      scope.includeNonBudgetedHistory === true &&
      scope.linkedAccountIds.has(candidate.accountId)
    ) {
      if (!scope.authorizedAccountIds.has(candidate.accountId)) {
        result.inputsComplete = false;
        continue;
      }
      result.nonBudgetedRows.push(candidate.value);
    }
  }
  return result;
}
