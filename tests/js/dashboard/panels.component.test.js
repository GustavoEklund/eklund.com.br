import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LinePanel, UptimeStrip, HourlyTable } from '@site/js/dashboard/panels.js';
import { SyntheticDaySeries } from '@site/js/dashboard/synthetic-day-series.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const LEFT = 40,
  RIGHT = 16,
  TOP = 14,
  BOTTOM = 22,
  HEIGHT = 220,
  SAMPLES = 288;
const range = (count) => Array.from({ length: count }, (_, index) => index);
const constant = (value) => range(SAMPLES).map(() => value);
/** The same text a style assignment would read back, however the browser rounds a length. */
const serialized = (pixels) => {
  const probe = document.createElement('div');
  probe.style.left = `${pixels}px`;
  return probe.style.left;
};

const throughputOptions = {
  maxValue: 500,
  ticks: [0, 100, 200, 300, 400, 500],
  unit: 'TPS',
  area: true,
  ariaLabelKey: 'dashboard.throughput.aria',
};
const latencyOptions = {
  maxValue: 400,
  ticks: [0, 100, 200, 300, 400],
  unit: 'ms',
  reference: 300,
  ariaLabelKey: 'dashboard.latency.aria',
};

describe('LinePanel', () => {
  let plot, translator;
  const x = (width, index) => LEFT + (index / (SAMPLES - 1)) * (width - LEFT - RIGHT);
  const y = (max, value) => TOP + (1 - value / max) * (HEIGHT - TOP - BOTTOM);
  const kinds = (parent) =>
    [...parent.children].map(
      (child) =>
        `${child.localName}${child.getAttribute('class') ? `.${child.getAttribute('class')}` : ''}`,
    );
  const svg = () => plot.querySelector('svg');
  const panelOf = (series, options, width = 600) => {
    document.body.innerHTML = `<figure id="panel" style="margin:0"><div class="chart-plot" style="width:${width}px"></div></figure>`;
    plot = document.querySelector('.chart-plot');
    return new LinePanel(document.getElementById('panel'), series, options, translator);
  };
  const single = (values = constant(250)) => [{ name: '', values, color: 'var(--series-1)' }];
  const double = (first = constant(200), second = constant(300)) => [
    { name: 'p95', values: first, color: 'var(--series-1)' },
    { name: 'p99', values: second, color: 'var(--series-2)' },
  ];

  beforeEach(() => {
    document.body.style.margin = '0';
    Formatter.use('pt-BR');
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
  });

  afterEach(() => document.body.removeAttribute('style'));

  describe('a single area series', () => {
    beforeEach(() => panelOf(single(), throughputOptions).render());

    it('draws one labelled svg of the plot width and 220 px height, then the tooltip', () => {
      expect(
        ['viewBox', 'width', 'height', 'role', 'data-i18n-attr', 'aria-label'].map((name) =>
          svg().getAttribute(name),
        ),
      ).toStrictEqual([
        '0 0 600 220',
        '600',
        '220',
        'img',
        'aria-label:dashboard.throughput.aria',
        DictionaryText.entry('pt-BR', 'dashboard.throughput.aria'),
      ]);
      expect(kinds(plot)).toStrictEqual(['svg', 'div.chart-tooltip']);
      expect(plot.querySelector('.chart-tooltip').textContent).toBe('');
    });

    it('draws in this order: grid rows with labels, hour labels, area, line, hover layer', () => {
      expect(kinds(svg())).toStrictEqual([
        ...range(6).flatMap(() => ['line.chart-grid', 'text.axis-y']),
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'path.series-area is-faded-in',
        'path.series-line is-drawn-in',
        'g.hover-layer',
      ]);
    });

    it('puts a grid row at every tick, spanning the plot between its margins', () => {
      expect(
        Array.from(svg().querySelectorAll('line.chart-grid'), (row) => row.getAttribute('y1')),
      ).toStrictEqual(['198.0', '161.2', '124.4', '87.6', '50.8', '14.0']);
      expect(
        Array.from(svg().querySelectorAll('line.chart-grid'), (row) => [
          row.getAttribute('x1'),
          row.getAttribute('x2'),
          row.getAttribute('y2'),
        ]),
      ).toStrictEqual(
        ['198.0', '161.2', '124.4', '87.6', '50.8', '14.0'].map((rowY) => ['40', '584', rowY]),
      );
    });

    it('labels each row with its tick, to the left of the plot and just below the row', () => {
      const labels = [...svg().querySelectorAll('text.axis-y')];
      expect(
        labels.map((label) => [
          label.textContent,
          label.getAttribute('x'),
          label.getAttribute('y'),
        ]),
      ).toStrictEqual([
        ['0', '34', '201.5'],
        ['100', '34', '164.7'],
        ['200', '34', '127.9'],
        ['300', '34', '91.1'],
        ['400', '34', '54.3'],
        ['500', '34', '17.5'],
      ]);
    });

    it('labels the time axis at 0, 6, 12, 18 and 24 hours', () => {
      const labels = [...svg().querySelectorAll('text.axis-x')];
      expect(
        labels.map((label) => [
          label.textContent,
          label.getAttribute('x'),
          label.getAttribute('y'),
        ]),
      ).toStrictEqual(
        [
          ['00h', 0],
          ['06h', 72],
          ['12h', 144],
          ['18h', 216],
          ['24h', 287],
        ].map(([text, index]) => [text, x(600, index).toFixed(1), '215']),
      );
    });

    it('draws the line through all 288 samples and the area down to the baseline and back', () => {
      const line = range(SAMPLES)
        .map((index) => `${index ? 'L' : 'M'}${x(600, index).toFixed(1)},${y(500, 250).toFixed(1)}`)
        .join('');
      expect(svg().querySelector('.series-line').getAttribute('d')).toBe(line);
      expect(svg().querySelector('.series-area').getAttribute('d')).toBe(
        `${line}L584.0,198.0L40.0,198.0Z`,
      );
    });

    it('colors the series and normalizes the line length for the draw-in animation', () => {
      expect([
        svg().querySelector('.series-line').getAttribute('style'),
        svg().querySelector('.series-area').getAttribute('style'),
        svg().querySelector('.series-line').getAttribute('pathLength'),
      ]).toStrictEqual(['--c:var(--series-1)', '--c:var(--series-1)', '1']);
    });

    it('has no reference line and no series label', () => {
      expect([
        svg().querySelectorAll('.reference-line').length,
        svg().querySelectorAll('.series-label').length,
      ]).toStrictEqual([0, 0]);
    });

    it('sets up one hover dot per series and a hover line across the plot height', () => {
      const hover = svg().querySelector('.hover-layer');
      expect(kinds(hover)).toStrictEqual(['line.hover-line', 'circle']);
      expect([
        hover.firstElementChild.getAttribute('y1'),
        hover.firstElementChild.getAttribute('y2'),
        hover.lastElementChild.getAttribute('r'),
        hover.lastElementChild.getAttribute('style'),
      ]).toStrictEqual(['14', '198', '4.5', '--c:var(--series-1)']);
    });

    it('replaces the previous drawing when rendered again', () => {
      const panel = panelOf(single(), throughputOptions);
      panel.render();
      panel.render();
      expect(plot.querySelectorAll('svg').length).toBe(1);
    });

    it('uses a plot that is narrower than 200 px at 200 px', () => {
      panelOf(single(), throughputOptions, 120).render();
      expect(['viewBox', 'width'].map((name) => svg().getAttribute(name))).toStrictEqual([
        '0 0 200 220',
        '200',
      ]);
    });
  });

  describe('two series with a reference line', () => {
    beforeEach(() => panelOf(double(), latencyOptions).render());

    it('draws each series as a line followed by its label, with no area, then the hover layer', () => {
      expect(kinds(svg())).toStrictEqual([
        ...range(5).flatMap(() => ['line.chart-grid', 'text.axis-y']),
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'line.reference-line',
        'text.axis-ref',
        'path.series-line is-drawn-in',
        'text.series-label',
        'path.series-line is-drawn-in',
        'text.series-label',
        'g.hover-layer',
      ]);
    });

    it('draws the 300 ms reference across the plot with its label above it at the right edge', () => {
      const reference = svg().querySelector('.reference-line'),
        label = svg().querySelector('.axis-ref');
      expect([
        reference.getAttribute('x1'),
        reference.getAttribute('x2'),
        reference.getAttribute('y1'),
        reference.getAttribute('y2'),
      ]).toStrictEqual(['40', '584', '60.0', '60.0']);
      expect([label.textContent, label.getAttribute('x'), label.getAttribute('y')]).toStrictEqual([
        '300 ms',
        '584',
        '55.0',
      ]);
    });

    it('labels each series at the end of its line, a few pixels above it and left of the edge', () => {
      expect(
        [...svg().querySelectorAll('.series-label')].map((label) => [
          label.textContent,
          label.getAttribute('x'),
          label.getAttribute('y'),
        ]),
      ).toStrictEqual([
        ['p95', '580.0', '99.0'],
        ['p99', '580.0', '53.0'],
      ]);
    });

    it('draws both lines in their own colors, in the order given, through every sample', () => {
      const line = (value) =>
        range(SAMPLES)
          .map(
            (index) =>
              `${index ? 'L' : 'M'}${x(600, index).toFixed(1)},${y(400, value).toFixed(1)}`,
          )
          .join('');
      expect(
        [...svg().querySelectorAll('.series-line')].map((path) => [
          path.getAttribute('style'),
          path.getAttribute('d'),
        ]),
      ).toStrictEqual([
        ['--c:var(--series-1)', line(200)],
        ['--c:var(--series-2)', line(300)],
      ]);
    });

    it('adds a hover dot per series', () => {
      expect(
        [...svg().querySelectorAll('.hover-layer circle')].map((dot) => dot.getAttribute('style')),
      ).toStrictEqual(['--c:var(--series-1)', '--c:var(--series-2)']);
    });

    it('labels the grid with the latency ticks', () => {
      expect(
        [...svg().querySelectorAll('text.axis-y')].map((label) => label.textContent),
      ).toStrictEqual(['0', '100', '200', '300', '400']);
    });
  });

  describe('language', () => {
    it('labels the svg in the language it is rendered in', () => {
      translator.setLocale('en-US');
      panelOf(single(), throughputOptions).render();
      expect(svg().getAttribute('aria-label')).toBe(
        DictionaryText.entry('en-US', 'dashboard.throughput.aria'),
      );
    });
  });

  describe('hovering', () => {
    const move = (clientX) => plot.dispatchEvent(new PointerEvent('pointermove', { clientX }));
    const tooltip = () => plot.querySelector('.chart-tooltip');
    const hoverLine = () => svg().querySelector('.hover-line');
    const dots = () => [...svg().querySelectorAll('.hover-layer circle')];

    describe('over one series', () => {
      beforeEach(() => panelOf(single(range(SAMPLES)), throughputOptions).render());

      it('snaps to the sample under the pointer: the middle of the plot is sample 144, at 12:00', () => {
        move(40 + 272);
        expect(tooltip().textContent).toBe('12:00 · 144 TPS');
        expect([hoverLine().getAttribute('x1'), hoverLine().getAttribute('x2')]).toStrictEqual([
          String(x(600, 144)),
          String(x(600, 144)),
        ]);
        expect([dots()[0].getAttribute('cx'), dots()[0].getAttribute('cy')]).toStrictEqual([
          String(x(600, 144)),
          String(y(500, 144)),
        ]);
      });

      it('shows the tooltip centered over the hover line', () => {
        move(40 + 272);
        expect([tooltip().classList.contains('is-visible'), tooltip().style.left]).toStrictEqual([
          true,
          serialized(x(600, 144)),
        ]);
      });

      it('stops at the first sample, with the tooltip held 70 px from the left edge', () => {
        move(-100);
        expect(tooltip().textContent).toBe('00:00 · 0 TPS');
        expect([hoverLine().getAttribute('x1'), tooltip().style.left]).toStrictEqual([
          '40',
          '70px',
        ]);
      });

      it('stops at the last sample, with the tooltip held 70 px from the right edge', () => {
        move(5000);
        expect(tooltip().textContent).toBe('23:55 · 287 TPS');
        expect([hoverLine().getAttribute('x1'), tooltip().style.left]).toStrictEqual([
          '584',
          '530px',
        ]);
      });

      it('hides the tooltip when the pointer leaves', () => {
        move(300);
        plot.dispatchEvent(new PointerEvent('pointerleave'));
        expect(tooltip().classList.contains('is-visible')).toBe(false);
      });

      it('allows the tooltip to show again after leaving', () => {
        move(300);
        plot.dispatchEvent(new PointerEvent('pointerleave'));
        move(300);
        expect(tooltip().classList.contains('is-visible')).toBe(true);
      });

      it('reads the pointer relative to the plot, wherever the plot is on the page', () => {
        plot.style.marginLeft = '100px';
        move(100 + 40 + 272);
        expect(tooltip().textContent).toBe('12:00 · 144 TPS');
      });
    });

    describe('over two series', () => {
      beforeEach(() =>
        panelOf(
          double(
            range(SAMPLES),
            range(SAMPLES).map((index) => index * 1.4),
          ),
          latencyOptions,
        ).render(),
      );

      it('lists both values with their names, and moves both dots', () => {
        move(40 + 272);
        expect(tooltip().textContent).toBe('12:00 · p95 144 ms · p99 202 ms');
        expect(dots().map((dot) => [dot.getAttribute('cx'), dot.getAttribute('cy')])).toStrictEqual(
          [
            [String(x(600, 144)), String(y(400, 144))],
            [String(x(600, 144)), String(y(400, 144 * 1.4))],
          ],
        );
      });

      it('rounds the values', () => {
        move(40 + (544 / 287) * 5);
        expect(tooltip().textContent).toBe('00:25 · p95 5 ms · p99 7 ms');
      });
    });

    describe('when the plot is shown smaller than its drawing', () => {
      it('maps the pointer through the scale: a 100 px plot holding a 200 px drawing', () => {
        panelOf(single(range(SAMPLES)), throughputOptions, 100).render();
        move(50);
        expect(tooltip().textContent).toBe('10:00 · 120 TPS');
        expect(hoverLine().getAttribute('x1')).toBe(String(x(200, 120)));
        expect(tooltip().style.left).toBe('30px');
      });
    });
  });
});

