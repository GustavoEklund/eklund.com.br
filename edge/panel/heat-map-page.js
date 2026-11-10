import { ReportVocabulary } from '../src/report-vocabulary.js';
import { PanelFormat } from './panel-format.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { SvgChart } from './svg-chart.js';

const HTML = PanelHtml.html;

/**
 * Where recorded visitors clicked: for each part of the page and range of window width, a grid of ten by ten cells laid over
 * that part, each cell as dark as its share of the part's busiest cell, with its count written in it. The grid is the
 * part's own box, not a picture of it, so a cell is a place inside that section, from its top left.
 */
export class HeatMapPage {
  #queries;
  #query;

  constructor({ queries, query }) {
    this.#queries = queries;
    this.#query = query;
  }

  async render() {
    const asked = this.#query.input('heat_map', ['page', 'region', 'viewport']);
    if (!asked.ok) return PanelLayout.invalid(asked.reason);
    const map = await this.#queries.run('heat_map', asked.input);
    const { from, to } = asked.input;
    return {
      title: 'Heat map',
      body: HTML`
        ${PanelLayout.form('/heat-map', [
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'To', value: to },
          {
            name: 'page',
            label: 'Page',
            value: map.page,
            options: ReportVocabulary.RECORDED_PAGES,
          },
          { name: 'region', label: 'Part', value: map.region, options: ReportVocabulary.REGIONS },
          {
            name: 'viewport',
            label: 'Width',
            value: map.viewport,
            options: ReportVocabulary.VIEWPORT_WIDTHS,
          },
        ])}
        ${PanelLayout.sample(map.sample, 'clicks')}
        <p class="note">Only the clicks of visitors who consented to recording, kept 30 days. Each grid is one part of the page at one range of window width, in CSS pixels; the parts are not drawn to scale with each other.</p>
        ${
          map.parts.length
            ? HTML`<div class="heat">${map.parts.map(
                (part) => HTML`<figure>
                  <figcaption><strong>${part.region}</strong> at ${part.viewport} px: ${PanelFormat.count(part.clicks)} ${part.clicks === 1 ? 'click' : 'clicks'}</figcaption>
                  ${SvgChart.grid(part.cells, map.grid, {
                    label: `Clicks on ${part.region} at ${part.viewport} pixels wide, in a grid of ${map.grid} by ${map.grid}`,
                  })}
                </figure>`,
              )}</div>`
            : HTML`<p class="empty">No click in this period.</p>`
        }`,
    };
  }
}
