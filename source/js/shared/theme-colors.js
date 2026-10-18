/**
 * Reads CSS color tokens as RGB. A hidden probe element carries the tokens as
 * ordinary properties, and a 1×1 canvas resolves oklch()/light-dark() to bytes.
 *
 * The colors are read the moment the theme changes, so the probe must show the new ones at once. A transition would
 * hold the old color for as long as it runs, and with motion paused every element has one (0.01 ms, enough to
 * return the previous value to the first reading), so the probe turns transitions off for itself, important
 * included: an inline !important declaration beats the rule of the paused state.
 */
export class ThemeColors {
  #probe;
  #context;

  constructor() {
    this.#probe = document.createElement('i');
    this.#probe.style.cssText =
      'position:absolute;width:0;height:0;color:var(--accent);background:var(--globe-body);border-top-color:var(--globe-dot);border-bottom-color:var(--accent-2);border-left-color:var(--fg);outline-color:var(--bg)';
    this.#probe.style.setProperty('transition', 'none', 'important');
    document.body.append(this.#probe);
    this.#context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  }

  /** @returns {[number, number, number]} channels in 0..1 */
  toUnitRgb(cssColor) {
    const ctx = this.#context;
    ctx.fillStyle = '#000';
    ctx.fillStyle = cssColor;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  }

  toByteRgb(cssColor) {
    return this.toUnitRgb(cssColor).map((channel) => Math.round(channel * 255));
  }

  snapshot() {
    const style = getComputedStyle(this.#probe);
    return {
      accent: this.toUnitRgb(style.color),
      accentSecondary: this.toUnitRgb(style.borderBottomColor),
      globeBody: this.toUnitRgb(style.backgroundColor),
      globeDot: this.toUnitRgb(style.borderTopColor),
      background: this.toUnitRgb(style.outlineColor),
    };
  }

  backgroundAsCss() {
    return `rgb(${this.toByteRgb(getComputedStyle(this.#probe).outlineColor).join(' ')})`;
  }

  accentBytes() {
    return this.toByteRgb(getComputedStyle(this.#probe).color);
  }

  /** The text color of the page: the --fg token, which the body paints its text with. */
  foregroundBytes() {
    return this.toByteRgb(getComputedStyle(this.#probe).borderLeftColor);
  }
}
