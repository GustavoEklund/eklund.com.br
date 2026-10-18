/** Where the arcs start and where they go. Indices in ARC_PAIRS refer to DESTINATIONS; -1 is home. */
export class Destinations {
  static HOME = {
    name: 'Taubaté',
    latitude: -23.03,
    longitude: -45.56,
    timeZone: 'America/Sao_Paulo',
  };

  static DESTINATIONS = [
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
  ].map(([name, latitude, longitude]) => ({ name, latitude, longitude }));

  static ARC_PAIRS = [
    ...Destinations.DESTINATIONS.map((_, index) => [-1, index]),
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
  ];
}
