import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { SendLimit } from '../../edge/src/send-limit.js';
import { EdgeWorker } from '../support/edge-worker.js';
import { PageReports } from '../support/page-reports.js';

/** The SHA-256 of 203.0.113.7, an address kept for documentation, cut to its first 32 hexadecimal digits, made by Node. */
const ADDRESS_HASH = createHash('sha256').update('203.0.113.7').digest('hex').slice(0, 32);
/** The binding's window follows the wall clock, so a run too close to the next minute is split in two. */
const MINUTE_MS = 60_000;
const MARGIN_MS = 15_000;
const withinOneWindow = async () => {
  const left = MINUTE_MS - (Date.now() % MINUTE_MS);
  if (left < MARGIN_MS) await new Promise((resolve) => setTimeout(resolve, left + 100));
};
const requestFrom = (address) =>
  new Request('https://eklund.example.workers.dev/v1/page', {
    method: 'POST',
    headers: address ? { 'cf-connecting-ip': address } : {},
  });

describe('SendLimit.allows', () => {
  let keys;
  let success;
  const limiter = {
    limit: async ({ key }) => {
      keys.push(key);
      return { success };
    },
  };

  beforeEach(() => {
    keys = [];
    success = true;
  });

  it('asks the binding with a hash of the address, never the address itself', async () => {
    const allowed = await new SendLimit(limiter).allows(requestFrom('203.0.113.7'));
    success = false;
    const refused = await new SendLimit(limiter).allows(requestFrom('203.0.113.7'));
    expect([allowed, refused, keys]).toStrictEqual([true, false, [ADDRESS_HASH, ADDRESS_HASH]]);
  });

  it('limits nothing without the binding or without an address', async () => {
    expect([
      await new SendLimit(undefined).allows(requestFrom('203.0.113.7')),
      await new SendLimit(limiter).allows(requestFrom(null)),
      keys,
    ]).toStrictEqual([true, true, []]);
  });

  it('keys an address with the first 32 digits of its SHA-256', async () => {
    expect(await SendLimit.key('203.0.113.7')).toBe(ADDRESS_HASH);
  });
});

describe('the limit of a client, through the whole Worker in workerd', () => {
  const worker = new EdgeWorker();

  beforeAll(() => worker.start(), EdgeWorker.START_TIMEOUT_MS);
  afterAll(() => worker.stop());
  beforeEach(() => worker.reset());

  it(
    'takes 60 reports a minute from one address, refuses the next with 429, and still takes another address',
    async () => {
      await withinOneWindow();
      const statuses = [];
      for (let sent = 0; sent < 61; sent += 1)
        statuses.push(
          (await worker.send(PageReports.complete(), { 'cf-connecting-ip': '203.0.113.7' })).status,
        );
      const other = await worker.send(PageReports.complete(), {
        'cf-connecting-ip': '203.0.113.8',
      });
      expect([
        statuses.filter((status) => status === 204).length,
        statuses.at(-1),
        other.status,
      ]).toStrictEqual([60, 429, 204]);
    },
    MARGIN_MS + 30_000,
  );
});
