import { describe, it, expect } from 'vitest';
import { Contrast } from '@site/js/shared/contrast.js';

const opaque = (r, g, b) => ({ r, g, b, a: 1 });
const WHITE = opaque(255, 255, 255);
const BLACK = opaque(0, 0, 0);

describe('Contrast.parse', () => {
  it.each([
    ['rgb(17, 19, 24)', { r: 17, g: 19, b: 24, a: 1 }],
    ['rgb(17 19 24)', { r: 17, g: 19, b: 24, a: 1 }],
    ['rgba(17, 19, 24, 0.25)', { r: 17, g: 19, b: 24, a: 0.25 }],
    ['rgb(17 19 24 / 40%)', { r: 17, g: 19, b: 24, a: 0.4 }],
    ['rgb(50% 25% 100%)', { r: 128, g: 64, b: 255, a: 1 }],
    ['rgba(0, 0, 0, 0)', { r: 0, g: 0, b: 0, a: 0 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
    ['  RGB(1 2 3)  ', { r: 1, g: 2, b: 3, a: 1 }],
  ])('reads %s', (css, expected) => expect(Contrast.parse(css)).toStrictEqual(expected));

  it.each([
    ['#fa0', { r: 255, g: 170, b: 0, a: 1 }],
    ['#FFAA00', { r: 255, g: 170, b: 0, a: 1 }],
    ['#fa08', { r: 255, g: 170, b: 0, a: 136 / 255 }],
    ['#11223344', { r: 17, g: 34, b: 51, a: 68 / 255 }],
  ])('reads the hex color %s', (css, expected) =>
    expect(Contrast.parse(css)).toStrictEqual(expected),
  );

  it('reads color(srgb ...) with channels in 0..1, rounding half up like a screen does', () => {
    expect(Contrast.parse('color(srgb 0.5 0.25 1 / 0.5)')).toStrictEqual({
      r: 128,
      g: 64,
      b: 255,
      a: 0.5,
    });
    expect(Contrast.parse('color(srgb 0 0 0)')).toStrictEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  // The expected bytes are what Chromium's canvas reads back for the same oklch() color.
  it.each([
    ['oklch(0.88 0.23 128)', { r: 171, g: 242, b: 1, a: 1 }],
    ['oklch(0.56 0.19 128)', { r: 83, g: 135, b: 0, a: 1 }],
    ['oklch(0.88 0.23 0)', { r: 255, g: 139, b: 209, a: 1 }],
    ['oklch(0.56 0.19 250)', { r: 0, g: 117, b: 221, a: 1 }],
    ['oklch(0.56 0.19 180)', { r: 0, g: 149, b: 121, a: 1 }],
    ['oklch(0.76 0.19 250)', { r: 58, g: 182, b: 255, a: 1 }],
    ['oklch(56% 0.19 128)', { r: 83, g: 135, b: 0, a: 1 }],
    ['oklch(0.56 0.19 128deg)', { r: 83, g: 135, b: 0, a: 1 }],
    ['oklch(0.56 0.19 128 / 0.12)', { r: 83, g: 135, b: 0, a: 0.12 }],
    ['oklch(0.56 47.5% 128)', { r: 83, g: 135, b: 0, a: 1 }],
  ])('reads %s as the bytes a browser paints', (css, expected) =>
    expect(Contrast.parse(css)).toStrictEqual(expected),
  );

  it('clips what falls outside the sRGB gamut', () => {
    expect(Contrast.parse('oklch(0.88 0.4 150)')).toStrictEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('reads oklab() with the same colors as oklch()', () => {
    expect(Contrast.parse('oklab(0.56 -0.11697568031187508 0.14972204318527718)')).toStrictEqual({
      r: 83,
      g: 135,
      b: 0,
      a: 1,
    });
    expect(Contrast.parse('oklab(0.5 0 0 / 0.5)')).toStrictEqual({ r: 99, g: 99, b: 99, a: 0.5 });
  });

  it('reads black and white from oklch lightness 0 and 1', () => {
    expect([Contrast.parse('oklch(0 0 0)'), Contrast.parse('oklch(1 0 0)')]).toStrictEqual([
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 },
    ]);
  });

  it('treats none as zero', () => {
    expect(Contrast.parse('oklch(0.56 none none)')).toStrictEqual(
      Contrast.parse('oklch(0.56 0 0)'),
    );
  });

  it.each([
    'hsl(0 0% 0%)',
    'red',
    'color(display-p3 1 0 0)',
    'lab(50 0 0)',
    '#12',
    '#12345',
    '#gg0000',
    'not a color',
    '',
  ])('rejects %j, naming it', (css) => {
    expect(() => Contrast.parse(css)).toThrow(`Unsupported color: ${css}`);
  });
});

describe('Contrast.over', () => {
  it('returns the top color when it is opaque', () =>
    expect(Contrast.over(opaque(10, 20, 30), opaque(200, 100, 50))).toStrictEqual(
      opaque(10, 20, 30),
    ));

  it('returns the base when the top is transparent', () =>
    expect(Contrast.over({ r: 9, g: 9, b: 9, a: 0 }, opaque(200, 100, 50))).toStrictEqual(
      opaque(200, 100, 50),
    ));

  it('mixes by alpha and rounds half up', () => {
    expect(Contrast.over({ r: 255, g: 0, b: 0, a: 0.5 }, opaque(0, 0, 255))).toStrictEqual({
      r: 128,
      g: 0,
      b: 128,
      a: 1,
    });
    expect(Contrast.over({ r: 0, g: 0, b: 0, a: 0.12 }, opaque(240, 249, 231))).toStrictEqual({
      r: 211,
      g: 219,
      b: 203,
      a: 1,
    });
  });

  it('keeps a translucent result translucent: alpha of both layers combined', () => {
    expect(
      Contrast.over({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 0.5 }),
    ).toStrictEqual({ r: 170, g: 0, b: 85, a: 0.75 });
  });

  it('is clear when both layers are', () => {
    expect(Contrast.over({ r: 1, g: 2, b: 3, a: 0 }, { r: 4, g: 5, b: 6, a: 0 })).toStrictEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });
});

describe('Contrast.luminance', () => {
  it('is 0 for black and 1 for white', () =>
    expect([Contrast.luminance(BLACK), Contrast.luminance(WHITE)]).toStrictEqual([0, 1]));

  it('weights the channels 0.2126, 0.7152 and 0.0722', () => {
    expect(Contrast.luminance(opaque(255, 0, 0))).toBeCloseTo(0.2126, 12);
    expect(Contrast.luminance(opaque(0, 255, 0))).toBeCloseTo(0.7152, 12);
    expect(Contrast.luminance(opaque(0, 0, 255))).toBeCloseTo(0.0722, 12);
  });

  // Computed apart from the class, with the sRGB transfer curve of WCAG 2.2.
  it.each([
    [opaque(128, 128, 128), 0.21586050011389923],
    [opaque(0x76, 0x76, 0x76), 0.18116424424986022],
    [opaque(0x77, 0x77, 0x77), 0.184474994500441],
    [opaque(83, 135, 0), 0.19166945701633528],
  ])('is %j for %j', (color, expected) =>
    expect(Contrast.luminance(color)).toBeCloseTo(expected, 12),
  );

  it('ignores alpha', () =>
    expect(Contrast.luminance({ r: 128, g: 128, b: 128, a: 0.1 })).toBe(
      Contrast.luminance(opaque(128, 128, 128)),
    ));

  it('switches curves at 0.04045 of full scale: byte 10 is still on the linear part, byte 11 is not', () => {
    expect(Contrast.luminance(opaque(10, 10, 10))).toBeCloseTo(10 / 255 / 12.92, 12);
    expect(Contrast.luminance(opaque(11, 11, 11))).toBeCloseTo(
      ((11 / 255 + 0.055) / 1.055) ** 2.4,
      12,
    );
  });
});

describe('Contrast.ratio', () => {
  it('is 21 for black on white, both ways round, and 1 for a color on itself', () => {
    expect([
      Contrast.ratio(BLACK, WHITE),
      Contrast.ratio(WHITE, BLACK),
      Contrast.ratio(WHITE, WHITE),
    ]).toStrictEqual([21, 21, 1]);
  });

  it.each([
    [opaque(0x76, 0x76, 0x76), WHITE, 4.542224959605253],
    [opaque(0x77, 0x77, 0x77), WHITE, 4.478089453577214],
    [opaque(128, 128, 128), WHITE, 3.9494396480491156],
    [opaque(0, 0, 255), WHITE, 8.592471358428805],
    [opaque(83, 135, 0), opaque(240, 249, 231), 4.015656402258115],
  ])('is the published WCAG figure for %j on %j', (foreground, background, expected) => {
    expect(Contrast.ratio(foreground, background)).toBeCloseTo(expected, 12);
  });

  it('paints a translucent foreground over the background first', () => {
    expect(Contrast.ratio({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toBe(
      Contrast.ratio(opaque(128, 128, 128), WHITE),
    );
  });

  it('leaves the 4.5 threshold on the right side: #767676 passes on white, #777777 does not', () => {
    expect([
      Contrast.ratio(opaque(0x76, 0x76, 0x76), WHITE) >= Contrast.AA_TEXT,
      Contrast.ratio(opaque(0x77, 0x77, 0x77), WHITE) >= Contrast.AA_TEXT,
    ]).toStrictEqual([true, false]);
  });
});

describe('thresholds', () => {
  it('names the WCAG 2.2 levels', () => {
    expect([
      Contrast.AA_TEXT,
      Contrast.AA_LARGE_TEXT,
      Contrast.AAA_TEXT,
      Contrast.AAA_LARGE_TEXT,
      Contrast.COMPONENT,
    ]).toStrictEqual([4.5, 3, 7, 4.5, 3]);
  });

  it('picks the level by text size', () => {
    expect([
      Contrast.minimum(false),
      Contrast.minimum(true),
      Contrast.enhanced(false),
      Contrast.enhanced(true),
    ]).toStrictEqual([4.5, 3, 7, 4.5]);
  });

  it.each([
    [24, 400, true],
    [23.99, 400, false],
    [40, 300, true],
    [(14 * 96) / 72, 700, true],
    [18.66, 700, false],
    [18.67, 700, true],
    [18.67, 699, false],
    [18.67, '700', true],
    [18.67, '400', false],
    [16, 700, false],
    [12, 900, false],
  ])('treats %d px at weight %s as large text: %s', (size, weight, large) => {
    expect(Contrast.isLargeText(size, weight)).toBe(large);
  });
});

describe('Contrast.truncate', () => {
  it.each([
    [4.499, 4.49],
    [4.5, 4.5],
    [21, 21],
    [2.675, 2.67],
    [4.6789, 4.67],
    [1, 1],
  ])('cuts %d to %d, two decimals', (ratio, expected) => {
    expect(Contrast.truncate(ratio)).toBe(expected);
  });

  it('cuts to the digits asked for', () =>
    expect([
      Contrast.truncate(4.6789, 1),
      Contrast.truncate(4.6789, 3),
      Contrast.truncate(4.6789, 0),
    ]).toStrictEqual([4.6, 4.678, 4]));

  it('does not let a float error a hair under a value cost a hundredth', () =>
    expect(Contrast.truncate(4.4999999999999)).toBe(4.5));
});
