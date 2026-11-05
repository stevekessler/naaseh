// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinanceAccessController } from '../../src/features/finance/security/finance-access-controller.js';
const f = vi.hoisted(() => ({
  controller: undefined as unknown,
  listeners: new Set<() => void>(),
  rows: vi.fn(),
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => f.controller,
  currentFinanceAccess: () => f.controller,
  subscribeFinanceAccess: (callback: () => void) => {
    f.listeners.add(callback);
    return () => f.listeners.delete(callback);
  },
}));
vi.mock('../../src/db/database.js', () => ({
  db: { secureFinanceRecords: { where: () => ({ equals: () => ({ toArray: f.rows }) }) } },
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  financeDeviceKey: async () => 'key',
  decryptFinanceRecord: async () => ({
    id: 'private-link',
    taskId: 'task',
    budgetId: 'private-budget',
    budgetItemId: 'private-item',
    status: 'active',
  }),
}));
import { FinancialTaskLink } from '../../src/features/tasks/FinancialTaskLink.js';
import { FinanceUnlock } from '../../src/features/finance/security/FinanceUnlock.js';
function setup() {
  let open = false;
  const change = () => {
    for (const callback of f.listeners) callback();
  };
  const lock = vi.fn(() => {
    open = false;
    change();
  });
  const controller = {
    securityReady: true,
    requiresPin: true,
    canRead: () => open,
    lock,
    read: async (operation: () => Promise<unknown>) => {
      if (!open) throw new Error('locked');
      const result = await operation();
      if (!open) throw new Error('locked');
      return result;
    },
    unlockOnline: vi.fn(async () => {
      open = true;
      change();
    }),
  } as unknown as FinanceAccessController;
  f.controller = controller;
  f.rows.mockResolvedValue([{}]);
  return { controller, lock };
}
afterEach(() => {
  cleanup();
  f.listeners.clear();
  vi.clearAllMocks();
});
describe('embedded Finance unlock', () => {
  it('keeps ordinary task edits usable, discloses no link before unlock and relocks on leaving', async () => {
    const { lock } = setup();
    const view = render(
      <>
        <input aria-label="Task title" defaultValue="My task" />
        <FinancialTaskLink taskId="task" />
      </>,
    );
    fireEvent.change(screen.getByLabelText('Task title'), {
      target: { value: 'Unsaved task edit' },
    });
    expect(f.rows).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Finance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(f.rows).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Task title') as HTMLInputElement).value).toBe(
      'Unsaved task edit',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Finance' }));
    fireEvent.change(screen.getByLabelText('Finance PIN'), { target: { value: '001234' } });
    fireEvent.submit(screen.getByLabelText('Finance PIN').closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Open related financial item' })).toBeTruthy(),
    );
    view.unmount();
    expect(lock).toHaveBeenCalled();
  });
  it('cancels a pending unlock without allowing its late result to reopen the view', async () => {
    const { controller, lock } = setup();
    let finish!: () => void;
    vi.mocked(controller.unlockOnline).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const unlocked = vi.fn();
    const cancel = vi.fn();
    render(<FinanceUnlock controller={controller} onUnlocked={unlocked} onCancel={cancel} />);
    fireEvent.change(screen.getByLabelText('Finance PIN'), { target: { value: '001234' } });
    fireEvent.submit(screen.getByLabelText('Finance PIN').closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(lock).toHaveBeenCalled();
    await act(async () => finish());
    expect(unlocked).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('aborts a pending unlock when its task view unmounts', async () => {
    const { controller, lock } = setup();
    let finish!: () => void;
    vi.mocked(controller.unlockOnline).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const unlocked = vi.fn();
    const view = render(
      <FinanceUnlock controller={controller} onUnlocked={unlocked} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Finance PIN'), { target: { value: '001234' } });
    fireEvent.submit(screen.getByLabelText('Finance PIN').closest('form')!);
    view.unmount();
    expect(lock).toHaveBeenCalled();
    await act(async () => finish());
    expect(unlocked).not.toHaveBeenCalled();
  });
});
