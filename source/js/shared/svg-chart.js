/** Linear scales for an SVG chart with fixed margins. */
export class ChartScales {
  #margin;
  #pointCount;
  #maxValue;
  innerWidth;
  innerHeight;
  baseline;

  constructor({ width, height, margin, pointCount, maxValue }) {
    this.#margin = margin;
    this.#pointCount = pointCount;
    this.#maxValue = maxValue;
    this.innerWidth = width - margin.left - margin.right;
    this.innerHeight = height - margin.top - margin.bottom;
    this.baseline = margin.top + this.innerHeight;
  }

  x(index) {
    return this.#margin.left + (index / (this.#pointCount - 1)) * this.innerWidth;
  }

  y(value) {
    return this.#margin.top + (1 - value / this.#maxValue) * this.innerHeight;
  }
}

export class SvgPaths {
  static line(values, scales) {
    return values
      .map(
        (value, index) =>
          `${index ? 'L' : 'M'}${scales.x(index).toFixed(1)},${scales.y(value).toFixed(1)}`,
      )
      .join('');
  }

  static area(values, scales) {
    return `${SvgPaths.line(values, scales)}L${scales.x(values.length - 1).toFixed(1)},${scales.baseline.toFixed(1)}L${scales.x(0).toFixed(1)},${scales.baseline.toFixed(1)}Z`;
  }

  static horizontalGrid(ticks, { x1, x2, scales, label }) {
    return ticks
      .map((tick) => {
        const y = scales.y(tick).toFixed(1);
        return `<line class="chart-grid" x1="${x1}" x2="${x2}" y1="${y}" y2="${y}"/><text class="axis-y" x="${x1 - 6}" y="${(+y + 3.5).toFixed(1)}">${label(tick)}</text>`;
      })
      .join('');
  }
}
