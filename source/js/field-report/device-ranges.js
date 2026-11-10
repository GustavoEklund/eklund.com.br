/** [upper bound, name] pairs: a value goes to the first range whose bound it is under, else to the last name. */
const WIDTHS = [
  [360, '0-359'],
  [414, '360-413'],
  [768, '414-767'],
  [1024, '768-1023'],
  [1280, '1024-1279'],
  [1536, '1280-1535'],
];
const PIXEL_RATIOS = [
  [1.5, '1'],
  [2, '1.5'],
  [3, '2'],
];
const MEMORIES = [
  [4, '0-2'],
  [8, '4'],
];
const CORES = [
  [3, '1-2'],
  [5, '3-4'],
  [9, '5-8'],
];
const ROUND_TRIPS = [
  [100, '0-99'],
  [300, '100-299'],
  [600, '300-599'],
];

/**
 * The device as a page report describes it (0010): ranges, never the exact values, because together exact sizes and counts
 * could single a device out. A value the browser does not give is 'unknown'.
 */
export class DeviceRanges {
  /**
   * @param {object} device
   * @param {number} device.width the width of the window, in CSS pixels
   * @param {number} device.pixelRatio
   * @param {number} [device.memory] navigator.deviceMemory, in gigabytes
   * @param {number} [device.cores] navigator.hardwareConcurrency
   * @param {number} [device.roundTrip] navigator.connection.rtt, in milliseconds
   * @param {boolean} [device.saveData] the browser asks to save data
   * @param {boolean} device.dark the browser asks for a dark theme
   * @param {boolean} device.reducedMotion the browser asks for less motion
   */
  static of({ width, pixelRatio, memory, cores, roundTrip, saveData, dark, reducedMotion }) {
    return {
      viewport: DeviceRanges.#range(width, WIDTHS, '1536+'),
      pixelRatio: DeviceRanges.#range(pixelRatio, PIXEL_RATIOS, '3+'),
      memory: DeviceRanges.#known(memory, 0)
        ? DeviceRanges.#range(memory, MEMORIES, '8+')
        : 'unknown',
      cores: DeviceRanges.#known(cores, 1) ? DeviceRanges.#range(cores, CORES, '9+') : 'unknown',
      roundTrip: DeviceRanges.#known(roundTrip, 0)
        ? DeviceRanges.#range(roundTrip, ROUND_TRIPS, '600+')
        : 'unknown',
      saveData: saveData === true,
      colorScheme: dark ? 'dark' : 'light',
      reducedMotion: reducedMotion === true,
    };
  }

  /** The device of this window, read from the browser. */
  static read(window = globalThis) {
    const { navigator } = window;
    return DeviceRanges.of({
      width: window.innerWidth,
      pixelRatio: window.devicePixelRatio,
      memory: navigator.deviceMemory,
      cores: navigator.hardwareConcurrency,
      roundTrip: navigator.connection?.rtt,
      saveData: navigator.connection?.saveData,
      dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }

  static #known(value, minimum) {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
  }

  static #range(value, ranges, last) {
    return ranges.find(([bound]) => value < bound)?.[1] ?? last;
  }
}
