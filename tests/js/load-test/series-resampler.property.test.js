import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { SeriesResampler } from '@site/js/load-test/series-resampler.js';

// A monotone cumulative counter sampled at increasing times, from 0 to a whole number of seconds.
const run = fc
  .record({
    seconds: fc.integer({ min: 1, max: 6 }),
    steps: fc.array(
      fc.tuple(
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 800 }),
      ),
      { minLength: 2, maxLength: 60 },
    ),
  })
  .map(({ seconds, steps }) => {
    const weight = steps.reduce((sum, [dt]) => sum + dt, 0);
    let time = 0,
      done = 0;
    const samples = [{ time: 0, done: 0, p95: 0, p99: 0 }];
    for (const [dt, increment, latency] of steps) {
      time += (dt / weight) * seconds;
      done += increment;
      samples.push({ time, done, p95: latency, p99: latency * 2 });
    }
    samples.at(-1).time = seconds;
    return { seconds, samples };
  });

describe('SeriesResampler properties', () => {
  it('produces exactly ten bins per scenario second, in all three series', () =>
    fc.assert(
      fc.property(run, ({ seconds, samples }) => {
        const { tps, p95, p99 } = new SeriesResampler(seconds).resample(samples);
        expect([tps.length, p95.length, p99.length]).toStrictEqual([
          seconds * 10,
          seconds * 10,
          seconds * 10,
        ]);
      }),
    ));

  it('never reports a negative or non-finite throughput for a monotone counter', () =>
    fc.assert(
      fc.property(run, ({ seconds, samples }) => {
        const { tps } = new SeriesResampler(seconds).resample(samples);
        expect(tps.filter((value) => !Number.isFinite(value) || value < -1e-9)).toStrictEqual([]);
      }),
    ));

  it('conserves the total: summed throughput times the bin width is the final count', () =>
    fc.assert(
      fc.property(run, ({ seconds, samples }) => {
        const { tps } = new SeriesResampler(seconds).resample(samples);
        const total = tps.reduce((sum, value) => sum + value * 0.1, 0);
        expect(total.toFixed(4)).toBe(samples.at(-1).done.toFixed(4));
      }),
    ));

  it('only reports percentiles that were sampled, p99 always twice its p95 here', () =>
    fc.assert(
      fc.property(run, ({ seconds, samples }) => {
        const { p95, p99 } = new SeriesResampler(seconds).resample(samples);
        const sampled = new Set(samples.map((entry) => entry.p95));
        expect(p95.filter((value) => !sampled.has(value))).toStrictEqual([]);
        expect(p99).toStrictEqual(p95.map((value) => value * 2));
      }),
    ));

  it('never goes backwards in time: the percentile index only advances', () =>
    fc.assert(
      fc.property(run, ({ seconds, samples }) => {
        const { p95 } = new SeriesResampler(seconds).resample(samples);
        const sampledOrder = samples.map((entry) => entry.p95);
        let cursor = 0;
        const outOfOrder = p95.filter((value) => {
          const found = sampledOrder.indexOf(value, cursor);
          if (found === -1) return true;
          cursor = found;
          return false;
        });
        expect(outOfOrder).toStrictEqual([]);
      }),
    ));
});
