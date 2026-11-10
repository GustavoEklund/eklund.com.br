import { describe, it, expect } from 'vitest';
import { PanelQuery } from '../../edge/panel/panel-query.js';

const clock = { now: () => Date.parse('2026-11-09T15:00:00Z') };
const query = (search) => new PanelQuery(new URL(`https://panel.example${search}`), clock);

describe('PanelQuery', () => {
  it('reads the last 28 days through today when the URL names no period', () => {
    expect([query('').today, query('').period(), query('').input('overview')]).toStrictEqual([
      '2026-11-09',
      { from: '2026-10-13', to: '2026-11-09' },
      { ok: true, input: { from: '2026-10-13', to: '2026-11-09' } },
    ]);
  });

  it("takes the period and the reading's filters from the URL, the first of a repeated one, and leaves other parameters out", () => {
    expect(
      query('?from=2026-11-01&to=2026-11-05&page=/en/&page=/&metric=LCP&device=').input('vitals', [
        'page',
        'device',
      ]),
    ).toStrictEqual({ ok: true, input: { from: '2026-11-01', to: '2026-11-05', page: '/en/' } });
  });

  it('refuses what the schema of the reading refuses, and reads a reading without a period', () => {
    expect([
      query('?from=2026-11-05&to=2026-11-01').input('overview'),
      query('?page=/admin/').input('events', ['page']),
      query('?scope=origin').input('crux', ['scope'], { period: false }),
      query('?metric=LCP').value('metric'),
      query('').value('metric'),
    ]).toStrictEqual([
      { ok: false, reason: 'to: to comes before from' },
      {
        ok: false,
        reason:
          'page: Invalid option: expected one of "/"|"/en/"|"/privacidade/"|"/cookies/"|"/termos/"|"/en/privacy/"|"/en/cookies/"|"/en/terms/"',
      },
      { ok: true, input: { scope: 'origin' } },
      'LCP',
      '',
    ]);
  });
});
