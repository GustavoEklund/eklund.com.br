import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PanelRouter } from '../../edge/panel/panel-router.js';
import { RecordingStore } from '../../edge/src/recording-store.js';
import { FakeAccess } from '../support/fake-access.js';
import { FakeReadings } from '../support/fake-readings.js';
import { PanelDocument } from '../support/panel-document.js';
import { PanelSeed } from '../support/panel-seed.js';
import { PanelWorker } from '../support/panel-worker.js';
import { SessionChunks } from '../support/session-chunks.js';

const ORIGIN = PanelWorker.ORIGIN;
const VENDOR = new URL('../../edge/panel/vendor/', import.meta.url);

describe('PanelRouter', () => {
  const router = (allowed = true) => {
    const checked = [];
    const queries = new FakeReadings({
      certificates: () => ({ day: null, certificates: [], sample: FakeReadings.sample(0, 1) }),
    });
    return {
      checked,
      queries,
      router: new PanelRouter({
        access: {
          verify: async (request) => {
            checked.push(new URL(request.url).pathname);
            return allowed
              ? { ok: true, email: 'owner@example.com' }
              : { ok: false, reason: 'no token' };
          },
        },
        queries,
        bucket: { get: async () => null },
        assets: { 'panel.css': { type: 'text/css; charset=utf-8', body: 'main {}' } },
        clock: { now: () => Date.parse('2026-11-09T15:00:00Z') },
      }),
    };
  };
  const handle = async (target, path, init) => {
    const response = await target.handle(new Request(`${ORIGIN}${path}`, init));
    return [response.status, response.headers.get('content-type'), await response.text()];
  };

  it('checks the token of every request first, assets and robots.txt included, and reads nothing for a refused one', async () => {
    const { router: refused, checked, queries } = router(false);
    const answers = await Promise.all(
      ['/', '/assets/panel.css', '/robots.txt', '/recordings/x/000', '/nope'].map((path) =>
        handle(refused, path),
      ),
    );
    expect([answers, checked, queries.calls]).toStrictEqual([
      Array(5).fill([403, 'text/plain; charset=utf-8', 'This panel is only for its owner.\n']),
      ['/', '/assets/panel.css', '/robots.txt', '/recordings/x/000', '/nope'],
      [],
    ]);
  });

  it('serves its assets and robots.txt, answers 404 to anything else, and only reads', async () => {
    const { router: open } = router();
    const [missing, unknown, post, css, robots] = await Promise.all([
      handle(open, '/assets/nope.js'),
      handle(open, '/admin'),
      handle(open, '/', { method: 'POST' }),
      handle(open, '/assets/panel.css'),
      handle(open, '/robots.txt'),
    ]);
    expect([
      missing,
      unknown[0],
      PanelDocument.texts(PanelDocument.parse(unknown[2]), 'main p'),
      post,
      css,
      robots,
    ]).toStrictEqual([
      [404, 'text/plain; charset=utf-8', 'Not found\n'],
      404,
      ['Nothing is here.'],
      [405, 'text/plain; charset=utf-8', 'Method not allowed\n'],
      [200, 'text/css; charset=utf-8', 'main {}'],
      [200, 'text/plain; charset=utf-8', 'User-agent: *\nDisallow: /\n'],
    ]);
  });
});