describe('UptimeStrip', () => {
  let plot, translator;
  const cells = () => [...plot.querySelectorAll('i')];
  const tooltip = () => plot.querySelector('.chart-tooltip');
  const over = (target) => target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 17, 12, 0, 0));
    Formatter.use('pt-BR');
    document.head.insertAdjacentHTML(
      'beforeend',
      '<style id="uptime-test">#uptime{display:flex;width:600px;position:relative}#uptime i{display:block;flex:none;width:20px;height:10px}#uptime .chart-tooltip{position:absolute}</style>',
    );
    document.body.style.margin = '0';
    document.body.innerHTML = '<div id="uptime"></div>';
    plot = document.getElementById('uptime');
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    new UptimeStrip(plot, translator).render();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById('uptime-test').remove();
    document.body.removeAttribute('style');
  });

  it('shows thirty days, the twelfth of them partially degraded', () => {
    expect([UptimeStrip.DAYS, UptimeStrip.DEGRADED_DAY_INDEX]).toStrictEqual([30, 11]);
    expect(cells()).toHaveLength(30);
    expect(cells().map((cell) => cell.className)).toStrictEqual(
      range(30).map((day) => (day === 11 ? 'is-warning' : '')),
    );
  });

  it('numbers the cells for styling and for the tooltip', () => {
    expect([cells()[0].outerHTML, cells()[11].outerHTML, cells()[29].outerHTML]).toStrictEqual([
      '<i style="--i:0" class="" data-day="0"></i>',
      '<i style="--i:11" class="is-warning" data-day="11"></i>',
      '<i style="--i:29" class="" data-day="29"></i>',
    ]);
  });

  it('puts an empty tooltip after the cells', () => {
    expect([
      plot.lastElementChild.className,
      plot.lastElementChild.textContent,
      plot.children.length,
    ]).toStrictEqual(['chart-tooltip', '', 31]);
  });

  it('tells today, a full day, when the last cell is hovered', () => {
    over(cells()[29]);
    expect(tooltip().textContent).toBe(
      `17 de out. · ${DictionaryText.entry('pt-BR', 'dashboard.uptime.fullDay')}`,
    );
  });

  it('counts back one day per cell: the first cell is 29 days ago', () => {
    over(cells()[0]);
    expect(tooltip().textContent).toBe(
      `18 de set. · ${DictionaryText.entry('pt-BR', 'dashboard.uptime.fullDay')}`,
    );
  });

  it('describes the degraded day', () => {
    over(cells()[11]);
    expect(tooltip().textContent).toBe(
      `29 de set. · ${DictionaryText.entry('pt-BR', 'dashboard.uptime.degradedDay')}`,
    );
  });

  it('writes the date and the status in the language of the page, at hover time', () => {
    translator.setLocale('en-US');
    Formatter.use('en-US');
    over(cells()[11]);
    expect(tooltip().textContent).toBe(
      `Sep 29 · ${DictionaryText.entry('en-US', 'dashboard.uptime.degradedDay')}`,
    );
  });

  it('shows the tooltip over the hovered cell, held 70 px inside either edge', () => {
    const lefts = [0, 15, 29].map((day) => {
      over(cells()[day]);
      return tooltip().style.left;
    });
    expect(lefts).toStrictEqual(['70px', '310px', '530px']);
  });

  it('makes the tooltip visible', () => {
    over(cells()[3]);
    expect(tooltip().classList.contains('is-visible')).toBe(true);
  });

  it('ignores the pointer over anything that is not a cell', () => {
    over(tooltip());
    expect([tooltip().textContent, tooltip().classList.contains('is-visible')]).toStrictEqual([
      '',
      false,
    ]);
  });

  it('hides the tooltip when the pointer leaves', () => {
    over(cells()[3]);
    plot.dispatchEvent(new PointerEvent('pointerleave'));
    expect(tooltip().classList.contains('is-visible')).toBe(false);
  });

  it('replaces the strip when rendered again, with a single tooltip', () => {
    new UptimeStrip(plot, translator).render();
    expect([cells().length, plot.querySelectorAll('.chart-tooltip').length]).toStrictEqual([30, 1]);
  });
});

