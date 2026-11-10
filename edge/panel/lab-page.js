import { ReadingQueries } from '../src/reading-queries.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { SvgChart } from './svg-chart.js';

const HTML = PanelHtml.html;
const PAGES = ['/', '/en/'];
const FORM_FACTORS = ['mobile', 'desktop'];
/** The lab numbers each night draws, and how each is written. */
const CHARTS = [
  ['score', 'Performance score', (value) => PanelFormat.metric('score', value)],
  ['lcp_ms', 'Largest Contentful Paint', (value) => PanelFormat.metric('lcp', value)],
  ['tbt_ms', 'Total Blocking Time', (value) => PanelFormat.metric('tbt', value)],
];

/**
 * What runs outside the visits: the nightly PageSpeed Insights series and where it shifted, CrUX, Search Console and Bing,
 * the certificates and the uptime monitor.
 */
export class LabPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const asked = this.#query.input('lab');
    if (!asked.ok) return PanelLayout.invalid(asked.reason);
    const metric = this.#query.value('metric') || 'lcp';
    const changes = PAGES.flatMap((page) =>
      FORM_FACTORS.map((formFactor) => ({ page, form_factor: formFactor })),
    );
    if (!Object.hasOwn(ReadingQueries.LAB_COLUMNS, metric))
      return PanelLayout.invalid(`metric: there is no lab number called ${metric}`);
    const { from, to } = asked.input;
    const [lab, crux, search, certificates, uptime, ...points] = await Promise.all([
      this.#queries.run('lab', asked.input),
      this.#queries.run('crux', {}),
      this.#queries.run('search', { from, to }),
      this.#queries.run('certificates', {}),
      this.#queries.run('uptime', { from, to }),
      ...changes.map((series) =>
        this.#queries.run('lab_change_points', { ...series, metric, from, to }),
      ),
    ]);
    return {
      title: 'Lab',
      body: HTML`
        ${PanelLayout.form('/lab', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
          {
            name: 'metric',
            label: 'Shifts in',
            value: metric,
            options: Object.keys(ReadingQueries.LAB_COLUMNS),
            required: true,
          },
        ])}
        <section>
          <h2>PageSpeed Insights, every night</h2>
          ${PanelLayout.sample(lab.sample, 'nights')}
          ${LabPage.#nights(lab.runs)}
        </section>
        <section>
          <h2>Where the ${metric} of the median run shifted</h2>
          ${LabPage.#shifts(points, metric)}
        </section>
        <section>
          <h2>Chrome UX Report</h2>
          ${LabPage.#crux(crux)}
        </section>
        <section>
          <h2>Search</h2>
          ${LabPage.#search(search)}
        </section>
        <div class="columns">
          <section class="ranked">
            <h2>Certificates</h2>
            ${LabPage.#certificates(certificates)}
          </section>
          <section class="ranked">
            <h2>Uptime</h2>
            ${LabPage.#uptime(uptime)}
          </section>
        </div>`,
    };
  }

  static #nights(runs) {
    if (runs.length === 0) return HTML`<p class="empty">No night of the lab in this period.</p>`;
    const series = PAGES.flatMap((page) =>
      FORM_FACTORS.map((formFactor) => ({
        name: `${page} ${formFactor}`,
        runs: runs.filter((run) => run.page === page && run.form_factor === formFactor),
      })),
    );
    const latest = runs.at(-1).day;
    return HTML`
      <ul class="legend">${series.map(({ name }, index) => HTML`<li class="series-${index}">${name}</li>`)}</ul>
      <div class="charts">${CHARTS.map(
        ([column, name, format]) => HTML`<figure>
          <figcaption>${name}</figcaption>
          ${SvgChart.lines(
            series.map(({ name: label, runs: found }) => ({
              name: label,
              points: found.map((run) => ({ day: run.day, value: run[column] })),
            })),
            { label: `${name} of the median run each night`, format },
          )}
        </figure>`,
      )}</div>
      <h3>The night of ${latest}</h3>
      <table>
        <thead><tr><th scope="col">Page</th><th scope="col">Form factor</th><th scope="col">Score</th><th scope="col">LCP</th><th scope="col">FCP</th><th scope="col">CLS</th><th scope="col">TBT</th><th scope="col">Speed Index</th><th scope="col">TTFB</th></tr></thead>
        <tbody>${runs
          .filter(({ day }) => day === latest)
          .map(
            (run) => HTML`<tr><th scope="row">${run.page}</th><td>${run.form_factor}</td>
              <td>${PanelFormat.metric('score', run.score)}</td><td>${PanelFormat.metric('lcp', run.lcp_ms)}</td>
              <td>${PanelFormat.metric('fcp', run.fcp_ms)}</td><td>${PanelFormat.metric('cls', run.cls)}</td>
              <td>${PanelFormat.metric('tbt', run.tbt_ms)}</td><td>${PanelFormat.metric('speed_index', run.speed_index_ms)}</td>
              <td>${PanelFormat.metric('ttfb', run.ttfb_ms)}</td></tr>`,
          )}</tbody>
      </table>`;
  }

  static #shifts(points, metric) {
    const format = (value) => PanelFormat.metric(metric, value);
    return HTML`<table>
      <thead><tr><th scope="col">Page</th><th scope="col">Form factor</th><th scope="col">Nights</th><th scope="col">Verdict</th><th scope="col">Levels</th></tr></thead>
      <tbody>${points.map(
        (found) => HTML`<tr>
          <th scope="row">${found.page}</th><td>${found.form_factor}</td>
          <td>${found.sample.size}${found.sample.enough ? '' : HTML` <span class="is-small">fewer than ${found.sample.minimum}</span>`}</td>
          <td>${found.verdict}</td>
          <td>${found.segments.map(({ from, to, nights, mean }) => HTML`<span class="segment">${from} to ${to}: ${format(mean)} (${nights})</span> `)}</td>
        </tr>`,
      )}</tbody>
    </table>`;
  }

  static #crux(crux) {
    if (crux.readings.length === 0)
      return HTML`<p class="empty">CrUX has reported nothing yet.</p><p class="note">${crux.sample.note}</p>`;
    return HTML`<p class="note">The 28 days before ${crux.day}. ${crux.sample.note}</p>
      <table>
        <thead><tr><th scope="col">Scope</th><th scope="col">Device</th><th scope="col">Metric</th><th scope="col">p75</th><th scope="col">Good, needs improvement, poor</th></tr></thead>
        <tbody>${crux.readings.map(
          (
            reading,
          ) => HTML`<tr><th scope="row">${reading.scope}</th><td>${reading.form_factor}</td><td>${reading.metric}</td>
            <td>${PanelFormat.metric(reading.metric, reading.p75)}</td>
            <td>${SvgChart.ratings(reading)} ${PanelFormat.share(reading.good)} · ${PanelFormat.share(reading.needs_improvement)} · ${PanelFormat.share(reading.poor)}</td></tr>`,
        )}</tbody>
      </table>`;
  }

  static #search(search) {
    return HTML`${PanelLayout.sample(search.sample, 'impressions')}
      <table>
        <thead><tr><th scope="col">Engine</th><th scope="col">Clicks</th><th scope="col">Impressions</th></tr></thead>
        <tbody>${
          search.totals.length
            ? search.totals.map(
                ({ engine, clicks, impressions }) =>
                  HTML`<tr><th scope="row">${engine}</th><td>${PanelFormat.count(clicks)}</td><td>${PanelFormat.count(impressions)}</td></tr>`,
              )
            : HTML`<tr><td colspan="3">No search data in this period.</td></tr>`
        }</tbody>
      </table>
      <div class="columns">
        <section class="ranked">
          <h3>Queries</h3>
          ${LabPage.#rows(search.queries, ({ engine, query, clicks, impressions, position }) => [query, engine, clicks, impressions, position ?? PanelFormat.NONE], ['Query', 'Engine', 'Clicks', 'Impressions', 'Position'])}
        </section>
        <section class="ranked">
          <h3>Pages on Google</h3>
          ${LabPage.#rows(search.pages, ({ page, clicks, impressions }) => [page, clicks, impressions], ['Page', 'Clicks', 'Impressions'])}
        </section>
      </div>`;
  }

  static #certificates({ certificates, day }) {
    if (certificates.length === 0)
      return HTML`<p class="empty">The lab has not checked a certificate yet.</p>`;
    return HTML`<p class="note">Checked on ${day}.</p>${LabPage.#rows(
      certificates,
      ({ host, issuer, problem, days_left: left }) => [
        host,
        problem ? HTML`<span class="is-small">${problem}</span>` : issuer,
        left ?? PanelFormat.NONE,
      ],
      ['Host', 'Issuer', 'Days left'],
    )}`;
  }

  static #uptime(uptime) {
    return HTML`${PanelLayout.sample(uptime.sample, 'checks')}${LabPage.#rows(
      uptime.pages,
      ({ target, availability, typical_ms: typical, worst_p95_ms: worst }) => {
        const now = uptime.now.find((found) => found.target === target);
        return [
          target,
          PanelFormat.share(availability, 2),
          PanelFormat.metric('ms', typical),
          PanelFormat.metric('ms', worst),
          now?.failing ? HTML`<span class="is-small">down since ${now.failing_since}</span>` : 'up',
        ];
      },
      ['Page', 'Available', 'Typical', 'Worst p95', 'Now'],
    )}`;
  }

  static #rows(rows, cells, columns) {
    if (rows.length === 0) return HTML`<p class="empty">None in this period.</p>`;
    return HTML`<table>
      <thead><tr>${columns.map((name) => HTML`<th scope="col">${name}</th>`)}</tr></thead>
      <tbody>${rows.map((row) => HTML`<tr>${cells(row).map((cell) => HTML`<td>${cell}</td>`)}</tr>`)}</tbody>
    </table>`;
  }
}
