/**
 * WCAG 2.2 contrast math on the colors a browser reports for computed styles.
 * Colors are { r, g, b, a }: bytes for the channels, 0..1 for alpha, as the screen shows them.
 */
export class Contrast {
  /** 1.4.3 Contrast (Minimum), 1.4.6 Contrast (Enhanced) and 1.4.11 Non-text Contrast. */
  static AA_TEXT = 4.5;
  static AA_LARGE_TEXT = 3;
  static AAA_TEXT = 7;
  static AAA_LARGE_TEXT = 4.5;
  static COMPONENT = 3;

  /** Large text is 18 pt, or 14 pt in bold, which are 24 px and 18.666 px. */
  static #LARGE_PX = 24;
  static #LARGE_BOLD_PX = (14 * 96) / 72;
  static #BOLD_WEIGHT = 700;

  /** Parses a computed-style color: rgb(), rgba(), #hex, color(srgb ...), oklab(), oklch() or transparent. */
  static parse(css) {
    const text = String(css).trim().toLowerCase();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (text.startsWith('#')) return Contrast.#parseHex(text);
    const call = /^([a-z]+)\((.*)\)$/.exec(text);
    if (!call) throw new Error(`Unsupported color: ${css}`);
    const [, name, body] = call;
    const parts = body
      .trim()
      .split(/\s*[,/]\s*|\s+/)
      .filter(Boolean);
    switch (name) {
      case 'rgb':
      case 'rgba':
        return Contrast.#parseRgb(parts);
      case 'color':
        return Contrast.#parseColorFunction(parts, css);
      case 'oklab':
        return Contrast.#parseOklab(parts);
      case 'oklch':
        return Contrast.#parseOklch(parts);
      default:
        throw new Error(`Unsupported color: ${css}`);
    }
  }

  /** `top` painted over `base`: what the screen shows where both overlap. */
  static over(top, base) {
    const alpha = top.a + base.a * (1 - top.a);
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (channel) =>
      Math.round((top[channel] * top.a + base[channel] * base.a * (1 - top.a)) / alpha);
    return { r: mix('r'), g: mix('g'), b: mix('b'), a: alpha };
  }

  /** WCAG relative luminance, 0 for black to 1 for white. */
  static luminance({ r, g, b }) {
    const linear = (byte) => {
      const unit = byte / 255;
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }

  /** Contrast ratio, 1 to 21. A translucent foreground is painted over the background first. */
  static ratio(foreground, background) {
    const top = foreground.a < 1 ? Contrast.over(foreground, background) : foreground;
    const [lighter, darker] = [Contrast.luminance(top), Contrast.luminance(background)].sort(
      (a, b) => b - a,
    );
    return (lighter + 0.05) / (darker + 0.05);
  }

  static isLargeText(fontSizePx, fontWeight) {
    return (
      fontSizePx >= Contrast.#LARGE_PX ||
      (fontSizePx >= Contrast.#LARGE_BOLD_PX && Number(fontWeight) >= Contrast.#BOLD_WEIGHT)
    );
  }

  static minimum(large) {
    return large ? Contrast.AA_LARGE_TEXT : Contrast.AA_TEXT;
  }
  static enhanced(large) {
    return large ? Contrast.AAA_LARGE_TEXT : Contrast.AAA_TEXT;
  }

  /** Cuts, never rounds, so 4.499 does not pass for 4.5. */
  static truncate(ratio, digits = 2) {
    const scale = 10 ** digits;
    return Math.floor(ratio * scale + 1e-9) / scale;
  }

  static #parseHex(text) {
    const digits = text.slice(1);
    const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
    if (!/^[0-9a-f]+$/.test(full) || (full.length !== 6 && full.length !== 8))
      throw new Error(`Unsupported color: ${text}`);
    const [r, g, b, a = 255] = full.match(/../g).map((pair) => Number.parseInt(pair, 16));
    return { r, g, b, a: a / 255 };
  }

  static #number(token, percentScale = 1) {
    if (token === 'none') return 0;
    return token.endsWith('%')
      ? (Number.parseFloat(token) / 100) * percentScale
      : Number.parseFloat(token);
  }

  static #alpha(token) {
    return token === undefined ? 1 : Math.min(1, Math.max(0, Contrast.#number(token)));
  }

  static #parseRgb([red, green, blue, alpha]) {
    const channel = (token) => Math.round(Math.min(255, Math.max(0, Contrast.#number(token, 255))));
    return { r: channel(red), g: channel(green), b: channel(blue), a: Contrast.#alpha(alpha) };
  }

  static #parseColorFunction([space, red, green, blue, alpha], css) {
    if (space !== 'srgb') throw new Error(`Unsupported color: ${css}`);
    const channel = (token) => Contrast.#encode(Contrast.#number(token), false);
    return { r: channel(red), g: channel(green), b: channel(blue), a: Contrast.#alpha(alpha) };
  }

  static #parseOklab([lightness, a, b, alpha]) {
    return Contrast.#fromOklab(
      Contrast.#number(lightness),
      Contrast.#number(a, 0.4),
      Contrast.#number(b, 0.4),
      Contrast.#alpha(alpha),
    );
  }

  static #parseOklch([lightness, chroma, hue, alpha]) {
    const radians = (Contrast.#number(hue) * Math.PI) / 180;
    const c = Contrast.#number(chroma, 0.4);
    return Contrast.#fromOklab(
      Contrast.#number(lightness),
      c * Math.cos(radians),
      c * Math.sin(radians),
      Contrast.#alpha(alpha),
    );
  }

  /** Oklab to sRGB bytes. A browser clips what falls outside the sRGB gamut, so this does too. */
  static #fromOklab(lightness, a, b, alpha) {
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return {
      r: Contrast.#encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, true),
      g: Contrast.#encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, true),
      b: Contrast.#encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, true),
      a: alpha,
    };
  }

  /** A 0..1 channel to a byte, gamma encoded when it is linear light. */
  static #encode(value, linear) {
    const unit = Math.min(1, Math.max(0, value));
    const encoded = linear
      ? unit <= 0.0031308
        ? 12.92 * unit
        : 1.055 * unit ** (1 / 2.4) - 0.055
      : unit;
    return Math.round(encoded * 255);
  }
}
