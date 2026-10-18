import { describe, it, expect } from 'vitest';
import { SeriesResampler } from '@site/js/load-test/series-resampler.js';

const sample = (time, done, p95 = 0, p99 = 0) => ({ time, done, p95, p99 });
/** Rounds to the millionth so floating point dust does not hide the exact value. */
const rounded = (values) => values.map((value) => Math.round(value * 1e6) / 1e6);
const repeat = (value, count) => Array.from({ length: count }, () => value);

describe('SeriesResampler', () => {
  it('returns empty series for fewer than two samples', () => {
    const resampler = new SeriesResampler(2);
    expect(resampler.resample([])).toStrictEqual({ tps: [], p95: [], p99: [] });
    expect(resampler.resample([sample(0, 0)])).toStrictEqual({ tps: [], p95: [], p99: [] });
  });

  it('turns a constant rate into a flat TPS line, one point per 100 ms', () => {
    const samples = Array.from({ length: 21 }, (_, index) => sample(index / 10, index * 100));
    expect(rounded(new SeriesResampler(2).resample(samples).tps)).toStrictEqual(repeat(1000, 20));
  });

  it('shows a rate change where the cumulative curve bends', () => {
    const { tps } = new SeriesResampler(2).resample([
      sample(0, 0),
      sample(1, 500),
      sample(2, 2000),
    ]);
    expect(rounded(tps)).toStrictEqual([...repeat(500, 10), ...repeat(1500, 10)]);
  });

  it('reports a flat counter as exactly zero throughput', () => {
    expect(new SeriesResampler(1).resample([sample(0, 0), sample(1, 0)]).tps).toStrictEqual(
      repeat(0, 10),
    );
  });

  it('carries the latest percentile sample into each bin', () => {
    const { p95, p99 } = new SeriesResampler(2).resample([
      sample(0, 0, 10, 100),
      sample(1, 1, 20, 200),
      sample(2, 2, 30, 300),
    ]);
    expect(p95).toStrictEqual([...repeat(10, 9), ...repeat(20, 10), 30]);
    expect(p99).toStrictEqual([...repeat(100, 9), ...repeat(200, 10), 300]);
  });

  it('stops at the last sample, even before the scenario length', () => {
    const { tps, p95, p99 } = new SeriesResampler(2).resample([
      sample(0, 0, 1, 7),
      sample(0.55, 55, 2, 8),
    ]);
    expect(rounded(tps)).toStrictEqual(repeat(100, 6));
    expect(p95).toStrictEqual([1, 1, 1, 1, 1, 2]);
    expect(p99).toStrictEqual([7, 7, 7, 7, 7, 8]);
  });

  it('never produces more bins than the scenario length allows', () => {
    expect(
      rounded(new SeriesResampler(1).resample([sample(0, 0), sample(5, 500)]).tps),
    ).toStrictEqual(repeat(100, 10));
  });

  it('counts from zero, so the first bin after a late first sample absorbs what it had already done', () => {
    const { tps } = new SeriesResampler(1).resample([sample(0.5, 100), sample(1, 150)]);
    expect(rounded(tps)).toStrictEqual([0, 0, 0, 0, 0, 1100, 100, 100, 100, 100]);
  });

  it('credits a jump between two samples at the same instant to the bin before it', () => {
    const { tps } = new SeriesResampler(1).resample([
      sample(0, 0),
      sample(0.5, 50),
      sample(0.5, 80),
      sample(1, 130),
    ]);
    expect(rounded(tps)).toStrictEqual([100, 100, 100, 100, 400, 100, 100, 100, 100, 100]);
  });

  it('closes on a zero-width final bin with zero throughput', () => {
    expect(
      rounded(new SeriesResampler(1).resample([sample(0, 0), sample(0.5, 50)]).tps),
    ).toStrictEqual([100, 100, 100, 100, 100, 0]);
  });
});
