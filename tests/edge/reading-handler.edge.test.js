import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ReadingHandler } from '../../edge/src/reading-handler.js';
import { ReadingInputs } from '../../edge/src/reading-inputs.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { FakeGithub } from '../support/fake-github.js';
import { ReadingSession } from '../support/reading-session.js';

const WORKER = EdgeWorker.WORKER;

describe('ReadingHandler', () => {
  let calls;
  const queries = {
    run: async (name, input) => {
      calls.push([name, input]);
      return { reading: name };
    },
  };
  const handle = async (path, props) => {
    const response = await new ReadingHandler({ allowedLogins: ['gustavoeklund'], queries }).handle(
      new Request(`${WORKER}${path}`, {
        headers: { accept: 'application/json, text/event-stream' },
      }),
      props,
    );
    return [response.status, await response.text()];
  };

  beforeEach(() => {
    calls = [];
  });

  it('reads for a login in the list, in any case, and refuses any other token', async () => {
    expect([
      await handle('/api/v1/certificates', { login: 'GustavoEklund' }),
      await handle('/api/v1/certificates', { login: 'octocat' }),
      await handle('/api/v1/certificates', {}),
      await handle('/api/v1/certificates', undefined),
      calls,
    ]).toStrictEqual([
      [200, '{"reading":"certificates"}'],
      [403, 'This account may not read these measurements.\n'],
      [403, 'This account may not read these measurements.\n'],
      [403, 'This account may not read these measurements.\n'],
      [['certificates', {}]],
    ]);
  });

  it('serves MCP at /mcp only, the JSON API under /api/v1, and nothing else', async () => {
    expect([
      (await handle('/mcp', { login: 'gustavoeklund' }))[0],
      await handle('/mcp/tools', { login: 'gustavoeklund' }),
      await handle('/api/v2/certificates', { login: 'gustavoeklund' }),
    ]).toStrictEqual([405, [404, 'Not found\n'], [404, 'Not found\n']]);
  });
});

describe('the readings through the whole Worker in workerd, with a token of a real sign-in', () => {
  const github = new FakeGithub();
  let worker;
  let session;
  let token;

  beforeAll(async () => {
    await github.start();
    worker = new EdgeWorker(github.vars);
    session = new ReadingSession(worker);
    await worker.start();
  }, EdgeWorker.START_TIMEOUT_MS);
  afterAll(async () => {
    await worker.stop();
    await github.stop();
  });
  beforeEach(async () => {
    await worker.reset();
    token = (await session.signIn()).token.access_token;
  });

  it('asks for a token at /mcp and /api/v1, and says where to get one', async () => {
    const answers = await Promise.all(
      ['/mcp', '/api/v1/certificates'].map((path) => worker.fetch(path, { method: 'POST' })),
    );
    const metadata = await (await worker.fetch('/.well-known/oauth-protected-resource')).json();
    expect([
      answers.map((response) => [response.status, response.headers.get('www-authenticate')]),
      metadata,
    ]).toStrictEqual([
      Array(2).fill([
        401,
        `Bearer realm="OAuth", resource_metadata="${WORKER}/.well-known/oauth-protected-resource"`,
      ]),
      {
        resource: ReadingSession.RESOURCE,
        authorization_servers: [WORKER],
        bearer_methods_supported: ['header'],
        resource_name: 'Measurements of eklund.com.br',
      },
    ]);
  });

  it('lists the tools and answers one over MCP, and the same reading as JSON, with one token', async () => {
    await (
      await worker.database()
    )
      .prepare(
        "INSERT INTO certificate VALUES ('2026-11-08', 'eklund.com.br', NULL, '', 'CERT_HAS_EXPIRED')",
      )
      .run();
    const listed = await session.call(token, 1, 'tools/list');
    const called = await session.call(token, 2, 'tools/call', {
      name: 'certificates',
      arguments: {},
    });
    const json = await worker.fetch('/api/v1/certificates', {
      headers: { authorization: `Bearer ${token}` },
    });
    const certificates = {
      day: '2026-11-08',
      certificates: [
        {
          host: 'eklund.com.br',
          issuer: '',
          problem: 'CERT_HAS_EXPIRED',
          valid_to: null,
          days_left: null,
        },
      ],
      sample: { size: 1, minimum: 1, enough: true },
    };
    expect([
      listed.result.tools.map(({ name }) => name),
      called.result.structuredContent,
      json.status,
      await json.json(),
    ]).toStrictEqual([ReadingInputs.NAMES, certificates, 200, certificates]);
  });

  it('refuses a token that is not one, and leaves the public routes open', async () => {
    const forged = await worker.fetch('/api/v1/certificates', {
      headers: { authorization: `Bearer ${token.slice(0, -4)}AAAA` },
    });
    const about = await worker.fetch('/');
    const robots = await worker.fetch('/robots.txt');
    expect([forged.status, about.status, await robots.text()]).toStrictEqual([
      401,
      200,
      'User-agent: *\nDisallow: /\n',
    ]);
  });
});
