import { describe, it, expect } from 'vitest';
import { Numbers, SeededRandom } from '@site/js/shared/math.js';

describe('Numbers.clamp', () => {
  it('returns the value when it is inside the range', () => expect(Numbers.clamp(2, 0, 3)).toBe(2));
  it('caps at the maximum', () => expect(Numbers.clamp(5, 0, 3)).toBe(3));
  it('raises to the minimum', () => expect(Numbers.clamp(-1, 0, 3)).toBe(0));
  it('keeps values that sit exactly on a bound', () => {
    expect(Numbers.clamp(0, 0, 3)).toBe(0);
    expect(Numbers.clamp(3, 0, 3)).toBe(3);
  });
  it('works with negative and fractional ranges', () => {
    expect(Numbers.clamp(-0.2, -0.5, -0.1)).toBe(-0.2);
    expect(Numbers.clamp(0.9, -0.5, -0.1)).toBe(-0.1);
  });
});

describe('Numbers.lerp', () => {
  it('returns both ends at t = 0 and t = 1', () => {
    expect(Numbers.lerp(10, 20, 0)).toBe(10);
    expect(Numbers.lerp(10, 20, 1)).toBe(20);
  });
  it('interpolates linearly', () => expect(Numbers.lerp(10, 20, 0.25)).toBe(12.5));
  it('extrapolates outside 0..1', () => {
    expect(Numbers.lerp(0, 10, 2)).toBe(20);
    expect(Numbers.lerp(0, 10, -1)).toBe(-10);
  });
  it('goes downhill when the target is lower', () =>
    expect(Numbers.lerp(10, 0, 0.3)).toBeCloseTo(7, 10));
});

describe('Numbers.degreesToRadians', () => {
  it.each([
    [0, 0],
    [90, Math.PI / 2],
    [180, Math.PI],
    [360, 2 * Math.PI],
    [-90, -Math.PI / 2],
  ])('%d° is %f rad', (degrees, radians) => {
    expect(Numbers.degreesToRadians(degrees)).toBeCloseTo(radians, 12);
  });
});

describe('Numbers.hashToUnit', () => {
  it('is deterministic', () =>
    expect([Numbers.hashToUnit(7, 3), Numbers.hashToUnit(7, 3)]).toStrictEqual([
      0.6893863952718675, 0.6893863952718675,
    ]));
  it('treats the second argument as 0 by default', () =>
    expect([Numbers.hashToUnit(5), Numbers.hashToUnit(5, 0)]).toStrictEqual([
      0.020775705808773637, 0.020775705808773637,
    ]));
  it('maps zero to zero', () => expect(Numbers.hashToUnit(0, 0)).toBe(0));
  it('depends on both arguments and on their order', () => {
    expect([
      Numbers.hashToUnit(1, 2),
      Numbers.hashToUnit(2, 1),
      Numbers.hashToUnit(1, 3),
      Numbers.hashToUnit(2, 2),
    ]).toStrictEqual([
      0.7020561962854117, 0.7291678537148982, 0.4651106297969818, 0.5198874631896615,
    ]);
  });
  it('keeps its published values, so jitter stays stable between releases', () => {
    expect(Numbers.hashToUnit(1)).toBeCloseTo(0.6041551411617547, 12);
    expect(Numbers.hashToUnit(1, 2)).toBeCloseTo(0.7020561962854117, 12);
    expect(Numbers.hashToUnit(7, 3)).toBeCloseTo(0.6893863952718675, 12);
  });
});

describe('Numbers.percentile', () => {
  const oneToTen = [10, 3, 7, 1, 9, 2, 8, 4, 6, 5];

  it('returns 0 for no values', () => expect(Numbers.percentile([], 0.5)).toBe(0));
  it('sorts before picking', () => {
    expect(Numbers.percentile(oneToTen, 0)).toBe(1);
    expect(Numbers.percentile(oneToTen, 0.5)).toBe(6);
  });
  it('clamps the top fraction to the last value', () => {
    expect(Numbers.percentile(oneToTen, 1)).toBe(10);
    expect(Numbers.percentile(oneToTen, 1.5)).toBe(10);
  });
  it('indexes by floor(fraction * length)', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(Numbers.percentile(hundred, 0.95)).toBe(96);
    expect(Numbers.percentile(hundred, 0.99)).toBe(100);
  });
  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    Numbers.percentile(input, 0.5);
    expect(input).toStrictEqual([3, 1, 2]);
  });
  it('accepts typed arrays', () =>
    expect(Numbers.percentile(new Float32Array([4, 2, 8]), 0.5)).toBe(4));
  it('sorts numerically, not as text', () => expect(Numbers.percentile([100, 9, 10], 1)).toBe(100));
  it('works on a single value', () => expect(Numbers.percentile([42], 0.99)).toBe(42));
});

