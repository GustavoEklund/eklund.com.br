import { describe, it, expect } from 'vitest';
import { OrthogonalPath } from '@site/js/architecture-map/orthogonal-path.js';

describe('OrthogonalPath', () => {
  it('draws a straight segment as a move and a line', () =>
    expect(
      OrthogonalPath.build([
        [0, 0],
        [10, 0],
      ]),
    ).toBe('M0,0L10,0'));
  it('handles a single point', () => expect(OrthogonalPath.build([[5, 7]])).toBe('M5,7L5,7'));
  it('keeps decimals and negatives as written', () =>
    expect(
      OrthogonalPath.build([
        [-1.5, 2],
        [3, 2],
      ]),
    ).toBe('M-1.5,2L3,2'));

  it('rounds a corner with a 9 px radius: a line to 9 px short of the corner, a curve through it, and a line from 9 px past it', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [100, 0],
        [100, 100],
      ]),
    ).toBe('M0,0L91,0 Q100,0 100,9L100,100');
  });

  it('rounds each corner of a staircase, with the corner as the control point of its curve', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [40, 0],
        [40, 40],
        [80, 40],
        [80, 80],
      ]),
    ).toBe('M0,0L31,0 Q40,0 40,9L40,31 Q40,40 49,40L71,40 Q80,40 80,49L80,80');
  });

  it('rounds corners going up and to the left as well', () => {
    expect(
      OrthogonalPath.build([
        [100, 100],
        [0, 100],
        [0, 0],
      ]),
    ).toBe('M100,100L9,100 Q0,100 0,91L0,0');
  });

  it('rounds a corner going down and then right, and up and then left', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [0, 50],
        [50, 50],
      ]),
    ).toBe('M0,0L0,41 Q0,50 9,50L50,50');
    expect(
      OrthogonalPath.build([
        [50, 50],
        [50, 0],
        [0, 0],
      ]),
    ).toBe('M50,50L50,9 Q50,0 41,0L0,0');
  });

  it('cuts the corner at half the shorter leg when a leg is under 18 px long', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [8, 0],
        [8, 100],
      ]),
    ).toBe('M0,0L4,0 Q8,0 8,4L8,100');
    expect(
      OrthogonalPath.build([
        [0, 0],
        [100, 0],
        [100, 12],
      ]),
    ).toBe('M0,0L94,0 Q100,0 100,6L100,12');
  });

  it('uses the shorter of the two legs, whichever side it is on', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [100, 0],
        [100, 6],
      ]),
    ).toBe('M0,0L97,0 Q100,0 100,3L100,6');
    expect(
      OrthogonalPath.build([
        [0, 0],
        [6, 0],
        [6, 100],
      ]),
    ).toBe('M0,0L3,0 Q6,0 6,3L6,100');
  });

  it('shares a short leg between two corners without crossing itself', () => {
    expect(
      OrthogonalPath.build([
        [0, 0],
        [8, 0],
        [8, 8],
        [40, 8],
      ]),
    ).toBe('M0,0L4,0 Q8,0 8,4L8,4 Q8,8 12,8L40,8');
  });

  it('draws a corner without legs as a point', () => {
    expect(
      OrthogonalPath.build([
        [5, 5],
        [5, 5],
        [5, 5],
      ]),
    ).toBe('M5,5L5,5 Q5,5 5,5L5,5');
  });
});
