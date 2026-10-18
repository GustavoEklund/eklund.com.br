import { describe, it, expect } from 'vitest';
import { DurationSummary } from '@site/js/load-test/duration-summary.js';

describe('DurationSummary', () => {
  const stats = new DurationSummary([5, 1, 3, 2, 4]);

  it('counts, finds the extremes and averages', () => {
    expect(stats.count).toBe(5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.average).toBe(3);
  });

  it('picks percentiles by floor(fraction * count) on the sorted values', () => {
    expect(stats.percentile(0)).toBe(1);
    expect(stats.percentile(0.5)).toBe(3);
    expect(stats.percentile(0.95)).toBe(5);
    expect(stats.percentile(1)).toBe(5);
    expect(stats.percentile(2)).toBe(5);
  });

  it('is all zeros without data', () => {
    const empty = new DurationSummary([]);
    expect(empty.count).toBe(0);
    expect(empty.min).toBe(0);
    expect(empty.max).toBe(0);
    expect(empty.average).toBe(0);
    expect(empty.percentile(0.99)).toBe(0);
  });

  it('sorts numerically, not alphabetically', () => {
    const mixed = new DurationSummary([10, 9, 100]);
    expect(mixed.min).toBe(9);
    expect(mixed.max).toBe(100);
    expect(mixed.percentile(0.5)).toBe(10);
  });

  it('accepts typed arrays and stores single precision, like the worker sends them', () => {
    const typed = new DurationSummary(new Float32Array([0.1, 0.2]));
    expect(typed.min).toBe(Math.fround(0.1));
    expect(typed.max).toBe(Math.fround(0.2));
  });

  it('does not change the array it was given', () => {
    const input = [3, 1, 2];
    new DurationSummary(input);
    expect(input).toStrictEqual([3, 1, 2]);
  });

  it('handles one value', () => {
    const single = new DurationSummary([7]);
    expect([
      single.count,
      single.min,
      single.max,
      single.average,
      single.percentile(0.99),
    ]).toStrictEqual([1, 7, 7, 7, 7]);
  });

  it('gives the same average on every read', () =>
    expect([stats.average, stats.average, stats.average]).toStrictEqual([3, 3, 3]));
});
