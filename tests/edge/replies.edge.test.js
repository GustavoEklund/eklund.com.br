import { describe, it, expect } from 'vitest';
import { Replies } from '../../edge/src/replies.js';

const ORIGIN = 'https://eklund.com.br';
const described = async (response) => ({
  status: response.status,
  headers: Object.fromEntries(response.headers),
  body: await response.text(),
});

describe('Replies', () => {
  it('accepts with no content, readable by the origin that sent the report', async () => {
    expect(await described(Replies.accepted(ORIGIN))).toStrictEqual({
      status: 204,
      headers: {
        'access-control-allow-origin': ORIGIN,
        'cache-control': 'no-store',
        vary: 'Origin',
        'x-content-type-options': 'nosniff',
      },
      body: '',
    });
  });

  it('refuses a report with its reason, as plain text', async () => {
    expect(
      await described(Replies.refused(ORIGIN, 'page is not one of the allowed values')),
    ).toStrictEqual({
      status: 400,
      headers: {
        'access-control-allow-origin': ORIGIN,
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        vary: 'Origin',
        'x-content-type-options': 'nosniff',
      },
      body: 'page is not one of the allowed values\n',
    });
  });

  it('gives an origin it does not know no CORS header at all', async () => {
    expect(await described(Replies.forbidden())).toStrictEqual({
      status: 403,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
      body: 'This origin may not send reports here.\n',
    });
  });

  it('answers a preflight with what the collector allows, for a day', async () => {
    expect(await described(Replies.preflight(ORIGIN))).toStrictEqual({
      status: 204,
      headers: {
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST',
        'access-control-allow-origin': ORIGIN,
        'access-control-max-age': '86400',
        'cache-control': 'no-store',
        vary: 'Origin',
        'x-content-type-options': 'nosniff',
      },
      body: '',
    });
  });

  it('says which methods a path takes, and that it is too large or not there', async () => {
    expect([
      await described(Replies.methodNotAllowed('GET, HEAD')),
      await described(Replies.tooLarge(ORIGIN)),
      await described(Replies.notFound()),
    ]).toStrictEqual([
      {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        },
        body: 'Method not allowed\n',
      },
      {
        status: 413,
        headers: {
          'access-control-allow-origin': ORIGIN,
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          vary: 'Origin',
          'x-content-type-options': 'nosniff',
        },
        body: 'the report is too long\n',
      },
      {
        status: 404,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        },
        body: 'Not found\n',
      },
    ]);
  });
});
