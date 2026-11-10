import { PanelHtml } from './panel-html.js';

const HTML = PanelHtml.html;
const WIDTH = 720;
const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };
const CELL = 24;

/**
 * The charts of the panel, drawn on the server as inline SVG: no script, no library, and colors from the panel's stylesheet
 * through classes. Each chart has a text label for screen readers and a title on each mark with its value.
 */
export class SvgChart {
  static WIDTH = WIDTH;
  static HEIGHT = HEIGHT;

  /** One bar per point, such as the views of each day. `points` are `{ label, value }`. */
  static bars(points, { label, format = String }) {
    const max = Math.max(1, ...points.map(({ value }) => value));
    const inner = WIDTH - PAD.left - PAD.right;
    const height = HEIGHT - PAD.top - PAD.bottom;
    const step = inner / Math.max(points.length, 1);
    const gap = step > 4 ? 1 : 0;
    return HTML`<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
      ${SvgChart.#axis(max, format)}
      ${points.map(({ label: name, value }, index) => {
        const tall = (value / max) * height;
        return HTML`<rect class="mark" x="${(PAD.left + index * step + gap / 2).toFixed(1)}" y="${(PAD.top + height - tall).toFixed(1)}" width="${Math.max(step - gap, 0.5).toFixed(1)}" height="${tall.toFixed(1)}"><title>${name}: ${format(value)}</title></rect>`;
      })}
      ${SvgChart.#ends(points.map(({ label: name }) => name))}
    </svg>`;
  }

  /**
   * Lines over the same days, such as a lab number for each page and form factor. `series` are `{ name, points }`, each
   * point `{ day, value }`; a day a series lacks breaks nothing, the line goes to the next point.
   */
  static lines(series, { label, format = String, floor = 0 }) {
    const days = [...new Set(series.flatMap(({ points }) => points.map(({ day }) => day)))].sort();
    const values = series.flatMap(({ points }) => points.map(({ value }) => value));
    const max = Math.max(floor + 1e-9, ...values);
    const inner = WIDTH - PAD.left - PAD.right;
    const height = HEIGHT - PAD.top - PAD.bottom;
    const x = (day) =>
      PAD.left + (days.length > 1 ? (days.indexOf(day) / (days.length - 1)) * inner : inner / 2);
    const y = (value) => PAD.top + height - ((value - floor) / (max - floor)) * height;
    return HTML`<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
      ${SvgChart.#axis(max, format, floor)}
      ${series.map(
        ({ points }, index) => HTML`<g class="series series-${index}">
          <polyline fill="none" points="${points.map(({ day, value }) => `${x(day).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}"/>
          ${points.map(({ day, value }) => HTML`<circle cx="${x(day).toFixed(1)}" cy="${y(value).toFixed(1)}" r="2.5"><title>${series[index].name}, ${day}: ${format(value)}</title></circle>`)}
        </g>`,
      )}
      ${SvgChart.#ends(days)}
    </svg>`;
  }

  /** The shares of good, needs-improvement and poor loads, as one stacked bar. */
  static ratings({ good, needs_improvement: middle, poor }) {
    let start = 0;
    const parts = [
      ['good', good],
      ['middle', middle],
      ['poor', poor],
    ].map(([name, share]) => {
      const part = HTML`<rect class="rating-${name}" x="${(start * 120).toFixed(1)}" y="0" width="${((share ?? 0) * 120).toFixed(1)}" height="10"><title>${name === 'middle' ? 'needs improvement' : name}: ${Math.round((share ?? 0) * 100)}%</title></rect>`;
      start += share ?? 0;
      return part;
    });
    return HTML`<svg class="ratings" viewBox="0 0 120 10" width="120" height="10" role="img" aria-label="good ${Math.round((good ?? 0) * 100)}%, needs improvement ${Math.round((middle ?? 0) * 100)}%, poor ${Math.round((poor ?? 0) * 100)}%">${parts}</svg>`;
  }

  /** A short bar for a value out of the largest in its table. */
  static meter(value, max) {
    const width = max > 0 ? (value / max) * 100 : 0;
    return HTML`<svg class="meter" viewBox="0 0 100 8" width="100" height="8" aria-hidden="true"><rect class="mark" x="0" y="0" width="${width.toFixed(1)}" height="8"/></svg>`;
  }

  /**
   * The clicks of a part of the page in a square grid, from its top left: each cell as dark as its share of the busiest cell.
   * `cells` are `{ x, y, clicks }`, only the cells that have any.
   */
  static grid(cells, size, { label }) {
    const max = Math.max(1, ...cells.map(({ clicks }) => clicks));
    const side = size * CELL;
    const empty = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1)
        if (!cells.some((cell) => cell.x === x && cell.y === y)) empty.push({ x, y });
    return HTML`<svg class="grid" viewBox="0 0 ${side} ${side}" role="img" aria-label="${label}">
      ${empty.map(({ x, y }) => HTML`<rect class="cell-empty" x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}"/>`)}
      ${cells.map(
        ({ x, y, clicks }) =>
          HTML`<rect class="cell" x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill-opacity="${(0.15 + 0.85 * (clicks / max)).toFixed(2)}"><title>column ${x + 1}, row ${y + 1}: ${clicks} ${clicks === 1 ? 'click' : 'clicks'}</title></rect><text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + 4}">${clicks}</text>`,
      )}
    </svg>`;
  }

  /** The value axis: zero (or the floor) and the largest value, with a line for each. */
  static #axis(max, format, floor = 0) {
    const bottom = HEIGHT - PAD.bottom;
    return HTML`<g class="axis">
      <line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${PAD.top}" y2="${PAD.top}"/>
      <line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${bottom}" y2="${bottom}"/>
      <text x="${PAD.left - 6}" y="${PAD.top + 4}" text-anchor="end">${format(max)}</text>
      <text x="${PAD.left - 6}" y="${bottom + 4}" text-anchor="end">${format(floor)}</text>
    </g>`;
  }

  /** The first and the last label under the chart. */
  static #ends(labels) {
    if (labels.length === 0) return '';
    const y = HEIGHT - 6;
    return HTML`<g class="axis">
      <text x="${PAD.left}" y="${y}">${labels[0]}</text>
      ${labels.length > 1 ? HTML`<text x="${WIDTH - PAD.right}" y="${y}" text-anchor="end">${labels.at(-1)}</text>` : ''}
    </g>`;
  }
}
