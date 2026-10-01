import { describe, expect, it } from 'vitest';
import {
  fiveMinuteTimeOptions,
  splitTimeForDisplay,
  timeFromDisplay,
} from '../../src/features/tasks/due-value.js';

describe('task edit controls', () => {
  it('provides a dense five-minute time list', () => {
    expect(fiveMinuteTimeOptions()).toHaveLength(288);
    expect(fiveMinuteTimeOptions()).toContain('10:05');
  });

  it('converts stored times to and from an AM/PM display', () => {
    expect(splitTimeForDisplay('00:05')).toEqual({ hour: '12', minute: '05', meridiem: 'AM' });
    expect(splitTimeForDisplay('15:30')).toEqual({ hour: '3', minute: '30', meridiem: 'PM' });
    expect(timeFromDisplay('12', '00', 'PM')).toBe('12:00');
    expect(timeFromDisplay('12', '00', 'AM')).toBe('00:00');
    expect(timeFromDisplay('3', '30', 'PM')).toBe('15:30');
  });
});
