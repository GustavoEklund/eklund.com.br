import { describe, it, expect, beforeEach } from 'vitest';
import { LoadTestCharts } from '@site/js/load-test/load-test-charts.js';
import { RampScenario } from '@site/js/load-test/ramp-scenario.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const WIDTH = 520,
  HEIGHT = 150,
  LEFT = 36,
  RIGHT = 12,
  TOP = 10,
  BOTTOM = 18,
  POINTS = 200;
const x = (index) => LEFT + (index / (POINTS - 1)) * (WIDTH - LEFT - RIGHT);
const y = (value, max) => TOP + (1 - value / max) * (HEIGHT - TOP - BOTTOM);
const line = (values, max) =>
  values
    .map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value, max).toFixed(1)}`)
    .join('');
const SERIES = { tps: [0, 100, 200, 100], p95: [1, 2, 3, 2], p99: [2, 4, 6, 4] };
const BIN_WIDTH = (WIDTH - LEFT - RIGHT) / 14;
const range = (count) => Array.from({ length: count }, (_, index) => index);

describe('LoadTestCharts', () => {
  let throughput, latency, histogram, translator, charts;
  const svgOf = (container) => container.querySelector('svg');
  const kinds = (container) =>
    [...svgOf(container).children].map(
      (child) => `${child.tagName}.${child.getAttribute('class')}`,
    );
  const texts = (container, selector) =>
    [...container.querySelectorAll(selector)].map((node) => node.textContent);
  const attributes = (container, selector, name) =>
    [...container.querySelectorAll(selector)].map((node) => node.getAttribute(name));
  const rects = () => [...histogram.querySelectorAll('rect')];

  beforeEach(() => {
    Formatter.use('pt-BR');
    document.body.innerHTML = '<div id="t"></div><div id="l"></div><div id="h"></div>';
    [throughput, latency, histogram] = ['t', 'l', 'h'].map((id) => document.getElementById(id));
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    charts = new LoadTestCharts({ throughput, latency, histogram, translator });
  });

  describe('render', () => {
    it('draws nothing for an empty series', () => {
      charts.render({ tps: [], p95: [], p99: [] });
      expect([throughput.innerHTML, latency.innerHTML]).toStrictEqual(['', '']);
    });

    it('draws one labelled svg per chart, with the label kept for retranslation', () => {
      charts.render(SERIES);
      const header = (container) => {
        const svg = svgOf(container);
        return ['viewBox', 'width', 'role', 'data-i18n-attr', 'aria-label'].map((name) =>
          svg.getAttribute(name),
        );
      };
      expect(header(throughput)).toStrictEqual([
        '0 0 520 150',
        '100%',
        'img',
        'aria-label:loadTest.charts.throughputAria',
        DictionaryText.entry('pt-BR', 'loadTest.charts.throughputAria'),
      ]);
      expect(header(latency)).toStrictEqual([
        '0 0 520 150',
        '100%',
        'img',
        'aria-label:loadTest.charts.latencyAria',
        DictionaryText.entry('pt-BR', 'loadTest.charts.latencyAria'),
      ]);
    });

    it('replaces the previous drawing instead of stacking a new one', () => {
      charts.render(SERIES);
      charts.render(SERIES);
      expect([
        throughput.querySelectorAll('svg').length,
        latency.querySelectorAll('svg').length,
      ]).toStrictEqual([1, 1]);
    });

    it('translates the label into the language it is rendered in', () => {
      translator.setLocale('en-US');
      charts.render(SERIES);
      expect(svgOf(throughput).getAttribute('aria-label')).toBe(
        DictionaryText.entry('en-US', 'loadTest.charts.throughputAria'),
      );
    });
  });

  describe('throughput chart', () => {
    beforeEach(() => charts.render(SERIES));

    it('draws three grid rows with their labels, five time labels, then the ramp stage, the area and the line', () => {
      expect(kinds(throughput)).toStrictEqual([
        'line.chart-grid',
        'text.axis-y',
        'line.chart-grid',
        'text.axis-y',
        'line.chart-grid',
        'text.axis-y',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'path.stage-line',
        'path.series-area',
        'path.series-line',
      ]);
    });

    it('puts the grid rows at the bottom, middle and top of the plot', () => {
      expect(attributes(throughput, 'line.chart-grid', 'y1')).toStrictEqual(['132', '71', '10']);
      expect(attributes(throughput, 'line.chart-grid', 'y2')).toStrictEqual(['132', '71', '10']);
      expect(attributes(throughput, 'line.chart-grid', 'x1')).toStrictEqual(['36', '36', '36']);
      expect(attributes(throughput, 'line.chart-grid', 'x2')).toStrictEqual(['508', '508', '508']);
      expect(attributes(throughput, 'text.axis-y', 'y')).toStrictEqual(['135', '74', '13']);
      expect(attributes(throughput, 'text.axis-y', 'x')).toStrictEqual(['30', '30', '30']);
    });

    it('labels the rows with 0, half and the full scale, which is 110% of the peak', () => {
      expect(texts(throughput, 'text.axis-y')).toStrictEqual(['0', '110', '220']);
    });

    it('labels the time axis every five seconds; 20s sits on the last point (index 199 of 0..199), at the right edge of the grid', () => {
      expect(texts(throughput, 'text.axis-x')).toStrictEqual(['0s', '5s', '10s', '15s', '20s']);
      expect(attributes(throughput, 'text.axis-x', 'x')).toStrictEqual([
        '36.0',
        '154.6',
        '273.2',
        '391.8',
        '508.0',
      ]);
      expect(attributes(throughput, 'text.axis-x', 'x')).toStrictEqual(
        [0, 50, 100, 150, 199].map((index) => x(index).toFixed(1)),
      );
      expect(attributes(throughput, 'line.chart-grid', 'x2')[0]).toBe('508');
      expect(attributes(throughput, 'text.axis-x', 'y')).toStrictEqual([
        '146',
        '146',
        '146',
        '146',
        '146',
      ]);
    });

    it('draws the series line through every sample at 110% of the peak', () => {
      const max = 200 * 1.1;
      expect(throughput.querySelector('.series-line').getAttribute('d')).toBe(
        line(SERIES.tps, max),
      );
      expect(throughput.querySelector('.series-line').getAttribute('style')).toBe(
        '--c:var(--series-1)',
      );
    });

    it('fills the area under the line down to the baseline and back to the start', () => {
      const max = 200 * 1.1;
      expect(throughput.querySelector('.series-area').getAttribute('d')).toBe(
        `${line(SERIES.tps, max)}L${x(3).toFixed(1)},132L36,132Z`,
      );
    });

    it('draws the planned ramp as a dashed stage line: 200 samples following the scenario', () => {
      const max = 200 * 1.1;
      const stage = range(POINTS).map((index) => (RampScenario.fractionAt(index / 10) * max) / 1.1);
      expect(throughput.querySelector('.stage-line').getAttribute('d')).toBe(line(stage, max));
    });

    it('scales to a peak of 1 when the test has not processed anything yet', () => {
      charts.render({ tps: [0, 0], p95: [0, 0], p99: [0, 0] });
      expect(texts(throughput, 'text.axis-y')).toStrictEqual(['0', '1', '1']);
    });

    it('abbreviates thousands and millions on the scale', () => {
      charts.render({ tps: [0, 2000000], p95: [0, 0], p99: [0, 0] });
      expect(texts(throughput, 'text.axis-y')).toStrictEqual(['0', '1,1M', '2,2M']);
    });
  });

  describe('latency chart', () => {
    beforeEach(() => charts.render(SERIES));

    it('draws the same grid, then the p99 line and the p95 line', () => {
      expect(kinds(latency)).toStrictEqual([
        'line.chart-grid',
        'text.axis-y',
        'line.chart-grid',
        'text.axis-y',
        'line.chart-grid',
        'text.axis-y',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'text.axis-x',
        'path.series-line is-dashed',
        'text.series-label',
        'path.series-line',
        'text.series-label',
      ]);
    });

    it('tells the two lines apart without color (WCAG 1.4.1): p99 is dashed, and each line is named at its right end', () => {
      expect([
        [...latency.querySelectorAll('.series-line')].map((path) =>
          path.classList.contains('is-dashed'),
        ),
        texts(latency, 'text.series-label'),
        attributes(latency, 'text.series-label', 'x'),
        attributes(latency, 'text.series-label', 'y'),
      ]).toStrictEqual([
        [true, false],
        ['p99', 'p95'],
        ['39.1', '39.1'],
        ['59.9', '113.5'],
      ]);
    });

    it('keeps the labels inside the plot when a line runs along the bottom: p95 is held 4 px above the axis labels', () => {
      charts.render({ tps: [0, 1], p95: [0, 0], p99: [0, 0] });
      expect(attributes(latency, 'text.series-label', 'y')).toStrictEqual(['125.0', '128.0']);
    });

    it('scales to 125% of the worst p99, with two decimals', () => {
      expect(texts(latency, 'text.axis-y')).toStrictEqual(['0,00', '3,75', '7,50']);
    });

    it('uses the decimal mark of the language', () => {
      Formatter.use('en-US');
      charts.render(SERIES);
      expect(texts(latency, 'text.axis-y')).toStrictEqual(['0.00', '3.75', '7.50']);
    });

    it('draws p99 in the second series color first and p95 in the first one on top', () => {
      const max = 6 * 1.25;
      const [p99, p95] = [...latency.querySelectorAll('.series-line')];
      expect([
        p99.getAttribute('style'),
        p99.getAttribute('d'),
        p95.getAttribute('style'),
        p95.getAttribute('d'),
      ]).toStrictEqual([
        '--c:var(--series-2)',
        line(SERIES.p99, max),
        '--c:var(--series-1)',
        line(SERIES.p95, max),
      ]);
    });

    it('never scales below 0.1 ms times 125%', () => {
      charts.render({ tps: [0, 1], p95: [0, 0], p99: [0, 0] });
      expect(texts(latency, 'text.axis-y')).toStrictEqual(['0,00', '0,06', '0,13']);
    });
  });

  describe('histogram', () => {
    it('is empty until it is rendered, and clear() empties only the histogram', () => {
      expect(histogram.innerHTML).toBe('');
      charts.render(SERIES);
      charts.renderHistogram([1, 2]);
      charts.clear();
      expect([
        histogram.innerHTML,
        svgOf(throughput) === null,
        svgOf(latency) === null,
      ]).toStrictEqual(['', false, false]);
    });

    it('draws a labelled svg with the histogram class and fourteen bars', () => {
      charts.renderHistogram([1, 2, 3]);
      const svg = svgOf(histogram);
      expect(
        ['viewBox', 'width', 'role', 'data-i18n-attr', 'aria-label', 'class'].map((name) =>
          svg.getAttribute(name),
        ),
      ).toStrictEqual([
        '0 0 520 150',
        '100%',
        'img',
        'aria-label:loadTest.charts.histogramAria',
        DictionaryText.entry('pt-BR', 'loadTest.charts.histogramAria'),
        'histogram',
      ]);
      expect(rects()).toHaveLength(14);
    });

    it('spreads ten evenly spaced durations over the bins their share of the 99.5th percentile falls in', () => {
      charts.renderHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const filled = [1, 2, 4, 5, 7, 8, 9, 11, 12, 13];
      expect(attributes(histogram, 'rect', 'height')).toStrictEqual(
        range(14).map((index) => (filled.includes(index) ? '122.0' : '0.0')),
      );
      expect(attributes(histogram, 'rect', 'y')).toStrictEqual(
        range(14).map((index) => (filled.includes(index) ? '10.0' : '132.0')),
      );
    });

    it('lays the bars side by side, 2 px in from each slot and 4 px narrower than it', () => {
      charts.renderHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(attributes(histogram, 'rect', 'x')).toStrictEqual(
        range(14).map((index) => (LEFT + index * BIN_WIDTH + 2).toFixed(1)),
      );
      expect(attributes(histogram, 'rect', 'width')).toStrictEqual(
        range(14).map(() => (BIN_WIDTH - 4).toFixed(1)),
      );
      expect(attributes(histogram, 'rect', 'rx')).toStrictEqual(range(14).map(() => '3'));
    });

    it('puts identical durations in the last bin, as tall as the plot', () => {
      charts.renderHistogram([2, 2, 2, 2]);
      expect(attributes(histogram, 'rect', 'height')).toStrictEqual([
        ...range(13).map(() => '0.0'),
        '122.0',
      ]);
    });

    it('scales bar heights to the tallest bin', () => {
      charts.renderHistogram([1, 1, 1, 1, 10]);
      const heights = attributes(histogram, 'rect', 'height');
      expect([heights[1], heights[13]]).toStrictEqual(['122.0', '30.5']);
    });

    it('labels the axis with 0, half and the 99.5th percentile, in milliseconds', () => {
      charts.renderHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(texts(histogram, 'text.axis-x')).toStrictEqual(['0,00 ms', '5,00 ms', '10,00 ms']);
      expect(attributes(histogram, 'text.axis-x', 'x')).toStrictEqual(['36.0', '272.0', '508.0']);
      expect(attributes(histogram, 'text.axis-x', 'y')).toStrictEqual(['146', '146', '146']);
    });

    it('accepts the typed arrays the workers send', () => {
      charts.renderHistogram(Float32Array.of(1, 2, 3, 4));
      const filled = [3, 7, 10, 13];
      expect(attributes(histogram, 'rect', 'height')).toStrictEqual(
        range(14).map((index) => (filled.includes(index) ? '122.0' : '0.0')),
      );
      expect(texts(histogram, 'text.axis-x')).toStrictEqual(['0,00 ms', '2,00 ms', '4,00 ms']);
    });

    it('draws flat bars and a 0 to 1 ms axis when there is nothing to show', () => {
      charts.renderHistogram([]);
      expect(attributes(histogram, 'rect', 'height')).toStrictEqual(range(14).map(() => '0.0'));
      expect(texts(histogram, 'text.axis-x')).toStrictEqual(['0,00 ms', '0,50 ms', '1,00 ms']);
    });

    it('replaces the previous drawing', () => {
      charts.renderHistogram([1, 2]);
      charts.renderHistogram([3, 4]);
      expect(histogram.querySelectorAll('svg').length).toBe(1);
    });
  });
});
