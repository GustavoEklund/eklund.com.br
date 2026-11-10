import { describe, it, expect } from 'vitest';
import { EventsPage } from '../../edge/panel/events-page.js';
import { PanelQuery } from '../../edge/panel/panel-query.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };

describe('EventsPage', () => {
  const render = async (search, events, errors) => {
    const queries = new FakeReadings({
      events: (input) => ({
        ...input,
        page: input.page ?? null,
        events,
        sample: FakeReadings.sample(events.reduce((sum, { total }) => sum + total, 0)),
      }),
      errors: (input) => ({
        ...input,
        version: input.version ?? null,
        errors,
        sample: FakeReadings.sample(errors.length),
      }),
    });
    const page = await new EventsPage({
      queries,
      query: new PanelQuery(new URL(`https://panel.example/events${search}`), clock),
    }).render();
    return { page, queries, document: page.body && PanelDocument.parse(page.body) };
  };

  it('lists the events and the errors of the period, most frequent first, with the page and release asked for', async () => {
    const { page, queries, document } = await render(
      '?from=2026-11-01&to=2026-11-09&page=/en/&version=1.2.0',
      [
        { name: 'section', detail: 'status', total: 30 },
        { name: 'copy-email', detail: '', total: 10 },
      ],
      [{ kind: 'error', source: '/js/globe/globe.js', message: '<script>x</script>', total: 2 }],
    );
    expect([
      page.title,
      queries.calls,
      PanelDocument.texts(document, '.sample'),
      PanelDocument.tables(document),
      document.querySelector('select[name="page"] option[selected]').textContent,
    ]).toStrictEqual([
      'Events and errors',
      [
        ['events', { from: '2026-11-01', to: '2026-11-09', page: '/en/' }],
        ['errors', { from: '2026-11-01', to: '2026-11-09', version: '1.2.0' }],
      ],
      ['Sample: 40 events.', 'Sample too small: 1 errors, and a conclusion needs at least 20.'],
      [
        [
          ['Event', 'Detail', 'Times'],
          ['section', 'status', '30'],
          ['copy-email', '-', '10'],
        ],
        [
          ['Kind', 'Source', 'Message', 'Times'],
          ['error', '/js/globe/globe.js', '<script>x</script>', '2'],
        ],
      ],
      '/en/',
    ]);
  });

  it('says when the period has none, and answers 400 to a filter the readings refuse', async () => {
    const empty = await render('', [], []);
    const refused = await render('?version=latest', [], []);
    expect([
      PanelDocument.texts(empty.document, '.empty'),
      refused.page.status,
      refused.queries.calls,
    ]).toStrictEqual([['None in this period.', 'None in this period.'], 400, []]);
  });
});
