import { Numbers } from '../shared/math.js';

const BIN_SECONDS = 0.1;

/** Resamples (time, cumulative count, p95, p99) samples into fixed 100 ms bins; TPS is the derivative of the cumulative curve. */
export class SeriesResampler {
  #totalSeconds;

  constructor(totalSeconds) {
    this.#totalSeconds = totalSeconds;
  }

  resample(samples) {
    const tps = [],
      p95 = [],
      p99 = [];
    if (samples.length < 2) return { tps, p95, p99 };
    const last = samples.at(-1).time;
    let sampleIndex = 0;
    for (let bin = 0; bin < this.#totalSeconds / BIN_SECONDS; bin++) {
      const start = bin * BIN_SECONDS,
        end = Math.min(start + BIN_SECONDS, last);
      if (start > last) break;
      tps.push(
        (this.#cumulativeAt(samples, end) - this.#cumulativeAt(samples, start)) /
          (end - start || BIN_SECONDS),
      );
      while (
        sampleIndex < samples.length - 1 &&
        samples[sampleIndex + 1].time <= start + BIN_SECONDS
      )
        sampleIndex++;
      p95.push(samples[sampleIndex].p95);
      p99.push(samples[sampleIndex].p99);
    }
    return { tps, p95, p99 };
  }

  #cumulativeAt(samples, time) {
    if (time <= samples[0].time) return 0;
    let low = 0,
      high = samples.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (samples[middle].time <= time) low = middle;
      else high = middle - 1;
    }
    const a = samples[low],
      b = samples[Math.min(low + 1, samples.length - 1)];
    return b.time > a.time
      ? a.done + (b.done - a.done) * Numbers.clamp((time - a.time) / (b.time - a.time), 0, 1)
      : a.done;
  }
}
