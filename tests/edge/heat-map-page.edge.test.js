import { describe, it, expect } from 'vitest';
import { HeatMapPage } from '../../edge/panel/heat-map-page.js';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };

describe('HeatMapPage', () => {
  const render = async (search, parts) => {
    const clicks = parts.reduce((sum, part) => sum + part.clicks, 0);
    const queries = new FakeReadings({
      heat_map: (input) => ({
        from: input.from,
        to: input.to,
        page: input.page ?? null,
        region: input.region ?? null,
        viewport: input.viewport ?? null,
        grid: 10,
        clicks,
        parts,
        sample: FakeReadings.sample(clicks),
      }),
    });
    const page = await new HeatMapPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/heat-map${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('draws a ten by ten grid for each part and width, with the filters asked for, and says the sample is small', async () => {
    const { page, queries, document } = await render('?page=/&viewport=1280-1535', [
      {
        region: 'status',
        viewport: '1280-1535',
        clicks: 3,
        cells: [
          { x: 2, y: 5, clicks: 2 },
          { x: 9, y: 9, clicks: 1 },
        ],
      },
      { region: 'hero', viewport: '1280-1535', clicks: 1, cells: [{ x: 0, y: 0, clicks: 1 }] },
    ]);
    expect([
      page.title,
      queries.calls,
      PanelDocument.texts(document, 'figcaption'),
      [...document.querySelectorAll('svg.grid')].map((grid) => [
        grid.getAttribute('aria-label'),
        grid.querySelectorAll('rect.cell').length,
        grid.querySelectorAll('rect.cell-empty').length,
      ]),
      PanelDocument.texts(document, '.sample'),
    ]).toStrictEqual([
      'Heat map',
      [['heat_map', { from: '2026-10-13', to: '2026-11-09', page: '/', viewport: '1280-1535' }]],
      ['status at 1280-1535 px: 3 clicks', 'hero at 1280-1535 px: 1 click'],
      [
        ['Clicks on status at 1280-1535 pixels wide, in a grid of 10 by 10', 2, 98],
        ['Clicks on hero at 1280-1535 pixels wide, in a grid of 10 by 10', 1, 99],
      ],
      ['Sample too small: 4 clicks, and a conclusion needs at least 20.'],
    ]);
  });

  it('says when the period has no click, and answers 400 to a part the page does not have', async () => {
    const empty = await render('', []);
    const refused = await render('?region=sidebar', []);
    expect([PanelDocument.texts(empty.document, '.empty'), refused.page.status]).toStrictEqual([
      ['No click in this period.'],
      400,
    ]);
  });
});
