import { describe, it, expect } from 'vitest';
import { ChartScales, SvgPaths } from '@site/js/shared/svg-chart.js';

const MARGIN = { top: 10, right: 20, bottom: 30, left: 40 };
const scales = (pointCount = 3) =>
  new ChartScales({ width: 400, height: 200, margin: MARGIN, pointCount, maxValue: 100 });

describe('ChartScales', () => {
  it('derives the inner box and the baseline from the margins', () => {
    const chart = scales();
    expect(chart.innerWidth).toBe(340);
    expect(chart.innerHeight).toBe(160);
    expect(chart.baseline).toBe(170);
  });

  it('spreads the points evenly from the left margin to the right edge of the inner box', () => {
    const chart = scales(5);
    expect(chart.x(0)).toBe(40);
    expect(chart.x(2)).toBe(210);
    expect(chart.x(4)).toBe(380);
  });

  it('maps 0 to the baseline and the maximum to the top margin', () => {
    const chart = scales();
    expect(chart.y(0)).toBe(170);
    expect(chart.y(100)).toBe(10);
    expect(chart.y(50)).toBe(90);
  });

  it('does not clamp values above the maximum', () => expect(scales().y(200)).toBe(-150));
});

describe('SvgPaths.line', () => {
  it('starts with M, continues with L and rounds to one decimal', () => {
    expect(SvgPaths.line([0, 100, 50], scales())).toBe('M40.0,170.0L210.0,10.0L380.0,90.0');
  });

  it('rounds fractional coordinates to one decimal', () => {
    expect(
      SvgPaths.line(
        [33.333],
        new ChartScales({
          width: 100,
          height: 100,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          pointCount: 2,
          maxValue: 100,
        }),
      ),
    ).toBe('M0.0,66.7');
  });

  it('returns nothing for no values', () => expect(SvgPaths.line([], scales())).toBe(''));
});

describe('SvgPaths.area', () => {
  it('closes the line down to the baseline and back to the first x', () => {
    expect(SvgPaths.area([0, 100, 50], scales())).toBe(
      'M40.0,170.0L210.0,10.0L380.0,90.0L380.0,170.0L40.0,170.0Z',
    );
  });
});

describe('SvgPaths.horizontalGrid', () => {
  it('draws one line and one label per tick, with the label above the line', () => {
    const markup = SvgPaths.horizontalGrid([0, 50], {
      x1: 40,
      x2: 380,
      scales: scales(),
      label: (tick) => `${tick}%`,
    });
    expect(markup).toBe(
      '<line class="chart-grid" x1="40" x2="380" y1="170.0" y2="170.0"/><text class="axis-y" x="34" y="173.5">0%</text>' +
        '<line class="chart-grid" x1="40" x2="380" y1="90.0" y2="90.0"/><text class="axis-y" x="34" y="93.5">50%</text>',
    );
  });

  it('returns nothing for no ticks', () => {
    expect(SvgPaths.horizontalGrid([], { x1: 0, x2: 1, scales: scales(), label: String })).toBe('');
  });
});
