// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ controller: undefined as unknown }));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => f.controller,
  subscribeFinanceAccess: () => () => undefined,
}));
vi.mock('../../src/features/finance/security/finance-access-session.js', () => ({
  refreshFinanceSecurity: vi.fn(),
}));
import { FinanceAccessBoundary } from '../../src/features/finance/security/FinanceUnlock.js';
const controller = (ownerId: string, tabNonce: string) => ({
  ownerId,
  tabNonce,
  securityReady: true,
  requiresPin: false,
  canRead: () => true,
});
function RetainedView({ value }: { value: string }) {
  const [retained] = useState(value);
  return <p>{retained}</p>;
}
function ProtectedView({ ownerId, value }: { ownerId: string; value: string }) {
  return (
    <FinanceAccessBoundary ownerId={ownerId} csrfToken="csrf" onCancel={() => undefined}>
      <RetainedView value={value} />
    </FinanceAccessBoundary>
  );
}
afterEach(cleanup);
describe('Finance boundary owner and visit isolation', () => {
  it('withholds children when the active controller belongs to another owner', () => {
    f.controller = controller('previous-owner', 'old-tab');
    const view = render(<ProtectedView ownerId="next-owner" value="Protected budget data" />);
    expect(view.queryByText('Protected budget data')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh Finance security' })).toBeTruthy();
  });
  it('discards retained component data when the owner and controller change together', () => {
    f.controller = controller('first-owner', 'first-tab');
    const view = render(<ProtectedView ownerId="first-owner" value="First private budget" />);
    expect(view.getByText('First private budget')).toBeTruthy();
    f.controller = controller('second-owner', 'second-tab');
    view.rerender(<ProtectedView ownerId="second-owner" value="Second private budget" />);
    expect(view.queryByText('First private budget')).toBeNull();
    expect(view.getByText('Second private budget')).toBeTruthy();
  });
  it('discards retained component data when the same owner gets a replacement controller', () => {
    f.controller = controller('owner', 'old-tab');
    const view = render(<ProtectedView ownerId="owner" value="Previous visit budget" />);
    f.controller = controller('owner', 'fresh-tab');
    view.rerender(<ProtectedView ownerId="owner" value="Fresh visit budget" />);
    expect(view.queryByText('Previous visit budget')).toBeNull();
    expect(view.getByText('Fresh visit budget')).toBeTruthy();
    const lockedController = (tabNonce: string) => ({
      ...controller('owner', tabNonce),
      requiresPin: true,
      canRead: () => false,
    });
    f.controller = lockedController('locked-tab');
    view.rerender(<ProtectedView ownerId="owner" value="Must remain hidden" />);
    fireEvent.change(view.getByLabelText('Finance PIN'), { target: { value: '001234' } });
    f.controller = lockedController('replacement-locked-tab');
    view.rerender(<ProtectedView ownerId="owner" value="Must remain hidden" />);
    expect((view.getByLabelText('Finance PIN') as HTMLInputElement).value).toBe('');
    expect(view.queryByText('Must remain hidden')).toBeNull();
  });
});
