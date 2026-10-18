import { Dom } from '../shared/dom.js';
import { SyntheticDaySeries } from './synthetic-day-series.js';
import { HourlyTable, LinePanel, UptimeStrip } from './panels.js';

const RESIZE_DEBOUNCE_MS = 120;

/** Grafana-like panel: the CV figures as tiles plus illustrative charts calibrated to them. */
export class ObservabilityDashboard {
  #root;
  #panels;
  #table;
  #resizeTimer = 0;

  constructor({ root, translator }) {
    this.#root = root;
    const series = new SyntheticDaySeries();
    this.#panels = [
      new LinePanel(
        root.querySelector('#chart-throughput'),
        [{ name: '', values: series.tps, color: 'var(--series-1)' }],
        {
          maxValue: 500,
          ticks: [0, 100, 200, 300, 400, 500],
          unit: 'TPS',
          area: true,
          ariaLabelKey: 'dashboard.throughput.aria',
        },
        translator,
      ),
      new LinePanel(
        root.querySelector('#chart-latency'),
        [
          { name: 'p95', values: series.p95, color: 'var(--series-1)' },
          { name: 'p99', values: series.p99, color: 'var(--series-2)' },
        ],
        {
          maxValue: 400,
          ticks: [0, 100, 200, 300, 400],
          unit: 'ms',
          reference: 300,
          ariaLabelKey: 'dashboard.latency.aria',
        },
        translator,
      ),
      new UptimeStrip(root.querySelector('#chart-uptime .chart-plot'), translator),
    ];
    this.#table = new HourlyTable(root.querySelector('#dashboard-table-body'), series);
  }

  mount() {
    this.#table.render();
    new ResizeObserver(() => {
      clearTimeout(this.#resizeTimer);
      this.#resizeTimer = setTimeout(() => this.render(), RESIZE_DEBOUNCE_MS);
    }).observe(this.#root);
    Dom.observeVisibility(
      this.#root,
      (visible) => {
        if (visible) {
          this.render();
          requestAnimationFrame(() => this.#root.classList.add('is-revealed'));
        }
      },
      0.2,
    );
  }

  render() {
    for (const panel of this.#panels) panel.render();
  }
}
