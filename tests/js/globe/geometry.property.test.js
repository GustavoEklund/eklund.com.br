import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GlobeGeometry } from '@site/js/globe/geometry.js';

const place = fc.record({
  latitude: fc.double({ min: -90, max: 90, noNaN: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true }),
});

describe('GlobeGeometry properties', () => {
  it('toUnitVector always has length 1', () =>
    fc.assert(
      fc.property(place, (point) => {
        expect(Number(Math.hypot(...GlobeGeometry.toUnitVector(point)).toFixed(12))).toBe(1);
      }),
    ));

  it('toUnitVector keeps y equal to sin(latitude), exactly', () =>
    fc.assert(
      fc.property(place, (point) => {
        expect(GlobeGeometry.toUnitVector(point)[1]).toBe(
          Math.sin((point.latitude * Math.PI) / 180),
        );
      }),
    ));

  it('toUnitVector puts east at negative z: z has the sign opposite to sin(longitude)', () =>
    fc.assert(
      fc.property(place, (point) => {
        const [, , z] = GlobeGeometry.toUnitVector(point);
        expect(z).toBe(
          -Math.cos((point.latitude * Math.PI) / 180) * Math.sin((point.longitude * Math.PI) / 180),
        );
      }),
    ));

  it('arcs between distinct, non-antipodal places are finite and never dip below the surface', () =>
    fc.assert(
      fc.property(place, place, (from, to) => {
        const a = GlobeGeometry.toUnitVector(from),
          b = GlobeGeometry.toUnitVector(to);
        const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        fc.pre(dot < 0.999 && dot > -0.999);
        const { vertices } = GlobeGeometry.arcs(from, [to], [[-1, 0]]);
        const notFinite = Array.from(vertices).filter((value) => !Number.isFinite(value));
        const radii = Array.from({ length: vertices.length / 9 }, (_, index) =>
          Math.hypot(vertices[index * 9], vertices[index * 9 + 1], vertices[index * 9 + 2]),
        );
        expect([notFinite, radii.filter((radius) => radius < 0.9999)]).toStrictEqual([[], []]);
      }),
    ));
});
