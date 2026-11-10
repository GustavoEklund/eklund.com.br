import { DeviceRanges } from './device-ranges.js';

/** A position is kept to a thousandth of the part a click landed in. */
const STEPS = 1_000;

/**
 * Where a click of the heat map landed (0010): the part of the page it landed in, from a closed list, the range of the
 * window's width, and the position inside that part as a share of its width and height, from the top left. A click outside
 * every listed part is placed against the window. Nothing else about the click is kept: not the element, not its text.
 */
export class ClickPlaces {
  /**
   * @param {object} click
   * @param {Element} click.target what was clicked
   * @param {number} click.clientX @param {number} click.clientY where, in the window
   * @param {[string, string][]} regions [name, selector] of the parts of the page, the first that holds the target wins
   * @param {{ width: number, height: number }} window the size of the window, in CSS pixels
   * @returns {{ region: string, viewport: string, x: number, y: number }}
   */
  static of({ target, clientX, clientY }, regions, { width, height }) {
    const viewport = DeviceRanges.viewport(width);
    for (const [region, selector] of regions) {
      const part = target?.closest?.(selector);
      if (!part) continue;
      const box = part.getBoundingClientRect();
      return {
        region,
        viewport,
        x: ClickPlaces.#share(clientX - box.left, box.width),
        y: ClickPlaces.#share(clientY - box.top, box.height),
      };
    }
    return {
      region: 'other',
      viewport,
      x: ClickPlaces.#share(clientX, width),
      y: ClickPlaces.#share(clientY, height),
    };
  }

  /** `offset` as a share of `length`, from 0 to 1, rounded to a thousandth. */
  static #share(offset, length) {
    if (!(length > 0)) return 0;
    return Math.round(Math.min(Math.max(offset / length, 0), 1) * STEPS) / STEPS;
  }
}
