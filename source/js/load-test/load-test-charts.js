import { Numbers } from '../shared/math.js';
import { Formatter } from '../shared/format.js';
import { RampScenario } from './ramp-scenario.js';

const WIDTH = 520,
  HEIGHT = 150;
const MARGIN = { left: 36, right: 12, top: 10, bottom: 18 };
const HISTOGRAM_BINS = 14;
/** The two latency lines differ by more than color (WCAG 1.4.1): the p99 line is dashed, and both are named at their right end. */
const LATENCY_LINES = [
  { name: 'p99', color: 'var(--series-2)', dashed: true, labelOffset: -7 },
  { name: 'p95', color: 'var(--series-1)', dashed: false, labelOffset: 14 },
];

/** Throughput, latency and histogram charts for the load test. */
export class LoadTestCharts {
  #throughput;
  #latency;
  #histogram;
  #translator;

  constructor({ throughput, latency, histogram, translator }) {
    this.#throughput = throughput;
    this.#latency = latency;
    this.#histogram = histogram;
    this.#translator = translator;
  }

  /** Attribute pair for an SVG label: its text now, and the key that retranslates it when the language changes. */
  #ariaLabel(key) {
    return `data-i18n-attr="aria-label:${key}" aria-label="${this.#translator.t(key)}"`;
  }

  clear() {
    this.#histogram.innerHTML = '';
  }

  render(series) {
    if (!series.tps.length) return;
    const points = RampScenario.totalSeconds * 10;
    const x = (index) =>
      MARGIN.left + (index / (points - 1)) * (WIDTH - MARGIN.left - MARGIN.right);
    const y = (value, max) =>
      MARGIN.top + (1 - value / max) * (HEIGHT - MARGIN.top - MARGIN.bottom);
    const line = (values, max) =>
      values
        .map(
          (value, index) =>
            `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value, max).toFixed(1)}`,
        )
        .join('');
    const maxTps = Math.max(1, ...series.tps) * 1.1,
      maxLatency = Math.max(0.1, ...series.p99) * 1.25;
    const stageLine = line(
      Array.from(
        { length: points },
        (_, index) => (RampScenario.fractionAt(index / 10) * maxTps) / 1.1,
      ),
      maxTps,
    );
    const last = series.tps.length - 1;
    const labelY = (name, offset) =>
      Numbers.clamp(
        y(series[name][last], maxLatency) + offset,
        MARGIN.top + 8,
        HEIGHT - MARGIN.bottom - 4,
      );
    const latencyLines = LATENCY_LINES.map(
      ({ name, color, dashed, labelOffset }) =>
        `<path class="series-line${dashed ? ' is-dashed' : ''}" style="--c:${color}" d="${line(series[name], maxLatency)}"/><text class="series-label" x="${(x(last) - 4).toFixed(1)}" y="${labelY(name, labelOffset).toFixed(1)}">${name}</text>`,
    ).join('');
    this.#throughput.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" ${this.#ariaLabel('loadTest.charts.throughputAria')}>${this.#grid(maxTps, Formatter.compactCount, x)}<path class="stage-line" d="${stageLine}"/><path class="series-area" style="--c:var(--series-1)" d="${line(series.tps, maxTps)}L${x(last).toFixed(1)},${HEIGHT - MARGIN.bottom}L${x(0)},${HEIGHT - MARGIN.bottom}Z"/><path class="series-line" style="--c:var(--series-1)" d="${line(series.tps, maxTps)}"/></svg>`;
    this.#latency.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" ${this.#ariaLabel('loadTest.charts.latencyAria')}>${this.#grid(maxLatency, (value) => Formatter.decimal(value), x)}${latencyLines}</svg>`;
  }

  renderHistogram(batchDurations) {
    const max = Numbers.percentile(batchDurations, 0.995) || 1;
    const bins = Array.from({ length: HISTOGRAM_BINS }, () => 0);
    for (const value of batchDurations)
      bins[Math.min(HISTOGRAM_BINS - 1, Math.floor((value / max) * HISTOGRAM_BINS))]++;
    const tallest = Math.max(1, ...bins),
      binWidth = (WIDTH - MARGIN.left - MARGIN.right) / HISTOGRAM_BINS,
      innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const bars = bins
      .map(
        (count, index) =>
          `<rect x="${(MARGIN.left + index * binWidth + 2).toFixed(1)}" y="${(MARGIN.top + (1 - count / tallest) * innerHeight).toFixed(1)}" width="${(binWidth - 4).toFixed(1)}" height="${((count / tallest) * innerHeight).toFixed(1)}" rx="3"/>`,
      )
      .join('');
    const labels = [0, 0.5, 1]
      .map(
        (k) =>
          `<text class="axis-x" x="${(MARGIN.left + k * (WIDTH - MARGIN.left - MARGIN.right)).toFixed(1)}" y="${HEIGHT - 4}">${Formatter.decimal(max * k)} ms</text>`,
      )
      .join('');
    this.#histogram.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img" ${this.#ariaLabel('loadTest.charts.histogramAria')} class="histogram">${bars}${labels}</svg>`;
  }

  #grid(max, label, x) {
    const rows = [0, 0.5, 1]
      .map((k) => {
        const y = MARGIN.top + (1 - k) * (HEIGHT - MARGIN.top - MARGIN.bottom);
        return `<line class="chart-grid" x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${y}" y2="${y}"/><text class="axis-y" x="${MARGIN.left - 6}" y="${y + 3}">${label(max * k)}</text>`;
      })
      .join('');
    const columns = [0, 5, 10, 15, 20]
      .map(
        (second) =>
          `<text class="axis-x" x="${x(Math.min(second * 10, RampScenario.totalSeconds * 10 - 1)).toFixed(1)}" y="${HEIGHT - 4}">${second}s</text>`,
      )
      .join('');
    return rows + columns;
  }
}
