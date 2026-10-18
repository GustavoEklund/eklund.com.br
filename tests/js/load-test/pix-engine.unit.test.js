import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PixEngine } from '@site/js/load-test/pix-engine.js';

const { ACCEPTED, INVALID, DUPLICATE, INSUFFICIENT_FUNDS } = PixEngine.OUTCOMES;
const FNV_OFFSET = 2166136261,
  FNV_PRIME = 16777619;
const NO_COUNTS = {
  accepted: 0,
  insufficientFunds: 0,
  duplicates: 0,
  invalid: 0,
  negativeBalances: 0,
};

/** Independent FNV-1a, so the chain is checked against the algorithm and not against itself. */
const fnv1a = (text, hash = FNV_OFFSET) => {
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
};
const message = (overrides = {}) =>
  JSON.stringify({ endToEndId: 'E1', from: 1, to: 2, amount: 100, timestamp: 0, ...overrides });

describe('PixEngine setup', () => {
  it('opens 10,000 accounts with R$ 1,000,000 each, except 40 empty ones at multiples of 251', () => {
    const engine = new PixEngine();
    const empty = Array.from({ length: 40 }, (_, index) => index * 251);
    expect(PixEngine.ACCOUNT_COUNT).toBe(10000);
    expect(engine.balances).toHaveLength(10000);
    expect(
      engine.balances.reduce(
        (accounts, balance, index) => (balance === 0 ? [...accounts, index] : accounts),
        [],
      ),
    ).toStrictEqual(empty);
    expect(engine.balances.filter((balance) => balance === 1e6)).toHaveLength(9960);
    expect(engine.initialTotal).toBe(9960 * 1e6);
  });

  it('starts with an empty journal, zero counters and the FNV offset', () => {
    const engine = new PixEngine();
    expect([
      engine.journalEntries,
      engine.chain,
      engine.lastEndToEndId,
      engine.seen.size,
    ]).toStrictEqual([0, FNV_OFFSET, 'E0', 0]);
    expect(engine.counters).toStrictEqual(NO_COUNTS);
  });

  it('batches 1000 payments', () => expect(PixEngine.BATCH_SIZE).toBe(1000));

  it('names its four outcomes and freezes them', () => {
    expect(PixEngine.OUTCOMES).toStrictEqual({
      ACCEPTED: 'accepted',
      INVALID: 'invalid',
      DUPLICATE: 'duplicate',
      INSUFFICIENT_FUNDS: 'insufficientFunds',
    });
    expect(Object.isFrozen(PixEngine.OUTCOMES)).toBe(true);
  });
});

describe('PixEngine.handle: an accepted payment', () => {
  let engine;
  beforeEach(() => {
    engine = new PixEngine();
  });

  it('moves the money between the two accounts', () => {
    expect(engine.handle(message({ amount: 250.5 }))).toBe(ACCEPTED);
    expect([engine.balances[1], engine.balances[2]]).toStrictEqual([1e6 - 250.5, 1e6 + 250.5]);
  });

  it('touches no other account', () => {
    const before = Float64Array.from(engine.balances);
    engine.handle(message({ amount: 250.5 }));
    expect(
      engine.balances.reduce(
        (changed, balance, index) => (balance === before[index] ? changed : [...changed, index]),
        [],
      ),
    ).toStrictEqual([1, 2]);
  });

  it('counts it, journals it and remembers its EndToEndId', () => {
    engine.handle(message());
    expect(engine.counters).toStrictEqual({ ...NO_COUNTS, accepted: 1 });
    expect([engine.journalEntries, engine.lastEndToEndId, [...engine.seen]]).toStrictEqual([
      1,
      'E1',
      ['E1'],
    ]);
  });

  it('extends the hash chain with the message text (FNV-1a)', () => {
    const first = message(),
      second = message({ endToEndId: 'E2', amount: 5 });
    engine.handle(first);
    expect(engine.chain).toBe(fnv1a(first));
    expect(engine.chain).toBe(1856164552);
    engine.handle(second);
    expect(engine.chain).toBe(fnv1a(second, fnv1a(first)));
  });

  it('settles a payment for the whole balance and leaves the account at exactly zero', () => {
    expect(engine.handle(message({ amount: 1e6 }))).toBe(ACCEPTED);
    expect([engine.balances[1], engine.counters.negativeBalances]).toStrictEqual([0, 0]);
  });

  it('can pay out of an account that was just funded', () => {
    expect([
      engine.handle(message({ endToEndId: 'E1', from: 1, to: 0, amount: 40 })),
      engine.handle(message({ endToEndId: 'E2', from: 0, to: 3, amount: 40 })),
    ]).toStrictEqual([ACCEPTED, ACCEPTED]);
    expect([engine.balances[0], engine.balances[3]]).toStrictEqual([0, 1e6 + 40]);
  });
});

