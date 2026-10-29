import { describe, it, expect, beforeEach } from 'vitest';
import { Collector } from '../../edge/src/collector.js';
import { PageReport } from '../../edge/src/page-report.js';
import { PageReports } from '../support/page-reports.js';

const ORIGIN = 'https://eklund.com.br';
const PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
/** 23:30 in Taubaté on 28 October, which is already the 29th in UTC. */
const NOW = Date.parse('2026-10-29T02:30:00Z');

/** A request as the Worker gets it, with Cloudflare's `cf` object, or without one when `cf` is null. */
const requestOf = ({ body, headers = {}, cf = { country: 'BR' } }) =>
  Object.assign(
    new Request('https://eklund.example.workers.dev/v1/page', {
      method: 'POST',
      body,
      headers: {
        origin: ORIGIN,
        'content-type': 'text/plain;charset=UTF-8',
        'user-agent': PHONE,
        ...headers,
      },
    }),
    cf === null ? {} : { cf },
  );

describe('Collector.take', () => {
  let saved;
  let collector;

  beforeEach(() => {
    saved = [];
    collector = new Collector({
      origins: [ORIGIN, 'https://gustavo.eklund.com.br'],
      store: { save: async (report, context) => saved.push([report, context]) },
      clock: { now: () => NOW },
    });
  });

  it('stores a valid report with the day, the host, the country and the browser, and answers 204', async () => {
    const response = await collector.take(
      requestOf({ body: JSON.stringify(PageReports.complete()) }),
    );
    expect([response.status, saved]).toStrictEqual([
      204,
      [
        [
          PageReport.parse(JSON.stringify(PageReports.complete())).report,
          {
            receivedAt: NOW,
            day: '2026-10-29',
            host: 'eklund.com.br',
            country: 'BR',
            agent: { robot: false, device: 'phone', browser: 'chrome', version: 130 },
          },
        ],
      ],
    ]);
  });

  it('files a report from the mirror under its own host', async () => {
    await collector.take(
      requestOf({
        body: JSON.stringify(PageReports.complete()),
        headers: { origin: 'https://gustavo.eklund.com.br' },
      }),
    );
    expect(saved.map(([, context]) => context.host)).toStrictEqual(['gustavo.eklund.com.br']);
  });

  it('keeps no country for an unknown place, Tor or a missing cf object', async () => {
    for (const cf of [{ country: 'XX' }, { country: 'T1' }, null])
      await collector.take(requestOf({ body: JSON.stringify(PageReports.complete()), cf }));
    expect(saved.map(([, context]) => context.country)).toStrictEqual([null, null, null]);
  });

  it('refuses another origin, and a request without one, before reading the body', async () => {
    const responses = [
      await collector.take(
        requestOf({ body: 'not read', headers: { origin: 'https://evil.example' } }),
      ),
      await collector.take(
        Object.assign(
          new Request('https://eklund.example.workers.dev/v1/page', {
            method: 'POST',
            body: 'not read',
          }),
          { cf: {} },
        ),
      ),
    ];
    expect([responses.map((response) => response.status), saved]).toStrictEqual([[403, 403], []]);
  });

  it('answers 204 and stores nothing for Global Privacy Control or a robot', async () => {
    const body = JSON.stringify(PageReports.complete());
    const statuses = [
      (await collector.take(requestOf({ body, headers: { 'sec-gpc': '1' } }))).status,
      (await collector.take(requestOf({ body, headers: { 'user-agent': 'Googlebot/2.1' } })))
        .status,
      (await collector.take(requestOf({ body, headers: { 'user-agent': '' } }))).status,
    ];
    expect([statuses, saved]).toStrictEqual([[204, 204, 204], []]);
  });

  it('refuses a body announced as too long, and an invalid report with its reason', async () => {
    const tooLong = await collector.take(
      requestOf({ body: '{}', headers: { 'content-length': '16385' } }),
    );
    const invalid = await collector.take(
      requestOf({ body: JSON.stringify(PageReports.with((report) => (report.page = '/x/'))) }),
    );
    expect([
      [tooLong.status, await tooLong.text()],
      [invalid.status, await invalid.text()],
      saved,
    ]).toStrictEqual([
      [413, 'the report is too long\n'],
      [400, 'page is not one of the allowed values\n'],
      [],
    ]);
  });
});
