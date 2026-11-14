// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
const financeAccess = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('../../src/sync/finance-cache-access.js', () => ({
  readFinanceCachedData: financeAccess.check,
}));
import { CombinedSearchPage } from '../../src/features/search/CombinedSearchPage.js';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/search');
  sessionStorage.clear();
  localStorage.clear();
  financeAccess.check.mockReset();
});

describe('combined search scope', () => {
  it('withholds in-memory Finance hits until access is checked again and keeps ordinary results after revocation', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    financeAccess.check.mockImplementationOnce(async (read: () => unknown) => {
      await pending;
      return read();
    });
    const task = createTask({ label: 'Juniper task', assigneeId: 'viewer' }, 'viewer');
    const view = render(
      <CombinedSearchPage
        tasks={[task]}
        lists={[]}
        items={new Map()}
        directory={[]}
        categories={[]}
        projects={[]}
        currentUserId="viewer"
        currentUserGroupIds={[]}
        openTask={vi.fn()}
        openList={vi.fn()}
        loadFinanceSource={async () => ({
          accounts: [{ id: 'account', friendlyName: 'Household' }],
          transactions: [
            { id: 'transaction', accountId: 'account', description: 'Juniper groceries' },
          ],
          merchants: [],
        })}
      />,
    );
    fireEvent.click(view.getByRole('checkbox', { name: 'Transactions', exact: true }));
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'juniper' } });
    await waitFor(() => expect(financeAccess.check).toHaveBeenCalledOnce());
    expect(view.queryByRole('link', { name: 'Juniper groceries' })).toBeNull();
    expect(view.getByRole('button', { name: 'Juniper task' })).toBeTruthy();
    expect(view.queryByText(/No selected content matches/)).toBeNull();
    release();
    await waitFor(() => expect(view.getByRole('link', { name: 'Juniper groceries' })).toBeTruthy());
    financeAccess.check.mockRejectedValueOnce(new Error('Access changed'));
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'JUNIPER' } });
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toContain('Finance search is unavailable'),
    );
    expect(view.queryByRole('link', { name: 'Juniper groceries' })).toBeNull();
    expect(view.getByRole('button', { name: 'Juniper task' })).toBeTruthy();
  });
  it('defaults to the viewer and their groups and can search all readable content', async () => {
    const mine = createTask({ label: 'Task mine', assigneeId: 'viewer' }, 'owner');
    const theirs = createTask({ label: 'Task theirs', assigneeId: 'alex' }, 'alex');
    const view = render(
      <CombinedSearchPage
        tasks={[mine, theirs]}
        lists={[]}
        items={new Map()}
        directory={[]}
        categories={[]}
        projects={[]}
        currentUserId="viewer"
        currentUserGroupIds={[]}
        openTask={vi.fn()}
        openList={vi.fn()}
      />,
    );
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Task' } });
    await waitFor(() => expect(view.getByRole('button', { name: 'Task mine' })).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Task theirs' })).toBeNull();

    fireEvent.click(view.getByRole('checkbox', { name: 'All content' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Task theirs' })).toBeTruthy());
    expect(location.search).toBe('?scope=all');
  });
});
