/**
 * The Mann-Whitney U test between two groups of values, with the normal approximation, the correction for ties and the
 * continuity correction. It asks whether a value of one group tends to be larger than a value of the other, without assuming
 * any distribution, which suits load times: skewed, with a long tail.
 */
export class MannWhitney {
  /**
   * `u` belongs to the first group: the number of pairs in which its value is the larger, ties counting a half. `effect` is the
   * rank-biserial correlation, from -1 (every value of the first group is smaller) to 1 (every one is larger).
   */
  static test(first, second) {
    const [n1, n2] = [first.length, second.length];
    if (n1 === 0 || n2 === 0) return { u: null, z: null, p: null, effect: null };
    const values = [
      ...first.map((value) => ({ value, first: true })),
      ...second.map((value) => ({ value, first: false })),
    ].sort((a, b) => a.value - b.value);
    let rankSum = 0;
    let ties = 0;
    for (let start = 0; start < values.length;) {
      let end = start;
      while (end + 1 < values.length && values[end + 1].value === values[start].value) end += 1;
      const size = end - start + 1;
      const rank = (start + end) / 2 + 1;
      for (let index = start; index <= end; index += 1) if (values[index].first) rankSum += rank;
      ties += size ** 3 - size;
      start = end + 1;
    }
    const total = n1 + n2;
    const u = rankSum - (n1 * (n1 + 1)) / 2;
    const mean = (n1 * n2) / 2;
    const variance = ((n1 * n2) / 12) * (total + 1 - ties / (total * (total - 1)));
    const distance = Math.max(Math.abs(u - mean) - 0.5, 0);
    const z = variance > 0 ? (Math.sign(u - mean) * distance) / Math.sqrt(variance) : 0;
    return { u, z, p: MannWhitney.pValue(z), effect: (2 * u) / (n1 * n2) - 1 };
  }

  /** The two-sided p-value of a standard normal score: the chance of a score at least this far from zero. */
  static pValue(z) {
    return Math.min(1, MannWhitney.#erfc(Math.abs(z) / Math.SQRT2));
  }

  /** The complementary error function: a series near zero, a continued fraction in the tail. Both are good to about 1e-14. */
  static #erfc(x) {
    if (x < 2) {
      let term = x;
      let sum = x;
      for (let n = 1; Math.abs(term) > 1e-17 * Math.abs(sum); n += 1) {
        term *= (-x * x) / n;
        sum += term / (2 * n + 1);
      }
      return 1 - (2 / Math.sqrt(Math.PI)) * sum;
    }
    // Lentz's method for erfc(x) = exp(-x²) / √π · 1 / (x + 1/2 / (x + 1 / (x + 3/2 / (x + …)))).
    const tiny = 1e-300;
    let fraction = x;
    let c = x;
    let d = 0;
    for (let n = 1; n < 500; n += 1) {
      const a = n / 2;
      d = x + a * d;
      d = d === 0 ? tiny : 1 / d;
      c = x + a / c;
      if (c === 0) c = tiny;
      const delta = c * d;
      fraction *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return Math.exp(-x * x) / Math.sqrt(Math.PI) / fraction;
  }
}
