import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EdgeWorker } from '../support/edge-worker.js';
import { PageReports } from '../support/page-reports.js';

const answer = async (response) => [
  response.status,
  response.headers.get('allow'),
  response.headers.get('access-control-allow-origin'),
  await response.text(),
];

describe('Router, through the whole Worker in workerd', () => {
  const worker = new EdgeWorker();

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(() => worker.reset());

  it('says what it is, in both languages, to anyone who opens its address, and keeps crawlers out', async () => {
    const about = await worker.fetch('/');
    expect([
      about.status,
      about.headers.get('content-type'),
      (await about.text()).split('\n'),
      await answer(await worker.fetch('/robots.txt')),
      (await worker.fetch('/', { method: 'HEAD' })).status,
    ]).toStrictEqual([
      200,
      'text/plain; charset=utf-8',
      [
        'Este é o coletor de eklund.com.br. Ele recebe medições anônimas do site (como ele carrega, o que quebra e que partes são usadas), não guarda endereço IP nem nada que ligue uma visita a outra, e o código dele é público:',
        'This is the collector of eklund.com.br. It receives anonymous measurements of the site (how it loads, what breaks and which parts are used), stores no IP address and nothing that links one visit to another, and its code is public:',
        'https://github.com/GustavoEklund/eklund.com.br/tree/main/edge',
        '',
      ],
      [200, null, null, 'User-agent: *\nDisallow: /\n'],
      200,
    ]);
  });

  it('stores a report sent to /v1/page by the site, with the origins of its configuration', async () => {
    const response = await worker.send(PageReports.complete());
    expect([
      response.status,
      response.headers.get('access-control-allow-origin'),
      await worker.rows('SELECT id, host, country FROM page_view'),
    ]).toStrictEqual([
      204,
      EdgeWorker.ORIGIN,
      [{ id: PageReports.VIEW, host: 'eklund.com.br', country: 'BR' }],
    ]);
  });

  it('answers a preflight only for the site, and names the methods of each path', async () => {
    const preflight = (origin) =>
      worker.fetch('/v1/page', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
    expect([
      await answer(await preflight(EdgeWorker.MIRROR)),
      await answer(await preflight('https://evil.example')),
      await answer(await worker.fetch('/v1/page')),
      await answer(await worker.fetch('/', { method: 'POST', body: '{}' })),
      await answer(await worker.fetch('/v1/visits')),
    ]).toStrictEqual([
      [204, null, EdgeWorker.MIRROR, ''],
      [403, null, null, 'This origin may not send reports here.\n'],
      [405, 'POST, OPTIONS', null, 'Method not allowed\n'],
      [405, 'GET, HEAD', null, 'Method not allowed\n'],
      [404, null, null, 'Not found\n'],
    ]);
  });
});
