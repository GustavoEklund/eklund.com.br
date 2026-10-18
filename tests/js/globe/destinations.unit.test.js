import { describe, it, expect } from 'vitest';
import { Destinations } from '@site/js/globe/destinations.js';

describe('Destinations', () => {
  it('has home in Taubaté, with these exact coordinates and the São Paulo time zone', () => {
    expect(Destinations.HOME).toStrictEqual({
      name: 'Taubaté',
      latitude: -23.03,
      longitude: -45.56,
      timeZone: 'America/Sao_Paulo',
    });
  });

  it('lists exactly these 25 destinations, in this order', () => {
    expect(
      Destinations.DESTINATIONS.map(({ name, latitude, longitude }) => [name, latitude, longitude]),
    ).toStrictEqual([
      ['Brasília', -15.79, -47.88],
      ['São Paulo', -23.55, -46.63],
      ['Rio de Janeiro', -22.91, -43.17],
      ['Recife', -8.05, -34.88],
      ['Porto Alegre', -30.03, -51.23],
      ['Manaus', -3.12, -60.02],
      ['Buenos Aires', -34.6, -58.38],
      ['Santiago', -33.45, -70.67],
      ['Lima', -12.05, -77.04],
      ['Bogotá', 4.71, -74.07],
      ['Cidade do México', 19.43, -99.13],
      ['Miami', 25.76, -80.19],
      ['Nova York', 40.71, -74.01],
      ['Toronto', 43.65, -79.38],
      ['Lisboa', 38.72, -9.14],
      ['Madri', 40.42, -3.7],
      ['Londres', 51.51, -0.13],
      ['Berlim', 52.52, 13.4],
      ['Dubai', 25.2, 55.27],
      ['Mumbai', 19.08, 72.88],
      ['Singapura', 1.35, 103.82],
      ['Tóquio', 35.68, 139.69],
      ['Sydney', -33.87, 151.21],
      ['Joanesburgo', -26.2, 28.05],
      ['Lagos', 6.52, 3.38],
    ]);
  });

  it('gives every destination exactly name, latitude and longitude', () => {
    expect(Destinations.DESTINATIONS.map((place) => Object.keys(place).join())).toStrictEqual(
      Destinations.DESTINATIONS.map(() => 'name,latitude,longitude'),
    );
  });

  it('keeps every coordinate on the globe', () => {
    expect(
      Destinations.DESTINATIONS.filter(
        ({ latitude, longitude }) =>
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180,
      ),
    ).toStrictEqual([]);
  });

  it('has no repeated name and no repeated position', () => {
    const names = Destinations.DESTINATIONS.map(({ name }) => name);
    const positions = Destinations.DESTINATIONS.map(
      ({ latitude, longitude }) => `${latitude},${longitude}`,
    );
    expect([new Set(names).size, new Set(positions).size]).toStrictEqual([25, 25]);
  });

  it('accepts the home time zone in Intl', () => {
    expect(
      new Intl.DateTimeFormat('en', { timeZone: Destinations.HOME.timeZone }).resolvedOptions()
        .timeZone,
    ).toBe('America/Sao_Paulo');
  });

  it('starts one arc from home to each destination, then adds ten routes between destinations', () => {
    expect(Destinations.ARC_PAIRS).toStrictEqual([
      ...Array.from({ length: 25 }, (_, index) => [-1, index]),
      [1, 15],
      [12, 16],
      [20, 21],
      [10, 9],
      [14, 24],
      [18, 19],
      [6, 7],
      [13, 11],
      [17, 18],
      [3, 14],
    ]);
  });

  it('only refers to existing places and never joins a place to itself', () => {
    expect(
      Destinations.ARC_PAIRS.filter(
        ([from, to]) => from < -1 || from > 24 || to < 0 || to > 24 || from === to,
      ),
    ).toStrictEqual([]);
  });

  it('has no duplicate arcs', () => {
    const keys = Destinations.ARC_PAIRS.map(([from, to]) => `${from}>${to}`);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toStrictEqual([]);
  });
});
