export class Numbers {
  static clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  static lerp(from, to, t) {
    return from + (to - from) * t;
  }

  static degreesToRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  /** Deterministic unit-interval hash of two integers (for stable jitter). */
  static hashToUnit(a, b = 0) {
    return (Math.imul((a * 73856093) ^ (b * 19349663), 2654435761) >>> 0) / 4294967296;
  }

  static percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = Float32Array.from(values).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  }

  static average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  static gaussian(x, mean, sigma) {
    const d = x - mean;
    return Math.exp(-(d * d) / (2 * sigma * sigma));
  }

  /** Picks a round tick step (1, 2, 5 × 10^n) that yields about `divisions` ticks. */
  static niceStep(range, divisions) {
    const raw = range / divisions;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    // 0.15 / 0.1 is 1.4999999999999998: the threshold must see the decimal value, not the binary one.
    const normalized = Number((raw / magnitude).toPrecision(12));
    const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
    return factor * magnitude;
  }
}

/** mulberry32: a tiny seeded PRNG so illustrative data never changes between visits. */
export class SeededRandom {
  #state;

  constructor(seed) {
    this.#state = seed;
  }

  next() {
    this.#state = (this.#state + 0x6d2b79f5) | 0;
    let x = Math.imul(this.#state ^ (this.#state >>> 15), 1 | this.#state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
}