describe('PixEngine.handle: rejections leave the ledger alone', () => {
  let engine, ledgerBefore;
  beforeEach(() => {
    engine = new PixEngine();
    ledgerBefore = Float64Array.from(engine.balances);
  });
  const expectLedgerUntouched = () => {
    expect(engine.balances).toStrictEqual(ledgerBefore);
    expect([engine.journalEntries, engine.chain, engine.counters.accepted]).toStrictEqual([
      0,
      FNV_OFFSET,
      0,
    ]);
  };

  it.each([
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['a missing amount', { amount: undefined }],
    ['a text amount', { amount: 'cem' }],
    ['the same account on both sides', { from: 7, to: 7 }],
    ['an EndToEndId that is not text', { endToEndId: 12345 }],
    ['a missing EndToEndId', { endToEndId: undefined }],
  ])('refuses %s as invalid, counting only that', (_label, overrides) => {
    expect(engine.handle(message(overrides))).toBe(INVALID);
    expect(engine.counters).toStrictEqual({ ...NO_COUNTS, invalid: 1 });
    expect(engine.seen.size).toBe(0);
    expectLedgerUntouched();
  });

  it('refuses a payment one cent above the balance, counting only that', () => {
    expect(engine.handle(message({ amount: 1e6 + 0.01 }))).toBe(INSUFFICIENT_FUNDS);
    expect(engine.counters).toStrictEqual({ ...NO_COUNTS, insufficientFunds: 1 });
    expectLedgerUntouched();
  });

  it('refuses a payment from an empty account', () => {
    expect(engine.handle(message({ from: 0, to: 1, amount: 0.01 }))).toBe(INSUFFICIENT_FUNDS);
    expect(engine.counters).toStrictEqual({ ...NO_COUNTS, insufficientFunds: 1 });
    expectLedgerUntouched();
  });

  it('consumes the EndToEndId even when the funds are missing, so a retry is a duplicate', () => {
    expect(engine.handle(message({ endToEndId: 'E9', from: 0, amount: 10 }))).toBe(
      INSUFFICIENT_FUNDS,
    );
    expect([...engine.seen]).toStrictEqual(['E9']);
    expect(engine.handle(message({ endToEndId: 'E9', from: 1, amount: 10 }))).toBe(DUPLICATE);
  });

  it('records the id of a payment refused for funds as the last EndToEndId', () => {
    engine.handle(message({ endToEndId: 'E9', from: 0, amount: 10 }));
    expect(engine.lastEndToEndId).toBe('E9');
  });

  it('does not take an invalid payment as the last EndToEndId', () => {
    engine.handle(message({ endToEndId: 'E5', amount: 0 }));
    expect(engine.lastEndToEndId).toBe('E0');
  });

  it('throws on a message that is not JSON, as a broken wire would', () => {
    expect(() => engine.handle('not json')).toThrow(SyntaxError);
    expect(engine.counters).toStrictEqual(NO_COUNTS);
  });
});

