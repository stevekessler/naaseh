import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shouldShowCrisisPlan } from '../../src/features/journal/JournalEntryEditor.js';
import { TriggeredCrisisPlan } from '../../src/features/journal/TriggeredCrisisPlan.js';

const document = {
  version: 1 as const,
  blocks: [
    {
      type: 'paragraph' as const,
      children: [{ type: 'text' as const, text: 'Use coping skills' }],
    },
  ],
};
describe('triggered Crisis Plan', () => {
  it('uses the either-answer truth table without changing answers', () => {
    expect(shouldShowCrisisPlan(null, null)).toBe(false);
    expect(shouldShowCrisisPlan(false, false)).toBe(false);
    expect(shouldShowCrisisPlan(true, false)).toBe(true);
    expect(shouldShowCrisisPlan(false, true)).toBe(true);
    expect(shouldShowCrisisPlan(true, true)).toBe(true);
  });
  it('renders an accessible plan and actionable decrypt failure', () => {
    expect(renderToStaticMarkup(<TriggeredCrisisPlan document={document} />)).toContain(
      'Use coping skills',
    );
    const failed = renderToStaticMarkup(
      <TriggeredCrisisPlan
        document={null}
        error="Could not decrypt"
        onRetry={() => undefined}
        onEdit={() => undefined}
      />,
    );
    expect(failed).toContain('aria-live="polite"');
    expect(failed).toContain('Retry Crisis Plan');
    expect(failed).toContain('Edit Crisis Plan');
  });
});
