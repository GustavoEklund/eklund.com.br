import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AccessCheck } from '../../edge/panel/access-check.js';
import { FakeAccess } from '../support/fake-access.js';

const NOW = Date.parse('2026-11-09T15:00:00Z');
const SECONDS = NOW / 1_000;

describe('AccessCheck', () => {
  const access = new FakeAccess();
  let lookups;
  const keys = {
    find: async (kid) => {
      lookups.push(kid);
      return kid === FakeAccess.KID ? access.publicKey : null;
    },
  };
  const check = (settings = {}) =>
    new AccessCheck({
      teamDomain: FakeAccess.TEAM,
      audience: FakeAccess.AUDIENCE,
      allowedEmails: ['someone@example.com', FakeAccess.EMAIL],
      keys,
      clock: { now: () => NOW },
      ...settings,
    });
  const request = (token) =>
    new Request('https://eklund-panel.example.workers.dev/', {
      headers: token === null ? {} : { 'cf-access-jwt-assertion': token },
    });
  const claims = (changes) => ({ ...FakeAccess.claims(NOW), ...changes });
  const verify = async (token, settings) => check(settings).verify(request(token));

  beforeAll(() => access.start());
  afterAll(() => access.stop());

  it("lets in a token of the team, for the panel's application, not expired, of an email in the list in any case", async () => {
    lookups = [];
    expect([
      await verify(await access.token(claims())),
      await verify(
        await access.token(claims({ email: 'Owner@Example.com', aud: FakeAccess.AUDIENCE })),
      ),
      await verify(await access.token(claims({ nbf: SECONDS + 30, exp: SECONDS + 1 }))),
      lookups,
    ]).toStrictEqual([
      { ok: true, email: FakeAccess.EMAIL },
      { ok: true, email: FakeAccess.EMAIL },
      { ok: true, email: FakeAccess.EMAIL },
      Array(3).fill(FakeAccess.KID),
    ]);
  });

  it('refuses a token for another application, from another issuer, expired, not valid yet, or of an email not in the list', async () => {
    const withoutExpiry = claims();
    delete withoutExpiry.exp;
    expect(
      await Promise.all(
        [
          claims({ aud: ['another-application'] }),
          claims({ aud: 'another-application' }),
          claims({ iss: 'https://someone-else.cloudflareaccess.com' }),
          claims({ exp: SECONDS }),
          claims({ exp: SECONDS - 3_600 }),
          withoutExpiry,
          claims({ nbf: SECONDS + 61 }),
          claims({ email: 'stranger@example.com' }),
          claims({ email: undefined }),
        ].map(async (changed) => (await verify(await access.token(changed))).reason),
      ),
    ).toStrictEqual([
      'another application',
      'another application',
      'another issuer',
      'expired',
      'expired',
      'expired',
      'not valid yet',
      'this email may not read',
      'this email may not read',
    ]);
  });

  it('refuses a missing token, one that is not a JWT, one signed by another key, with another algorithm, or by a key the team lacks', async () => {
    const good = await access.token(claims());
    const [head, body] = good.split('.');
    const reasons = await Promise.all(
      [
        null,
        '',
        'not-a-token',
        'a.b',
        `${head}.${body}.`,
        `${head}.${body}.not base64!`,
        `bm9wZQ.${body}.c2ln`,
        await access.token(claims(), { forged: true }),
        await access.token(claims(), { header: { alg: 'HS256' } }),
        await access.token(claims(), { header: { alg: 'none' } }),
        await access.token(claims(), { header: { kid: 'a-rotated-key' } }),
        await access.token(claims(), { header: { kid: 42 } }),
        `${head}.${Buffer.from(JSON.stringify(claims({ email: 'stranger@example.com' }))).toString('base64url')}.${good.split('.')[2]}`,
      ].map(async (token) => (await verify(token)).reason),
    );
    expect(reasons).toStrictEqual([
      'no token',
      'no token',
      'not a token',
      'not a token',
      'the signature does not match',
      'not a token',
      'not a token',
      'the signature does not match',
      'not signed with RS256',
      'not signed with RS256',
      'no key of the team has that id',
      'not signed with RS256',
      'the signature does not match',
    ]);
  });

  it('refuses everything while the team, the AUD or the list of emails is not set, without reading a key', async () => {
    lookups = [];
    const token = await access.token(claims());
    expect([
      await verify(token, { teamDomain: undefined }),
      await verify(token, { audience: undefined }),
      await verify(token, { allowedEmails: [] }),
      lookups,
    ]).toStrictEqual([
      { ok: false, reason: 'the panel is not set up' },
      { ok: false, reason: 'the panel is not set up' },
      { ok: false, reason: 'the panel is not set up' },
      [],
    ]);
  });

  it('refuses, instead of failing, when finding a key throws', async () => {
    const throwing = { find: async () => Promise.reject(new Error('the network is down')) };
    expect(await verify(await access.token(claims()), { keys: throwing })).toStrictEqual({
      ok: false,
      reason: 'could not verify',
    });
  });

  it("names where a team's certificates are", () => {
    expect(AccessCheck.certificates('eklund-lab.cloudflareaccess.com')).toBe(
      'https://eklund-lab.cloudflareaccess.com/cdn-cgi/access/certs',
    );
  });
});
