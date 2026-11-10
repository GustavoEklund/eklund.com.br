import { ReportVocabulary } from '../src/report-vocabulary.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { SvgChart } from './svg-chart.js';

const HTML = PanelHtml.html;

/** What visitors did, event by event, and the errors of the site's own code, most frequent first. */
export class EventsPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const events = this.#query.input('events', ['page']);
    if (!events.ok) return PanelLayout.invalid(events.reason);
    const errors = this.#query.input('errors', ['version']);
    if (!errors.ok) return PanelLayout.invalid(errors.reason);
    const [done, broke] = await Promise.all([
      this.#queries.run('events', events.input),
      this.#queries.run('errors', errors.input),
    ]);
    const { from, to } = events.input;
    return {
      title: 'Events and errors',
      body: HTML`
        ${PanelLayout.form('/events', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
          { name: 'page', label: 'Page', value: done.page, options: ReportVocabulary.PAGES },
        ])}
        <section>
          <h2>Events</h2>
          ${PanelLayout.sample(done.sample, 'events')}
          ${EventsPage.#table(
            ['Event', 'Detail'],
            done.events.map(({ name, detail, total }) => [
              [name, detail || PanelFormat.NONE],
              total,
            ]),
          )}
        </section>
        <section>
          <h2>Errors</h2>
          ${PanelLayout.sample(broke.sample, 'errors')}
          ${EventsPage.#table(
            ['Kind', 'Source', 'Message'],
            broke.errors.map(({ kind, source, message, total }) => [
              [kind, HTML`<code>${source}</code>`, message],
              total,
            ]),
          )}
          <p class="note">Error rows are kept 90 days; older periods count from the daily totals.</p>
        </section>`,
    };
  }

  static #table(columns, rows) {
    if (rows.length === 0) return HTML`<p class="empty">None in this period.</p>`;
    const max = Math.max(...rows.map(([, total]) => total));
    return HTML`<table>
      <thead><tr>${columns.map((name) => HTML`<th scope="col">${name}</th>`)}<th scope="col">Times</th></tr></thead>
      <tbody>${rows.map(
        ([cells, total]) =>
          HTML`<tr>${cells.map((cell) => HTML`<td>${cell}</td>`)}<td>${SvgChart.meter(total, max)} ${PanelFormat.count(total)}</td></tr>`,
      )}</tbody>
    </table>`;
  }
}