describe('the panel through the whole Worker in workerd, with tokens of a fake Access team', () => {
  const access = new FakeAccess();
  let worker;
  let token;

  /** How many rows each table holds, and every key of the bucket: what must not change while the panel reads. */
  const storage = async () => {
    const database = await worker.database();
    const { results: tables } = await database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'd1_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    const counts = await Promise.all(
      tables.map(async ({ name }) => [
        name,
        (await database.prepare(`SELECT count(*) AS rows FROM ${name}`).first()).rows,
      ]),
    );
    const listed = await (await worker.reports()).list();
    return { counts, keys: listed.objects.map(({ key }) => key) };
  };

  beforeAll(async () => {
    await access.start();
    worker = new PanelWorker(access.vars);
    await worker.start();
    await worker.reset();
    await new PanelSeed({ db: await worker.database(), bucket: await worker.reports() }).run();
    token = await access.token();
  }, PanelWorker.START_TIMEOUT_MS);
  afterAll(async () => {
    await worker.stop();
    await access.stop();
  });

  it('answers 403 to a request without a valid token: missing, forged, expired, for another application or another email', async () => {
    const claims = FakeAccess.claims();
    const tokens = [
      null,
      await access.token(claims, { forged: true }),
      await access.token({ ...claims, exp: Math.floor(Date.now() / 1_000) - 1 }),
      await access.token({ ...claims, aud: ['another-application'] }),
      await access.token({ ...claims, iss: 'https://another-team.cloudflareaccess.com' }),
      await access.token({ ...claims, email: 'stranger@example.com' }),
    ];
    const answers = await Promise.all(
      tokens.map(async (forged) => {
        const response = await worker.fetch('/', { token: forged });
        return [response.status, response.headers.get('x-robots-tag'), await response.text()];
      }),
    );
    expect(answers).toStrictEqual(
      Array(6).fill([403, 'noindex, nofollow', 'This panel is only for its owner.\n']),
    );
  });

  it(
    'answers 403 to every request while ACCESS_AUD and ALLOWED_EMAILS are not set, as on the first deploy',
    async () => {
      const bare = new PanelWorker({
        ACCESS_TEAM_DOMAIN: FakeAccess.TEAM,
        ACCESS_CERTIFICATES: access.certificates,
      });
      await bare.start();
      try {
        const answers = await Promise.all(
          ['/', '/assets/panel.css', `/recordings/${PanelSeed.RECORDING}/000`].map(
            async (path) => (await bare.fetch(path, { token })).status,
          ),
        );
        expect(answers).toStrictEqual([403, 403, 403]);
      } finally {
        await bare.stop();
      }
    },
    PanelWorker.START_TIMEOUT_MS,
  );

  it('renders every page from the seeded D1 and R2, with its headers, and writes nothing', async () => {
    const before = await storage();
    const period = '?from=2026-10-13&to=2026-11-09';
    const pages = await Promise.all(
      [
        '/',
        '/vitals',
        '/events',
        '/lab',
        '/recordings',
        '/heat-map',
        `/recordings/${PanelSeed.RECORDING}`,
      ].map(async (path) => {
        const response = await worker.fetch(
          `${path}${path.startsWith('/recordings/') ? '' : period}`,
          { token },
        );
        return [response, PanelDocument.parse(await response.text())];
      }),
    );
    const [overview, vitals, events, lab, recordings, heatMap, replay] = pages.map(
      ([, page]) => page,
    );
    expect([
      pages.map(([response, page]) => [
        response.status,
        response.headers.get('cache-control'),
        response.headers.get('x-robots-tag'),
        response.headers.get('content-security-policy').split('; ')[3],
        page.querySelector('h1').textContent,
      ]),
      PanelDocument.texts(overview, '.tile strong').slice(1),
      PanelDocument.texts(overview, '.chart title').length,
      PanelDocument.tables(overview)[0][0],
      PanelDocument.texts(vitals, '.verdict'),
      PanelDocument.tables(events)[1].slice(1),
      PanelDocument.tables(lab)[1]
        .slice(1, 2)
        .map((row) => row.slice(0, 4)),
      // The days left count from the Worker's own clock, so only the hosts and issuers are fixed.
      PanelDocument.tables(lab)[6]
        .slice(1)
        .map((row) => row.slice(0, 2)),
      PanelDocument.tables(recordings)[0]
        .slice(1)
        .map((row) => [row[0], row[1], row[2], row[5], row[7]]),
      PanelDocument.texts(heatMap, 'figcaption'),
      replay.querySelector('.replay').dataset.chunks,
      await storage(),
    ]).toStrictEqual([
      [
        ...Array(6).fill([200, 'no-store', 'noindex, nofollow', "img-src 'self' data:"]),
        [
          200,
          'no-store',
          'noindex, nofollow',
          "img-src 'self' data: https://eklund.com.br https://gustavo.eklund.com.br",
        ],
      ].map((answer, index) => [
        ...answer,
        [
          'Overview',
          'Web Vitals',
          'Events and errors',
          'Lab',
          'Recordings',
          'Heat map',
          'Recording 3f2b8c1e',
        ][index],
      ]),
      ['28', '1.2.0'],
      28,
      ['p75 of real visits', '1.1.0', '1.2.0'],
      [
        'Verdict: after is better. Mann-Whitney U, p < 0.001, over the latest loads of each release on every page.',
      ],
      [
        [
          'error',
          '/js/globe/globe.js',
          "TypeError: Cannot read properties of null (reading 'width')",
          '6',
        ],
      ],
      [['/', 'mobile', '28', 'the level shifted once']],
      [
        ['eklund.com.br', "Let's Encrypt R11"],
        ['gustavo.eklund.com.br', "Let's Encrypt R11"],
      ],
      [
        ['7c9e6679', '/en/', 'en-US', '0:00', '1'],
        ['3f2b8c1e', '/', 'pt-BR', '0:10', '3'],
      ],
      [
        'contato at 360-413 px: 1 click',
        'hero at 1280-1535 px: 1 click',
        'status at 1280-1535 px: 2 clicks',
      ],
      `/recordings/${PanelSeed.RECORDING}/000 /recordings/${PanelSeed.RECORDING}/001`,
      before,
    ]);
  });

  it('streams a seeded chunk of a recording as the gzip R2 keeps, and 404 for one that is not there', async () => {
    const chunk = await worker.fetch(`/recordings/${PanelSeed.RECORDING}/001`, { token });
    const bytes = new Uint8Array(await chunk.arrayBuffer());
    const stored = await (
      await worker.reports()
    ).get(RecordingStore.key(PanelSeed.TODAY, PanelSeed.RECORDING, 1));
    const missing = await worker.fetch(`/recordings/${PanelSeed.RECORDING}/002`, { token });
    expect([
      chunk.status,
      chunk.headers.get('content-type'),
      Buffer.from(bytes).equals(Buffer.from(await stored.arrayBuffer())),
      JSON.parse(await SessionChunks.inflate(bytes)),
      missing.status,
    ]).toStrictEqual([
      200,
      'application/gzip',
      true,
      PanelSeed.chunk(PanelSeed.RECORDING, 1, Date.parse(`${PanelSeed.TODAY}T14:00:00Z`), [
        ['status', '1280-1535', 0.25, 0.5],
        ['status', '1280-1535', 0.27, 0.52],
        ['hero', '1280-1535', 0.5, 0.8],
      ]),
      404,
    ]);
  });

  it("serves the replay page's script and rrweb's replayer as the files in the repository, as JavaScript", async () => {
    const served = await Promise.all(
      [
        'replay-start.js',
        'replay-player.js',
        'rrweb-replay.js',
        'rrweb-replay.css',
        'panel.css',
      ].map(async (name) => {
        const response = await worker.fetch(`/assets/${name}`, { token });
        return [response.headers.get('content-type'), await response.text()];
      }),
    );
    const read = (path) => readFileSync(new URL(path, VENDOR), 'utf8');
    expect(served).toStrictEqual([
      ['text/javascript; charset=utf-8', read('../browser/replay-start.js')],
      ['text/javascript; charset=utf-8', read('../browser/replay-player.js')],
      ['text/javascript; charset=utf-8', read('rrweb-replay.js')],
      ['text/css; charset=utf-8', read('rrweb-replay.css')],
      ['text/css; charset=utf-8', read('../browser/panel.css')],
    ]);
  });
});
