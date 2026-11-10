import { Calendar } from '../src/calendar.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { ReleaseOrder } from './release-order.js';
import { SvgChart } from './svg-chart.js';

const HTML = PanelHtml.html;
/** The tables of the overview, by the column of the daily totals each one ranks. */
const TOPS = [
  ['page', 'Pages'],
  ['language', 'Languages'],
  ['country', 'Countries'],
  ['device', 'Devices'],
  ['browser', 'Browsers'],
  ['referrer', 'Referrers'],
  ['version', 'Releases'],
  ['host', 'Hosts'],
];
/** What an empty value means in each column. */
const EMPTY = { country: 'unknown', referrer: 'none (typed or bookmarked)' };
const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

/**
 * The first page: the views of the period, day by day and by page, language, country and the other columns, and the
 * current release beside the previous one, each with its sample.
 */
export class OverviewPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const asked = this.#query.input('overview');
    if (!asked.ok) return PanelLayout.invalid(asked.reason);
    const { from, to } = asked.input;
    const overview = await this.#queries.run('overview', asked.input);
    const [current = null, previous = null] = ReleaseOrder.newestFirst(
      overview.top.version.map(({ value }) => value),
    );
    const [now, before] = await Promise.all(
      [current, previous].map((version) =>
        version ? this.#queries.run('vitals', { from, to, version }) : null,
      ),
    );
    return {
      title: 'Overview',
      body: HTML`
        ${PanelLayout.form('/', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
        ])}
        <div class="tiles">
          <p class="tile"><span>Views</span> <strong>${PanelFormat.count(overview.views)}</strong></p>
          <p class="tile"><span>Days with views</span> <strong>${overview.days_with_views}</strong></p>
          <p class="tile"><span>Current release</span> <strong>${current ?? PanelFormat.NONE}</strong></p>
        </div>
        ${PanelLayout.sample(overview.sample, 'views')}
        <section>
          <h2>Views per day</h2>
          ${SvgChart.bars(OverviewPage.#days(from, to, overview.per_day), {
            label: `Views per day from ${from} to ${to}`,
            format: PanelFormat.count,
          })}
        </section>
        <section>
          <h2>Current release and the previous one</h2>
          ${OverviewPage.#releases(overview, [previous, before], [current, now])}
        </section>
        <div class="columns">
          ${TOPS.map(([column, name]) => OverviewPage.#top(name, column, overview.top[column], overview.views))}
        </div>`,
    };
  }

  /** Every day of the period, with zero views where it has none. */
  static #days(from, to, perDay) {
    const views = new Map(perDay.map(({ day, views: count }) => [day, count]));
    const days = [];
    for (let day = to; day >= from; day = Calendar.daysBefore(day, 1)) days.unshift(day);
    return days.map((day) => ({ label: day, value: views.get(day) ?? 0 }));
  }

  static #releases(overview, [previous, before], [current, now]) {
    if (!current) return HTML`<p class="empty">No release has views in this period.</p>`;
    const views = (version) =>
      overview.top.version.find(({ value }) => value === version)?.views ?? 0;
    const metric = (vitals, name) => vitals?.metrics.find(({ metric: found }) => found === name);
    const cell = (vitals, name) => {
      const found = metric(vitals, name);
      return found
        ? HTML`<td>${PanelFormat.metric(name, found.p75)} <small>(${found.sample.size}${found.sample.enough ? '' : ', too few'})</small></td>`
        : HTML`<td>${PanelFormat.NONE}</td>`;
    };
    const releases = previous ? [previous, current] : [current];
    const vitals = previous ? [before, now] : [now];
    return HTML`<table>
      <thead><tr><th scope="col">p75 of real visits</th>${releases.map((version) => HTML`<th scope="col">${version}</th>`)}</tr></thead>
      <tbody>
        <tr><th scope="row">Views</th>${releases.map((version) => HTML`<td>${PanelFormat.count(views(version))}</td>`)}</tr>
        ${VITALS.map((name) => HTML`<tr><th scope="row">${name}</th>${vitals.map((found) => cell(found, name))}</tr>`)}
      </tbody>
    </table>
    <p class="note">In brackets, the loads each value comes from; below ${overview.sample.minimum} a release is too small to compare.
    ${previous ? HTML`<a href="/vitals?${new URLSearchParams({ before: previous, after: current })}">Compare them with a test</a>.` : 'There is no earlier release in this period to compare with.'}</p>`;
  }

  static #top(name, column, rows, total) {
    const max = Math.max(0, ...rows.map(({ views }) => views));
    return HTML`<section class="ranked">
      <h2>${name}</h2>
      ${
        rows.length
          ? HTML`<table>
        <thead><tr><th scope="col">${column}</th><th scope="col">Views</th><th scope="col">Share</th></tr></thead>
        <tbody>${rows.map(
          ({ value, views }) => HTML`<tr>
            <td>${value === '' ? HTML`<em>${EMPTY[column] ?? 'none'}</em>` : value}</td>
            <td>${PanelFormat.count(views)}</td>
            <td>${SvgChart.meter(views, max)} ${PanelFormat.share(total ? views / total : null)}</td>
          </tr>`,
        )}</tbody>
      </table>`
          : HTML`<p class="empty">No views.</p>`
      }
    </section>`;
  }
}
