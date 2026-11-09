import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MannWhitney } from '../../edge/src/mann-whitney.js';

const group = fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 25 });

describe('MannWhitney', () => {
  it('gives the two-sided tail of a normal score: 5% at 1.96, and down to 1e-15 far out', () => {
    const tails = [
      [0, 1],
      [1, 0.31731050786291404],
      [1.959963984540054, 0.05],
      [2, 0.04550026389635842],
      [-3, 0.0026997960632601866],
      [5, 5.733031438470704e-7],
      [8, 1.2441921148543e-15],
    ].map(([z, p]) => MannWhitney.pValue(z) - p);
    tails.forEach((difference) => expect(difference).toBeCloseTo(0, 14));
  });

  it('finds two groups that do not overlap: u is 0, every value of the first is smaller', () => {
    const z = -12 / Math.sqrt(25 * (11 / 12));
    const result = MannWhitney.test([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect([result.u, result.effect]).toStrictEqual([0, -1]);
    expect(result.z).toBeCloseTo(z, 12);
    expect(result.p).toBeCloseTo(MannWhitney.pValue(z), 12);
  });

  it('gives tied values the mean of their ranks and corrects the variance for them', () => {
    // Ranks: 1 | 2 2 2 → 3 | 3 3 → 5.5 | 4 4 → 7.5. The first group sums 12.5; the ties weigh 24 + 6 + 6.
    const z = (2.5 - 8 + 0.5) / Math.sqrt((16 / 12) * (9 - 36 / 56));
    const result = MannWhitney.test([1, 2, 2, 3], [2, 3, 4, 4]);
    expect([result.u, result.effect]).toStrictEqual([2.5, -0.6875]);
    expect(result.z).toBeCloseTo(z, 12);
  });

  it('answers nothing for an empty group, and no difference when every value is the same', () => {
    expect([MannWhitney.test([], [1]), MannWhitney.test([3, 3], [3, 3, 3])]).toStrictEqual([
      { u: null, z: null, p: null, effect: null },
      { u: 3, z: 0, p: 1, effect: 0 },
    ]);
  });

  it('mirrors itself when the groups swap places', () =>
    fc.assert(
      fc.property(group, group, (first, second) => {
        const there = MannWhitney.test(first, second);
        const back = MannWhitney.test(second, first);
        expect([there.u + back.u, there.p - back.p]).toStrictEqual([
          first.length * second.length,
          0,
        ]);
        expect(there.z + back.z).toBeCloseTo(0, 12);
        expect(there.effect + back.effect).toBeCloseTo(0, 12);
      }),
      { numRuns: 300 },
    ));

  it('keeps u between 0 and n1·n2, the effect between -1 and 1 and p between 0 and 1', () =>
    fc.assert(
      fc.property(group, group, (first, second) => {
        const { u, effect, p } = MannWhitney.test(first, second);
        expect([
          u >= 0 && u <= first.length * second.length,
          effect >= -1 && effect <= 1,
          p >= 0 && p <= 1,
        ]).toStrictEqual([true, true, true]);
      }),
      { numRuns: 300 },
    ));

  it('depends only on the order of the values: shifting and stretching both groups changes nothing', () =>
    fc.assert(
      fc.property(group, group, fc.integer({ min: -1000, max: 1000 }), (first, second, shift) => {
        const moved = (values) => values.map((value) => value * 3 + shift);
        expect(MannWhitney.test(moved(first), moved(second))).toStrictEqual(
          MannWhitney.test(first, second),
        );
      }),
      { numRuns: 300 },
    ));
});
