// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CrisisPlanShareManager,
  crisisPlanSelect2Options,
} from '../../src/features/journal/CrisisPlanShareManager.js';

afterEach(cleanup);
describe('Select2 Crisis Plan share manager', () => {
  it('uses the bounded Select2 search configuration and cleans up on unmount', () => {
    const view = render(
      <CrisisPlanShareManager
        online={false}
        shares={[]}
        search={vi.fn(async () => [])}
        onShare={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
      />,
    );
    expect(crisisPlanSelect2Options).toMatchObject({ minimumInputLength: 2, width: '100%' });
    expect(
      view.getByLabelText('Select a user').classList.contains('select2-hidden-accessible'),
    ).toBe(true);
    expect(view.getByText(/existing remote access may continue/u)).toBeTruthy();
    view.unmount();
    expect(document.querySelector('.select2-container')).toBeNull();
  });
});
