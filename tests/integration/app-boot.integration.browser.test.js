import { describe, it, expect, beforeAll } from 'vitest';
import indexHtml from '@site/index.html?raw';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { Diagram } from '@site/js/architecture-map/diagram.js';

const untilTrue = async (condition, frames = 120) => {
  for (let frame = 0; frame < frames && !condition(); frame++)
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
};

describe('the whole page, booted by importing main.js into the real markup', () => {
  const problems = { errors: [], warnings: [], resizeLoops: 0, rejections: [] };
  let handle;

  beforeAll(async () => {
    window.addEventListener('error', (event) => {
      // Chromium reports this when a ResizeObserver callback changes layout; it is not a script error.
      if (/ResizeObserver loop/.test(event.message)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        problems.resizeLoops++;
        return;
      }
      problems.errors.push(event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      problems.rejections.push(String(event.reason));
    });
    const originalWarn = console.warn;
    console.error = (...args) => {
      problems.errors.push(args.map(String).join(' '));
    };
    console.warn = (...args) => {
      problems.warnings.push(args.map(String).join(' '));
      originalWarn(...args);
    };
    localStorage.clear();
    history.replaceState(null, '', '/');
    const page = new DOMParser().parseFromString(
      indexHtml.replaceAll('rel="stylesheet"', 'rel="stylesheet-not-loaded"'),
      'text/html',
    );
    document.head.innerHTML = '';
    for (const element of page.head.querySelectorAll('meta, title'))
      document.head.append(document.importNode(element, true));
    document.body.innerHTML = page.body.innerHTML;
    await import('@site/js/main.js');
    handle = window.eklund;
    await untilTrue(() => document.documentElement.classList.contains('fonts-ready'), 240);
  }, 30000);

  it('starts without a script error, an unhandled rejection or a missing translation', () => {
    expect([problems.errors, problems.rejections, problems.warnings]).toStrictEqual([[], [], []]);
  });

  it('leaves a handle on window with the parts a developer can play with, in this order', () => {
    expect(Object.keys(handle)).toStrictEqual([
      'globe',
      'field',
      'trace',
      'status',
      'dashboard',
      'architecture',
      'loadTest',
      'theme',
      'translator',
      'setLocale',
    ]);
  });

  it('marks the start and the end of the app boot once each, with ready after start', () => {
    const [start, ready] = ['app:start', 'app:ready'].map((name) =>
      performance.getEntriesByName(name, 'mark'),
    );
    expect([start.length, ready.length, start[0].startTime <= ready[0].startTime]).toStrictEqual([
      1,
      1,
      true,
    ]);
  });

  describe('language', () => {
    it('opens in Portuguese at the root address, with the page metadata translated', () => {
      expect([
        document.documentElement.lang,
        document.title,
        document.querySelector('meta[name=description]').content,
      ]).toStrictEqual(['pt-BR', PT_BR.meta.title, PT_BR.meta.description]);
    });

    it('marks Portuguese as the current language in the switcher', () => {
      expect(
        [...document.querySelectorAll('.locale-switcher a')].map((link) => [
          link.dataset.locale,
          link.getAttribute('aria-current'),
        ]),
      ).toStrictEqual([
        ['pt-BR', 'true'],
        ['en-US', null],
      ]);
    });

    it('switches to English and back, remembering the choice and updating the address', async () => {
      handle.setLocale('en');
      await untilTrue(() => document.documentElement.lang === 'en-US');
      expect([
        document.documentElement.lang,
        document.title,
        location.pathname,
        localStorage.getItem('lang'),
      ]).toStrictEqual(['en-US', EN_US.meta.title, '/en/', 'en-US']);
      expect(
        [...document.querySelectorAll('.locale-switcher a')].map((link) =>
          link.getAttribute('aria-current'),
        ),
      ).toStrictEqual([null, 'true']);
      handle.setLocale('pt');
      await untilTrue(() => document.documentElement.lang === 'pt-BR');
      expect([
        document.documentElement.lang,
        location.pathname,
        localStorage.getItem('lang'),
      ]).toStrictEqual(['pt-BR', '/', 'pt-BR']);
    });
  });

  describe('what the boot built', () => {
    it('draws the globe from the real land data, with every route', () => {
      expect([
        handle.globe.pointCount,
        handle.globe.arcCount,
        document.getElementById('globe').classList.contains('is-fallback'),
      ]).toStrictEqual([11911, 35, false]);
    });

    it('fills the point-count chip, the year and the local time', () => {
      expect([
        document.getElementById('chip-points').textContent,
        document.getElementById('current-year').textContent,
      ]).toStrictEqual(['11.911', String(new Date().getFullYear())]);
      expect(document.getElementById('local-time').textContent.startsWith('· ')).toBe(true);
    });

    it('lists the eight components on the status page, named from the dictionary', () => {
      expect(
        [...document.querySelectorAll('#status-components li b')].map((name) => name.textContent),
      ).toStrictEqual(
        [
          'document',
          'fonts',
          'globe',
          'mainThread',
          'layoutShift',
          'dependencies',
          'platform',
          'contrast',
        ].map((key) => PT_BR.status.checks[key].name),
      );
    });

    it('draws the architecture map: 30 nodes plus the Kafka bus, and 36 connectors', () => {
      expect([
        document.querySelectorAll('#architecture-svg .node').length,
        document.querySelectorAll('#architecture-svg path.edge').length,
      ]).toStrictEqual([Object.keys(Diagram.NODES).length + 1, Diagram.edges().length]);
    });

    it('mounts the load test', () => expect(handle.loadTest.constructor.name).toBe('LoadTest'));

    it('reveals the hero after the display fonts settle, with the name split into letters', () => {
      expect([
        document.documentElement.classList.contains('fonts-ready'),
        document.getElementById('hero').classList.contains('is-revealed'),
        document.querySelector('.hero-name .word .letter') !== null,
      ]).toStrictEqual([true, true, true]);
    });

    it('sizes the globe bitmap to the canvas it draws on', () => {
      const canvas = document.getElementById('globe-canvas');
      expect(handle.globe.canvasSize).toBe(`${canvas.width}×${canvas.height}`);
    });
  });

  describe('theme', () => {
    it('toggles between dark and light and saves the choice', async () => {
      const toggle = document.getElementById('theme-toggle');
      const before = document.documentElement.dataset.theme;
      toggle.click();
      await untilTrue(() => document.documentElement.dataset.theme !== before);
      expect([
        before,
        document.documentElement.dataset.theme,
        localStorage.getItem('theme'),
      ]).toStrictEqual(['dark', 'light', 'light']);
      toggle.click();
      await untilTrue(() => document.documentElement.dataset.theme === 'dark');
      expect([document.documentElement.dataset.theme, localStorage.getItem('theme')]).toStrictEqual(
        ['dark', 'dark'],
      );
    });
  });

  describe('command palette', () => {
    it('opens with Ctrl+K and lists every command in the dictionary, translated', async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
      const dialog = document.getElementById('command-palette');
      await untilTrue(() => dialog.open);
      const titles = [...document.querySelectorAll('#command-palette-list li')].map(
        (item) => item.firstChild.textContent,
      );
      const expected = Object.entries(PT_BR.palette.commands)
        .filter(([id]) => id !== 'resumeMotion')
        .map(([, command]) => command.title.replace('{city}', 'Taubaté'));
      expect([dialog.open, titles]).toStrictEqual([true, expected]);
      dialog.close();
    });

    it('offers to resume motion instead of pausing it once the visitor paused it, and back again', async () => {
      const toggle = document.getElementById('motion-toggle');
      const dialog = document.getElementById('command-palette');
      const titles = () =>
        [...document.querySelectorAll('#command-palette-list li')].map(
          (item) => item.firstChild.textContent,
        );
      const openPalette = async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
        );
        await untilTrue(() => dialog.open);
      };
      toggle.click();
      try {
        await openPalette();
        expect([
          toggle.getAttribute('aria-pressed'),
          document.documentElement.dataset.motion,
        ]).toStrictEqual(['true', 'paused']);
        expect([
          titles().includes(PT_BR.palette.commands.resumeMotion.title),
          titles().includes(PT_BR.palette.commands.pauseMotion.title),
        ]).toStrictEqual([true, false]);
      } finally {
        dialog.close();
        toggle.click();
      }
      await openPalette();
      expect([
        toggle.getAttribute('aria-pressed'),
        titles().includes(PT_BR.palette.commands.pauseMotion.title),
        titles().includes(PT_BR.palette.commands.resumeMotion.title),
      ]).toStrictEqual(['false', true, false]);
      dialog.close();
    });
  });

  it('stays free of script errors after all of that', () => {
    expect([problems.errors, problems.rejections]).toStrictEqual([[], []]);
  });
});
