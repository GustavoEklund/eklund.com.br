import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeColors } from '@site/js/shared/theme-colors.js';

const TOKENS = {
  '--accent': 'rgb(10, 20, 30)',
  '--accent-2': 'rgb(40, 50, 60)',
  '--globe-body': 'rgb(70, 80, 90)',
  '--globe-dot': 'rgb(100, 110, 120)',
  '--bg': 'rgb(130, 140, 150)',
  '--fg': 'rgb(1, 2, 3)',
};
const unit = (bytes) => bytes.map((channel) => channel / 255);
const setTokens = (tokens) => {
  for (const [name, value] of Object.entries(tokens))
    document.documentElement.style.setProperty(name, value);
};

describe('ThemeColors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setTokens(TOKENS);
  });
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
  });

  it('adds one hidden probe element to the body', () => {
    new ThemeColors();
    expect(document.body.children).toHaveLength(1);
    const probe = document.body.firstElementChild;
    expect([
      probe.tagName,
      probe.style.position,
      probe.style.width,
      probe.style.height,
    ]).toStrictEqual(['I', 'absolute', '0px', '0px']);
  });

  it('reads the five tokens as channels in 0..1', () => {
    expect(new ThemeColors().snapshot()).toStrictEqual({
      accent: unit([10, 20, 30]),
      accentSecondary: unit([40, 50, 60]),
      globeBody: unit([70, 80, 90]),
      globeDot: unit([100, 110, 120]),
      background: unit([130, 140, 150]),
    });
  });

  it('follows the tokens when they change', () => {
    const colors = new ThemeColors();
    setTokens({ '--accent': 'rgb(255, 0, 128)' });
    expect(colors.snapshot().accent).toStrictEqual(unit([255, 0, 128]));
    expect(colors.accentBytes()).toStrictEqual([255, 0, 128]);
  });

  it('resolves light-dark() with the page color scheme', () => {
    setTokens({ '--accent': 'light-dark(rgb(255, 0, 0), rgb(0, 0, 255))' });
    const colors = new ThemeColors();
    document.documentElement.style.colorScheme = 'dark';
    expect(colors.accentBytes()).toStrictEqual([0, 0, 255]);
    document.documentElement.style.colorScheme = 'light';
    expect(colors.accentBytes()).toStrictEqual([255, 0, 0]);
  });

  it('writes the background as a space-separated rgb() color', () =>
    expect(new ThemeColors().backgroundAsCss()).toBe('rgb(130 140 150)'));
  it('reads the accent as bytes', () =>
    expect(new ThemeColors().accentBytes()).toStrictEqual([10, 20, 30]));
  it('reads the text color of the page, the --fg token, as bytes', () =>
    expect(new ThemeColors().foregroundBytes()).toStrictEqual([1, 2, 3]));

  describe('when every element has a transition, as the page does while motion is paused', () => {
    let rules;
    beforeEach(() => {
      rules = document.createElement('style');
      rules.textContent = `
        :root { --accent: rgb(10, 20, 30); --accent-2: rgb(40, 50, 60); --globe-body: rgb(70, 80, 90);
          --globe-dot: rgb(100, 110, 120); --bg: rgb(130, 140, 150); --fg: rgb(1, 2, 3); }
        :root[data-theme='light'] { --accent: rgb(210, 220, 230); --accent-2: rgb(240, 250, 5); --globe-body: rgb(15, 25, 35);
          --globe-dot: rgb(45, 55, 65); --bg: rgb(75, 85, 95); --fg: rgb(105, 115, 125); }
        * { transition-duration: 0.01ms !important; }`;
      document.head.append(rules);
      document.documentElement.removeAttribute('style');
    });
    afterEach(() => {
      rules.remove();
      delete document.documentElement.dataset.theme;
    });

    it('reads the colors of the theme just switched to, not the ones it left', () => {
      const colors = new ThemeColors();
      colors.snapshot(); // the probe has its style: the switch below is a change of it, which a transition would hold back
      document.documentElement.dataset.theme = 'light';
      expect([
        colors.snapshot(),
        colors.backgroundAsCss(),
        colors.accentBytes(),
        colors.foregroundBytes(),
      ]).toStrictEqual([
        {
          accent: unit([210, 220, 230]),
          accentSecondary: unit([240, 250, 5]),
          globeBody: unit([15, 25, 35]),
          globeDot: unit([45, 55, 65]),
          background: unit([75, 85, 95]),
        },
        'rgb(75 85 95)',
        [210, 220, 230],
        [105, 115, 125],
      ]);
    });

    it('and back again', () => {
      document.documentElement.dataset.theme = 'light';
      const colors = new ThemeColors();
      colors.snapshot();
      delete document.documentElement.dataset.theme;
      expect(colors.accentBytes()).toStrictEqual([10, 20, 30]);
    });
  });

  describe('toByteRgb', () => {
    it.each([
      ['#ff8000', [255, 128, 0]],
      ['rgb(0, 255, 64)', [0, 255, 64]],
      ['hsl(120 100% 50%)', [0, 255, 0]],
      ['oklch(1 0 0)', [255, 255, 255]],
      ['oklch(0 0 0)', [0, 0, 0]],
      ['white', [255, 255, 255]],
    ])('turns %s into %j', (color, bytes) =>
      expect(new ThemeColors().toByteRgb(color)).toStrictEqual(bytes),
    );

    it.each([['transparent'], ['not a color'], ['']])('falls back to black for %j', (color) =>
      expect(new ThemeColors().toByteRgb(color)).toStrictEqual([0, 0, 0]),
    );

    it('forgets the previous color: a bad value after a good one is black, not the good one', () => {
      const colors = new ThemeColors();
      colors.toByteRgb('rgb(200, 100, 50)');
      expect(colors.toByteRgb('nonsense')).toStrictEqual([0, 0, 0]);
    });
  });

  describe('toUnitRgb', () => {
    it('divides each byte by 255', () =>
      expect(new ThemeColors().toUnitRgb('rgb(51, 102, 255)')).toStrictEqual([
        51 / 255,
        102 / 255,
        1,
      ]));
  });
});
