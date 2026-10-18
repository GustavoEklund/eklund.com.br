import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Contrast } from '@site/js/shared/contrast.js';

const byte = fc.integer({ min: 0, max: 255 });
const opaque = fc.record({ r: byte, g: byte, b: byte, a: fc.constant(1) });
const alpha = fc.integer({ min: 0, max: 100 }).map((percent) => percent / 100);
const translucent = fc.record({ r: byte, g: byte, b: byte, a: alpha });

describe('Contrast properties', () => {
  it('ratio is the same either way round', () =>
    fc.assert(
      fc.property(opaque, opaque, (a, b) => {
        expect(Contrast.ratio(a, b)).toBe(Contrast.ratio(b, a));
      }),
    ));

  it('ratio stays between 1 and 21', () =>
    fc.assert(
      fc.property(opaque, opaque, (a, b) => {
        const ratio = Contrast.ratio(a, b);
        expect(ratio >= 1 && ratio <= 21).toBe(true);
      }),
    ));

  it('a color on itself is exactly 1', () =>
    fc.assert(
      fc.property(opaque, (color) => {
        expect(Contrast.ratio(color, color)).toBe(1);
      }),
    ));

  it('ratio is (lighter + 0.05) / (darker + 0.05) of the two luminances', () =>
    fc.assert(
      fc.property(opaque, opaque, (a, b) => {
        const [lighter, darker] = [Contrast.luminance(a), Contrast.luminance(b)].sort(
          (x, y) => y - x,
        );
        expect(Contrast.ratio(a, b)).toBe((lighter + 0.05) / (darker + 0.05));
      }),
    ));

  it('luminance never decreases when a channel gets brighter', () =>
    fc.assert(
      fc.property(opaque, fc.constantFrom('r', 'g', 'b'), byte, (color, channel, other) => {
        const [low, high] = [Math.min(color[channel], other), Math.max(color[channel], other)];
        expect(
          Contrast.luminance({ ...color, [channel]: low }) <=
            Contrast.luminance({ ...color, [channel]: high }),
        ).toBe(true);
      }),
    ));

  it('against black, a lighter color has a higher ratio, and against white a darker one does', () =>
    fc.assert(
      fc.property(opaque, opaque, (a, b) => {
        const [aLum, bLum] = [Contrast.luminance(a), Contrast.luminance(b)];
        const black = { r: 0, g: 0, b: 0, a: 1 };
        const white = { r: 255, g: 255, b: 255, a: 1 };
        expect(Contrast.ratio(a, black) >= Contrast.ratio(b, black)).toBe(aLum >= bLum);
        expect(Contrast.ratio(a, white) >= Contrast.ratio(b, white)).toBe(aLum <= bLum);
      }),
    ));

  it('over keeps an opaque top, and shows the base through a transparent one', () =>
    fc.assert(
      fc.property(opaque, translucent, (top, base) => {
        expect(Contrast.over(top, base)).toStrictEqual({ r: top.r, g: top.g, b: top.b, a: 1 });
        expect(Contrast.over({ ...top, a: 0 }, base)).toStrictEqual(
          base.a === 0
            ? { r: 0, g: 0, b: 0, a: 0 }
            : { r: base.r, g: base.g, b: base.b, a: base.a },
        );
      }),
    ));

  it('over an opaque base gives an opaque color whose channels lie between the two', () =>
    fc.assert(
      fc.property(translucent, opaque, (top, base) => {
        const result = Contrast.over(top, base);
        expect(result.a).toBe(1);
        for (const channel of ['r', 'g', 'b']) {
          expect(
            result[channel] >= Math.min(top[channel], base[channel]) &&
              result[channel] <= Math.max(top[channel], base[channel]),
          ).toBe(true);
        }
      }),
    ));

  it('over matches the straight blend of each channel, rounded', () =>
    fc.assert(
      fc.property(translucent, opaque, (top, base) => {
        const result = Contrast.over(top, base);
        expect([result.r, result.g, result.b]).toStrictEqual(
          ['r', 'g', 'b'].map((channel) =>
            Math.round(top[channel] * top.a + base[channel] * (1 - top.a)),
          ),
        );
      }),
    ));

  it('parse reads every rgb() and hex spelling of a byte color the same', () =>
    fc.assert(
      fc.property(opaque, (color) => {
        const hex = `#${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        const expected = { r: color.r, g: color.g, b: color.b, a: 1 };
        expect(Contrast.parse(`rgb(${color.r}, ${color.g}, ${color.b})`)).toStrictEqual(expected);
        expect(Contrast.parse(`rgb(${color.r} ${color.g} ${color.b})`)).toStrictEqual(expected);
        expect(Contrast.parse(hex)).toStrictEqual(expected);
        expect(Contrast.parse(hex.toUpperCase())).toStrictEqual(expected);
        expect(
          Contrast.parse(`color(srgb ${color.r / 255} ${color.g / 255} ${color.b / 255})`),
        ).toStrictEqual(expected);
      }),
    ));

  it('parse reads an oklch() color as bytes, whatever the hue, lightness and chroma', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 360 }),
        (lightness, chroma, hue) => {
          const color = Contrast.parse(`oklch(${lightness / 1000} ${chroma / 1000} ${hue})`);
          for (const channel of [color.r, color.g, color.b])
            expect(Number.isInteger(channel) && channel >= 0 && channel <= 255).toBe(true);
          expect(color.a).toBe(1);
        },
      ),
    ));

  it('parse gives the same color for oklch() and for the oklab() with its a and b', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 359 }),
        (lightness, chroma, hue) => {
          const radians = (hue * Math.PI) / 180;
          const a = (chroma / 100) * Math.cos(radians);
          const b = (chroma / 100) * Math.sin(radians);
          expect(Contrast.parse(`oklab(${lightness / 100} ${a} ${b})`)).toStrictEqual(
            Contrast.parse(`oklch(${lightness / 100} ${chroma / 100} ${hue})`),
          );
        },
      ),
    ));

  it('large text is a monotone property of size: bigger never stops being large', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }).map((tenths) => tenths / 10),
        fc.integer({ min: 0, max: 300 }).map((tenths) => tenths / 10),
        fc.constantFrom(400, 500, 700, 900),
        (size, extra, weight) => {
          expect(
            !Contrast.isLargeText(size, weight) || Contrast.isLargeText(size + extra, weight),
          ).toBe(true);
        },
      ),
    ));

  it('truncate never rounds up and stays within a hundredth of the ratio', () =>
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2100 }).map((hundredths) => hundredths / 100),
        fc.integer({ min: 0, max: 99 }),
        (base, extra) => {
          const ratio = base + extra / 10000;
          const cut = Contrast.truncate(ratio);
          expect(cut <= ratio + 1e-9 && ratio - cut < 0.01 + 1e-9).toBe(true);
        },
      ),
    ));
});
