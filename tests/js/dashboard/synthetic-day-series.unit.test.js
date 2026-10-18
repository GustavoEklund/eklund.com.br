import { describe, it, expect } from 'vitest';
import {
  SyntheticDaySeries,
  SAMPLES_PER_DAY,
  PEAK_TPS,
} from '@site/js/dashboard/synthetic-day-series.js';

const stats = (values) => ({
  average: values.reduce((sum, value) => sum + value, 0) / values.length,
  minimum: Math.min(...values),
  maximum: Math.max(...values),
});
const at = (values, indexes) => indexes.map((index) => values[index]);

describe('SyntheticDaySeries', () => {
  const series = new SyntheticDaySeries();

  it('has one sample every five minutes for a day', () => {
    expect([SAMPLES_PER_DAY, PEAK_TPS]).toStrictEqual([288, 500]);
    expect([series.tps.length, series.p95.length, series.p99.length]).toStrictEqual([
      288, 288, 288,
    ]);
  });

  it('throughput averages 194.98 TPS, bottoms at 59.34 and touches the 500 TPS cap exactly once', () => {
    const { average, minimum, maximum } = stats(series.tps);
    expect(average).toBeCloseTo(194.9826512747171, 10);
    expect(minimum).toBeCloseTo(59.34282658228106, 10);
    expect(maximum).toBe(500);
    expect(series.tps.filter((value) => value === 500)).toHaveLength(1);
  });

  it('p95 averages 184.85 ms between 162.08 and 206.09', () => {
    const { average, minimum, maximum } = stats(series.p95);
    expect(average).toBeCloseTo(184.84986945381036, 10);
    expect(minimum).toBeCloseTo(162.08063361548753, 10);
    expect(maximum).toBeCloseTo(206.08729711536017, 10);
  });

  it('p99 averages 277.27 ms between 249.86 and 301.33', () => {
    const { average, minimum, maximum } = stats(series.p99);
    expect(average).toBeCloseTo(277.272139763873, 10);
    expect(minimum).toBeCloseTo(249.85723352804837, 10);
    expect(maximum).toBeCloseTo(301.32634490646194, 10);
  });

  it('keeps p99 above p95 at every sample', () => {
    expect(
      series.p95
        .map((value, index) => [index, series.p99[index] > value])
        .filter(([, above]) => !above),
    ).toStrictEqual([]);
  });

  it('never exceeds the 500 TPS cap', () =>
    expect(series.tps.filter((value) => value > PEAK_TPS)).toStrictEqual([]));

  it('peaks in the evening, at sample 251, which is 20:55', () => {
    expect(series.tps.indexOf(500)).toBe(251);
    expect(SyntheticDaySeries.labelFor(251)).toBe('20:55');
  });

  it('is quiet at 04:00 and busy at midday', () => {
    expect(at(series.tps, [48, 144])).toStrictEqual([61.3160225449665, 265.19848000315534]);
  });

  it('keeps its published curve at midnight, 04:00, noon, the evening peak and the last sample', () => {
    expect(at(series.tps, [0, 48, 144, 251, 287])).toStrictEqual([
      140.7128797114903, 61.3160225449665, 265.19848000315534, 500, 166.67513553201726,
    ]);
    expect(at(series.p95, [0, 48, 144, 251, 287])).toStrictEqual([
      182.8072462229449, 182.42585546697674, 192.79521052909297, 195.92120653033203,
      190.29453590919854,
    ]);
    expect(at(series.p99, [0, 48, 144, 251, 287])).toStrictEqual([
      280.75199097892744, 265.8435525801597, 279.1062157394165, 292.27417001789206,
      268.923047762103,
    ]);
  });

  it('looks the same on every visit', () => {
    const again = new SyntheticDaySeries();
    expect([again.tps, again.p95, again.p99]).toStrictEqual([series.tps, series.p95, series.p99]);
  });

  it('labels samples as HH:MM, five minutes apart', () => {
    expect(
      [0, 1, 11, 12, 13, 144, 287].map((index) => SyntheticDaySeries.labelFor(index)),
    ).toStrictEqual(['00:00', '00:05', '00:55', '01:00', '01:05', '12:00', '23:55']);
  });
});
