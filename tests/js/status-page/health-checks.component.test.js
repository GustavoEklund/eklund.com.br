import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Level,
  HealthCheck,
  DocumentCheck,
  FontsCheck,
  GlobeCheck,
  MainThreadCheck,
  LayoutShiftCheck,
  DependenciesCheck,
  PlatformCheck,
  ContrastCheck,
  HealthChecks,
} from '@site/js/status-page/health-checks.js';
import { ContrastReport } from '@site/js/shared/contrast-report.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const text = (key, params) => DictionaryText.fill('pt-BR', key, params);
const plural = (key, count, params) => DictionaryText.plural('pt-BR', key, count, params);
const setFonts = (faces) =>
  Object.defineProperty(document, 'fonts', { configurable: true, value: faces });

describe('health checks', () => {
  let translator;

  beforeEach(() => {
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    Formatter.use('pt-BR');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    delete document.fonts;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('numbers the levels 0, 1 and 2 and freezes them', () => {
    expect(Level).toStrictEqual({ OPERATIONAL: 0, DEGRADED: 1, DOWN: 2 });
    expect(Object.isFrozen(Level)).toBe(true);
  });

  describe('HealthCheck', () => {
    it('refuses to be used without an evaluate()', () => {
      expect(() => new HealthCheck(translator, 'fonts').evaluate()).toThrow(
        'HealthCheck must implement evaluate()',
      );
    });

    it('names the subclass that forgot to implement it', () => {
      class ForgetfulCheck extends HealthCheck {}
      expect(() => new ForgetfulCheck(translator, 'fonts').evaluate()).toThrow(
        'ForgetfulCheck must implement evaluate()',
      );
    });

    it('wraps a level and a detail in a result', () =>
      expect(new HealthCheck(translator, 'fonts').result(1, 'x')).toStrictEqual({
        level: 1,
        detail: 'x',
      }));

    it('looks its texts up under status.checks.<key> and follows the language', () => {
      const check = new HealthCheck(translator, 'fonts');
      expect([check.nameKey, check.name, check.text('detail', { loaded: 2 })]).toStrictEqual([
        'status.checks.fonts.name',
        'Fontes',
        text('status.checks.fonts.detail', { loaded: 2 }),
      ]);
      translator.setLocale('en-US');
      expect(check.name).toBe(DictionaryText.entry('en-US', 'status.checks.fonts.name'));
    });

    it('picks the plural form by count', () => {
      const check = new HealthCheck(translator, 'mainThread');
      expect([check.pluralText('detail', 1), check.pluralText('detail', 4)]).toStrictEqual([
        plural('status.checks.mainThread.detail', 1),
        plural('status.checks.mainThread.detail', 4),
      ]);
    });
  });

  describe('DocumentCheck', () => {
    const check = (readings) => new DocumentCheck({ translator, readings }).evaluate();

    it('is always operational and reports kilobytes, requests and own files', () => {
      expect(
        check({ transferredBytes: 20480, requestCount: 3, ownResources: [{}, {}] }),
      ).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.document.detail', {
          kilobytes: 20,
          requests: plural('status.checks.document.requests', 3),
          files: 3,
        }),
      });
    });

    it('reserves room for four digits of kilobytes and three of requests and files, with the plural', () => {
      expect(
        new DocumentCheck({
          translator,
          readings: { transferredBytes: 0, requestCount: 1, ownResources: [] },
        }).reserve(),
      ).toBe('9999 KB na rede · 999 requisições · 999 arquivos do site');
    });

    it('uses the singular for one request and counts the page itself as a file', () => {
      expect(check({ transferredBytes: 0, requestCount: 1, ownResources: [] }).detail).toBe(
        text('status.checks.document.detail', {
          kilobytes: 0,
          requests: plural('status.checks.document.requests', 1),
          files: 1,
        }),
      );
    });

    it.each([
      [1536, 2],
      [2560, 3],
      [511, 0],
      [512, 1],
    ])('rounds %d bytes to %d KB', (bytes, kilobytes) => {
      expect(check({ transferredBytes: bytes, requestCount: 2, ownResources: [] }).detail).toBe(
        text('status.checks.document.detail', {
          kilobytes,
          requests: plural('status.checks.document.requests', 2),
          files: 1,
        }),
      );
    });
  });

  describe('FontsCheck', () => {
    const face = (family, status = 'loaded') => ({ family, status });
    const evaluate = () => new FontsCheck({ translator }).evaluate();

    it('is operational with three loaded families', () => {
      setFonts([
        face('"Bricolage Grotesque"'),
        face('"Instrument Serif"'),
        face('"JetBrains Mono"'),
      ]);
      expect(evaluate()).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.fonts.detail', { loaded: 3 }),
      });
    });

    it('is degraded with two', () => {
      setFonts([face('"Bricolage Grotesque"'), face('"Instrument Serif"')]);
      expect(evaluate()).toStrictEqual({
        level: Level.DEGRADED,
        detail: text('status.checks.fonts.detail', { loaded: 2 }),
      });
    });

    it('does not count the metric-matched stand-ins: they are not font files', () => {
      setFonts([
        face('"Bricolage Grotesque"'),
        face('"Bricolage Grotesque Fallback"'),
        face('JetBrains Mono Fallback'),
        face('"Instrument Serif Fallback"'),
      ]);
      expect(evaluate()).toStrictEqual({
        level: Level.DEGRADED,
        detail: text('status.checks.fonts.detail', { loaded: 1 }),
      });
    });

    it('counts families, not faces: three weights of one family are one', () => {
      setFonts([face('"JetBrains Mono"'), face('JetBrains Mono'), face('"JetBrains Mono"')]);
      expect(evaluate().detail).toBe(text('status.checks.fonts.detail', { loaded: 1 }));
    });

    it('ignores faces that are still loading or failed', () => {
      setFonts([face('A'), face('B', 'loading'), face('C', 'error'), face('D', 'unloaded')]);
      expect(evaluate().detail).toBe(text('status.checks.fonts.detail', { loaded: 1 }));
    });

    it('is degraded with no fonts at all', () => {
      setFonts([]);
      expect(evaluate()).toStrictEqual({
        level: Level.DEGRADED,
        detail: text('status.checks.fonts.detail', { loaded: 0 }),
      });
    });
  });

  describe('GlobeCheck', () => {
    const globe = (overrides = {}) => ({
      isRunning: true,
      frameRate: 60,
      pointCount: 10000,
      instanceCount: 2,
      pixelRatio: 2,
      ...overrides,
    });
    const evaluate = (instance) => new GlobeCheck({ translator, globe: instance }).evaluate();

    it('is down, saying WebGL2 is unavailable, when there is no globe', () => {
      expect(evaluate(null)).toStrictEqual({
        level: Level.DOWN,
        detail: text('status.checks.globe.unavailable'),
      });
    });

    it('is operational at 60 fps, reporting points (times instances), fps and pixel ratio', () => {
      expect(evaluate(globe())).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.globe.detail', { points: '20.000', fps: '60 fps', dpr: 2 }),
      });
    });

    it('reserves room for the longer of "999 fps" and the paused text, with the same points and pixel ratio', () => {
      expect(new GlobeCheck({ translator, globe: globe() }).reserve()).toBe(
        text('status.checks.globe.detail', {
          points: '20.000',
          fps: text('status.checks.globe.paused'),
          dpr: 2,
        }),
      );
    });

    it('reserves nothing without a globe: its row says WebGL2 is unavailable and that is final', () => {
      expect(new GlobeCheck({ translator, globe: null }).reserve()).toBeNull();
    });

    it('is degraded below 24 fps and fine at exactly 24', () => {
      expect([
        evaluate(globe({ frameRate: 23 })).level,
        evaluate(globe({ frameRate: 24 })).level,
      ]).toStrictEqual([Level.DEGRADED, Level.OPERATIONAL]);
    });

    it('shows a dash for a frame rate that is not measured yet, and is not degraded', () => {
      expect(evaluate(globe({ frameRate: 0 }))).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.globe.detail', { points: '20.000', fps: '— fps', dpr: 2 }),
      });
    });

    it('says it is paused off screen, and is not degraded even with a low last rate', () => {
      expect(evaluate(globe({ isRunning: false, frameRate: 5 }))).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.globe.detail', {
          points: '20.000',
          fps: text('status.checks.globe.paused'),
          dpr: 2,
        }),
      });
    });

    it('formats the point count for the language', () => {
      Formatter.use('en-US');
      expect(evaluate(globe()).detail).toBe(
        text('status.checks.globe.detail', { points: '20,000', fps: '60 fps', dpr: 2 }),
      );
    });
  });

  describe('MainThreadCheck', () => {
    const evaluate = (longTaskCount) =>
      new MainThreadCheck({ translator, readings: { longTaskCount } }).evaluate();

    it.each([
      [0, Level.OPERATIONAL],
      [1, Level.OPERATIONAL],
      [2, Level.OPERATIONAL],
      [3, Level.DEGRADED],
      [10, Level.DEGRADED],
    ])('%d long tasks is level %d', (count, level) => {
      expect(evaluate(count)).toStrictEqual({
        level,
        detail: plural('status.checks.mainThread.detail', count),
      });
    });

    it('reserves room for two digits of long tasks, in the plural', () => {
      expect(new MainThreadCheck({ translator, readings: { longTaskCount: 0 } }).reserve()).toBe(
        '99 long tasks acima de 50 ms',
      );
    });
  });

  describe('LayoutShiftCheck', () => {
    const evaluate = (cumulativeLayoutShift) =>
      new LayoutShiftCheck({ translator, readings: { cumulativeLayoutShift } }).evaluate();

    it('is operational up to 0.1, with three decimals', () => {
      expect(evaluate(0)).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.layoutShift.detail', { value: '0,000' }),
      });
      expect(evaluate(0.1)).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.layoutShift.detail', { value: '0,100' }),
      });
    });

    it('is degraded above 0.1', () => {
      expect(evaluate(0.1001)).toStrictEqual({
        level: Level.DEGRADED,
        detail: text('status.checks.layoutShift.detail', { value: '0,100' }),
      });
      expect(evaluate(0.25).detail).toBe(
        text('status.checks.layoutShift.detail', { value: '0,250' }),
      );
    });
  });

  describe('DependenciesCheck', () => {
    it('counts the images on the page', () => {
      document.body.innerHTML = '<img alt=""><img alt=""><img alt="">';
      expect(new DependenciesCheck({ translator }).evaluate()).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.dependencies.detail', { images: 3 }),
      });
    });

    it('counts none on an empty page', () => {
      expect(new DependenciesCheck({ translator }).evaluate().detail).toBe(
        text('status.checks.dependencies.detail', { images: 0 }),
      );
    });
  });

  describe('PlatformCheck', () => {
    const evaluate = () => new PlatformCheck({ translator }).evaluate();

    it('lists four features with a tick or a cross, separated by dots', () => {
      vi.spyOn(CSS, 'supports').mockImplementation((property) => property === 'animation-timeline');
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
      const result = evaluate();
      delete document.startViewTransition;
      expect(result.level).toBe(Level.OPERATIONAL);
      expect(result.detail).toBe(
        `view transitions ✗ · scroll-driven ✓ · light-dark() ✗ · popover ${'popover' in HTMLElement.prototype ? '✓' : '✗'}`,
      );
    });

    it('asks the browser about the two CSS features with their exact syntax', () => {
      const supports = vi.spyOn(CSS, 'supports').mockReturnValue(true);
      evaluate();
      expect(supports).toHaveBeenCalledTimes(2);
      expect(supports).toHaveBeenNthCalledWith(1, 'animation-timeline', 'scroll()');
      expect(supports).toHaveBeenNthCalledWith(2, 'color', 'light-dark(#000,#fff)');
    });

    it('shows every tick when everything is supported', () => {
      vi.spyOn(CSS, 'supports').mockReturnValue(true);
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: () => {},
      });
      Object.defineProperty(HTMLElement.prototype, 'popover', { configurable: true, value: null });
      const result = evaluate();
      delete document.startViewTransition;
      delete HTMLElement.prototype.popover;
      expect(result.detail).toBe(
        'view transitions ✓ · scroll-driven ✓ · light-dark() ✓ · popover ✓',
      );
    });
  });

  describe('ContrastCheck', () => {
    const pair = (kind, ratio, { large = false } = {}) => ({
      kind,
      ratio,
      large,
      minimum: kind === 'text' && !large ? 4.5 : 3,
      enhanced: kind === 'text' ? 7 : 3,
      labels: [kind],
      count: 1,
    });
    const PASSING = new ContrastReport([
      pair('text', 4.629999),
      pair('text', 7.5),
      pair('text', 3.62, { large: true }),
      pair('component', 3.249),
      pair('component', 12),
    ]);
    const FAILING = new ContrastReport([
      pair('text', 4.629999),
      pair('text', 4.1),
      pair('component', 3.249),
    ]);
    let audit, theme, notifyColorsChange, settle;

    /** An audit whose measurement the test finishes by hand. */
    const fakeAudit = () => {
      const waiting = [];
      return {
        measureWithoutBlocking: vi.fn(
          () =>
            new Promise((resolve) => {
              waiting.push(resolve);
            }),
        ),
        finish: (report, index = waiting.length - 1) => waiting[index](report),
      };
    };
    const flush = async () => {
      for (let turn = 0; turn < 5; turn++) await Promise.resolve();
    };
    const build = () => new ContrastCheck({ translator, audit, theme });
    const detail = (values) => text('status.checks.contrast.detail', values);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      audit = fakeAudit();
      settle = Promise.resolve();
      theme = {
        theme: 'dark',
        hue: 128,
        onColorsChange: vi.fn((listener) => {
          notifyColorsChange = listener;
        }),
        get settled() {
          return settle;
        },
      };
    });
    afterEach(() => vi.useRealTimers());

    it('is named from the dictionary like the others', () => {
      expect([build().nameKey, build().name]).toStrictEqual([
        'status.checks.contrast.name',
        'Contraste (WCAG 2.2)',
      ]);
    });

    it('reserves room for the widest reading, which is what the row has to hold once the report arrives', () => {
      expect(build().reserve()).toBe(
        detail({
          passing: 99,
          pairs: 99,
          text: '9,99',
          component: '9,99',
          theme: 'escuro',
          hue: 360,
        }),
      );
    });

    it('reserves with the longer theme name of the language in use, English included', () => {
      translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'en-US' });
      Formatter.use('en-US');
      expect(build().reserve()).toBe(
        DictionaryText.fill('en-US', 'status.checks.contrast.detail', {
          passing: 99,
          pairs: 99,
          text: '9.99',
          component: '9.99',
          theme: 'light',
          hue: 360,
        }),
      );
    });

    it('starts a measurement at once, without blocking, and asks to hear about every change of colors', () => {
      build();
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(1);
      expect(audit.measureWithoutBlocking).toHaveBeenNthCalledWith(1);
      expect(theme.onColorsChange).toHaveBeenCalledTimes(1);
    });

    it('says it is measuring until the first report arrives, and is not degraded meanwhile', () => {
      expect(build().evaluate()).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: text('status.checks.contrast.measuring'),
      });
    });

    it('reports the pairs that pass, the lowest regular text and the lowest component, cut to two decimals, with the theme and hue', async () => {
      const check = build();
      audit.finish(PASSING);
      await flush();
      expect(check.evaluate()).toStrictEqual({
        level: Level.OPERATIONAL,
        detail: detail({
          passing: 5,
          pairs: 5,
          text: '4,62',
          component: '3,24',
          theme: 'escuro',
          hue: 128,
        }),
      });
    });

    it('is degraded, and says how many pairs pass, when one is under its minimum', async () => {
      const check = build();
      audit.finish(FAILING);
      await flush();
      expect(check.evaluate()).toStrictEqual({
        level: Level.DEGRADED,
        detail: detail({
          passing: 2,
          pairs: 3,
          text: '4,10',
          component: '3,24',
          theme: 'escuro',
          hue: 128,
        }),
      });
    });

    it('formats and words the detail for the language', async () => {
      const check = build();
      audit.finish(PASSING);
      await flush();
      translator.setLocale('en-US');
      Formatter.use('en-US');
      expect(check.evaluate().detail).toBe(
        DictionaryText.fill('en-US', 'status.checks.contrast.detail', {
          passing: 5,
          pairs: 5,
          text: '4.62',
          component: '3.24',
          theme: 'dark',
          hue: 128,
        }),
      );
    });

    it('waits for a theme switch to finish, then half a second more, before measuring again', async () => {
      build();
      audit.finish(PASSING);
      await flush();
      let endSwitch;
      settle = new Promise((resolve) => {
        endSwitch = resolve;
      });
      notifyColorsChange();
      vi.advanceTimersByTime(60_000);
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(1);
      endSwitch();
      await flush();
      vi.advanceTimersByTime(ContrastCheck.SETTLE_MS - 1);
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(2);
      expect(ContrastCheck.SETTLE_MS).toBe(500);
    });

    it('keeps showing the last reading while it measures again, then the new one with the theme and hue it measured', async () => {
      const check = build();
      audit.finish(PASSING);
      await flush();
      theme.theme = 'light';
      theme.hue = 200;
      notifyColorsChange();
      await flush();
      expect(check.evaluate().detail).toBe(
        detail({
          passing: 5,
          pairs: 5,
          text: '4,62',
          component: '3,24',
          theme: 'escuro',
          hue: 128,
        }),
      );
      vi.advanceTimersByTime(ContrastCheck.SETTLE_MS);
      audit.finish(FAILING);
      await flush();
      expect(check.evaluate()).toStrictEqual({
        level: Level.DEGRADED,
        detail: detail({
          passing: 2,
          pairs: 3,
          text: '4,10',
          component: '3,24',
          theme: 'claro',
          hue: 200,
        }),
      });
    });

    it('measures once for changes that come before the colors have settled, not once for each', async () => {
      build();
      audit.finish(PASSING);
      await flush();
      let release;
      settle = new Promise((resolve) => {
        release = resolve;
      });
      notifyColorsChange();
      notifyColorsChange();
      release();
      await flush();
      vi.advanceTimersByTime(ContrastCheck.SETTLE_MS);
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(2);
    });

    it('measures once for a burst of changes, such as a hue dragged across the slider', async () => {
      build();
      audit.finish(PASSING);
      await flush();
      for (let step = 0; step < 20; step++) {
        notifyColorsChange();
        await flush();
        vi.advanceTimersByTime(100);
      }
      vi.advanceTimersByTime(ContrastCheck.SETTLE_MS);
      expect(audit.measureWithoutBlocking).toHaveBeenCalledTimes(2);
    });

    it('drops a report for colors that changed while it was being measured', async () => {
      const check = build();
      audit.finish(PASSING);
      await flush();
      notifyColorsChange();
      await flush();
      vi.advanceTimersByTime(ContrastCheck.SETTLE_MS);
      notifyColorsChange(); // the colors move again while the second measurement runs
      await flush();
      audit.finish(FAILING, 1); // the report of the stale measurement arrives late
      await flush();
      expect(check.evaluate().detail).toBe(
        detail({
          passing: 5,
          pairs: 5,
          text: '4,62',
          component: '3,24',
          theme: 'escuro',
          hue: 128,
        }),
      );
    });
  });

  describe('HealthChecks.forThisPage', () => {
    const theme = { theme: 'dark', hue: 128, onColorsChange: vi.fn(), settled: Promise.resolve() };

    it('builds the eight checks in display order with their dictionary keys', () => {
      const checks = HealthChecks.forThisPage({ readings: {}, globe: null, translator, theme });
      expect(checks.map((check) => [check.constructor.name, check.nameKey])).toStrictEqual([
        ['DocumentCheck', 'status.checks.document.name'],
        ['FontsCheck', 'status.checks.fonts.name'],
        ['GlobeCheck', 'status.checks.globe.name'],
        ['MainThreadCheck', 'status.checks.mainThread.name'],
        ['LayoutShiftCheck', 'status.checks.layoutShift.name'],
        ['DependenciesCheck', 'status.checks.dependencies.name'],
        ['PlatformCheck', 'status.checks.platform.name'],
        ['ContrastCheck', 'status.checks.contrast.name'],
      ]);
    });

    it('asks for the room of the longest text only from the checks whose text grows after the first reading (the globe has none here: there is no globe)', () => {
      const readings = {
        longTaskCount: 0,
        cumulativeLayoutShift: 0,
        transferredBytes: 1024,
        requestCount: 1,
        ownResources: [],
      };
      const checks = HealthChecks.forThisPage({ readings, globe: null, translator, theme });
      expect(checks.map((check) => check.reserve())).toStrictEqual([
        '9999 KB na rede · 999 requisições · 999 arquivos do site',
        null,
        null,
        '99 long tasks acima de 50 ms',
        null,
        null,
        null,
        '99/99 pares no AA · texto ≥ 9,99:1 · componentes ≥ 9,99:1 · escuro 360°',
      ]);
    });

    it('hands the globe to the globe check and the readings to the metric checks', () => {
      const readings = {
        longTaskCount: 5,
        cumulativeLayoutShift: 0.5,
        transferredBytes: 1024,
        requestCount: 1,
        ownResources: [],
      };
      const checks = HealthChecks.forThisPage({ readings, globe: null, translator, theme });
      expect([
        checks[2].evaluate().level,
        checks[3].evaluate().level,
        checks[4].evaluate().level,
      ]).toStrictEqual([Level.DOWN, Level.DEGRADED, Level.DEGRADED]);
    });
  });
});
