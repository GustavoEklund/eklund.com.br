import { describe, it, expect } from 'vitest';
import { DeviceRanges } from '@site/js/field-report/device-ranges.js';

const PHONE = {
  width: 412,
  pixelRatio: 2.625,
  memory: 4,
  cores: 8,
  roundTrip: 150,
  saveData: false,
  dark: true,
  reducedMotion: false,
};

describe('DeviceRanges', () => {
  it('describes a device by ranges and by what the browser asks for', () => {
    expect(DeviceRanges.of(PHONE)).toStrictEqual({
      viewport: '360-413',
      pixelRatio: '2',
      memory: '4',
      cores: '5-8',
      roundTrip: '100-299',
      saveData: false,
      colorScheme: 'dark',
      reducedMotion: false,
    });
  });

  it('puts each width in its range, the bounds included in the range above', () => {
    expect(
      [0, 359, 360, 413, 414, 767, 768, 1023, 1024, 1279, 1280, 1535, 1536, 3840].map(
        (width) => DeviceRanges.of({ ...PHONE, width }).viewport,
      ),
    ).toStrictEqual([
      '0-359',
      '0-359',
      '360-413',
      '360-413',
      '414-767',
      '414-767',
      '768-1023',
      '768-1023',
      '1024-1279',
      '1024-1279',
      '1280-1535',
      '1280-1535',
      '1536+',
      '1536+',
    ]);
  });

  it('gives the same range for a width alone, as a click of a recording names it', () => {
    expect(
      [0, 390, 1023, 1440, 2560].map((width) => [
        DeviceRanges.viewport(width),
        DeviceRanges.of({ ...PHONE, width }).viewport,
      ]),
    ).toStrictEqual([
      ['0-359', '0-359'],
      ['360-413', '360-413'],
      ['768-1023', '768-1023'],
      ['1280-1535', '1280-1535'],
      ['1536+', '1536+'],
    ]);
  });

  it('puts each pixel ratio in its range', () => {
    expect(
      [1, 1.25, 1.5, 1.75, 2, 2.625, 3, 4].map(
        (pixelRatio) => DeviceRanges.of({ ...PHONE, pixelRatio }).pixelRatio,
      ),
    ).toStrictEqual(['1', '1', '1.5', '1.5', '2', '2', '3+', '3+']);
  });

  it('puts memory, cores and round trip in their ranges, and calls unknown what the browser does not say', () => {
    const ranges = (fields) => {
      const { memory, cores, roundTrip } = DeviceRanges.of({ ...PHONE, ...fields });
      return [memory, cores, roundTrip];
    };
    expect([
      ranges({ memory: 0.5, cores: 1, roundTrip: 0 }),
      ranges({ memory: 2, cores: 2, roundTrip: 99 }),
      ranges({ memory: 4, cores: 3, roundTrip: 100 }),
      ranges({ memory: 8, cores: 4, roundTrip: 299 }),
      ranges({ memory: 16, cores: 5, roundTrip: 300 }),
      ranges({ memory: 8, cores: 9, roundTrip: 600 }),
      ranges({ memory: undefined, cores: undefined, roundTrip: undefined }),
      ranges({ memory: Number.NaN, cores: 0, roundTrip: -1 }),
    ]).toStrictEqual([
      ['0-2', '1-2', '0-99'],
      ['0-2', '1-2', '0-99'],
      ['4', '3-4', '100-299'],
      ['8+', '3-4', '100-299'],
      ['8+', '5-8', '300-599'],
      ['8+', '9+', '600+'],
      ['unknown', 'unknown', 'unknown'],
      ['unknown', 'unknown', 'unknown'],
    ]);
  });

  it('says true only for what the browser asks for, and light without a dark theme', () => {
    expect(
      DeviceRanges.of({ ...PHONE, saveData: true, dark: false, reducedMotion: true }),
    ).toStrictEqual({
      viewport: '360-413',
      pixelRatio: '2',
      memory: '4',
      cores: '5-8',
      roundTrip: '100-299',
      saveData: true,
      colorScheme: 'light',
      reducedMotion: true,
    });
  });

  it('reads the device from a window: its width, pixel ratio, navigator and media queries', () => {
    const window = {
      innerWidth: 1280,
      devicePixelRatio: 1,
      navigator: {
        deviceMemory: 8,
        hardwareConcurrency: 12,
        connection: { rtt: 50, saveData: true },
      },
      matchMedia: (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }),
    };
    expect(DeviceRanges.read(window)).toStrictEqual({
      viewport: '1280-1535',
      pixelRatio: '1',
      memory: '8+',
      cores: '9+',
      roundTrip: '0-99',
      saveData: true,
      colorScheme: 'light',
      reducedMotion: true,
    });
  });

  it('reads a browser without device memory or connection as unknown and not saving data', () => {
    const window = {
      innerWidth: 390,
      devicePixelRatio: 3,
      navigator: { hardwareConcurrency: 6 },
      matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' }),
    };
    expect(DeviceRanges.read(window)).toStrictEqual({
      viewport: '360-413',
      pixelRatio: '3+',
      memory: 'unknown',
      cores: '5-8',
      roundTrip: 'unknown',
      saveData: false,
      colorScheme: 'dark',
      reducedMotion: false,
    });
  });
});
