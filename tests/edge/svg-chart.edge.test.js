import { describe, it, expect } from 'vitest';
import { SvgChart } from '../../edge/panel/svg-chart.js';
import { PanelDocument } from '../support/panel-document.js';

const attributes = (root, selector, names) =>
  [...root.querySelectorAll(selector)].map((element) =>
    names.map((name) => element.getAttribute(name)),
  );

describe('SvgChart', () => {
  it('draws a bar for each point, as tall as its share of the largest, with the axis and the first and last label', () => {
    const svg = PanelDocument.parse(
      SvgChart.bars(
        [
          { label: '2026-11-01', value: 2 },
          { label: '2026-11-02', value: 0 },
          { label: '2026-11-03', value: 4 },
        ],
        { label: 'Views per day', format: (value) => `${value} views` },
      ),
    ).querySelector('svg');
    expect([
      svg.getAttribute('aria-label'),
      svg.getAttribute('viewBox'),
      attributes(svg, 'rect', ['x', 'y', 'width', 'height']),
      PanelDocument.texts(svg, 'title'),
      PanelDocument.texts(svg, 'text'),
    ]).toStrictEqual([
      'Views per day',
      '0 0 720 180',
      [
        ['56.5', '84.0', '216.3', '72.0'],
        ['273.8', '156.0', '216.3', '0.0'],
        ['491.2', '12.0', '216.3', '144.0'],
      ],
      ['2026-11-01: 2 views', '2026-11-02: 0 views', '2026-11-03: 4 views'],
      ['4 views', '0 views', '2026-11-01', '2026-11-03'],
    ]);
  });

  it('draws a line for each series over the days of all of them, from the floor to the largest value', () => {
    const svg = PanelDocument.parse(
      SvgChart.lines(
        [
          {
            name: '/ mobile',
            points: [
              { day: '2026-11-01', value: 100 },
              { day: '2026-11-03', value: 300 },
            ],
          },
          { name: '/en/ mobile', points: [{ day: '2026-11-02', value: 200 }] },
        ],
        { label: 'LCP', format: (value) => `${value} ms`, floor: 100 },
      ),
    ).querySelector('svg');
    expect([
      attributes(svg, 'polyline', ['points']),
      attributes(svg, 'circle', ['cx', 'cy']),
      PanelDocument.texts(svg, 'title'),
      PanelDocument.texts(svg, 'text'),
    ]).toStrictEqual([
      [['56.0,156.0 708.0,12.0'], ['382.0,84.0']],
      [
        ['56.0', '156.0'],
        ['708.0', '12.0'],
        ['382.0', '84.0'],
      ],
      [
        '/ mobile, 2026-11-01: 100 ms',
        '/ mobile, 2026-11-03: 300 ms',
        '/en/ mobile, 2026-11-02: 200 ms',
      ],
      ['300 ms', '100 ms', '2026-11-01', '2026-11-03'],
    ]);
  });

  it('stacks the shares of good, needs-improvement and poor loads in one bar, a missing share as none', () => {
    const svg = PanelDocument.parse(
      SvgChart.ratings({ good: 0.5, needs_improvement: 0.25, poor: null }),
    ).querySelector('svg');
    expect([
      svg.getAttribute('aria-label'),
      attributes(svg, 'rect', ['class', 'x', 'width']),
      PanelDocument.texts(svg, 'title'),
    ]).toStrictEqual([
      'good 50%, needs improvement 25%, poor 0%',
      [
        ['rating-good', '0.0', '60.0'],
        ['rating-middle', '60.0', '30.0'],
        ['rating-poor', '90.0', '0.0'],
      ],
      ['good: 50%', 'needs improvement: 25%', 'poor: 0%'],
    ]);
  });

  it('draws a meter as long as its share of the largest value, and an empty one when there is none', () => {
    const width = (markup) =>
      PanelDocument.parse(markup).querySelector('rect').getAttribute('width');
    expect([width(SvgChart.meter(3, 4)), width(SvgChart.meter(0, 0))]).toStrictEqual([
      '75.0',
      '0.0',
    ]);
  });

  it('lays the clicks of a part over a grid, each cell as dark as its share of the busiest one, and outlines the empty ones', () => {
    const svg = PanelDocument.parse(
      SvgChart.grid(
        [
          { x: 0, y: 0, clicks: 4 },
          { x: 1, y: 1, clicks: 1 },
        ],
        2,
        { label: 'Clicks on status' },
      ),
    ).querySelector('svg');
    expect([
      svg.getAttribute('viewBox'),
      attributes(svg, 'rect.cell', ['x', 'y', 'fill-opacity']),
      attributes(svg, 'rect.cell-empty', ['x', 'y']),
      PanelDocument.texts(svg, 'title'),
      PanelDocument.texts(svg, 'text'),
    ]).toStrictEqual([
      '0 0 48 48',
      [
        ['0', '0', '1.00'],
        ['24', '24', '0.36'],
      ],
      [
        ['24', '0'],
        ['0', '24'],
      ],
      ['column 1, row 1: 4 clicks', 'column 2, row 2: 1 click'],
      ['4', '1'],
    ]);
  });

  it('writes no label under a chart without points, and one under a chart with one', () => {
    const labels = (points) =>
      PanelDocument.texts(PanelDocument.parse(SvgChart.bars(points, { label: 'Views' })), 'text');
    expect([labels([]), labels([{ label: '2026-11-01', value: 3 }])]).toStrictEqual([
      ['1', '0'],
      ['3', '0', '2026-11-01'],
    ]);
  });
});
