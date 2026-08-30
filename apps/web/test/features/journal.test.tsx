import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JournalNumericField } from '../../src/features/journal/JournalNumericField.js';
import { JournalYesNoField } from '../../src/features/journal/JournalYesNoField.js';

describe('journal entry controls', () => {
  it('pairs accessible slider/number inputs and preserves an unanswered yes/no state', () => {
    const numeric = renderToStaticMarkup(
      <JournalNumericField
        id="sleep"
        label="Hours of sleep"
        value={null}
        minimum={1}
        maximum={24}
        step={0.5}
        onChange={() => undefined}
      />,
    );
    expect(numeric).toContain('type="range"');
    expect(numeric).toContain('type="number"');
    expect(numeric).toContain('step="0.5"');
    const yesNo = renderToStaticMarkup(
      <JournalYesNoField
        id="self-care"
        label="Self care"
        value={null}
        onChange={() => undefined}
      />,
    );
    expect(yesNo).toContain('Unanswered');
    expect(yesNo).not.toContain('delete');
  });
});
