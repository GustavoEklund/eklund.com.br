/**
 * Where the mean of a series shifts: binary segmentation over the sum of squared deviations from each segment's mean, with a
 * penalty of 2σ² ln n for each split (the BIC of a shift in the mean with known variance). σ comes from the median absolute
 * deviation of the differences between neighbors, so a step in the series does not inflate it the way the plain variance
 * would, and one noisy night does not move it much. Scaling the series or adding a constant to it changes no split.
 */
export class ChangePoints {
  /** The fewest nights in a segment: one odd night is noise, three in a row are a level. */
  static MIN_SEGMENT = 3;
  static MAX_POINTS = 5;

  /** The indices where a new segment starts, ascending. */
  static find(
    values,
    { minSegment = ChangePoints.MIN_SEGMENT, maxPoints = ChangePoints.MAX_POINTS } = {},
  ) {
    const n = values.length;
    if (n < 2 * minSegment) return [];
    const sums = [0];
    const squares = [0];
    for (const value of values) {
      sums.push(sums.at(-1) + value);
      squares.push(squares.at(-1) + value * value);
    }
    const cost = (start, end) => {
      const sum = sums[end] - sums[start];
      return Math.max(squares[end] - squares[start] - (sum * sum) / (end - start), 0);
    };
    const penalty = 2 * ChangePoints.#variance(values) * Math.log(n);
    // A gain of rounding error is no gain: the floor scales with the series, as the costs do.
    const floor = 1e-9 * Math.max(cost(0, n), Number.MIN_VALUE);
    const best = (start, end) => {
      let found = null;
      for (let split = start + minSegment; split <= end - minSegment; split += 1) {
        const gain = cost(start, end) - cost(start, split) - cost(split, end);
        if (!found || gain > found.gain) found = { start, end, split, gain };
      }
      return found;
    };
    const points = [];
    let segments = [[0, n]];
    while (points.length < maxPoints) {
      const candidate = segments
        .map(([start, end]) => best(start, end))
        .filter(Boolean)
        .reduce((a, b) => (b.gain > a.gain ? b : a), { gain: -Infinity });
      if (!(candidate.gain > penalty && candidate.gain > floor)) break;
      points.push(candidate.split);
      segments = segments.flatMap(([start, end]) =>
        start === candidate.start && end === candidate.end
          ? [
              [start, candidate.split],
              [candidate.split, end],
            ]
          : [[start, end]],
      );
    }
    return points.sort((a, b) => a - b);
  }

  /** The variance of the noise, from the differences between neighbors: robust first, the plain estimate when that is zero. */
  static #variance(values) {
    const differences = values.slice(1).map((value, index) => value - values[index]);
    const center = ChangePoints.#median(differences);
    const spread = 1.4826 * ChangePoints.#median(differences.map((d) => Math.abs(d - center)));
    if (spread > 0) return (spread * spread) / 2;
    const mean = differences.reduce((sum, d) => sum + d, 0) / differences.length;
    return differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / differences.length / 2;
  }

  static #median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
}
