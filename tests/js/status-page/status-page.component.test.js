import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusPage } from '@site/js/status-page/status-page.js';
import { Level } from '@site/js/status-page/health-checks.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const NOW = new Date(2026, 9, 17, 9, 5, 7);
const text = (key, params, locale = 'pt-BR') => DictionaryText.fill(locale, key, params);

describe('StatusPage', () => {
  let root, translator, checks, readings, globe, page, onMetric, results;
  const rows = () =>
    [...root.querySelectorAll('#status-components li')].map((item) => [
      item.querySelector('b').textContent,
      item.querySelector('small').textContent,
      item.querySelector('.status-badge').dataset.level,
      item.querySelector('.status-badge span').textContent,
    ]);
  const cells = () =>
    [...root.querySelectorAll('#status-cells i')].map((cell) => [
      cell.dataset.level ?? null,
      cell.classList.contains('is-latest'),
    ]);
  const incidents = () =>
    [...root.querySelectorAll('#status-incidents li')].map((item) => item.textContent);
  const check = (key, level = Level.OPERATIONAL, detail = 'detail', reserve = null) => {
    results[key] = { level, detail };
    return {
      nameKey: `status.checks.${key}.name`,
      name: text(`status.checks.${key}.name`),
      evaluate: vi.fn(() => results[key]),
      reserve: vi.fn(() => reserve),
    };
  };
  const reservations = () =>
    [...root.querySelectorAll('#status-components li small')].map((detail) =>
      detail.getAttribute('data-reserve'),
    );
  const build = ({ withGlobe = true, announce } = {}) => {
    page = new StatusPage({
      root,
      checks,
      readings,
      globe: withGlobe ? globe : null,
      translator,
      announce,
    });
    page.start();
    return page;
  };

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    });
    vi.setSystemTime(NOW);
    Formatter.use('pt-BR');
    document.body.innerHTML = `<section id="status">
      <ul id="status-components"></ul><div id="status-cells"></div><h3 id="status-title"></h3><span id="status-updated"></span>
      <ul id="status-incidents"></ul><span id="status-incident-count"></span><span id="status-uptime"></span></section>`;
    root = document.getElementById('status');
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    results = {};
    checks = [check('document'), check('fonts')];
    onMetric = undefined;
    readings = {
      subscribe: vi.fn((listener) => {
        onMetric = listener;
        return () => {};
      }),
    };
    globe = { isRunning: true, frameRate: 60 };
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise(() => {}) },
    });
  });

  afterEach(() => {
    delete document.documentElement.dataset.motion;
    delete document.fonts;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('start', () => {
    it('renders one row per check, named from the dictionary, then fills it from a first evaluation', () => {
      checks = [
        check('document', Level.OPERATIONAL, '20 KB na rede'),
        check('fonts', Level.DEGRADED, '2/3 famílias'),
      ];
      build();
      expect(rows()).toStrictEqual([
        [text('status.checks.document.name'), '20 KB na rede', '0', text('status.levels.0')],
        [text('status.checks.fonts.name'), '2/3 famílias', '1', text('status.levels.1')],
      ]);
      expect(checks.map((entry) => entry.evaluate.mock.calls.length)).toStrictEqual([1, 1]);
    });

    it('keeps the room of the longest text a check can show in its row, and none for a check that has a final text from the start', () => {
      checks = [
        check('document', Level.OPERATIONAL, 'short'),
        check('contrast', Level.OPERATIONAL, 'measuring', '99/99 pares no AA · texto ≥ 9,99:1'),
      ];
      build();
      expect(reservations()).toStrictEqual([null, '99/99 pares no AA · texto ≥ 9,99:1']);
      expect(checks.map((entry) => entry.reserve.mock.calls.length)).toStrictEqual([1, 1]);
    });

    it('takes the room back when a check stops reserving, and asks again at every refresh so a language change resizes it', () => {
      const reserved = ['longest text', null];
      checks = [check('contrast', Level.OPERATIONAL, 'measuring')];
      checks[0].reserve.mockImplementation(() => reserved.shift() ?? null);
      build();
      expect(reservations()).toStrictEqual(['longest text']);
      vi.advanceTimersByTime(1000);
      expect(reservations()).toStrictEqual([null]);
    });

    it('marks every row name for retranslation with its dictionary key', () => {
      build();
      expect(
        [...root.querySelectorAll('#status-components b')].map((name) => name.dataset.i18n),
      ).toStrictEqual(['status.checks.document.name', 'status.checks.fonts.name']);
    });

    it('shows the worst level as the banner, on the root and in the title', () => {
      checks = [check('document', Level.OPERATIONAL), check('fonts', Level.DOWN)];
      build();
      expect([
        root.dataset.level,
        document.getElementById('status-title').textContent,
      ]).toStrictEqual(['2', DictionaryText.entry('pt-BR', 'status.banners')[2]]);
    });

    it('shows all systems operational when nothing is wrong', () => {
      build();
      expect([
        root.dataset.level,
        document.getElementById('status-title').textContent,
      ]).toStrictEqual(['0', DictionaryText.entry('pt-BR', 'status.banners')[0]]);
    });

    it('stamps the time of the last refresh', () => {
      build();
      expect(document.getElementById('status-updated').textContent).toBe('09:05:07');
    });

    it('subscribes to the readings once', () => {
      build();
      expect(readings.subscribe).toHaveBeenCalledTimes(1);
    });

    it('refreshes every second: 3 seconds later every check was evaluated 4 times', () => {
      build();
      vi.advanceTimersByTime(3000);
      expect(checks.map((entry) => entry.evaluate.mock.calls.length)).toStrictEqual([4, 4]);
      expect(document.getElementById('status-updated').textContent).toBe('09:05:10');
    });

    it('stops refreshing while the visitor has paused motion, and carries on when it is back on', () => {
      document.documentElement.dataset.motion = 'paused';
      build();
      vi.advanceTimersByTime(3000);
      expect(checks.map((entry) => entry.evaluate.mock.calls.length)).toStrictEqual([1, 1]);
      delete document.documentElement.dataset.motion;
      vi.advanceTimersByTime(1000);
      expect(checks.map((entry) => entry.evaluate.mock.calls.length)).toStrictEqual([2, 2]);
    });

    it('refreshes once more when the fonts are ready', async () => {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });
      build();
      await Promise.resolve();
      await Promise.resolve();
      expect(checks.map((entry) => entry.evaluate.mock.calls.length)).toStrictEqual([2, 2]);
    });

    it('follows a check that changes level between refreshes', () => {
      build();
      results.fonts = { level: Level.DEGRADED, detail: 'now degraded' };
      vi.advanceTimersByTime(1000);
      expect([rows()[1].slice(1), root.dataset.level]).toStrictEqual([
        ['now degraded', '1', text('status.levels.1')],
        '1',
      ]);
    });
  });

  describe('announcing the banner', () => {
    const banner = (level) => DictionaryText.entry('pt-BR', 'status.banners')[level];

    it('says nothing about the first banner: the page has just loaded', () => {
      const announce = vi.fn();
      build({ announce });
      vi.advanceTimersByTime(3000);
      expect(announce).toHaveBeenCalledTimes(0);
    });

    it('announces the new banner once the level has held for three refreshes, and again when it changes back for as long', () => {
      const announce = vi.fn();
      build({ announce });
      results.fonts = { level: Level.DEGRADED, detail: 'slow' };
      vi.advanceTimersByTime(2000);
      expect(announce).toHaveBeenCalledTimes(0);
      vi.advanceTimersByTime(1000);
      expect(announce.mock.calls).toStrictEqual([[banner(1)]]);
      vi.advanceTimersByTime(5000);
      expect(announce).toHaveBeenCalledTimes(1);
      results.fonts = { level: Level.OPERATIONAL, detail: 'fine' };
      vi.advanceTimersByTime(3000);
      expect(announce.mock.calls).toStrictEqual([[banner(1)], [banner(0)]]);
    });

    it('never announces a change that lasts under three refreshes: a long task turns the banner amber for a second or two', () => {
      const announce = vi.fn();
      build({ announce });
      results.fonts = { level: Level.DEGRADED, detail: 'slow' };
      vi.advanceTimersByTime(2000);
      results.fonts = { level: Level.OPERATIONAL, detail: 'fine' };
      vi.advanceTimersByTime(10000);
      expect(announce).toHaveBeenCalledTimes(0);
    });

    it('starts counting again when the level changes to another one before the three refreshes are over', () => {
      const announce = vi.fn();
      build({ announce });
      results.fonts = { level: Level.DEGRADED, detail: 'slow' };
      vi.advanceTimersByTime(2000);
      results.fonts = { level: Level.DOWN, detail: 'gone' };
      vi.advanceTimersByTime(2000);
      expect(announce).toHaveBeenCalledTimes(0);
      vi.advanceTimersByTime(1000);
      expect(announce.mock.calls).toStrictEqual([[banner(2)]]);
    });

    it('does not announce a language change: the level is the same', () => {
      const announce = vi.fn();
      build({ announce });
      translator.setLocale('en-US');
      expect(announce).toHaveBeenCalledTimes(0);
    });

    it('does not touch the banner text while it stays the same, so no screen reader reads it again', () => {
      build();
      const title = document.getElementById('status-title');
      const text = title.firstChild;
      vi.advanceTimersByTime(3000);
      expect([title.firstChild, title.textContent]).toStrictEqual([text, banner(0)]);
    });
  });

  describe('the 90-second strip', () => {
    it('has 90 empty cells before the first refresh and one lit cell, the latest, after it', () => {
      build();
      const state = cells();
      expect([
        state.length,
        state.slice(0, 89).every(([level, latest]) => level === null && latest === false),
        state[89],
      ]).toStrictEqual([90, true, ['0', true]]);
    });

    it('fills from the right, one second per cell', () => {
      build();
      vi.advanceTimersByTime(2000);
      expect(cells().slice(86)).toStrictEqual([
        [null, false],
        ['0', false],
        ['0', false],
        ['0', true],
      ]);
    });

    it('records an incident in the second it happened and then goes back to operational', () => {
      build();
      page.addIncident(() => 'something', Level.DEGRADED);
      vi.advanceTimersByTime(2000);
      expect(
        cells()
          .slice(87)
          .map(([level]) => level),
      ).toStrictEqual(['0', '1', '0']);
    });

    it('keeps the worst level of the second', () => {
      build();
      page.addIncident(() => 'a', Level.DEGRADED);
      page.addIncident(() => 'b', Level.DOWN);
      page.addIncident(() => 'c', Level.DEGRADED);
      vi.advanceTimersByTime(1000);
      expect(
        cells()
          .slice(88)
          .map(([level]) => level),
      ).toStrictEqual(['0', '2']);
    });

    it('scrolls after 90 seconds: still 90 cells, all lit, only the last one latest', () => {
      build();
      vi.advanceTimersByTime(99000);
      const state = cells();
      expect([
        state.length,
        state.filter(([level]) => level === null).length,
        state.filter(([, latest]) => latest).length,
        state[89][1],
      ]).toStrictEqual([90, 0, 1, true]);
    });

    it('reports the share of quiet seconds as a whole percentage', () => {
      build();
      page.addIncident(() => 'x', Level.DEGRADED);
      vi.advanceTimersByTime(3000);
      expect(document.getElementById('status-uptime').textContent).toBe(
        text('status.history.quiet', { percent: 75 }),
      );
    });

    it('starts at 100% quiet', () => {
      build();
      expect(document.getElementById('status-uptime').textContent).toBe(
        text('status.history.quiet', { percent: 100 }),
      );
    });
  });

  describe('incidents', () => {
    it('lists the newest first, each with the time, its text and a resolved tag', () => {
      build();
      page.addIncident(() => 'first');
      vi.advanceTimersByTime(60000);
      page.addIncident(() => 'second');
      expect(incidents()).toStrictEqual([
        `09:06:07second${text('status.incidents.resolved')}`,
        `09:05:07first${text('status.incidents.resolved')}`,
      ]);
      expect(document.getElementById('status-incident-count').textContent).toBe('2');
    });

    it('keeps the six most recent', () => {
      build();
      for (let number = 1; number <= 8; number++) page.addIncident(() => `incident ${number}`);
      expect(
        [...root.querySelectorAll('#status-incidents li span:first-of-type')].map(
          (span) => span.textContent,
        ),
      ).toStrictEqual([
        'incident 8',
        'incident 7',
        'incident 6',
        'incident 5',
        'incident 4',
        'incident 3',
      ]);
      expect(document.getElementById('status-incident-count').textContent).toBe('6');
    });

    it('does not degrade the page for an incident that is informational', () => {
      build();
      page.addIncident(() => 'fyi', Level.OPERATIONAL);
      vi.advanceTimersByTime(1000);
      expect(
        cells()
          .slice(88)
          .map(([level]) => level),
      ).toStrictEqual(['0', '0']);
    });

    it('describes an incident at every render, so a language change retranslates it', () => {
      build();
      const describe = vi.fn(() => 'text');
      page.addIncident(describe);
      page.addIncident(() => 'other');
      expect(describe).toHaveBeenCalledTimes(2);
    });

    it('shows the empty message after the language changes with no incidents', () => {
      build();
      translator.setLocale('en-US');
      expect(incidents()).toStrictEqual([text('status.incidents.none', {}, 'en-US')]);
      expect([
        root.querySelector('#status-incidents li').className,
        document.getElementById('status-incident-count').textContent,
      ]).toStrictEqual(['is-empty', '0']);
    });
  });

  describe('readings', () => {
    it('logs a layout shift above 0.01 with three decimals, and degrades the second', () => {
      build();
      onMetric('layout-shift', { value: 0.02 });
      expect(incidents()).toStrictEqual([
        `09:05:07${text('status.incidents.layoutShift', { value: '0,020' })}${text('status.incidents.resolved')}`,
      ]);
      vi.advanceTimersByTime(1000);
      expect(
        cells()
          .slice(88)
          .map(([level]) => level),
      ).toStrictEqual(['0', '1']);
    });

    it('ignores a layout shift of 0.01 or less', () => {
      build();
      onMetric('layout-shift', { value: 0.01 });
      expect(incidents()).toStrictEqual([]);
    });

    it('logs a long task with its duration rounded to the millisecond', () => {
      build();
      onMetric('long-task', { duration: 61.6 });
      expect(incidents()).toStrictEqual([
        `09:05:07${text('status.incidents.longTask', { duration: 62 })}${text('status.incidents.resolved')}`,
      ]);
    });

    it.each([['paint'], ['lcp'], ['network']])('ignores %s events', (type) => {
      build();
      onMetric(type, { value: 1, duration: 1 });
      expect(incidents()).toStrictEqual([]);
    });
  });

  describe('frame rate', () => {
    it('logs an incident after three consecutive seconds below 20 fps, once', () => {
      build();
      globe.frameRate = 10;
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      expect(incidents()).toStrictEqual([]);
      vi.advanceTimersByTime(1000);
      expect(incidents()).toStrictEqual([
        `09:05:10${text('status.incidents.lowFps', { threshold: 20, fps: 10 })}${text('status.incidents.resolved')}`,
      ]);
      vi.advanceTimersByTime(5000);
      expect(incidents()).toHaveLength(1);
    });

    it('starts counting again after the frame rate recovers', () => {
      build();
      globe.frameRate = 10;
      vi.advanceTimersByTime(2000);
      globe.frameRate = 60;
      vi.advanceTimersByTime(1000);
      globe.frameRate = 10;
      vi.advanceTimersByTime(2000);
      expect(incidents()).toStrictEqual([]);
      vi.advanceTimersByTime(1000);
      expect(incidents()).toHaveLength(1);
    });

    it('treats exactly 20 fps, an unmeasured rate and a paused globe as fine', () => {
      build();
      for (const state of [
        { frameRate: 20 },
        { frameRate: 0 },
        { isRunning: false, frameRate: 5 },
      ]) {
        Object.assign(globe, { isRunning: true, frameRate: 60 }, state);
        vi.advanceTimersByTime(4000);
      }
      expect(incidents()).toStrictEqual([]);
    });

    it('works without a globe', () => {
      build({ withGlobe: false });
      vi.advanceTimersByTime(5000);
      expect(incidents()).toStrictEqual([]);
    });
  });

  describe('recordLoadTest', () => {
    it('logs the run with the processed count in the language of the page, without degrading it', () => {
      build();
      page.recordLoadTest({ done: 2000000, seconds: 20 });
      expect(incidents()).toStrictEqual([
        `09:05:07${text('status.incidents.loadTest', { done: '2.000.000', seconds: 20 })}${text('status.incidents.resolved')}`,
      ]);
      vi.advanceTimersByTime(1000);
      expect(
        cells()
          .slice(88)
          .map(([level]) => level),
      ).toStrictEqual(['0', '0']);
    });

    it('rewrites the log line when the visitor switches language', () => {
      build();
      page.recordLoadTest({ done: 2000000, seconds: 20 });
      Formatter.use('en-US');
      translator.setLocale('en-US');
      expect(incidents()).toStrictEqual([
        `09:05:07${text('status.incidents.loadTest', { done: '2,000,000', seconds: 20 }, 'en-US')}${text('status.incidents.resolved', {}, 'en-US')}`,
      ]);
    });
  });

  describe('language change', () => {
    it('retranslates the badges and the banner at once', () => {
      checks = [check('document', Level.OPERATIONAL), check('fonts', Level.DEGRADED)];
      build();
      translator.setLocale('en-US');
      expect(rows().map((row) => row[3])).toStrictEqual([
        DictionaryText.entry('en-US', 'status.levels')[0],
        DictionaryText.entry('en-US', 'status.levels')[1],
      ]);
      expect(document.getElementById('status-title').textContent).toBe(
        DictionaryText.entry('en-US', 'status.banners')[1],
      );
      expect(document.getElementById('status-uptime').textContent).toBe(
        text('status.history.quiet', { percent: 100 }, 'en-US'),
      );
    });
  });
});
