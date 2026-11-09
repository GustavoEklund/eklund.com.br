import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import { UptimeMonitor } from '../../edge/src/uptime-monitor.js';
import { EdgeWorker } from '../support/edge-worker.js';

const HOME = 'https://eklund.com.br/';
const ENGLISH = 'https://eklund.com.br/en/';
const MIRROR = 'https://gustavo.eklund.com.br/';
const TARGETS = [HOME, ENGLISH, MIRROR];
/** 00:05 in Taubaté on 29 October 2026. */
const START = Date.parse('2026-10-29T03:05:00Z');
const SAFE = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; script-src 'self'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};
const page = (html = '<!doctype html><html lang="pt-BR">', headers = SAFE, status = 200) =>
  new Response(html, { status, headers });

describe('UptimeMonitor.run, against D1 in workerd', () => {
  const worker = new EdgeWorker();
  let database;
  let answers;
  let opened;
  let closed;
  let now;

  /** Answers each target with what `answers` holds for it: a Response, or an error to throw. */
  const monitor = (enabled = true) =>
    new UptimeMonitor({
      db: database,
      fetch: async (target) => {
        const answer = answers[target] ?? page();
        if (answer instanceof Error) throw answer;
        return answer.clone();
      },
      issues: {
        enabled,
        open: async (incident) => {
          opened.push(incident);
          return 41 + opened.length;
        },
        close: async (incident) => {
          closed.push(incident);
        },
      },
      clock: { now: () => now },
    });
  const checks = () =>
    worker.rows(
      'SELECT checked_at, day, target, status, duration_ms, problem FROM uptime_check ORDER BY checked_at, target',
    );
  const states = () =>
    worker.rows('SELECT target, failures, failing_since, issue FROM uptime_target ORDER BY target');
  const stateOf = async (target) => (await states()).find((state) => state.target === target);

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(async () => {
    await worker.reset();
    database = await worker.database();
    [answers, opened, closed, now] = [{}, [], [], START];
  });

  it('stores one check per page and tells no one while every page is up', async () => {
    await monitor().run(TARGETS);
    expect([await checks(), await states(), opened, closed]).toStrictEqual([
      [
        {
          checked_at: START,
          day: '2026-10-29',
          target: HOME,
          status: 200,
          duration_ms: 0,
          problem: null,
        },
        {
          checked_at: START,
          day: '2026-10-29',
          target: ENGLISH,
          status: 200,
          duration_ms: 0,
          problem: null,
        },
        {
          checked_at: START,
          day: '2026-10-29',
          target: MIRROR,
          status: 200,
          duration_ms: 0,
          problem: null,
        },
      ],
      [
        { target: HOME, failures: 0, failing_since: null, issue: null },
        { target: ENGLISH, failures: 0, failing_since: null, issue: null },
        { target: MIRROR, failures: 0, failing_since: null, issue: null },
      ],
      [],
      [],
    ]);
  });

  it('also checks the folder of the release that the home page says it was built from', async () => {
    answers[HOME] = page('<!doctype html><html lang="pt-BR" data-version="1.2.0" class="js">');
    await monitor().run(TARGETS);
    expect((await checks()).map(({ target }) => target)).toStrictEqual([
      HOME,
      'https://eklund.com.br/1.2.0/',
      ENGLISH,
      MIRROR,
    ]);
  });

  it('names what is wrong: a status, an answer that is not HTML, a missing header, no answer, no connection', async () => {
    const plain = { ...SAFE, 'content-type': 'text/plain' };
    const noPolicy = { ...SAFE, 'content-security-policy': '' };
    const noTransport = {
      'content-type': SAFE['content-type'],
      'content-security-policy': SAFE['content-security-policy'],
    };
    const targets = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => `https://${name}.example/`);
    [
      page('', SAFE, 503),
      page('<p>', plain),
      page('<html>', noPolicy),
      page('<html>', noTransport),
      new DOMException('The operation timed out', 'TimeoutError'),
      new TypeError('fetch failed'),
    ].forEach((answer, index) => (answers[targets[index]] = answer));
    await monitor().run(targets);
    expect((await checks()).map(({ status, problem }) => [status, problem])).toStrictEqual([
      [503, 'status 503'],
      [200, 'the answer is not HTML'],
      [200, 'no Content-Security-Policy'],
      [200, 'no Strict-Transport-Security'],
      [null, 'no answer in 15 s'],
      [null, 'the connection failed'],
    ]);
  });

  it('opens one issue at the second failure in a row, and closes it when the page is back', async () => {
    answers[ENGLISH] = page('', SAFE, 503);
    await monitor().run(TARGETS);
    const afterFirst = [...opened];
    now = START + 300_000;
    await monitor().run(TARGETS);
    now = START + 600_000;
    await monitor().run(TARGETS);
    const whileDown = await stateOf(ENGLISH);
    delete answers[ENGLISH];
    now = START + 900_000;
    await monitor().run(TARGETS);
    expect([afterFirst, opened, whileDown, closed, await stateOf(ENGLISH)]).toStrictEqual([
      [],
      [{ target: ENGLISH, problem: 'status 503', since: START }],
      { target: ENGLISH, failures: 3, failing_since: START, issue: 42 },
      [{ issue: 42, target: ENGLISH, since: START, until: START + 900_000 }],
      { target: ENGLISH, failures: 0, failing_since: null, issue: null },
    ]);
  });

  it('only stores and counts when there is nowhere to send an issue', async () => {
    answers[MIRROR] = new TypeError('fetch failed');
    await monitor(false).run(TARGETS);
    now = START + 300_000;
    await monitor(false).run(TARGETS);
    expect([opened, await stateOf(MIRROR)]).toStrictEqual([
      [],
      { target: MIRROR, failures: 2, failing_since: START, issue: null },
    ]);
  });
});

describe('the five-minute Cron Trigger, through the whole Worker in workerd', () => {
  let site;
  let worker;
  let requests;

  beforeAll(async () => {
    requests = [];
    site = createServer((request, response) => {
      requests.push([request.url, request.headers['user-agent']]);
      response.writeHead(200, SAFE).end('<!doctype html><html lang="pt-BR">');
    });
    await new Promise((done) => site.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${site.address().port}`;
    worker = new EdgeWorker({ UPTIME_TARGETS: `${origin}/ ${origin}/en/` });
    await worker.start();
  }, EdgeWorker.START_TIMEOUT_MS);
  afterAll(async () => {
    await worker.stop();
    await new Promise((done) => site.close(done));
  });
  beforeEach(() => worker.reset());

  it('checks the pages of UPTIME_TARGETS and stores what it found, without an operations token', async () => {
    const outcome = await worker.scheduled(new Date(START), '*/5 * * * *');
    expect([
      outcome,
      requests.sort(),
      await worker.rows('SELECT status, problem FROM uptime_check ORDER BY target'),
    ]).toStrictEqual([
      { outcome: 'ok', noRetry: false },
      [
        ['/', 'eklund-uptime (+https://github.com/GustavoEklund/eklund.com.br)'],
        ['/en/', 'eklund-uptime (+https://github.com/GustavoEklund/eklund.com.br)'],
      ],
      [
        { status: 200, problem: null },
        { status: 200, problem: null },
      ],
    ]);
  });
});
