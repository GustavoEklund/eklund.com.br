import { Numbers, SeededRandom } from '../shared/math.js';

export const SAMPLES_PER_DAY = 288; // one sample every 5 minutes
export const PEAK_TPS = 500;
const AVERAGE_TPS = 190;
const SEED = 20240815;

/**
 * Illustrative 24-hour series calibrated to the real figures on the CV
 * (average ~190 TPS, peaks at 500, p95 ~200 ms, p99 ~300 ms). Seeded, so it
 * looks the same on every visit.
 */
export class SyntheticDaySeries {
  tps;
  p95;
  p99;

  constructor() {
    const random = new SeededRandom(SEED);
    this.tps = this.#throughput(random);
    [this.p95, this.p99] = this.#latencies(random);
  }

  static labelFor(index) {
    return `${String(Math.floor(index / 12)).padStart(2, '0')}:${String((index % 12) * 5).padStart(2, '0')}`;
  }

  #throughput(random) {
    const base = [];
    let smoothNoise = 0;
    for (let index = 0; index < SAMPLES_PER_DAY; index++) {
      const hour = index / 12;
      smoothNoise = smoothNoise * 0.82 + (random.next() - 0.5) * 0.35;
      base.push(
        (60 +
          150 * Numbers.gaussian(hour, 12.4, 2.4) +
          210 * Numbers.gaussian(hour, 20.3, 2.6) +
          70 * Numbers.gaussian(hour, 9, 1.6) +
          40 * Numbers.gaussian(hour, 16, 1.5)) *
          (1 + smoothNoise * 0.35),
      );
    }
    const scale = AVERAGE_TPS / (base.reduce((sum, value) => sum + value, 0) / SAMPLES_PER_DAY);
    return base.map((value, index) => {
      const hour = index / 12;
      const spike =
        230 * Numbers.gaussian(hour, 20.9, 0.08) +
        190 * Numbers.gaussian(hour, 12.6, 0.07) +
        120 * Numbers.gaussian(hour, 0.05, 0.05) +
        90 * Numbers.gaussian(hour, 17.6, 0.06) +
        110 * Numbers.gaussian(hour, 11.2, 0.05);
      return Math.min(PEAK_TPS, value * scale + spike);
    });
  }

  #latencies(random) {
    const p95 = [],
      p99 = [];
    let noise95 = 0,
      noise99 = 0;
    for (let index = 0; index < SAMPLES_PER_DAY; index++) {
      noise95 = noise95 * 0.8 + (random.next() - 0.5) * 14;
      noise99 = noise99 * 0.8 + (random.next() - 0.5) * 22;
      const load = this.tps[index] / PEAK_TPS;
      p95.push(176 + 24 * load + noise95);
      p99.push(258 + 42 * Math.pow(load, 0.7) + noise99);
    }
    return [p95, p99];
  }
}
