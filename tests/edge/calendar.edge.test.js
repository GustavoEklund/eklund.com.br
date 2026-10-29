import { describe, it, expect } from 'vitest';
import { Calendar } from '../../edge/src/calendar.js';

describe('Calendar', () => {
  it('names the UTC day of an instant, not the local one', () => {
    expect([
      Calendar.day(new Date('2026-10-28T23:30:00-03:00')),
      Calendar.day(new Date('2026-10-28T20:59:59-03:00')),
    ]).toStrictEqual(['2026-10-29', '2026-10-28']);
  });

  it('counts days back across months, years and a leap day', () => {
    expect([
      Calendar.daysBefore('2026-10-29', 0),
      Calendar.daysBefore('2026-10-29', 1),
      Calendar.daysBefore('2026-10-29', 90),
      Calendar.daysBefore('2027-01-01', 1),
      Calendar.daysBefore('2028-03-01', 1),
    ]).toStrictEqual(['2026-10-29', '2026-10-28', '2026-07-31', '2026-12-31', '2028-02-29']);
  });

  it('counts months back to the same day, or to the last day of a shorter month', () => {
    expect([
      Calendar.monthsBefore('2026-10-29', 13),
      Calendar.monthsBefore('2026-10-29', 25),
      Calendar.monthsBefore('2027-03-31', 1),
      Calendar.monthsBefore('2028-03-31', 1),
      Calendar.monthsBefore('2026-12-31', 13),
      Calendar.monthsBefore('2026-01-15', 1),
    ]).toStrictEqual([
      '2025-09-29',
      '2024-09-29',
      '2027-02-28',
      '2028-02-29',
      '2025-11-30',
      '2025-12-15',
    ]);
  });
});
