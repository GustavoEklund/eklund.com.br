import { ReadingQueries } from '../src/reading-queries.js';
import { ReportVocabulary } from '../src/report-vocabulary.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';

const HTML = PanelHtml.html;

/** The session recordings of a period, the latest first, each linking to its replay. */
export class RecordingsPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const asked = this.#query.input('recordings', ['page']);
    if (!asked.ok) return PanelLayout.invalid(asked.reason);
    const found = await this.#queries.run('recordings', asked.input);
    const { from, to } = asked.input;
    return {
      title: 'Recordings',
      body: HTML`
        ${PanelLayout.form('/recordings', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
          {
            name: 'page',
            label: 'Page',
            value: found.page,
            options: ReportVocabulary.RECORDED_PAGES,
          },
        ])}
        <p class="note">Only visitors who consented are recorded, without anything they typed, and each recording is deleted after 30 days or when its browser asks.
        ${found.sample.size > found.recordings.length ? HTML`This period has ${found.sample.size}; the latest ${ReadingQueries.LONG_TOP} are listed.` : ''}</p>
        ${
          found.recordings.length
            ? HTML`<table>
          <thead><tr><th scope="col">Recording</th><th scope="col">Page</th><th scope="col">Language</th><th scope="col">Release</th><th scope="col">Started</th><th scope="col">Length</th><th scope="col">Size</th><th scope="col">Clicks</th></tr></thead>
          <tbody>${found.recordings.map(
            (recording) => HTML`<tr>
              <th scope="row"><a href="/recordings/${recording.code}"><code>${recording.code.slice(0, 8)}</code></a></th>
              <td>${recording.page}</td><td>${recording.language}</td><td>${recording.version}</td>
              <td>${PanelFormat.time(recording.started)}</td><td>${PanelFormat.duration(recording.duration_ms)}</td>
              <td>${PanelFormat.bytes(recording.bytes)} <small>(${recording.chunks} ${recording.chunks === 1 ? 'chunk' : 'chunks'})</small></td>
              <td>${recording.clicks}</td>
            </tr>`,
          )}</tbody>
        </table>`
            : HTML`<p class="empty">No recording in this period.</p>`
        }`,
    };
  }
}
