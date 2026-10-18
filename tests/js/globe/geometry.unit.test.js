import { describe, it, expect, afterEach, vi } from 'vitest';
import { GlobeGeometry } from '@site/js/globe/geometry.js';
import { Destinations } from '@site/js/globe/destinations.js';

const STRIDE = 9,
  SEGMENTS = 96;
const radians = (degrees) => (degrees * Math.PI) / 180;
const HOME = { latitude: -23.03, longitude: -45.56 };
const PLACES = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 90 },
  { latitude: 60, longitude: -30 },
];

/** The point of an arc at fraction t, spelled out step by step. */
const arcPoint = (from, to, t) => {
  const angle = Math.acos(from[0] * to[0] + from[1] * to[1] + from[2] * to[2]);
  const lift = 0.06 + 0.3 * (angle / Math.PI);
  const w0 = Math.sin((1 - t) * angle) / Math.sin(angle),
    w1 = Math.sin(t * angle) / Math.sin(angle);
  const height = 1 + lift * Math.sin(Math.PI * t);
  return from.map((value, axis) => (value * w0 + to[axis] * w1) * height);
};

describe('GlobeGeometry.toUnitVector', () => {
  it.each([
    ['the prime meridian on the equator', { latitude: 0, longitude: 0 }, [1, 0, 0]],
    ['the north pole', { latitude: 90, longitude: 0 }, [0, 1, 0]],
    ['the south pole', { latitude: -90, longitude: 0 }, [0, -1, 0]],
    [
      '90° east, seen from outside, which flips to negative z',
      { latitude: 0, longitude: 90 },
      [0, 0, -1],
    ],
    ['90° west', { latitude: 0, longitude: -90 }, [0, 0, 1]],
    ['the antimeridian', { latitude: 0, longitude: 180 }, [-1, 0, 0]],
  ])('maps %s', (_label, place, expected) => {
    expect(
      GlobeGeometry.toUnitVector(place).map((value) => Number(value.toFixed(12)) + 0),
    ).toStrictEqual(expected);
  });

  it('is the spherical formula (cos lat cos lon, sin lat, -cos lat sin lon) for a real place', () => {
    const lat = radians(40.71),
      lon = radians(-74.01);
    expect(GlobeGeometry.toUnitVector({ latitude: 40.71, longitude: -74.01 })).toStrictEqual([
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      -Math.cos(lat) * Math.sin(lon),
    ]);
  });

  it('has length 1 for home and every destination', () => {
    const lengths = [Destinations.HOME, ...Destinations.DESTINATIONS].map((place) =>
      Number(Math.hypot(...GlobeGeometry.toUnitVector(place)).toFixed(12)),
    );
    expect(lengths).toStrictEqual(Array.from({ length: 26 }, () => 1));
  });

  it('puts the northern hemisphere at +sin(lat) and the southern at -sin(lat)', () => {
    expect([
      GlobeGeometry.toUnitVector({ latitude: 40, longitude: 10 })[1],
      GlobeGeometry.toUnitVector({ latitude: -40, longitude: 10 })[1],
    ]).toStrictEqual([Math.sin(radians(40)), Math.sin(radians(-40))]);
  });
});

describe('GlobeGeometry.pins', () => {
  afterEach(() => vi.restoreAllMocks());

  it('packs x, y, z and a kind flag per place: 0 for home, then 1 for each destination', () => {
    const [home, first, second] = [HOME, PLACES[0], PLACES[2]].map((place) =>
      GlobeGeometry.toUnitVector(place),
    );
    const pins = GlobeGeometry.pins(HOME, [PLACES[0], PLACES[2]]);
    expect(pins).toBeInstanceOf(Float32Array);
    expect(Array.from(pins)).toStrictEqual(
      [...home, 0, ...first, 1, ...second, 1].map(Math.fround),
    );
  });

  it('turns each place into a vector once, home first and then the destinations in order', () => {
    const toUnitVector = vi.spyOn(GlobeGeometry, 'toUnitVector');
    GlobeGeometry.pins(HOME, PLACES);
    expect(toUnitVector).toHaveBeenCalledTimes(4);
    expect(toUnitVector).toHaveBeenNthCalledWith(1, HOME);
    expect(toUnitVector).toHaveBeenNthCalledWith(2, PLACES[0]);
    expect(toUnitVector).toHaveBeenNthCalledWith(3, PLACES[1]);
    expect(toUnitVector).toHaveBeenNthCalledWith(4, PLACES[2]);
  });

  it('has four floats per place for the 25 real destinations', () => {
    expect(GlobeGeometry.pins(Destinations.HOME, Destinations.DESTINATIONS)).toHaveLength(104);
  });

  it('is just home when there are no destinations', () => {
    expect(Array.from(GlobeGeometry.pins(HOME, []))).toStrictEqual(
      [...GlobeGeometry.toUnitVector(HOME), 0].map(Math.fround),
    );
  });
});

