import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { OrthogonalPath } from '@site/js/architecture-map/orthogonal-path.js';

// A staircase polyline: alternating horizontal and vertical legs.
const staircase = fc
  .record({
    start: fc.tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 })),
    legs: fc.array(fc.integer({ min: 4, max: 300 }), { minLength: 1, maxLength: 7 }),
    horizontalFirst: fc.boolean(),
  })
  .map(({ start, legs, horizontalFirst }) => {
    const points = [start];
    legs.forEach((length, index) => {
      const [x, y] = points.at(-1);
      points.push((index % 2 === 0) === horizontalFirst ? [x + length, y] : [x, y + length]);
    });
    return points;
  });

/** The path read back as numbers: the start, then for every corner the point before it, the control point and the point after. */
const readBack = (path) => {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(([text]) => Number(text));
  const pairs = Array.from({ length: numbers.length / 2 }, (_, index) => [
    numbers[index * 2],
    numbers[index * 2 + 1],
  ]);
  return {
    start: pairs[0],
    corners: Array.from({ length: (pairs.length - 2) / 3 }, (_, index) =>
      pairs.slice(1 + index * 3, 4 + index * 3),
    ),
    end: pairs.at(-1),
  };
};
const distance = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by);

describe('OrthogonalPath properties', () => {
  it('begins with a move to the first point and ends with a line to the last one', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        const path = OrthogonalPath.build(points);
        const [firstX, firstY] = points[0],
          [lastX, lastY] = points.at(-1);
        expect([
          path.slice(0, `M${firstX},${firstY}`.length),
          path.slice(-`L${lastX},${lastY}`.length),
        ]).toStrictEqual([`M${firstX},${firstY}`, `L${lastX},${lastY}`]);
      }),
    ));

  it('has exactly one curve per inner corner', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        expect(OrthogonalPath.build(points).split('Q').length - 1).toBe(
          Math.max(0, points.length - 2),
        );
      }),
    ));

  it('contains no invalid numbers', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        expect(OrthogonalPath.build(points).match(/NaN|undefined|Infinity/g)).toBeNull();
      }),
    ));

  it('curves through every corner it was given, in order', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        expect(
          readBack(OrthogonalPath.build(points)).corners.map(([, control]) => control),
        ).toStrictEqual(points.slice(1, -1));
      }),
    ));

  it('starts and ends each curve min(9, half the shorter leg) away from its corner, on the legs themselves', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        const { corners } = readBack(OrthogonalPath.build(points));
        const measured = corners.map(([before, control, after]) => [
          distance(before, control),
          distance(control, after),
        ]);
        const expected = points.slice(1, -1).map((corner, index) => {
          const radius = Math.min(
            9,
            distance(points[index], corner) / 2,
            distance(corner, points[index + 2]) / 2,
          );
          return [radius, radius];
        });
        expect(measured).toStrictEqual(expected);
      }),
    ));

  it('keeps every curve point on the line of its leg: x or y never changes inside a leg', () =>
    fc.assert(
      fc.property(staircase, (points) => {
        const { start, corners, end } = readBack(OrthogonalPath.build(points));
        const sequence = [start, ...corners.flatMap(([before, , after]) => [before, after]), end];
        const legs = Array.from({ length: sequence.length / 2 }, (_, index) => [
          sequence[index * 2],
          sequence[index * 2 + 1],
        ]);
        expect(legs.filter(([from, to]) => from[0] !== to[0] && from[1] !== to[1])).toStrictEqual(
          [],
        );
      }),
    ));
});