describe('PixEngine.handle: idempotency by EndToEndId', () => {
  let engine;
  beforeEach(() => {
    engine = new PixEngine();
  });

  it('settles the same EndToEndId only once, whatever else the repeat says', () => {
    expect([
      engine.handle(message({ endToEndId: 'EA' })),
      engine.handle(message({ endToEndId: 'EA' })),
      engine.handle(message({ endToEndId: 'EA', from: 3, to: 4, amount: 999 })),
    ]).toStrictEqual([ACCEPTED, DUPLICATE, DUPLICATE]);
    expect(engine.counters).toStrictEqual({ ...NO_COUNTS, accepted: 1, duplicates: 2 });
    expect([engine.journalEntries, engine.balances[1], engine.balances[3]]).toStrictEqual([
      1,
      1e6 - 100,
      1e6,
    ]);
  });

  it('keeps the chain and the last EndToEndId where they were after a duplicate', () => {
    engine.handle(message({ endToEndId: 'EA' }));
    engine.handle(message({ endToEndId: 'EB' }));
    const snapshot = [engine.chain, engine.lastEndToEndId];
    engine.handle(message({ endToEndId: 'EA' }));
    expect([engine.chain, engine.lastEndToEndId]).toStrictEqual(snapshot);
  });

  it('treats different EndToEndIds as different payments', () => {
    expect([
      engine.handle(message({ endToEndId: 'EA' })),
      engine.handle(message({ endToEndId: 'EB' })),
    ]).toStrictEqual([ACCEPTED, ACCEPTED]);
    expect(engine.journalEntries).toBe(2);
  });

  it('keeps 300,000 ids, then starts a fresh set with the id being settled, so older ones can be accepted again', () => {
    for (let index = 0; index < 300000; index++)
      engine.handle(message({ endToEndId: `E${index}`, amount: 0.01 }));
    expect(engine.seen.size).toBe(300000);
    engine.handle(message({ endToEndId: 'E300000', amount: 0.01 }));
    expect([engine.seen.size, [...engine.seen]]).toStrictEqual([1, ['E300000']]);
    expect(engine.handle(message({ endToEndId: 'E0', amount: 0.01 }))).toBe(ACCEPTED);
  });

  it('still recognizes the id that triggered the reset', () => {
    for (let index = 0; index <= 300000; index++)
      engine.handle(message({ endToEndId: `E${index}`, amount: 0.01 }));
    expect(engine.handle(message({ endToEndId: 'E300000', amount: 0.01 }))).toBe(DUPLICATE);
  });

  it('does not reset while a duplicate arrives at the limit', () => {
    for (let index = 0; index < 300000; index++)
      engine.handle(message({ endToEndId: `E${index}`, amount: 0.01 }));
    expect(engine.handle(message({ endToEndId: 'E5', amount: 0.01 }))).toBe(DUPLICATE);
    expect(engine.seen.size).toBe(300000);
  });
});

describe('PixEngine.handle: payloads that look valid to JavaScript but are not', () => {
  it.each([
    ['an amount that is text', { amount: '5' }],
    ['an amount that is a boolean', { amount: true }],
    ['an account below zero', { from: -1 }],
    ['a recipient below zero', { to: -1 }],
    ['an account past the last one', { to: 10000 }],
    ['a sender past the last account', { from: 99999 }],
    ['a fractional account number', { to: 2.5 }],
    ['an account given as text', { from: '1' }],
    ['a missing account', { to: undefined }],
  ])('refuses %s as invalid and keeps the total', (_label, overrides) => {
    const engine = new PixEngine();
    expect([
      engine.handle(message(overrides)),
      engine.report().conserved,
      engine.counters,
    ]).toStrictEqual([INVALID, true, { ...NO_COUNTS, invalid: 1 }]);
  });

  it.each([['null'], ['[]'], ['5'], ['"E1"'], ['true'], ['[{"amount":1}]']])(
    'refuses the JSON %s as invalid',
    (json) => {
      const engine = new PixEngine();
      expect([engine.handle(json), engine.counters]).toStrictEqual([
        INVALID,
        { ...NO_COUNTS, invalid: 1 },
      ]);
    },
  );

  it('accepts the first and the last account of the ledger', () => {
    const engine = new PixEngine();
    expect([
      engine.handle(message({ endToEndId: 'E1', from: 1, to: 9999 })),
      engine.handle(message({ endToEndId: 'E2', from: 9999, to: 1 })),
    ]).toStrictEqual([ACCEPTED, ACCEPTED]);
    expect(engine.handle(message({ endToEndId: 'E3', from: 1, to: 0, amount: 1 }))).toBe(ACCEPTED);
  });
});

