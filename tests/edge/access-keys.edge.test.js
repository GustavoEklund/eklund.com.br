import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AccessKeys } from '../../edge/panel/access-keys.js';
import { FakeAccess } from '../support/fake-access.js';

describe('AccessKeys', () => {
  const access = new FakeAccess();
  let now;
  const clock = { now: () => now };
  const keys = (cache = new Map(), fetch = globalThis.fetch) =>
    new AccessKeys({ url: access.certificates, fetch, clock, cache });

  beforeAll(() => access.start());
  afterAll(() => access.stop());

  it("imports the team's RS256 key by its id, and reads the set again only after an hour", async () => {
    now = 1_000_000;
    const cache = new Map();
    const before = access.requests;
    const first = await keys(cache).find(FakeAccess.KID);
    now += AccessKeys.TTL_MS - 1;
    const second = await keys(cache).find(FakeAccess.KID);
    const cached = access.requests - before;
    now += 1;
    await keys(cache).find(FakeAccess.KID);
    expect([
      first.type,
      first.algorithm.name,
      first.usages,
      second === first,
      cached,
      access.requests - before,
    ]).toStrictEqual(['public', 'RSASSA-PKCS1-v1_5', ['verify'], true, 1, 2]);
  });

  it('finds no key for an id the set lacks, and reads the set again for one at most once a minute', async () => {
    now = 5_000_000;
    const cache = new Map();
    const before = access.requests;
    await keys(cache).find(FakeAccess.KID);
    const unknown = await keys(cache).find('a-rotated-key');
    now += AccessKeys.RETRY_MS;
    const again = await keys(cache).find('a-rotated-key');
    expect([unknown, again, access.requests - before]).toStrictEqual([null, null, 2]);
  });

  it('finds no key when the set cannot be read, is not JSON, or holds no usable key, and keeps only a set it read', async () => {
    now = 9_000_000;
    const cache = new Map();
    const answer =
      (body, status = 200) =>
      async () =>
        new Response(body, { status });
    const found = await Promise.all([
      keys(cache, answer('{}', 500)).find(FakeAccess.KID),
      keys(cache, answer('not json')).find(FakeAccess.KID),
      keys(cache, answer('{"keys":"no"}')).find(FakeAccess.KID),
      keys(
        cache,
        answer(
          JSON.stringify({
            keys: [
              { kid: FakeAccess.KID, kty: 'EC', crv: 'P-256', x: 'a', y: 'b' },
              { kid: FakeAccess.KID, kty: 'RSA', alg: 'RS512', n: 'a', e: 'AQAB' },
              { kid: FakeAccess.KID, kty: 'RSA', use: 'enc', n: 'a', e: 'AQAB' },
            ],
          }),
        ),
      ).find(FakeAccess.KID),
      keys(cache, async () => {
        throw new TypeError('fetch failed');
      }).find(FakeAccess.KID),
    ]);
    expect([found, cache.size]).toStrictEqual([[null, null, null, null, null], 1]);
  });
});