describe('GlobeGeometry.arcs', () => {
  afterEach(() => vi.restoreAllMocks());

  const arcs = GlobeGeometry.arcs(HOME, PLACES, [
    [-1, 0],
    [0, 1],
    [1, 2],
  ]);
  const vertex = (arc, segment, side) =>
    Array.from(
      arcs.vertices.subarray(
        ((arc * SEGMENTS + segment) * 2 + side) * STRIDE,
        ((arc * SEGMENTS + segment) * 2 + side + 1) * STRIDE,
      ),
    );
  const route = [
    [HOME, PLACES[0]],
    [PLACES[0], PLACES[1]],
    [PLACES[1], PLACES[2]],
  ].map(([from, to]) => [GlobeGeometry.toUnitVector(from), GlobeGeometry.toUnitVector(to)]);
  /** The whole vertex a segment and a side should have: point, t, next point, side, arc, in single precision. */
  const expectedVertex = (arc, segment, side) => {
    const [from, to] = route[arc];
    const t = segment / 95;
    const point = arcPoint(from, to, t);
    const next =
      segment < 95
        ? arcPoint(from, to, (segment + 1) / 95)
        : point.map((value, axis) => 2 * value - arcPoint(from, to, 94 / 95)[axis]);
    return [...point, t, ...next, side ? 1 : -1, arc].map(Math.fround);
  };

  it('describes the buffer layout: 3 arcs x 96 segments x 2 sides x 9 floats', () => {
    expect([arcs.segments, arcs.arcCount, arcs.vertices.length]).toStrictEqual([
      96,
      3,
      3 * 96 * 2 * 9,
    ]);
    expect(arcs.vertices).toBeInstanceOf(Float32Array);
  });

  it.each([
    [0, 0],
    [0, 1],
    [0, 47],
    [0, 94],
    [0, 95],
    [1, 0],
    [1, 48],
    [1, 95],
    [2, 10],
    [2, 95],
  ])('arc %d, segment %d has exactly the expected vertices on both sides', (arc, segment) => {
    expect([vertex(arc, segment, 0), vertex(arc, segment, 1)]).toStrictEqual([
      expectedVertex(arc, segment, 0),
      expectedVertex(arc, segment, 1),
    ]);
  });

  it('emits the two sides of a segment with the same position and opposite side flags', () => {
    expect([vertex(0, 10, 0)[7], vertex(0, 10, 1)[7]]).toStrictEqual([-1, 1]);
    expect(vertex(0, 10, 0).slice(0, 7)).toStrictEqual(vertex(0, 10, 1).slice(0, 7));
  });

  it('tags every vertex of an arc with its index', () => {
    expect(
      [0, 1, 2].map((arc) => [vertex(arc, 0, 0)[8], vertex(arc, 33, 1)[8], vertex(arc, 95, 0)[8]]),
    ).toStrictEqual([
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ]);
  });

  it('starts exactly on the origin and ends exactly on the target, on the surface', () => {
    const [from, to] = route[2];
    expect([vertex(2, 0, 0).slice(0, 3), vertex(2, 95, 0).slice(0, 3)]).toStrictEqual([
      from.map(Math.fround),
      to.map(Math.fround),
    ]);
  });

  it('ends on a target at 0°, 0° up to the sign of a zero (0 + -0 is +0 in the blend)', () => {
    const [from, to] = route[0];
    expect([
      vertex(0, 0, 0).slice(0, 3),
      vertex(0, 95, 0)
        .slice(0, 3)
        .map((value) => value + 0),
    ]).toStrictEqual([from.map(Math.fround), to.map((value) => Math.fround(value) + 0)]);
  });

  it('starts an arc between two destinations on the first destination', () => {
    expect(vertex(1, 0, 0).slice(0, 3)).toStrictEqual(route[1][0].map(Math.fround));
  });

  it('runs t from 0 to 1 in 95 equal steps', () => {
    expect([vertex(1, 0, 0)[3], vertex(1, 48, 0)[3], vertex(1, 95, 0)[3]]).toStrictEqual([
      0,
      Math.fround(48 / 95),
      1,
    ]);
  });

  it('lifts the middle of the arc by 0.06 + 0.3 * angle / pi above the sphere', () => {
    const [from, to] = route[1];
    const angle = Math.acos(from[0] * to[0] + from[1] * to[1] + from[2] * to[2]);
    const lifted = 1 + (0.06 + (0.3 * angle) / Math.PI) * Math.sin((Math.PI * 47) / 95);
    expect(Math.hypot(...arcPoint(from, to, 47 / 95))).toBeCloseTo(lifted, 12);
    expect(Math.hypot(...vertex(1, 47, 0).slice(0, 3))).toBe(
      Math.hypot(...expectedVertex(1, 47, 0).slice(0, 3)),
    );
  });

  it('lifts a farther route higher: the radius peaks exactly where the model says, and arc 1 (a quarter turn) peaks above arc 0', () => {
    const peak = (read) => (arc) =>
      Math.max(
        ...Array.from({ length: SEGMENTS }, (_, segment) =>
          Math.hypot(...read(arc, segment, 0).slice(0, 3)),
        ),
      );
    const actual = [0, 1].map(peak(vertex)),
      expected = [0, 1].map(peak(expectedVertex));
    expect(actual).toStrictEqual(expected);
    expect(Math.max(...actual)).toBe(actual[1]);
  });

  it('points each vertex at the next one, and extrapolates past the last', () => {
    expect([vertex(0, 20, 0).slice(4, 7), vertex(0, 95, 0).slice(4, 7)]).toStrictEqual([
      vertex(0, 21, 0).slice(0, 3),
      expectedVertex(0, 95, 0).slice(4, 7),
    ]);
  });

  it('turns the origin once, then each arc end once: home, then from and to of every later arc', () => {
    const toUnitVector = vi.spyOn(GlobeGeometry, 'toUnitVector');
    GlobeGeometry.arcs(HOME, PLACES, [
      [-1, 0],
      [0, 1],
      [1, 2],
    ]);
    expect(toUnitVector).toHaveBeenCalledTimes(6);
    expect(toUnitVector).toHaveBeenNthCalledWith(1, HOME);
    expect(toUnitVector).toHaveBeenNthCalledWith(2, PLACES[0]);
    expect(toUnitVector).toHaveBeenNthCalledWith(3, PLACES[0]);
    expect(toUnitVector).toHaveBeenNthCalledWith(4, PLACES[1]);
    expect(toUnitVector).toHaveBeenNthCalledWith(5, PLACES[1]);
    expect(toUnitVector).toHaveBeenNthCalledWith(6, PLACES[2]);
  });

  it('bends routes between places off the equator by the true angle between them', () => {
    const off = [
      { latitude: 10, longitude: 20 },
      { latitude: 35, longitude: 110 },
      { latitude: -50, longitude: -30 },
    ];
    const bent = GlobeGeometry.arcs(HOME, off, [
      [-1, 0],
      [0, 1],
      [1, 2],
    ]);
    const read = (arc, segment) =>
      Array.from(
        bent.vertices.subarray(
          (arc * SEGMENTS + segment) * 2 * STRIDE,
          ((arc * SEGMENTS + segment) * 2 + 1) * STRIDE,
        ),
      );
    const ends = [
      [HOME, off[0]],
      [off[0], off[1]],
      [off[1], off[2]],
    ].map(([from, to]) => [GlobeGeometry.toUnitVector(from), GlobeGeometry.toUnitVector(to)]);
    const model = (arc, segment) => {
      const [from, to] = ends[arc];
      const t = segment / 95;
      const point = arcPoint(from, to, t);
      const next = arcPoint(from, to, Math.min(95, segment + 1) / 95);
      return [
        ...point,
        t,
        ...(segment < 95
          ? next
          : point.map((value, axis) => 2 * value - arcPoint(from, to, 94 / 95)[axis])),
        -1,
        arc,
      ].map(Math.fround);
    };
    expect(
      [0, 1, 2].flatMap((arc) => [20, 47, 80].map((segment) => read(arc, segment))),
    ).toStrictEqual([0, 1, 2].flatMap((arc) => [20, 47, 80].map((segment) => model(arc, segment))));
  });

  it('produces only finite numbers for the 35 real routes of the site', () => {
    const real = GlobeGeometry.arcs(
      Destinations.HOME,
      Destinations.DESTINATIONS,
      Destinations.ARC_PAIRS,
    );
    expect([
      real.arcCount,
      real.vertices.length,
      Array.from(real.vertices).filter((value) => !Number.isFinite(value)).length,
    ]).toStrictEqual([35, 35 * 96 * 2 * 9, 0]);
  });

  it('is empty without routes', () => {
    const empty = GlobeGeometry.arcs(HOME, PLACES, []);
    expect([empty.vertices.length, empty.arcCount, empty.segments]).toStrictEqual([0, 0, 96]);
  });
});
