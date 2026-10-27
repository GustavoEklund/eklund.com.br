import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Numbers, SeededRandom } from '@site/js/shared/math.js';

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
const ordered = fc.tuple(finite, finite).map(([a, b]) => (a <= b ? [a, b] : [b, a]));
const integer = fc.integer({ min: -1e6, max: 1e6 });
const quarter = fc.constantFrom(0, 0.25, 0.5, 0.75, 1);

describe('Numbers properties', () => {
  it('clamp equals the bound it crosses, or the value itself, a zero with either sign', () =>
    fc.assert(
      fc.property(finite, ordered, (value, [min, max]) => {
        const expected = value < min ? min : value > max ? max : value;
        // Math.min and Math.max put -0 before 0, so a zero can come back with the sign of a bound, and no caller reads that
        // sign. Adding 0 turns -0 into 0 on both sides.
        expect(Numbers.clamp(value, min, max) + 0).toBe(expected + 0);
      }),
      // The case fast-check found in CI, and the same one the other way around: clamp(0, 0, -0) is -0, clamp(-0, 0, 1) is 0.
      {
        examples: [
          [0, [0, -0]],
          [-0, [0, 1]],
        ],
      },
    ));

  it('clamp is idempotent', () =>
    fc.assert(
      fc.property(finite, ordered, (value, [min, max]) => {
        const once = Numbers.clamp(value, min, max);
        expect(Numbers.clamp(once, min, max)).toBe(once);
      }),
    ));

  it('lerp on integers and quarter steps is exact: from * (1 - t) + to * t', () =>
    fc.assert(
      fc.property(integer, integer, quarter, (from, to, t) => {
        expect(Numbers.lerp(from, to, t)).toBe(from * (1 - t) + to * t);
      }),
    ));

  it('lerp returns the start at t = 0 and the end at t = 1', () =>
    fc.assert(
      fc.property(integer, integer, (from, to) => {
        expect([Numbers.lerp(from, to, 0), Numbers.lerp(from, to, 1)]).toStrictEqual([from, to]);
      }),
    ));

  it('degreesToRadians is odd and doubles when the angle doubles', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: -1440, max: 1440 }).map((halfDegrees) => halfDegrees / 2),
        (degrees) => {
          expect(Numbers.degreesToRadians(-degrees)).toBe(-Numbers.degreesToRadians(degrees));
          expect(Numbers.degreesToRadians(degrees * 2)).toBe(Numbers.degreesToRadians(degrees) * 2);
        },
      ),
    ));

  it('hashToUnit is a multiple of 2^-32 below one, and repeats for the same input', () =>
    fc.assert(
      fc.property(integer, integer, (a, b) => {
        const value = Numbers.hashToUnit(a, b);
        expect(Math.floor(value)).toBe(0);
        expect((value * 4294967296) % 1).toBe(0);
        expect(Numbers.hashToUnit(a, b)).toBe(value);
      }),
    ));

  it('percentile is the value at floor(fraction * n) in the ascending single-precision order', () =>
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: true, noDefaultInfinity: true, min: -1e4, max: 1e4 }), {
          minLength: 1,
          maxLength: 200,
        }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (values, fraction) => {
          const ascending = values.map((value) => Math.fround(value)).sort((a, b) => a - b);
          expect(Numbers.percentile(values, fraction)).toBe(
            ascending[Math.min(ascending.length - 1, Math.floor(fraction * ascending.length))],
          );
        },
      ),
    ));

  it('percentile never decreases as the fraction grows', () =>
    fc.assert(
      fc.property(
        fc.array(finite, { minLength: 1, maxLength: 100 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (values, a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(Math.max(Numbers.percentile(values, low), Numbers.percentile(values, high))).toBe(
            Numbers.percentile(values, high),
          );
        },
      ),
    ));

  it('percentile at fraction 0 is the minimum and at fraction 1 the maximum, in single precision', () =>
    fc.assert(
      fc.property(fc.array(finite, { minLength: 1, maxLength: 100 }), (values) => {
        const stored = values.map((value) => Math.fround(value));
        expect([Numbers.percentile(values, 0), Numbers.percentile(values, 1)]).toStrictEqual([
          Math.min(...stored),
          Math.max(...stored),
        ]);
      }),
    ));

  it('the average of one repeated integer is that integer', () =>
    fc.assert(
      fc.property(integer, fc.integer({ min: 1, max: 50 }), (value, count) => {
        expect(Numbers.average(Array.from({ length: count }, () => value))).toBe(value);
      }),
    ));

  it('the average of integers does not depend on their order', () =>
    fc.assert(
      fc.property(fc.array(integer, { minLength: 1, maxLength: 60 }), (values) => {
        expect(Numbers.average([...values].reverse())).toBe(Numbers.average(values));
      }),
    ));

  it('gaussian peaks at exactly 1 and is symmetric around an integer mean', () =>
    fc.assert(
      fc.property(
        integer,
        fc.integer({ min: 0, max: 50 }),
        fc.constantFrom(0.5, 1, 2, 4),
        (mean, offset, sigma) => {
          expect([
            Numbers.gaussian(mean, mean, sigma),
            Numbers.gaussian(mean + offset, mean, sigma),
          ]).toStrictEqual([1, Numbers.gaussian(mean - offset, mean, sigma)]);
        },
      ),
    ));

  it('gaussian falls the farther it gets from the mean', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.constantFrom(0.5, 1, 2, 4),
        (offset, sigma) => {
          expect(
            Math.min(Numbers.gaussian(offset, 0, sigma), Numbers.gaussian(offset + 1, 0, sigma)),
          ).toBe(Numbers.gaussian(offset + 1, 0, sigma));
        },
      ),
    ));

  it('niceStep picks 1, 2, 5 or 10 times a power of ten by the same thresholds as the unit tests', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e9 }),
        fc.integer({ min: 1, max: 20 }),
        (range, divisions) => {
          const [mantissaText, exponent] = (range / divisions).toExponential(14).split('e');
          const mantissa = Number(mantissaText);
          const factor = mantissa < 1.5 ? 1 : mantissa < 3.5 ? 2 : mantissa < 7.5 ? 5 : 10;
          expect(Numbers.niceStep(range, divisions)).toBe(Number(`${factor}e${exponent}`));
        },
      ),
    ));
});

describe('SeededRandom properties', () => {
  it('every draw is a multiple of 2^-32 below one', () =>
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const random = new SeededRandom(seed);
        const draws = Array.from({ length: 50 }, () => random.next());
        expect(draws.map((value) => [Math.floor(value), (value * 4294967296) % 1])).toStrictEqual(
          draws.map(() => [0, 0]),
        );
      }),
    ));

  it('replays the same sequence for the same seed', () =>
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = new SeededRandom(seed),
          b = new SeededRandom(seed);
        expect(Array.from({ length: 25 }, () => b.next())).toStrictEqual(
          Array.from({ length: 25 }, () => a.next()),
        );
      }),
    ));
});