describe('Numbers.average', () => {
  it('returns 0 for no values', () => expect(Numbers.average([])).toBe(0));
  it('averages values', () => expect(Numbers.average([1, 2, 3, 6])).toBe(3));
  it('handles negatives', () => expect(Numbers.average([-4, 4])).toBe(0));
});

describe('Numbers.gaussian', () => {
  it('peaks at 1 on the mean', () => expect(Numbers.gaussian(5, 5, 2)).toBe(1));
  it('falls to exp(-1/2) one sigma away, on both sides', () => {
    expect(Numbers.gaussian(7, 5, 2)).toBe(Math.exp(-0.5));
    expect(Numbers.gaussian(3, 5, 2)).toBe(Math.exp(-0.5));
  });
  it('falls faster with a smaller sigma: exp(-2) at sigma 0.5 against exp(-1/8) at sigma 2, one unit away', () => {
    expect(Numbers.gaussian(6, 5, 0.5)).toBe(Math.exp(-2));
    expect(Numbers.gaussian(6, 5, 2)).toBe(Math.exp(-0.125));
  });
});

describe('Numbers.niceStep', () => {
  it.each([
    [100, 5, 20],
    [1, 10, 0.1],
    [1000, 4, 200],
    [7, 1, 5],
    [8, 1, 10],
    [10, 4, 2],
  ])('range %d in %d divisions gives %d', (range, divisions, expected) => {
    expect(Numbers.niceStep(range, divisions)).toBeCloseTo(expected, 10);
  });

  it.each([
    [1.49, 1],
    [1.5, 2],
    [3.49, 2],
    [3.5, 5],
    [7.49, 5],
    [7.5, 10],
  ])('rounds a raw step of %f to a factor of %d', (raw, factor) => {
    expect(Numbers.niceStep(raw, 1)).toBeCloseTo(factor, 10);
  });

  it.each([
    [3, 20, 0.2],
    [7, 20, 0.5],
    [15, 20, 1],
    [3, 2, 2],
    [300, 2, 200],
  ])(
    'puts the thresholds on the decimal value, not the binary one: %d over %d is exactly a boundary and gives %d',
    (range, divisions, expected) => {
      // 0.15 / 0.1 is 1.4999999999999998 and 0.35 / 0.1 is 3.4999999999999996 in binary
      expect(Numbers.niceStep(range, divisions)).toBe(expected);
    },
  );

  it('scales with the magnitude of the range', () => {
    expect(Numbers.niceStep(0.03, 3)).toBeCloseTo(0.01, 12);
    expect(Numbers.niceStep(30000, 3)).toBe(10000);
  });
});

describe('SeededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new SeededRandom(99),
      b = new SeededRandom(99);
    expect(Array.from({ length: 20 }, () => b.next())).toStrictEqual(
      Array.from({ length: 20 }, () => a.next()),
    );
  });
  it('diverges for different seeds', () =>
    expect([new SeededRandom(1).next(), new SeededRandom(2).next()]).toStrictEqual([
      0.6270739405881613, 0.7342509443406016,
    ]));
  it('advances on every call', () => {
    const random = new SeededRandom(5);
    expect([random.next(), random.next()]).toStrictEqual([0.6897749109193683, 0.7727432732935995]);
  });
  it('keeps its published sequence, so the dashboard looks the same on every visit', () => {
    const random = new SeededRandom(1);
    expect(random.next()).toBeCloseTo(0.6270739405881613, 12);
    expect(random.next()).toBeCloseTo(0.002735721180215478, 12);
    expect(random.next()).toBeCloseTo(0.5274470399599522, 12);
    const dashboard = new SeededRandom(20240815);
    expect(dashboard.next()).toBeCloseTo(0.6007058331742883, 12);
    expect(dashboard.next()).toBeCloseTo(0.962594018317759, 12);
  });
  it('is uniform enough that 20,000 draws average 0.5002118228515959 and 9,946 fall below one half', () => {
    const random = new SeededRandom(2024);
    const samples = Array.from({ length: 20000 }, () => random.next());
    expect(Numbers.average(samples)).toBeCloseTo(0.5002118228515959, 14);
    expect(samples.filter((value) => value < 0.5)).toHaveLength(9946);
    expect(Math.min(...samples)).toBeCloseTo(0.00003278814256191254, 14);
    expect(Math.max(...samples)).toBeCloseTo(0.9999766258988529, 14);
  });
});
