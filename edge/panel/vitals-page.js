import { ReadingInputs } from '../src/reading-inputs.js';
import { ReportVocabulary } from '../src/report-vocabulary.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { ReleaseOrder } from './release-order.js';
import { SvgChart } from './svg-chart.js';

const HTML = PanelHtml.html;
const DEVICES = ['phone', 'tablet', 'desktop'];

/**
 * Core Web Vitals of real visits: the 75th percentile and the ratings of each metric with the filters asked for, the
 * same for each page and device, the elements LCP, INP and CLS name most, and one metric compared between two releases with
 * a Mann-Whitney U test. Only the home pages run the script that measures, so the grid has those two.
 */
export class VitalsPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const asked = this.#query.input('vitals', ['page', 'device', 'version']);
    if (!asked.ok) return PanelLayout.invalid(asked.reason);
    const { from, to, version = null } = asked.input;
    const [vitals, overview, ...grid] = await Promise.all([
      this.#queries.run('vitals', asked.input),
      this.#queries.run('overview', { from, to }),
      ...ReportVocabulary.RECORDED_PAGES.flatMap((page) =>
        DEVICES.map((device) =>
          this.#queries.run('vitals', { from, to, page, device, ...(version ? { version } : {}) }),
        ),
      ),
    ]);
    const versions = ReleaseOrder.newestFirst(overview.top.version.map(({ value }) => value));
    const compare = {
      metric: this.#query.value('metric') || 'LCP',
      before: this.#query.value('before') || versions[1],
      after: this.#query.value('after') || versions[0],
    };
    return {
      title: 'Web Vitals',
      body: HTML`
        ${PanelLayout.form('/vitals', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
          { name: 'page', label: 'Page', value: asked.input.page, options: ReportVocabulary.PAGES },
          { name: 'device', label: 'Device', value: asked.input.device, options: DEVICES },
          { name: 'version', label: 'Release', value: version, options: versions },
        ])}
        <section>
          <h2>Each metric</h2>
          ${VitalsPage.#metrics(vitals)}
        </section>
        <section>
          <h2>By page and device</h2>
          ${VitalsPage.#grid(grid)}
        </section>
        <section>
          <h2>What the metrics point at</h2>
          ${VitalsPage.#targets(vitals)}
        </section>
        <section>
          <h2>Two releases compared</h2>
          ${await this.#comparison(compare, versions)}
        </section>`,
    };
  }

  static #metrics(vitals) {
    if (vitals.metrics.length === 0) return HTML`<p class="empty">No loads in this period.</p>`;
    return HTML`<table>
      <thead><tr><th scope="col">Metric</th><th scope="col">p75</th><th scope="col">Good, needs improvement, poor</th><th scope="col">Loads</th></tr></thead>
      <tbody>${vitals.metrics.map(
        (metric) => HTML`<tr>
          <th scope="row">${metric.metric}</th>
          <td>${PanelFormat.metric(metric.metric, metric.p75)}</td>
          <td>${SvgChart.ratings(metric)} ${PanelFormat.share(metric.good)} · ${PanelFormat.share(metric.needs_improvement)} · ${PanelFormat.share(metric.poor)}</td>
          <td>${PanelFormat.count(metric.sample.size)}${metric.sample.enough ? '' : HTML` <span class="is-small">too few</span>`}</td>
        </tr>`,
      )}</tbody>
    </table>`;
  }

  static #grid(grid) {
    const names = ReportVocabulary.METRICS;
    const rows = ReportVocabulary.RECORDED_PAGES.flatMap((page) =>
      DEVICES.map((device) => ({ page, device })),
    );
    return HTML`<table>
      <thead><tr><th scope="col">Page</th><th scope="col">Device</th>${names.map((name) => HTML`<th scope="col">${name}</th>`)}</tr></thead>
      <tbody>${rows.map(({ page, device }, index) => {
        const found = (name) => grid[index].metrics.find(({ metric }) => metric === name);
        return HTML`<tr><th scope="row">${page}</th><td>${device}</td>${names.map((name) => {
          const metric = found(name);
          return metric
            ? HTML`<td>${PanelFormat.metric(name, metric.p75)} <small>(${metric.sample.size})</small></td>`
            : HTML`<td>${PanelFormat.NONE}</td>`;
        })}</tr>`;
      })}</tbody>
    </table>
    <p class="note">The 75th percentile, and in brackets the loads it comes from. Below 20 loads a cell is too small to conclude anything.</p>`;
  }

  static #targets(vitals) {
    const named = vitals.metrics.filter(({ targets }) => targets.length);
    if (named.length === 0)
      return HTML`<p class="empty">No load named an element in this period.</p>`;
    return HTML`<div class="columns">${named.map(
      ({ metric, targets }) => HTML`<section class="ranked">
        <h3>${metric}</h3>
        <table>
          <thead><tr><th scope="col">Element</th><th scope="col">Loads</th><th scope="col">Poor</th></tr></thead>
          <tbody>${targets.map(({ target, loads, poor }) => HTML`<tr><td><code>${target}</code></td><td>${loads}</td><td>${poor}</td></tr>`)}</tbody>
        </table>
      </section>`,
    )}</div>`;
  }

  async #comparison(compare, versions) {
    const form = PanelLayout.form('/vitals', [
      {
        name: 'metric',
        label: 'Metric',
        value: compare.metric,
        options: ReportVocabulary.METRICS,
        required: true,
      },
      { name: 'before', label: 'Before', value: compare.before, options: versions, required: true },
      { name: 'after', label: 'After', value: compare.after, options: versions, required: true },
    ]);
    if (!compare.before || !compare.after)
      return HTML`${form}<p class="empty">Two releases need views in this period to be compared.</p>`;
    const parsed = ReadingInputs.parse('compare_vitals', compare);
    if (!parsed.ok) return HTML`${form}<p class="empty">${parsed.reason}.</p>`;
    const result = await this.#queries.run('compare_vitals', parsed.input);
    const group = (side) => HTML`<tr>
      <th scope="row">${side.name}</th>
      <td>${PanelFormat.count(side.values)}</td>
      <td>${PanelFormat.metric(result.metric, side.median)}</td>
      <td>${PanelFormat.metric(result.metric, side.p75)}</td>
    </tr>`;
    return HTML`${form}
      <table>
        <thead><tr><th scope="col">Release</th><th scope="col">Loads</th><th scope="col">Median</th><th scope="col">p75</th></tr></thead>
        <tbody>${group(result.before)}${group(result.after)}</tbody>
      </table>
      <p class="verdict${result.sample.enough ? '' : ' is-small'}">Verdict: ${result.verdict}. Mann-Whitney U, p ${PanelFormat.p(result.test.p)}, over the latest loads of each release on every page.</p>`;
  }
}
