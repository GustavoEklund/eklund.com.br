import { describe, it, expect, beforeAll } from 'vitest';
import { LandDecoder } from '@site/js/globe/land-decoder.js';
import { LAND_BITSET_BASE64, LAND_RING_COUNT } from '@site/js/globe/land-bitset.js';
import { GlobeGeometry } from '@site/js/globe/geometry.js';
import { Destinations } from '@site/js/globe/destinations.js';

const PLACES = [Destinations.HOME, ...Destinations.DESTINATIONS];
const tenths = (value) => Math.round(value * 10) / 10;

describe('the land map and the geometry of the globe agree', () => {
  let land;
  /** Angle in degrees from a direction on the unit sphere to the closest land dot. */
  const degreesToNearestLand = (vector) => {
    let best = -1;
    for (let index = 0; index < land.count; index++) {
      const dot =
        land.positions[index * 4] * vector[0] +
        land.positions[index * 4 + 1] * vector[1] +
        land.positions[index * 4 + 2] * vector[2];
      if (dot > best) best = dot;
    }
    return (Math.acos(Math.min(1, best)) * 180) / Math.PI;
  };
  beforeAll(() => {
    land = new LandDecoder({
      ringCount: LAND_RING_COUNT,
      bitsetBase64: LAND_BITSET_BASE64,
    }).decode();
  });

  it('ships a 180-ring grid of 1 degree: 11,911 land dots out of 41,252 samples, 29% of the sphere', () => {
    const samples = Array.from({ length: LAND_RING_COUNT }, (_, ring) =>
      Math.floor(
        (2 * Math.PI * Math.cos(-Math.PI / 2 + ((ring + 0.5) * Math.PI) / LAND_RING_COUNT)) /
          (Math.PI / LAND_RING_COUNT) +
          0.5,
      ),
    ).reduce((sum, value) => sum + value, 0);
    expect([
      LAND_RING_COUNT,
      land.count,
      samples,
      Math.round((land.count / samples) * 1000) / 1000,
      (land.angularStep * 180) / Math.PI,
    ]).toStrictEqual([180, 11911, 41252, 0.289, 1]);
  });

  it('stores one bit per sample: 5,157 bytes cover the 41,252 samples', () => {
    expect(atob(LAND_BITSET_BASE64).length).toBe(Math.ceil(41252 / 8));
  });

  it('puts every city of the site within 0.8 degrees of a land dot, as the sphere is read from outside', () => {
    expect(
      PLACES.map((place) => [
        place.name,
        tenths(degreesToNearestLand(GlobeGeometry.toUnitVector(place))),
      ]),
    ).toStrictEqual([
      ['Taubaté', 0.5],
      ['Brasília', 0.5],
      ['São Paulo', 0.3],
      ['Rio de Janeiro', 0.4],
      ['Recife', 0.6],
      ['Porto Alegre', 0.5],
      ['Manaus', 0.5],
      ['Buenos Aires', 0.8],
      ['Santiago', 0.1],
      ['Lima', 0.6],
      ['Bogotá', 0.4],
      ['Cidade do México', 0.4],
      ['Miami', 0.7],
      ['Nova York', 0.7],
      ['Toronto', 0.5],
      ['Lisboa', 0.3],
      ['Madri', 0.2],
      ['Londres', 0.4],
      ['Berlim', 0.3],
      ['Dubai', 0.8],
      ['Mumbai', 0.6],
      ['Singapura', 0.4],
      ['Tóquio', 0.4],
      ['Sydney', 0.4],
      ['Joanesburgo', 0.5],
      ['Lagos', 0.4],
    ]);
  });

  it('would put those same cities in the sea if the longitudes were mirrored, which is how the earlier bug looked', () => {
    const mirrored = PLACES.map((place) => [
      place.name,
      tenths(
        degreesToNearestLand(
          GlobeGeometry.toUnitVector({ latitude: place.latitude, longitude: -place.longitude }),
        ),
      ),
    ]);
    expect(mirrored).toStrictEqual([
      ['Taubaté', 0.5],
      ['Brasília', 0.5],
      ['São Paulo', 0.3],
      ['Rio de Janeiro', 1.1],
      ['Recife', 0.4],
      ['Porto Alegre', 6.9],
      ['Manaus', 14.2],
      ['Buenos Aires', 14.3],
      ['Santiago', 16.1],
      ['Lima', 18.9],
      ['Bogotá', 5.3],
      ['Cidade do México', 0.4],
      ['Miami', 0.5],
      ['Nova York', 0.4],
      ['Toronto', 0.5],
      ['Lisboa', 0.9],
      ['Madri', 1.7],
      ['Londres', 0.4],
      ['Berlim', 2.7],
      ['Dubai', 12],
      ['Mumbai', 0.7],
      ['Singapura', 16],
      ['Tóquio', 13.2],
      ['Sydney', 25.1],
      ['Joanesburgo', 12.7],
      ['Lagos', 0.4],
    ]);
  });

  it('finds open ocean where there is ocean: the middle of the Pacific and of the South Atlantic', () => {
    const ocean = [
      { latitude: 0, longitude: -140 },
      { latitude: -30, longitude: -15 },
      { latitude: -50, longitude: 100 },
    ];
    expect(
      ocean.map((place) => tenths(degreesToNearestLand(GlobeGeometry.toUnitVector(place)))),
    ).toStrictEqual([24.4, 24.8, 16.5]);
  });
});