describe('PixEngine.report', () => {
  it('reports the whole state after one payment, with the chain as 8 hex digits', () => {
    const engine = new PixEngine();
    engine.handle(message({ amount: 123.45 }));
    expect(engine.report()).toStrictEqual({
      conserved: true,
      minimumBalance: 0,
      journalEntries: 1,
      chain: 'd77884c6',
      accepted: 1,
      insufficientFunds: 0,
      duplicates: 0,
      invalid: 0,
      negativeBalances: 0,
    });
  });

  it('pads a short chain with zeros', () => {
    const engine = new PixEngine();
    engine.chain = 0xabc;
    expect(engine.report().chain).toBe('00000abc');
  });

  it('finds the smallest balance, wherever it is', () => {
    const engine = new PixEngine();
    engine.balances.fill(5);
    engine.balances[9999] = -3;
    expect(engine.report().minimumBalance).toBe(-3);
    engine.balances[0] = -7;
    expect(engine.report().minimumBalance).toBe(-7);
  });

  it('notices money created out of thin air', () => {
    const engine = new PixEngine();
    engine.balances[10] += 1;
    expect(engine.report().conserved).toBe(false);
  });

  it('notices money that vanished', () => {
    const engine = new PixEngine();
    engine.balances[10] -= 1;
    expect(engine.report().conserved).toBe(false);
  });

  it('tolerates floating point dust below a thousandth', () => {
    const engine = new PixEngine();
    engine.balances[10] += 9e-4;
    expect(engine.report().conserved).toBe(true);
    engine.balances[11] += 2e-3;
    expect(engine.report().conserved).toBe(false);
  });
});

describe('PixEngine generated traffic', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is deterministic: 300 batches always end in the same state', () => {
    const engine = new PixEngine();
    for (let batch = 0; batch < 300; batch++) engine.runBatch();
    expect(engine.report()).toStrictEqual({
      conserved: true,
      minimumBalance: 128.48999999999978,
      journalEntries: 298148,
      chain: 'ced9a88c',
      accepted: 298148,
      insufficientFunds: 236,
      duplicates: 1579,
      invalid: 37,
      negativeBalances: 0,
    });
  });

  it('settles 1000 payments per batch and accounts for every one', () => {
    const engine = new PixEngine();
    engine.runBatch();
    expect(engine.counters).toStrictEqual({
      accepted: 988,
      insufficientFunds: 4,
      duplicates: 8,
      invalid: 0,
      negativeBalances: 0,
    });
  });

  it('repeats an EndToEndId on exactly 536 of the first 100,000 payments', () => {
    const engine = new PixEngine();
    for (let batch = 0; batch < 100; batch++) engine.runBatch();
    expect(engine.counters).toStrictEqual({
      accepted: 99315,
      insufficientFunds: 138,
      duplicates: 536,
      invalid: 11,
      negativeBalances: 0,
    });
  });

  it('returns the outcome of each generated payment: 1981 accepted, 7 for funds and 12 duplicates in the first 2000', () => {
    const engine = new PixEngine();
    const tally = {};
    for (let sequence = 0; sequence < 2000; sequence++) {
      const outcome = engine.processPix(sequence);
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    }
    expect(tally).toStrictEqual({ [ACCEPTED]: 1981, [INSUFFICIENT_FUNDS]: 7, [DUPLICATE]: 12 });
  });

  it('remembers one id per payment that was not a duplicate, all shaped E<random><sequence> in base 36', () => {
    const engine = new PixEngine();
    for (let sequence = 0; sequence < 2000; sequence++) engine.processPix(sequence);
    expect(engine.seen.size).toBe(1988);
    expect([...engine.seen].filter((id) => !/^E[0-9a-z]+$/.test(id))).toStrictEqual([]);
    expect([...engine.seen].slice(0, 3)).toStrictEqual(['Etdjw70', 'Eg9t6nd1', 'Ea080rg2']);
  });

  it('hands each generated payment to handle as a JSON message with its sequence as timestamp', () => {
    const engine = new PixEngine();
    const handle = vi.spyOn(engine, 'handle');
    engine.processPix(7);
    expect(handle).toHaveBeenCalledTimes(1);
    const sent = handle.mock.calls[0][0];
    expect(Object.keys(JSON.parse(sent))).toStrictEqual([
      'endToEndId',
      'from',
      'to',
      'amount',
      'timestamp',
    ]);
    expect(JSON.parse(sent).timestamp).toBe(7);
  });

  it('runs a batch as 1000 processPix calls with consecutive sequences, and the next batch carries on', () => {
    const engine = new PixEngine();
    const processPix = vi.spyOn(engine, 'processPix');
    engine.runBatch();
    engine.runBatch();
    expect(processPix).toHaveBeenCalledTimes(2000);
    expect(processPix).toHaveBeenNthCalledWith(1, 0);
    expect(processPix).toHaveBeenNthCalledWith(1000, 999);
    expect(processPix).toHaveBeenNthCalledWith(1001, 1000);
    expect(processPix).toHaveBeenNthCalledWith(2000, 1999);
  });
});

