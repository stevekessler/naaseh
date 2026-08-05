import {
  applyFilteredPermutation as applyDomainFilteredPermutation,
  type FilteredStackPermutation,
  type PersonalStackFilterBasis,
  type WorkReference,
} from '@naaseh/domain';

export interface OccupiedSlotPermutationInput {
  order: readonly WorkReference[];
  movedWork: WorkReference;
  destinationIndex: number;
  matches: (work: WorkReference) => boolean;
  filterBasis?: PersonalStackFilterBasis;
}

/**
 * Build the complete affected manifest required for an exact filtered move.
 * The manifest is derived from the full order so nonmatching slots never move.
 */
export function createOccupiedSlotPermutation(
  input: OccupiedSlotPermutationInput,
): FilteredStackPermutation {
  const affectedWork = input.order.filter(input.matches);
  return {
    kind: 'filtered_permutation',
    movedWork: input.movedWork,
    destinationIndex: input.destinationIndex,
    affectedWork,
    ...(input.filterBasis ? { filterBasis: input.filterBasis } : {}),
  };
}

/** Apply the canonical domain algorithm while keeping the browser API explicit. */
export function applyOccupiedSlotPermutation(
  order: readonly WorkReference[],
  move: FilteredStackPermutation,
): WorkReference[] {
  return applyDomainFilteredPermutation(order, move);
}

export const applyFilteredPermutation = applyOccupiedSlotPermutation;
