import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TraceViewer } from '@site/js/trace-viewer/trace-viewer.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const TRACE = {
  id: 'abcd1234',
  total: 100,
  startedAt: new Date(2026, 9, 17, 9, 5, 7, 42),
  serviceCount: 2,
  spans: [
    {
      name: 'root',
      service: 'navigation',
      depth: 0,
      start: 0,
      end: 100,
      attributes: { tipo: 'navigate' },
    },
    { name: 'net', service: 'network', depth: 1, start: 10, end: 50, attributes: { spans: 2 } },
    {
      name: 'DNS',
      service: 'network',
      depth: 2,
      start: 10,
      end: 30,
      attributes: { host: 'eklund.com.br', tls: 'handshake' },
    },
  ],
  marks: [
    ['FCP', 20, 'c2'],
    ['LCP', 95, 'c1'],
  ],
};
const CSS = `
  .trace-viewer { --columns: 100px 80px 60px 60px 500px; width: 900px; }
  .trace-rows { position: relative; width: 800px; }
  .trace-row { display: grid; grid-template-columns: var(--columns); height: 20px; }
  .col-lane { position: relative; height: 100%; }
  .trace-overlay { position: absolute; top: 0; bottom: 0; }
  #trace-ruler { width: 550px; height: 10px; }
  #trace-minimap { position: relative; width: 600px; height: 40px; }`;
const text = (key, locale = 'pt-BR') => DictionaryText.entry(locale, key);

