import { useMemo } from 'react';
import { HiddenMemoIndex } from '../../search/hidden-memo-index.js';
export function useHiddenMemoSearch() {
  return useMemo(() => new HiddenMemoIndex(), []);
}
