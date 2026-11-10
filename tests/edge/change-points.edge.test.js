import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ChangePoints } from '../../edge/src/change-points.js';

/** Eighteen nights of small noise around zero, the same every time. */
const NOISE = [
  0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.1, 0.3, -0.3, 0.1, 0.2, -0.2, 0, 0.1, -0.1, 0.3, -0.2, 0.1,
];
const series = (minLength = 0) =>
  fc.array(fc.integer({ min: 0, max: 50 }), { minLength, maxLength: 40 });

describe('ChangePoints', () => {
  it('finds the night a level changes, and nothing in a flat or a noisy level', () => {
    expect([
      ChangePoints.find([...Array(5).fill(10), ...Array(5).fill(20)]),
      ChangePoints.find(Array(12).fill(7)),
      ChangePoints.find(NOISE.map((noise) => noise + 10)),
    ]).toStrictEqual([[5], [], []]);
  });

  it('finds two shifts through the noise, the same after the series is scaled and moved', () => {
    const levels = NOISE.map((noise, night) => noise + (night < 6 ? 10 : night < 12 ? 12 : 9));
    expect([
      ChangePoints.find(levels),
      ChangePoints.find(levels.map((value) => value * 1000 + 5)),
    ]).toStrictEqual([
      [6, 12],
      [6, 12],
    ]);
  });

  it('looks for nothing in a series shorter than two segments, and stops at the most it may find', () => {
    const stairs = Array.from({ length: 30 }, (_, night) => Math.floor(night / 3) * 10);
    expect([
      ChangePoints.find([1, 2, 3, 4, 5]),
      ChangePoints.find(stairs, { maxPoints: 2 }).length,
      ChangePoints.find(stairs).length,
    ]).toStrictEqual([[], 2, ChangePoints.MAX_POINTS]);
  });

  it('answers ascending indices that leave at least a minimum segment on each side', () =>
    fc.assert(
      fc.property(series(2 * ChangePoints.MIN_SEGMENT), (values) => {
        const points = ChangePoints.find(values);
        const edges = [0, ...points, values.length];
        expect([
          points.length <= ChangePoints.MAX_POINTS,
          edges.slice(1).every((edge, index) => edge - edges[index] >= ChangePoints.MIN_SEGMENT),
        ]).toStrictEqual([true, true]);
      }),
      { numRuns: 300 },
    ));

  it('breaks an exact tie between two splits the same way after scaling and shifting', () => {
    const tied = [8, 4, 0, 34, 43, 35, 32, 23, 50, 7];
    expect([
      ChangePoints.find(tied),
      ChangePoints.find(tied.map((value) => value - 64)),
    ]).toStrictEqual([
      [3, 6],
      [3, 6],
    ]);
  });

  it('finds the same points after any positive scaling and shift', () =>
    fc.assert(
      fc.property(
        series(),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: -500, max: 500 }),
        (values, scale, shift) => {
          expect(ChangePoints.find(values.map((value) => value * scale + shift))).toStrictEqual(
            ChangePoints.find(values),
          );
        },
      ),
      { numRuns: 300 },
    ));
});
