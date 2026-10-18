import { Numbers } from '../shared/math.js';
import { Formatter } from '../shared/format.js';
import { ChartScales, SvgPaths } from '../shared/svg-chart.js';
import { SAMPLES_PER_DAY, SyntheticDaySeries } from './synthetic-day-series.js';

const CHART_HEIGHT = 220;
const MARGIN = { left: 40, right: 16, top: 14, bottom: 22 };

/** A 24-hour line chart with crosshair, hover dots and a tooltip. `options.ariaLabelKey` names its dictionary entry. */
export class LinePanel {
  #plot;
  #series;
  #options;
  #translator;

  constructor(panel, series, options, translator) {
    this.#plot = panel.querySelector('.chart-plot');
    this.#series = series;
    this.#options = options;
    this.#translator = translator;
  }

  render() {
    const plot = this.#plot,
      series = this.#series,
      options = this.#options;
    const width = Math.max(200, plot.clientWidth);
    const scales = new ChartScales({
      width,
      height: CHART_HEIGHT,
      margin: MARGIN,
      pointCount: SAMPLES_PER_DAY,
      maxValue: options.maxValue,
    });
    const x = (index) => scales.x(index),
      y = (value) => scales.y(value);
    const grid = SvgPaths.horizontalGrid(options.ticks, {
      x1: MARGIN.left,
      x2: width - MARGIN.right,
      scales,
      label: (tick) => tick,
    });
    const hourLabels = [0, 6, 12, 18, 23.9]
      .map(
        (hour) =>
          `<text class="axis-x" x="${x(Math.round(hour * 12)).toFixed(1)}" y="${CHART_HEIGHT - 5}">${String(Math.round(hour)).padStart(2, '0')}h</text>`,
      )
      .join('');
    const reference = options.reference
      ? `<line class="reference-line" x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(options.reference).toFixed(1)}" y2="${y(options.reference).toFixed(1)}"/><text class="axis-ref" x="${width - MARGIN.right}" y="${(y(options.reference) - 5).toFixed(1)}">${options.reference} ms</text>`
      : '';
    const body = series
      .map((item) => {
        const area = options.area
          ? `<path class="series-area is-faded-in" d="${SvgPaths.area(item.values, scales)}" style="--c:${item.color}"/>`
          : '';
        const label =
          series.length > 1
            ? `<text class="series-label" x="${(x(SAMPLES_PER_DAY - 1) - 4).toFixed(1)}" y="${(y(item.values.at(-1)) - 7).toFixed(1)}">${item.name}</text>`
            : '';
        return `${area}<path class="series-line is-drawn-in" d="${SvgPaths.line(item.values, scales)}" pathLength="1" style="--c:${item.color}"/>${label}`;
      })
      .join('');
    const hoverDots = series.map((item) => `<circle r="4.5" style="--c:${item.color}"/>`).join('');
    plot.innerHTML = `<svg viewBox="0 0 ${width} ${CHART_HEIGHT}" width="${width}" height="${CHART_HEIGHT}" role="img" data-i18n-attr="aria-label:${options.ariaLabelKey}" aria-label="${this.#translator.t(options.ariaLabelKey)}">${grid}${hourLabels}${reference}${body}<g class="hover-layer"><line class="hover-line" y1="${MARGIN.top}" y2="${CHART_HEIGHT - MARGIN.bottom}"/>${hoverDots}</g></svg><div class="chart-tooltip"></div>`;
    this.#bindHover(width, x, y);
  }

  #bindHover(width, x, y) {
    const plot = this.#plot,
      series = this.#series,
      options = this.#options;
    const hoverLine = plot.querySelector('.hover-line');
    const dots = [...plot.querySelectorAll('.hover-layer circle')];
    const tooltip = plot.querySelector('.chart-tooltip');
    plot.onpointermove = (event) => {
      const rect = plot.getBoundingClientRect();
      const scale = rect.width / width;
      const index = Numbers.clamp(
        Math.round(
          (((event.clientX - rect.left) / scale - MARGIN.left) /
            (width - MARGIN.left - MARGIN.right)) *
            (SAMPLES_PER_DAY - 1),
        ),
        0,
        SAMPLES_PER_DAY - 1,
      );
      const px = x(index);
      hoverLine.setAttribute('x1', px);
      hoverLine.setAttribute('x2', px);
      dots.forEach((dot, seriesIndex) => {
        dot.setAttribute('cx', px);
        dot.setAttribute('cy', y(series[seriesIndex].values[index]));
      });
      tooltip.textContent = `${SyntheticDaySeries.labelFor(index)} · ${series.map((item) => `${item.name ? `${item.name} ` : ''}${Math.round(item.values[index])} ${options.unit}`).join(' · ')}`;
      tooltip.style.left = `${Numbers.clamp(px * scale, 70, rect.width - 70)}px`;
      tooltip.classList.add('is-visible');
    };
    plot.onpointerleave = () => tooltip.classList.remove('is-visible');
  }
}

/** Thirty day cells, one of them degraded. The tooltip text is built on hover, so it is always in the active language. */
export class UptimeStrip {
  static DAYS = 30;
  static DEGRADED_DAY_INDEX = 11;
  #plot;
  #translator;

  constructor(plot, translator) {
    this.#plot = plot;
    this.#translator = translator;
  }

  render() {
    const plot = this.#plot,
      today = Date.now();
    plot.innerHTML =
      Array.from(
        { length: UptimeStrip.DAYS },
        (_, index) =>
          `<i style="--i:${index}" class="${index === UptimeStrip.DEGRADED_DAY_INDEX ? 'is-warning' : ''}" data-day="${index}"></i>`,
      ).join('') + '<div class="chart-tooltip"></div>';
    const tooltip = plot.querySelector('.chart-tooltip');
    plot.onpointerover = (event) => {
      const cell = event.target.closest('i');
      if (!cell) return;
      const day = +cell.dataset.day;
      const date = Formatter.shortDate(new Date(today - (UptimeStrip.DAYS - 1 - day) * 864e5));
      const status = this.#translator.t(
        day === UptimeStrip.DEGRADED_DAY_INDEX
          ? 'dashboard.uptime.degradedDay'
          : 'dashboard.uptime.fullDay',
      );
      const rect = plot.getBoundingClientRect(),
        cellRect = cell.getBoundingClientRect();
      tooltip.textContent = `${date} · ${status}`;
      tooltip.style.left = `${Numbers.clamp(cellRect.left + cellRect.width / 2 - rect.left, 70, rect.width - 70)}px`;
      tooltip.classList.add('is-visible');
    };
    plot.onpointerleave = () => tooltip.classList.remove('is-visible');
  }
}

/** The same data as a table, one row per hour, for readers who prefer numbers. */
export class HourlyTable {
  #tableBody;
  #series;

  constructor(tableBody, series) {
    this.#tableBody = tableBody;
    this.#series = series;
  }

  render() {
    const { tps, p95, p99 } = this.#series;
    this.#tableBody.innerHTML = Array.from({ length: 24 }, (_, hour) => {
      const slice = (values) => values.slice(hour * 12, hour * 12 + 12);
      return `<tr><td>${String(hour).padStart(2, '0')}h</td><td>${Math.round(Numbers.average(slice(tps)))}</td><td>${Math.round(Math.max(...slice(tps)))}</td><td>${Math.round(Numbers.average(slice(p95)))}</td><td>${Math.round(Numbers.average(slice(p99)))}</td></tr>`;
    }).join('');
  }
}
