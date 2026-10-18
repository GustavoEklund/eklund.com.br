import { describe, it, expect, beforeAll } from 'vitest';
import { Dom } from '@site/js/shared/dom.js';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { SiteSource } from '../support/site-source.js';

const lookup = (dictionary, path) =>
  path.split('.').reduce((node, part) => node?.[part], dictionary);
const attributePairs = (value) =>
  value
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf(':');
      return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
    });

describe('index.html', () => {
  let page;
  beforeAll(() => {
    page = SiteSource.html();
  });
  const all = (selector) => Dom.queryAll(selector, page);

  describe('translation keys', () => {
    it('only asks for keys that both dictionaries define', () => {
      const keys = [
        ...all('[data-i18n]').map((element) => element.dataset.i18n),
        ...all('[data-i18n-html]').map((element) => element.dataset.i18nHtml),
        ...all('[data-i18n-attr]').flatMap((element) =>
          attributePairs(element.dataset.i18nAttr).map(([, key]) => key),
        ),
      ];
      expect(
        keys.filter(
          (key) => typeof lookup(PT_BR, key) !== 'string' || typeof lookup(EN_US, key) !== 'string',
        ),
      ).toStrictEqual([]);
    });

    it('ships the Portuguese text in the markup, so the page reads right before any script runs', () => {
      const wrong = [
        ...all('[data-i18n]')
          .filter((element) => element.textContent !== lookup(PT_BR, element.dataset.i18n))
          .map((element) => element.dataset.i18n),
        ...all('[data-i18n-html]')
          .filter((element) => element.innerHTML !== lookup(PT_BR, element.dataset.i18nHtml))
          .map((element) => element.dataset.i18nHtml),
        ...all('[data-i18n-attr]').flatMap((element) =>
          attributePairs(element.dataset.i18nAttr)
            .filter(([attribute, key]) => element.getAttribute(attribute) !== lookup(PT_BR, key))
            .map(([, key]) => key),
        ),
      ];
      expect(wrong).toStrictEqual([]);
    });
  });

  describe('document metadata', () => {
    it('is Portuguese by default, with alternates for both languages and x-default', () => {
      expect(page.documentElement.lang).toBe('pt-BR');
      expect(
        all('link[rel=alternate]').map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      ).toStrictEqual([
        ['pt-BR', 'https://eklund.com.br/'],
        ['en', 'https://eklund.com.br/en/'],
        ['x-default', 'https://eklund.com.br/'],
      ]);
    });

    it('carries the Portuguese title, description and social tags from the dictionary', () => {
      expect(page.title).toBe(PT_BR.meta.title);
      expect(page.querySelector('meta[name=description]').content).toBe(PT_BR.meta.description);
      expect(page.querySelector('meta[property="og:title"]').content).toBe(PT_BR.meta.title);
      expect(page.querySelector('meta[property="og:description"]').content).toBe(
        PT_BR.meta.description,
      );
    });

    it('has the theme-color meta the theme controller updates', () => {
      expect(all('meta[name=theme-color]')).toHaveLength(1);
    });
  });

  describe('structure the scripts depend on', () => {
    it('has every id and class main.js requires', () => {
      const required = [
        ...SiteSource.read('js/main.js').matchAll(/Dom\.require\('([^']+)'\)/g),
      ].map(([, selector]) => selector);
      expect(required.filter((selector) => page.querySelector(selector) === null)).toStrictEqual(
        [],
      );
    });

    it('has one element for each id the scripts of every feature look up', () => {
      const files = SiteSource.files('js').filter(
        (file) =>
          file.endsWith('.js') && !file.includes('locales') && !file.endsWith('land-bitset.js'),
      );
      const selectors = files.flatMap((file) =>
        [
          ...SiteSource.read(file).matchAll(
            /(?:querySelector|Dom\.require|Dom\.query)\('(#[\w-]+)'\)/g,
          ),
        ].map(([, selector]) => selector),
      );
      const created = ['#trace-overlay', '#trace-playhead', '#trace-selection']; // built by TraceViewer.render, not shipped in the markup
      expect(
        [...new Set(selectors)].filter(
          (selector) => !created.includes(selector) && page.querySelector(selector) === null,
        ),
      ).toStrictEqual([]);
    });

    it('never repeats an id', () => {
      const ids = all('[id]').map((element) => element.id);
      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toStrictEqual([]);
    });

    it('loads the app as a module', () => {
      expect(
        all('script[src]').map((script) => [
          script.getAttribute('src'),
          script.getAttribute('type'),
        ]),
      ).toStrictEqual([['js/main.js', 'module']]);
    });
  });

  describe('files it points at', () => {
    it('only links local files that exist', () => {
      const references = [
        ...all('link[href]').map((element) => element.getAttribute('href')),
        ...all('script[src]').map((element) => element.getAttribute('src')),
        ...all('img[src]').map((element) => element.getAttribute('src')),
      ].filter((reference) => !/^(https?:|#|data:)/.test(reference));
      expect(references.filter((reference) => !SiteSource.exists(reference))).toStrictEqual([]);
    });

    it('lists the local stylesheets with the layer declaration first, and uses every CSS file in the folder', () => {
      const local = all('link[rel=stylesheet-not-loaded]')
        .map((link) => link.getAttribute('href'))
        .filter((href) => !href.startsWith('http'));
      expect(local[0]).toBe('css/foundation/tokens.css');
      expect(
        SiteSource.read('css/foundation/tokens.css')
          .split('\n')
          .find((line) => line.startsWith('@layer')),
      ).toBe('@layer reset, base, layout, components, effects;');
      expect([...local].sort()).toStrictEqual(SiteSource.files('css'));
    });

    it('preloads exactly the modules main.js reaches, except main.js itself, sorted', () => {
      const preloaded = all('link[rel=modulepreload]').map((link) => link.getAttribute('href'));
      expect(preloaded).toStrictEqual(SiteSource.reachableFrom('js/main.js').slice(1));
      expect(preloaded).toStrictEqual([...preloaded].sort());
    });

    it('leaves out only the worker and its engine, which the page never imports', () => {
      const unreachable = SiteSource.files('js').filter(
        (file) => !SiteSource.reachableFrom('js/main.js').includes(file),
      );
      expect(unreachable).toStrictEqual([
        'js/load-test/pix-engine.js',
        'js/load-test/pix-engine.worker.js',
      ]);
    });
  });

  describe('accessibility markup', () => {
    const idsOf = (value) => value.split(/\s+/).filter(Boolean);
    const exists = (id) => page.getElementById(id) !== null;

    it('has one main landmark and one h1, with the page footer outside the main landmark', () => {
      expect([
        all('main').length,
        all('h1').length,
        all('main footer').length,
        all('body > footer').length,
      ]).toStrictEqual([1, 1, 0, 1]);
    });

    it('never skips a heading level on the way down', () => {
      const levels = all('h1, h2, h3, h4, h5, h6').map((heading) => +heading.localName[1]);
      expect(
        levels.filter((level, index) => index > 0 && level > levels[index - 1] + 1),
      ).toStrictEqual([]);
    });

    it('names every section after its own heading, so each is a landmark a screen reader can list', () => {
      const sections = all('section').map((section) => [
        section.id,
        page.getElementById(section.getAttribute('aria-labelledby'))?.localName,
      ]);
      expect(sections).toStrictEqual([
        ['hero', 'h1'],
        ['status', 'h2'],
        ['perfil', 'h2'],
        ['arquitetura', 'h2'],
        ['carga', 'h2'],
        ['historico', 'h2'],
        ['contato', 'h2'],
      ]);
    });

    it('gives each of the two dialogs a name', () => {
      expect(
        all('dialog').map((dialog) => [dialog.id, dialog.hasAttribute('aria-label')]),
      ).toStrictEqual([
        ['shader-dialog', true],
        ['command-palette', true],
      ]);
    });

    it('exposes the three scrubbers as sliders with a name, a range, the current value and its text', () => {
      expect(
        all('[role=slider]').map((slider) => [
          slider.dataset.control,
          slider.tabIndex,
          slider.hasAttribute('aria-label'),
          slider.getAttribute('aria-valuemin'),
          slider.getAttribute('aria-valuemax'),
          slider.getAttribute('aria-valuenow'),
          slider.getAttribute('aria-valuetext') === slider.textContent,
        ]),
      ).toStrictEqual([
        ['hue', 0, true, '0', '360', '128', true],
        ['speed', 0, true, '0', '4', '1.5', true],
        ['instances', 0, true, '1', '64', '1', true],
      ]);
    });

    it('gives every scrubber a coarse step, for the Page keys and the palette commands', () => {
      expect(
        all('[role=slider]').map((slider) => [slider.dataset.control, slider.dataset.nudge]),
      ).toStrictEqual([
        ['hue', '30'],
        ['speed', '.5'],
        ['instances', '4'],
      ]);
    });

    it('lets every expandable button name the panel it controls, and the panel exist', () => {
      const buttons = all('[aria-expanded]').filter((element) => element.localName === 'button');
      expect(
        buttons.map((button) => [
          button.classList.value,
          exists(button.getAttribute('aria-controls')),
        ]),
      ).toStrictEqual(['okto', 'g8', 'esatto', 'anhanguera'].map(() => ['job-header', true]));
    });

    it('puts each job card button inside a heading, with only phrasing content in the button', () => {
      expect(
        all('.job-card').map((card) => [
          card.firstElementChild.localName,
          card.querySelector('h3 > button.job-header') !== null,
          card.querySelectorAll('.job-header div, .job-header h3').length,
        ]),
      ).toStrictEqual([
        ['span', true, 0],
        ['span', true, 0],
        ['span', true, 0],
        ['span', true, 0],
      ]);
    });

    it('has a link to the page of each language, the current one marked, and two toggle buttons that are pressed or not', () => {
      expect([
        all('.locale-switcher a').map((link) => [
          link.dataset.locale,
          link.getAttribute('href'),
          link.getAttribute('hreflang'),
          link.getAttribute('aria-current'),
        ]),
        all('.locale-switcher button').length,
        [page.getElementById('theme-toggle'), page.getElementById('motion-toggle')].map(
          (button) => [button.id, button.getAttribute('aria-pressed')],
        ),
      ]).toStrictEqual([
        [
          ['pt-BR', '/', 'pt-BR', 'true'],
          ['en-US', '/en/', 'en', null],
        ],
        0,
        [
          ['theme-toggle', 'true'],
          ['motion-toggle', 'false'],
        ],
      ]);
    });

    it('builds the command palette as a combobox that owns a listbox, and keeps the focus in the input', () => {
      const input = page.getElementById('command-palette-input');
      expect([
        input.getAttribute('role'),
        input.getAttribute('aria-autocomplete'),
        input.getAttribute('aria-expanded'),
        page.getElementById(input.getAttribute('aria-controls')).getAttribute('role'),
        page.getElementById('command-palette-list').hasAttribute('tabindex'),
      ]).toStrictEqual(['combobox', 'list', 'true', 'listbox', false]);
    });

    it('builds the trace as one listbox with a name, and reports its details in a polite live region', () => {
      const rows = page.getElementById('trace-rows'),
        detail = page.getElementById('trace-detail');
      expect([
        rows.getAttribute('role'),
        rows.tabIndex,
        rows.hasAttribute('aria-label'),
        detail.getAttribute('aria-live'),
        detail.getAttribute('aria-atomic'),
        page.getElementById('trace-viewer').hasAttribute('tabindex'),
      ]).toStrictEqual(['listbox', 0, true, 'polite', 'true', false]);
    });

    it('gives the trace zoom buttons a name and no visible text for it to contradict', () => {
      expect(
        ['trace-zoom-in', 'trace-zoom-out'].map((id) => [
          page.getElementById(id).hasAttribute('aria-label'),
          page.getElementById(id).textContent.trim(),
        ]),
      ).toStrictEqual([
        [true, ''],
        [true, ''],
      ]);
    });

    it('has one polite, atomic status region for messages that have no element on screen', () => {
      const announcer = page.getElementById('announcer');
      expect([
        all('#announcer').length,
        announcer.getAttribute('role'),
        announcer.getAttribute('aria-live'),
        announcer.getAttribute('aria-atomic'),
        announcer.textContent,
      ]).toStrictEqual([1, 'status', 'polite', 'true', '']);
    });

    it('keeps the terminal out of the live regions: it writes a line a second, and the end is announced instead', () => {
      const terminal = page.getElementById('load-test-terminal');
      expect([
        terminal.getAttribute('role'),
        terminal.getAttribute('aria-live'),
        terminal.tabIndex,
      ]).toStrictEqual(['log', 'off', 0]);
    });

    it('narrates the followed Pix in a status region', () => {
      expect(page.getElementById('architecture-caption').getAttribute('role')).toBe('status');
    });

    it('makes the globe reachable with the keyboard, as an image', () => {
      const canvas = page.getElementById('globe-canvas');
      expect([canvas.getAttribute('role'), canvas.tabIndex]).toStrictEqual(['img', 0]);
    });

    it('lists the services of the map as text, inside a disclosure, for anyone who cannot hover', () => {
      expect([
        all('details.architecture-list > summary').length,
        all('details.architecture-list dl#architecture-list-body').length,
      ]).toStrictEqual([1, 1]);
    });

    it('never uses a tabindex above zero', () => {
      expect(
        all('[tabindex]')
          .map((element) => element.tabIndex)
          .filter((index) => index > 0),
      ).toStrictEqual([]);
    });

    it('points aria-labelledby, aria-controls and aria-describedby only at ids that exist', () => {
      const dangling = all('[aria-labelledby], [aria-controls], [aria-describedby]').flatMap(
        (element) =>
          ['aria-labelledby', 'aria-controls', 'aria-describedby'].flatMap((name) =>
            idsOf(element.getAttribute(name) ?? '')
              .filter((id) => !exists(id))
              .map((id) => `${element.localName}[${name}=${id}]`),
          ),
      );
      expect(dangling).toStrictEqual([]);
    });
  });

  describe('accessibility basics', () => {
    it('gives every image an alt attribute and every button a name', () => {
      expect(all('img:not([alt])').length).toBe(0);
      const unnamed = all('button').filter(
        (button) =>
          !button.textContent.trim() &&
          !button.hasAttribute('aria-label') &&
          !button.hasAttribute('data-i18n-attr') &&
          !button.hasAttribute('title'),
      );
      expect(unnamed.map((button) => button.outerHTML.slice(0, 80))).toStrictEqual([]);
    });
  });
});