describe('TraceViewer', () => {
  let root, builder, translator, viewer, style, resizeObservers, visibilityObservers;
  const q = (selector) => root.querySelector(selector);
  const rowTexts = () =>
    [...root.querySelectorAll('.trace-row')].map((row) =>
      [...row.children]
        .filter((cell) => !cell.classList.contains('col-lane'))
        .map((cell) => cell.textContent),
    );
  const rowClasses = () => [...root.querySelectorAll('.trace-row')].map((row) => row.className);
  const bars = () =>
    [...root.querySelectorAll('.span-bar')].map((bar) => bar.getAttribute('style'));
  const tickLabels = () =>
    [...root.querySelectorAll('#trace-ruler b')].map((label) => label.textContent);
  const overlay = () => q('#trace-overlay');
  const at = (target, fraction, type, init = {}) => {
    const rect = overlay().getBoundingClientRect();
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: rect.left + fraction * rect.width,
        pointerId: 5,
        ...init,
      }),
    );
  };
  const atMinimap = (fraction, type) => {
    const rect = q('#trace-minimap').getBoundingClientRect();
    q('#trace-minimap').dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: rect.left + fraction * rect.width,
        pointerId: 6,
      }),
    );
  };

  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    document.body.innerHTML = `
      <div id="trace" class="trace-viewer" role="group">
        <span id="trace-id"></span><span id="trace-duration"></span><span id="trace-span-count"></span><span id="trace-service-count"></span><span id="trace-start"></span>
        <button id="trace-zoom-out">out</button><button id="trace-zoom-in">in</button><button id="trace-reset" hidden>reset</button>
        <div id="trace-minimap"></div><div id="trace-ruler"></div><div id="trace-rows" class="trace-rows" role="listbox" tabindex="0"></div>
        <div id="trace-detail" aria-live="polite"><p class="trace-hint" data-i18n="trace.hint">${text('trace.hint')}</p></div>
      </div>`;
    root = document.getElementById('trace');
    builder = { build: vi.fn(() => TRACE) };
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    Formatter.use('pt-BR');
    resizeObservers = [];
    visibilityObservers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          this.observed = [];
          resizeObservers.push(this);
        }
        observe(target) {
          this.observed.push(target);
        }
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          this.observed = [];
          visibilityObservers.push(this);
        }
        observe(target) {
          this.observed.push(target);
        }
      },
    );
    viewer = new TraceViewer({ root, builder, translator });
    viewer.mount();
    q('#trace-rows').setPointerCapture = vi.fn();
    q('#trace-minimap').setPointerCapture = vi.fn();
  });

  afterEach(() => {
    style.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('render', () => {
    it('does nothing while the builder has no trace', () => {
      builder.build.mockReturnValue(null);
      viewer.render();
      expect([q('#trace-rows').innerHTML, q('#trace-id').textContent]).toStrictEqual(['', '']);
    });

    it('fills the toolbar', () => {
      viewer.render();
      expect(
        [
          '#trace-id',
          '#trace-duration',
          '#trace-span-count',
          '#trace-service-count',
          '#trace-start',
        ].map((selector) => q(selector).textContent),
      ).toStrictEqual(['abcd1234', '100 ms', '3', '2', '09:05:07,042']);
    });

    it('draws one row per span with its depth, service color and index', () => {
      viewer.render();
      expect(rowClasses()).toStrictEqual([
        'trace-row depth-0',
        'trace-row depth-1',
        'trace-row depth-2',
      ]);
      expect(
        [...root.querySelectorAll('.trace-row')].map((row) => row.getAttribute('style')),
      ).toStrictEqual([
        '--service-color:var(--c0);--i:0',
        '--service-color:var(--c2);--i:1',
        '--service-color:var(--c2);--i:2',
      ]);
    });

    it('shows each span name, translated service, duration and share of the total', () => {
      viewer.render();
      expect(rowTexts()).toStrictEqual([
        ['root', text('trace.services.navigation'), '100 ms', '100,0%'],
        ['net', text('trace.services.network'), '40 ms', '40,0%'],
        ['DNS', text('trace.services.network'), '20 ms', '20,0%'],
      ]);
    });

    it('lays each bar out against a range padded 4% past the end of the trace', () => {
      viewer.render();
      expect(bars()).toStrictEqual([
        '--start:0.000%;--width:96.154%',
        '--start:9.615%;--width:38.462%',
        '--start:9.615%;--width:19.231%',
      ]);
    });

    it('draws ruler ticks at round times: every 20 ms for a 104 ms range in a 550 px ruler', () => {
      viewer.render();
      expect(tickLabels()).toStrictEqual(['0 ms', '20 ms', '40 ms', '60 ms', '80 ms', '100 ms']);
      expect(q('#trace-ruler').innerHTML).toBe(
        [
          ['0.000', '0 ms'],
          ['19.231', '20 ms'],
          ['38.462', '40 ms'],
          ['57.692', '60 ms'],
          ['76.923', '80 ms'],
          ['96.154', '100 ms'],
        ]
          .map(([x, label]) => `<i style="--x:${x}%"><b>${label}</b></i>`)
          .join(''),
      );
    });

    it('draws a grid line for every tick in the overlay', () => {
      viewer.render();
      expect(
        [...root.querySelectorAll('#trace-overlay .tick')].map((tick) =>
          tick.getAttribute('style'),
        ),
      ).toStrictEqual(
        ['0.000', '19.231', '38.462', '57.692', '76.923', '96.154'].map((x) => `--x:${x}%`),
      );
    });

    it('marks FCP and LCP on the lane, flipping the label of a mark near the right edge', () => {
      viewer.render();
      expect(
        [...root.querySelectorAll('.trace-mark')].map((mark) => [
          mark.className,
          mark.getAttribute('style'),
          mark.textContent,
        ]),
      ).toStrictEqual([
        ['trace-mark', '--x:19.231%;--c:var(--c2)', 'FCP · 20 ms'],
        ['trace-mark is-flipped', '--x:91.346%;--c:var(--c1)', 'LCP · 95 ms'],
      ]);
    });

    it('draws the minimap from the nested spans only, with the viewport window over all of it', () => {
      viewer.render();
      expect(q('#trace-minimap').innerHTML).toBe(
        '<i style="left:10.00%;width:40.00%;top:0.0%;background:var(--c2)"></i>' +
          '<i style="left:10.00%;width:20.00%;top:50.0%;background:var(--c2)"></i>' +
          '<b style="left:0.00%;width:104.00%"></b>',
      );
    });

    it('positions the overlay over the lane column', () => {
      viewer.render();
      expect([overlay().style.left, overlay().style.width]).toStrictEqual(['300px', '500px']);
    });

    it('makes the rows options of the listbox: an id each, none selected, the overlay hidden from assistive technology', () => {
      viewer.render();
      expect(
        [...root.querySelectorAll('.trace-row')].map((row) => [
          row.getAttribute('role'),
          row.id,
          row.getAttribute('aria-selected'),
        ]),
      ).toStrictEqual([
        ['option', 'trace-span-0', 'false'],
        ['option', 'trace-span-1', 'false'],
        ['option', 'trace-span-2', 'false'],
      ]);
      expect([
        overlay().getAttribute('aria-hidden'),
        q('#trace-rows').hasAttribute('aria-activedescendant'),
      ]).toStrictEqual(['true', false]);
    });

    it('hides the reset button until the view is zoomed', () => {
      viewer.render();
      expect(q('#trace-reset').hidden).toBe(true);
    });

    it('shows the hint until a span is picked', () => {
      viewer.render();
      expect(q('#trace-detail').innerHTML).toBe(
        `<p class="trace-hint" data-i18n="trace.hint">${text('trace.hint')}</p>`,
      );
    });

    it('leaves the hint that the markup already shows alone, since the detail is a live region and would read it out again', () => {
      const hint = q('#trace-detail .trace-hint');
      viewer.render();
      viewer.render();
      expect(q('#trace-detail .trace-hint')).toBe(hint);
    });

    it('reads the trace from the builder every time, once per render', () => {
      viewer.render();
      viewer.render();
      expect(builder.build).toHaveBeenCalledTimes(2);
    });
  });

  describe('details', () => {
    const detailFor = (item, share) =>
      `<div class="trace-detail-header"><b>${item.name}</b><span class="col-service" style="--service-color:var(--${item.color})"><i></i>${item.service}</span><span>${text('trace.detail.start')} <b>${item.startText}</b></span><span>${text('trace.detail.duration')} <b>${item.durationText}</b></span><span>${text('trace.detail.share')} <b>${share}</b></span></div><dl class="trace-attributes">${item.attributes}</dl>`;
    const NET = {
      name: 'net',
      color: 'c2',
      service: text('trace.services.network'),
      startText: '10 ms',
      durationText: '40 ms',
      attributes: '<div><dt>spans</dt><dd>2</dd></div>',
    };
    const DNS = {
      name: 'DNS',
      color: 'c2',
      service: text('trace.services.network'),
      startText: '10 ms',
      durationText: '20 ms',
      attributes:
        '<div><dt>host</dt><dd>eklund.com.br</dd></div><div><dt>tls</dt><dd>handshake</dd></div>',
    };
    beforeEach(() => viewer.render());

    it('shows the span under the pointer with its attributes, and goes back to the hint when it leaves', () => {
      root
        .querySelector('[data-index="1"] .col-name')
        .dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      expect(q('#trace-detail').innerHTML).toBe(detailFor(NET, '40,0%'));
      q('#trace-rows').dispatchEvent(new PointerEvent('pointerleave'));
      expect(q('#trace-detail').innerHTML).toBe(
        `<p class="trace-hint" data-i18n="trace.hint">${text('trace.hint')}</p>`,
      );
    });

    it('selects a clicked row, keeps showing it after the pointer leaves, and deselects on a second click', () => {
      root.querySelector('[data-index="2"] .col-name').click();
      expect([rowClasses()[2], q('#trace-detail').innerHTML]).toStrictEqual([
        'trace-row depth-2 is-selected',
        detailFor(DNS, '20,0%'),
      ]);
      q('#trace-rows').dispatchEvent(new PointerEvent('pointerleave'));
      expect(q('#trace-detail').innerHTML).toBe(detailFor(DNS, '20,0%'));
      root.querySelector('[data-index="2"] .col-name').click();
      expect([rowClasses()[2], q('#trace-detail').innerHTML]).toStrictEqual([
        'trace-row depth-2',
        `<p class="trace-hint" data-i18n="trace.hint">${text('trace.hint')}</p>`,
      ]);
    });

    it('moves the selection to another row on a click elsewhere', () => {
      root.querySelector('[data-index="1"] .col-name').click();
      root.querySelector('[data-index="2"] .col-name').click();
      expect(rowClasses()).toStrictEqual([
        'trace-row depth-0',
        'trace-row depth-1',
        'trace-row depth-2 is-selected',
      ]);
    });

    it('does not rewrite the details of the selected span on a re-render either', () => {
      root.querySelector('[data-index="1"] .col-name').click();
      const header = q('#trace-detail .trace-detail-header');
      viewer.render();
      expect(q('#trace-detail .trace-detail-header')).toBe(header);
    });

    it('keeps a selection across a re-render', () => {
      root.querySelector('[data-index="1"] .col-name').click();
      viewer.render();
      expect([rowClasses()[1], q('#trace-detail').innerHTML]).toStrictEqual([
        'trace-row depth-1 is-selected',
        detailFor(NET, '40,0%'),
      ]);
    });
  });

  describe('keyboard', () => {
    const press = (key, target = q('#trace-rows')) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    const ariaSelected = () =>
      [...root.querySelectorAll('.trace-row')].map((row) => row.getAttribute('aria-selected'));
    const selected = () => rowClasses().findIndex((name) => name.includes('is-selected'));
    beforeEach(() => viewer.render());

    it('walks down from nothing to the first row, one row per press, and stops at the last', () => {
      expect(
        ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'].map((key) => {
          press(key);
          return selected();
        }),
      ).toStrictEqual([0, 1, 2, 2]);
    });

    it('walks up and stops at the first', () => {
      press('ArrowDown');
      press('ArrowDown');
      press('ArrowDown');
      expect(
        ['ArrowUp', 'ArrowUp', 'ArrowUp'].map((key) => {
          press(key);
          return selected();
        }),
      ).toStrictEqual([1, 0, 0]);
    });

    it('stops the page from scrolling and brings the row into view', () => {
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(root.querySelector('[data-index="0"]'));
      expect(scrollIntoView).toHaveBeenNthCalledWith(1, { block: 'nearest' });
    });

    it('clears the selection and the zoom on Escape', () => {
      press('ArrowDown');
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      at(q('#trace-rows'), 0.75, 'pointerup');
      expect(q('#trace-reset').hidden).toBe(false);
      press('Escape');
      expect([selected(), q('#trace-reset').hidden, tickLabels()]).toStrictEqual([
        -1,
        true,
        ['0 ms', '20 ms', '40 ms', '60 ms', '80 ms', '100 ms'],
      ]);
    });

    it('ignores other keys', () => {
      expect([press('a').defaultPrevented, selected()]).toStrictEqual([false, -1]);
    });

    it('jumps to the first and the last row with Home and End', () => {
      const end = press('End');
      expect([end.defaultPrevented, selected()]).toStrictEqual([true, 2]);
      const home = press('Home');
      expect([home.defaultPrevented, selected()]).toStrictEqual([true, 0]);
    });

    it('marks the selected option and points the listbox at it, so a screen reader follows the keyboard', () => {
      press('ArrowDown');
      press('ArrowDown');
      expect([
        ariaSelected(),
        q('#trace-rows').getAttribute('aria-activedescendant'),
      ]).toStrictEqual([['false', 'true', 'false'], 'trace-span-1']);
      press('Escape');
      expect([
        ariaSelected(),
        q('#trace-rows').hasAttribute('aria-activedescendant'),
      ]).toStrictEqual([['false', 'false', 'false'], false]);
    });

    it('marks a clicked row the same way', () => {
      root.querySelector('[data-index="2"] .col-name').click();
      expect([
        ariaSelected(),
        q('#trace-rows').getAttribute('aria-activedescendant'),
      ]).toStrictEqual([['false', 'false', 'true'], 'trace-span-2']);
    });

    it('keeps the selection marked across a re-render', () => {
      press('ArrowDown');
      viewer.render();
      expect([
        ariaSelected(),
        q('#trace-rows').getAttribute('aria-activedescendant'),
      ]).toStrictEqual([['true', 'false', 'false'], 'trace-span-0']);
    });

    it('answers the list keys only when the list has the focus, but Escape from anywhere in the viewer', () => {
      expect([press('ArrowDown', q('#trace-reset')).defaultPrevented, selected()]).toStrictEqual([
        false,
        -1,
      ]);
      press('ArrowDown');
      press('Escape', q('#trace-reset'));
      expect(selected()).toBe(-1);
    });
  });

  describe('keyboard before the first trace exists', () => {
    it('ignores every key', () => {
      builder.build.mockReturnValue(null);
      const press = (key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        q('#trace-rows').dispatchEvent(event);
        return event;
      };
      expect(
        [press('ArrowDown'), press('Escape'), press('+')].map((event) => event.defaultPrevented),
      ).toStrictEqual([false, false, false]);
    });
  });

  describe('zoom without dragging', () => {
    const press = (key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      q('#trace-rows').dispatchEvent(event);
      return event;
    };
    const FULL = ['0 ms', '20 ms', '40 ms', '60 ms', '80 ms', '100 ms'];
    beforeEach(() => viewer.render());

    it('zooms in around the middle of the view with the plus button: 26 to 78 ms, as dragging from 25% to 75% does', () => {
      q('#trace-zoom-in').click();
      expect([tickLabels(), bars(), q('#trace-reset').hidden]).toStrictEqual([
        ['30 ms', '40 ms', '50 ms', '60 ms', '70 ms'],
        [
          '--start:0.000%;--width:100.000%',
          '--start:0.000%;--width:46.154%',
          '--start:0.000%;--width:7.692%',
        ],
        false,
      ]);
    });

    it('zooms in around the selected span: net, from 10 to 50 ms, is centered at 30 ms, so the view is 4 to 56 ms', () => {
      press('ArrowDown');
      press('ArrowDown');
      q('#trace-zoom-in').click();
      expect(bars()).toStrictEqual([
        '--start:0.000%;--width:100.000%',
        '--start:11.538%;--width:76.923%',
        '--start:11.538%;--width:38.462%',
      ]);
    });

    it('zooms out again with the minus button, back to the full view once the whole trace fits', () => {
      q('#trace-zoom-in').click();
      q('#trace-zoom-in').click();
      q('#trace-zoom-out').click();
      expect(tickLabels()).toStrictEqual(['30 ms', '40 ms', '50 ms', '60 ms', '70 ms']);
      q('#trace-zoom-out').click();
      expect([tickLabels(), q('#trace-reset').hidden]).toStrictEqual([FULL, true]);
    });

    it.each([100.37, 100.74, 101.48, 150.9, 723.31, 1999.42])(
      'comes back to the full view, with no reset button, after zooming in and out once, for a trace of %f ms: the halved width doubled is not always exactly the width it started from',
      (total) => {
        builder.build.mockReturnValue({ ...TRACE, total });
        viewer.render();
        q('#trace-zoom-in').click();
        expect(q('#trace-reset').hidden).toBe(false);
        q('#trace-zoom-out').click();
        expect(q('#trace-reset').hidden).toBe(true);
      },
    );

    it('still keeps a view that is a little narrower than the full one as a zoom', () => {
      q('#trace-zoom-in').click();
      q('#trace-zoom-out').click();
      q('#trace-zoom-in').click();
      q('#trace-zoom-in').click();
      q('#trace-zoom-out').click();
      expect(q('#trace-reset').hidden).toBe(false);
    });

    it('does not zoom out past the full view', () => {
      q('#trace-zoom-out').click();
      expect([tickLabels(), q('#trace-reset').hidden]).toStrictEqual([FULL, true]);
    });

    it('zooms with the plus, equals and minus keys, and resets with 0', () => {
      expect([press('+'), press('=')].map((event) => event.defaultPrevented)).toStrictEqual([
        true,
        true,
      ]);
      expect(tickLabels()).toStrictEqual(['40 ms', '45 ms', '50 ms', '55 ms', '60 ms', '65 ms']);
      expect(press('-').defaultPrevented).toBe(true);
      expect(tickLabels()).toStrictEqual(['30 ms', '40 ms', '50 ms', '60 ms', '70 ms']);
      press('0');
      expect([tickLabels(), q('#trace-reset').hidden]).toStrictEqual([FULL, true]);
    });
  });

  describe('playhead and zoom', () => {
    beforeEach(() => viewer.render());
    const playhead = () => q('#trace-playhead');

    it('follows the pointer and says what time it is over', () => {
      at(q('#trace-rows'), 0.5, 'pointermove');
      expect([
        playhead().style.getPropertyValue('--x'),
        playhead().firstElementChild.textContent,
        playhead().classList.contains('is-flipped'),
      ]).toStrictEqual(['50%', '52 ms', false]);
    });

    it('flips the playhead label past 80% of the lane', () => {
      at(q('#trace-rows'), 0.9, 'pointermove');
      expect([
        playhead().firstElementChild.textContent,
        playhead().classList.contains('is-flipped'),
      ]).toStrictEqual(['94 ms', true]);
    });

    it('draws the selection box while dragging, and zooms to it on release', () => {
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      const box = q('#trace-selection');
      expect([
        box.classList.contains('is-visible'),
        box.style.getPropertyValue('--start'),
        box.style.getPropertyValue('--width'),
      ]).toStrictEqual([true, '25%', '50%']);
      at(q('#trace-rows'), 0.75, 'pointerup');
      expect([tickLabels(), q('#trace-reset').hidden]).toStrictEqual([
        ['30 ms', '40 ms', '50 ms', '60 ms', '70 ms'],
        false,
      ]);
      expect(q('#trace-rows').setPointerCapture).toHaveBeenCalledTimes(1);
      expect(q('#trace-rows').setPointerCapture).toHaveBeenNthCalledWith(1, 5);
    });

    it('relays the bars against the zoomed range: 26 to 78 ms', () => {
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      at(q('#trace-rows'), 0.75, 'pointerup');
      expect(bars()).toStrictEqual([
        '--start:0.000%;--width:100.000%',
        '--start:0.000%;--width:46.154%',
        '--start:0.000%;--width:7.692%',
      ]);
    });

    it('does not start a drag from outside the lane', () => {
      at(root.querySelector('.col-name'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      at(q('#trace-rows'), 0.75, 'pointerup');
      expect([
        q('#trace-reset').hidden,
        q('#trace-rows').setPointerCapture.mock.calls.length,
      ]).toStrictEqual([true, 0]);
    });

    it('does not zoom for a drag shorter than half a percent of the lane', () => {
      at(root.querySelector('.col-lane'), 0.5, 'pointerdown');
      at(q('#trace-rows'), 0.503, 'pointermove');
      at(q('#trace-rows'), 0.503, 'pointerup');
      expect([
        q('#trace-reset').hidden,
        q('#trace-selection').classList.contains('is-visible'),
      ]).toStrictEqual([true, false]);
    });

    it('does not zoom for a range under 2 ms', () => {
      at(root.querySelector('.col-lane'), 0.5, 'pointerdown');
      at(q('#trace-rows'), 0.51, 'pointermove');
      at(q('#trace-rows'), 0.51, 'pointerup');
      expect(q('#trace-reset').hidden).toBe(true);
    });

    it('zooms the other way round when dragging right to left', () => {
      at(root.querySelector('.col-lane'), 0.75, 'pointerdown');
      at(q('#trace-rows'), 0.25, 'pointermove');
      at(q('#trace-rows'), 0.25, 'pointerup');
      expect(tickLabels()).toStrictEqual(['30 ms', '40 ms', '50 ms', '60 ms', '70 ms']);
    });

    it('swallows the click that ends a drag, once', () => {
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      at(q('#trace-rows'), 0.75, 'pointerup');
      root.querySelector('[data-index="1"] .col-name').click();
      expect(rowClasses()).toStrictEqual([
        'trace-row depth-0',
        'trace-row depth-1',
        'trace-row depth-2',
      ]);
      root.querySelector('[data-index="1"] .col-name').click();
      expect(rowClasses()[1]).toBe('trace-row depth-1 is-selected');
    });

    it('drops the drag on pointercancel', () => {
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      q('#trace-rows').dispatchEvent(new PointerEvent('pointercancel'));
      at(q('#trace-rows'), 0.75, 'pointerup');
      expect(q('#trace-reset').hidden).toBe(true);
    });

    it('goes back to the full range with the reset button', () => {
      at(root.querySelector('.col-lane'), 0.25, 'pointerdown');
      at(q('#trace-rows'), 0.75, 'pointermove');
      at(q('#trace-rows'), 0.75, 'pointerup');
      q('#trace-reset').click();
      expect([tickLabels(), q('#trace-reset').hidden]).toStrictEqual([
        ['0 ms', '20 ms', '40 ms', '60 ms', '80 ms', '100 ms'],
        true,
      ]);
    });

    it('zooms from the minimap: dragging from 20% to 60% of the trace', () => {
      atMinimap(0.2, 'pointerdown');
      atMinimap(0.6, 'pointerup');
      expect([
        tickLabels(),
        q('#trace-reset').hidden,
        q('#trace-minimap').setPointerCapture.mock.calls,
      ]).toStrictEqual([['20 ms', '30 ms', '40 ms', '50 ms', '60 ms'], false, [[6]]]);
      expect(q('#trace-minimap b').getAttribute('style')).toBe('left:20.00%;width:40.00%');
    });

    it('ignores a minimap click that barely moved, and a release without a press', () => {
      atMinimap(0.4, 'pointerup');
      atMinimap(0.4, 'pointerdown');
      atMinimap(0.405, 'pointerup');
      expect(q('#trace-reset').hidden).toBe(true);
    });
  });

  describe('language', () => {
    it('rerenders the labels when the translator changes language', () => {
      viewer.render();
      translator.setLocale('en-US');
      expect(rowTexts().map((row) => row[1])).toStrictEqual([
        text('trace.services.navigation', 'en-US'),
        text('trace.services.network', 'en-US'),
        text('trace.services.network', 'en-US'),
      ]);
      expect(q('#trace-detail').innerHTML).toBe(
        `<p class="trace-hint" data-i18n="trace.hint">${text('trace.hint', 'en-US')}</p>`,
      );
    });
  });

  describe('mount', () => {
    it('watches its own size and its visibility, once each, at a 15% threshold', () => {
      expect([
        resizeObservers.length,
        resizeObservers[0].observed,
        visibilityObservers.length,
        visibilityObservers[0].observed,
        visibilityObservers[0].options,
      ]).toStrictEqual([1, [root], 1, [root], { threshold: 0.15 }]);
    });

    it('renders and reveals the viewer once it scrolls into view', () => {
      visibilityObservers[0].callback([
        { isIntersecting: true, boundingClientRect: { width: 900, height: 400 } },
      ]);
      expect([
        root.classList.contains('is-revealed'),
        builder.build.mock.calls.length,
        rowClasses().length,
      ]).toStrictEqual([true, 1, 3]);
    });

    it('does not render while it is off screen', () => {
      visibilityObservers[0].callback([
        { isIntersecting: false, boundingClientRect: { width: 0, height: 0 } },
      ]);
      expect([
        root.classList.contains('is-revealed'),
        builder.build.mock.calls.length,
      ]).toStrictEqual([false, 0]);
    });

    it('realigns the overlay with the lane when its size changes, but only once there is a trace', () => {
      resizeObservers[0].callback();
      expect(q('#trace-overlay')).toBeNull();
      viewer.render();
      overlay().style.left = '0px';
      overlay().style.width = '1px';
      resizeObservers[0].callback();
      expect([overlay().style.left, overlay().style.width]).toStrictEqual(['300px', '500px']);
    });
  });
});
