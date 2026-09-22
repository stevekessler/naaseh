// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JOURNAL_RELOCK_DELAY_MS,
  useJournalRelock,
} from '../../src/features/journal/useJournalRelock.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Journal PIN relock grace period', () => {
  it('requires the PIN after five minutes, not before', () => {
    vi.useFakeTimers();
    const lock = vi.fn();
    renderHook(() => useJournalRelock(true, false, lock));

    act(() => vi.advanceTimersByTime(JOURNAL_RELOCK_DELAY_MS - 1));
    expect(lock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(lock).toHaveBeenCalledOnce();
  });

  it('restarts the timer while the user is interacting with the Journal', () => {
    vi.useFakeTimers();
    const lock = vi.fn();
    renderHook(() => useJournalRelock(true, true, lock));

    act(() => vi.advanceTimersByTime(JOURNAL_RELOCK_DELAY_MS - 1));
    fireEvent.pointerDown(document);
    act(() => vi.advanceTimersByTime(JOURNAL_RELOCK_DELAY_MS - 1));
    expect(lock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(lock).toHaveBeenCalledOnce();
  });
});
