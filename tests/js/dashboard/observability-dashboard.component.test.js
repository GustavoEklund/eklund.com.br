import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObservabilityDashboard } from '@site/js/dashboard/observability-dashboard.js';
import { HourlyTable, LinePanel, UptimeStrip } from '@site/js/dashboard/panels.js';
import { SyntheticDaySeries } from '@site/js/dashboard/synthetic-day-series.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { FrameQueue } from '../../support/frame-queue.js';
import { FakeIntersectionObserver, FakeResizeObserver } from '../../support/fake-observers.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const expectedRows = () => {
  const series = new SyntheticDaySeries();
  return Array.from({ length: 24 }, (_, hour) => {
    const slice = (values) => values.slice(hour * 12, hour * 12 + 12);
    return [
      `${String(hour).padStart(2, '0')}h`,
      String(Math.round(average(slice(series.tps)))),
      String(Math.round(Math.max(...slice(series.tps)))),
      String(Math.round(average(slice(series.p95)))),
      String(Math.round(average(slice(series.p99)))),
    ];
  });
};

describe('ObservabilityDashboard', () => {
  let root, translator, frames, dashboard;
  const plot = (id) => root.querySelector(`#${id} .chart-plot`);
  const rows = () =>
    [...root.querySelectorAll('#dashboard-table-body tr')].map((row) =>
      [...row.cells].map((cell) => cell.textContent),
    );
  const build = () => {
    dashboard = new ObservabilityDashboard({ root, translator });
    return dashboard;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Formatter.use('pt-BR');
    document.body.style.margin = '0';
    document.body.innerHTML = `<section id="dashboard">
      <figure id="chart-throughput" style="margin:0"><div class="chart-plot" style="width:600px"></div></figure>
      <figure id="chart-latency" style="margin:0"><div class="chart-plot" style="width:600px"></div></figure>
      <figure id="chart-uptime" style="margin:0"><div class="chart-plot uptime-strip"></div></figure>
      <table><tbody id="dashboard-table-body"></tbody></table></section>`;
    root = document.getElementById('dashboard');
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    frames = new FrameQueue().install();
    FakeIntersectionObserver.install();
    FakeResizeObserver.install();
  });

  afterEach(() => {
    frames.restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('style');
  });

  it('draws nothing when it is only constructed', () => {
    build();
    expect([
      plot('chart-throughput').innerHTML,
      plot('chart-latency').innerHTML,
      plot('chart-uptime').innerHTML,
      rows(),
    ]).toStrictEqual(['', '', '', []]);
  });

  describe('mount', () => {
    it('fills the hourly table at once, from the seeded day', () => {
      build().mount();
      expect(rows()).toStrictEqual(expectedRows());
    });

    it('does not draw the charts before the dashboard is on screen', () => {
      build().mount();
      expect([
        plot('chart-throughput').innerHTML,
        plot('chart-latency').innerHTML,
        plot('chart-uptime').innerHTML,
      ]).toStrictEqual(['', '', '']);
    });

    it('watches the dashboard for size changes, and for visibility from 20% of it', () => {
      build().mount();
      expect([
        FakeResizeObserver.instances.map((observer) => observer.observed),
        FakeIntersectionObserver.instances.map((observer) => [observer.observed, observer.options]),
      ]).toStrictEqual([[[root]], [[[root], { threshold: 0.2 }]]]);
    });

    it('renders the table exactly once on mount and never again', () => {
      const table = vi.spyOn(HourlyTable.prototype, 'render');
      build().mount();
      FakeIntersectionObserver.report(true);
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(500);
      expect(table).toHaveBeenCalledTimes(1);
    });
  });

  describe('when it scrolls into view', () => {
    it('draws the two line charts and the uptime strip', () => {
      build().mount();
      FakeIntersectionObserver.report(true);
      expect(plot('chart-throughput').querySelector('svg').getAttribute('aria-label')).toBe(
        DictionaryText.entry('pt-BR', 'dashboard.throughput.aria'),
      );
      expect(plot('chart-latency').querySelector('svg').getAttribute('aria-label')).toBe(
        DictionaryText.entry('pt-BR', 'dashboard.latency.aria'),
      );
      expect([
        plot('chart-uptime').querySelectorAll('i').length,
        plot('chart-uptime').querySelectorAll('svg').length,
      ]).toStrictEqual([30, 0]);
    });

    it('plots the throughput as one filled series on a 0 to 500 scale, and the latency as p95 and p99 on 0 to 400 with a 300 ms reference', () => {
      build().mount();
      FakeIntersectionObserver.report(true);
      const throughput = plot('chart-throughput'),
        latency = plot('chart-latency');
      expect([
        [...throughput.querySelectorAll('.axis-y')].map((label) => label.textContent),
        throughput.querySelectorAll('.series-area').length,
        throughput.querySelectorAll('.series-line').length,
        throughput.querySelectorAll('.reference-line').length,
      ]).toStrictEqual([['0', '100', '200', '300', '400', '500'], 1, 1, 0]);
      expect([
        [...latency.querySelectorAll('.axis-y')].map((label) => label.textContent),
        latency.querySelectorAll('.series-area').length,
        [...latency.querySelectorAll('.series-label')].map((label) => label.textContent),
        latency.querySelector('.axis-ref').textContent,
      ]).toStrictEqual([['0', '100', '200', '300', '400'], 0, ['p95', 'p99'], '300 ms']);
    });

    it('renders each panel once: two line panels and one strip, no table', () => {
      const lines = vi.spyOn(LinePanel.prototype, 'render'),
        strip = vi.spyOn(UptimeStrip.prototype, 'render');
      build().mount();
      FakeIntersectionObserver.report(true);
      expect([lines.mock.calls.length, strip.mock.calls.length]).toStrictEqual([2, 1]);
    });

    it('marks the dashboard as revealed on the next frame, not before', () => {
      build().mount();
      FakeIntersectionObserver.report(true);
      expect([root.classList.contains('is-revealed'), frames.pending]).toStrictEqual([false, 1]);
      frames.run(16);
      expect(root.classList.contains('is-revealed')).toBe(true);
    });

    it('does nothing when it leaves the screen', () => {
      const lines = vi.spyOn(LinePanel.prototype, 'render');
      build().mount();
      FakeIntersectionObserver.report(false);
      expect([
        lines.mock.calls.length,
        frames.pending,
        root.classList.contains('is-revealed'),
      ]).toStrictEqual([0, 0, false]);
    });

    it('redraws on every return to the screen', () => {
      const lines = vi.spyOn(LinePanel.prototype, 'render');
      build().mount();
      FakeIntersectionObserver.report(true);
      FakeIntersectionObserver.report(false);
      FakeIntersectionObserver.report(true);
      expect(lines).toHaveBeenCalledTimes(4);
    });
  });

  describe('on resize', () => {
    it('redraws the charts 120 ms after the last size change, once', () => {
      const lines = vi.spyOn(LinePanel.prototype, 'render'),
        strip = vi.spyOn(UptimeStrip.prototype, 'render');
      build().mount();
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(50);
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(50);
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(119);
      expect([lines.mock.calls.length, strip.mock.calls.length]).toStrictEqual([0, 0]);
      vi.advanceTimersByTime(1);
      expect([lines.mock.calls.length, strip.mock.calls.length]).toStrictEqual([2, 1]);
      vi.advanceTimersByTime(1000);
      expect([lines.mock.calls.length, strip.mock.calls.length]).toStrictEqual([2, 1]);
    });

    it('draws at the new width', () => {
      build().mount();
      plot('chart-throughput').style.width = '400px';
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(120);
      expect(plot('chart-throughput').querySelector('svg').getAttribute('width')).toBe('400');
    });

    it('draws again after a pause, once per burst', () => {
      const lines = vi.spyOn(LinePanel.prototype, 'render');
      build().mount();
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(200);
      FakeResizeObserver.fire();
      vi.advanceTimersByTime(200);
      expect(lines).toHaveBeenCalledTimes(4);
    });
  });

  describe('render', () => {
    it('draws all three panels', () => {
      build().render();
      expect([
        plot('chart-throughput').querySelectorAll('svg').length,
        plot('chart-latency').querySelectorAll('svg').length,
        plot('chart-uptime').querySelectorAll('i').length,
      ]).toStrictEqual([1, 1, 30]);
    });

    it('labels the charts in the language the page is in at that moment', () => {
      build();
      translator.setLocale('en-US');
      dashboard.render();
      expect(plot('chart-throughput').querySelector('svg').getAttribute('aria-label')).toBe(
        DictionaryText.entry('en-US', 'dashboard.throughput.aria'),
      );
    });

    it('can be repeated without stacking drawings', () => {
      build();
      dashboard.render();
      dashboard.render();
      expect([
        plot('chart-throughput').querySelectorAll('svg').length,
        plot('chart-uptime').querySelectorAll('i').length,
      ]).toStrictEqual([1, 30]);
    });
  });
});