describe('PixEngine pacing with a controlled clock', () => {
  let engine, clock, now, step;
  beforeEach(() => {
    engine = new PixEngine();
    clock = 1000;
    step = 10;
    now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += step));
  });
  afterEach(() => vi.restoreAllMocks());

  it('times a batch with two clock readings', () => {
    expect(engine.runBatch()).toBe(10);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it('warms up for 250 ms of clock time (26 readings, 8 batches) and sizes a 48 ms tick from it', () => {
    expect(engine.warmUp()).toBe((8 / 250) * 48);
    expect(now).toHaveBeenCalledTimes(26);
    expect(clock).toBe(1260);
  });

  it('forgets the warm-up traffic in the counters but keeps the ledger and the journal', () => {
    engine.warmUp();
    expect(engine.counters).toStrictEqual(NO_COUNTS);
    expect(engine.journalEntries).toBe(7935);
    expect(engine.report().conserved).toBe(true);
  });

  it('runs round(batchesPerTick x fraction) batches in a tick, at least one', () => {
    engine.warmUp();
    now.mockClear();
    expect(Array.from(engine.tick(1))).toStrictEqual([10, 10]);
    expect(now).toHaveBeenCalledTimes(7);
    now.mockClear();
    expect(Array.from(engine.tick(0.1))).toStrictEqual([10]);
    expect(now).toHaveBeenCalledTimes(4);
    now.mockClear();
    expect(Array.from(engine.tick(0))).toStrictEqual([10]);
    expect(now).toHaveBeenCalledTimes(4);
  });

  it('returns Float32 durations, one per batch', () => {
    engine.warmUp();
    const durations = engine.tick(1);
    expect([
      durations instanceof Float32Array,
      durations.length,
      durations.byteLength,
    ]).toStrictEqual([true, 2, 8]);
  });

  it('stops a tick at the 48 ms budget even when 154 batches were asked for', () => {
    engine.warmUp();
    now.mockClear();
    expect(Array.from(engine.tick(100))).toStrictEqual([10, 10]);
    expect(now).toHaveBeenCalledTimes(8);
  });

  it('stops a tick the moment the 48 ms budget is used up, not one reading later', () => {
    engine.warmUp();
    now.mockClear();
    step = 12;
    expect(Array.from(engine.tick(100))).toStrictEqual([12]);
    expect(now).toHaveBeenCalledTimes(5);
  });

  it('runs a single batch per tick before any warm-up', () => {
    const fresh = new PixEngine();
    expect(Array.from(fresh.tick(5))).toStrictEqual([10]);
  });
});