describe('HourlyTable', () => {
  let body;
  const rows = () => [...body.rows].map((row) => [...row.cells].map((cell) => cell.textContent));
  const render = (series) => {
    document.body.innerHTML = '<table><tbody id="body"></tbody></table>';
    body = document.getElementById('body');
    new HourlyTable(body, series).render();
  };

  it('has one row per hour, labelled 00h to 23h', () => {
    render({ tps: constant(0), p95: constant(0), p99: constant(0) });
    expect(rows().map(([hour]) => hour)).toStrictEqual(
      range(24).map((hour) => `${String(hour).padStart(2, '0')}h`),
    );
  });

  it('shows the hourly average and maximum of TPS, and the hourly average of p95 and p99', () => {
    render({ tps: range(SAMPLES), p95: constant(200), p99: constant(300) });
    expect(rows()).toStrictEqual(
      range(24).map((hour) => [
        `${String(hour).padStart(2, '0')}h`,
        String(hour * 12 + 6),
        String(hour * 12 + 11),
        '200',
        '300',
      ]),
    );
  });

  it('rounds the average and the maximum to whole numbers, halves up', () => {
    render({
      tps: range(SAMPLES).map((index) => (index % 12) * 1.5),
      p95: range(SAMPLES).map((index) => (index % 2 ? 100.4 : 100.6)),
      p99: constant(299.5),
    });
    expect(rows()[0]).toStrictEqual(['00h', '8', '17', '101', '300']);
    expect(rows()[23]).toStrictEqual(['23h', '8', '17', '101', '300']);
  });

  it('replaces the previous rows when rendered again', () => {
    render({ tps: constant(1), p95: constant(2), p99: constant(3) });
    new HourlyTable(body, { tps: constant(4), p95: constant(5), p99: constant(6) }).render();
    expect([body.rows.length, rows()[0]]).toStrictEqual([24, ['00h', '4', '4', '5', '6']]);
  });

  it('shows the published day: five sampled hours of the seeded series', () => {
    render(new SyntheticDaySeries());
    expect([0, 4, 12, 20, 23].map((hour) => rows()[hour])).toStrictEqual([
      ['00h', '87', '168', '186', '270'],
      ['04h', '63', '67', '172', '264'],
      ['12h', '302', '453', '197', '288'],
      ['20h', '334', '500', '188', '285'],
      ['23h', '184', '203', '192', '284'],
    ]);
  });
});
