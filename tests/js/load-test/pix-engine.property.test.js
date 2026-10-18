import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PixEngine } from '@site/js/load-test/pix-engine.js';

const { ACCEPTED } = PixEngine.OUTCOMES;
const order = fc.record({
  endToEndId: fc.oneof(fc.stringMatching(/^E[0-9a-f]{1,3}$/), fc.constant('E-shared')),
  from: fc.integer({ min: 0, max: 60 }),
  to: fc.integer({ min: 0, max: 60 }),
  amount: fc.oneof(
    fc.integer({ min: -5, max: 2_000_000 }).map((value) => value / 100),
    fc.constant(0),
  ),
  timestamp: fc.integer({ min: 0, max: 1e6 }),
});
const orders = fc.array(order, { maxLength: 200 });

const settle = (entries) => {
  const engine = new PixEngine();
  return { engine, outcomes: entries.map((entry) => engine.handle(JSON.stringify(entry))) };
};

describe('PixEngine properties', () => {
  it('conserves money for any sequence of payments', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        expect(settle(entries).engine.report().conserved).toBe(true);
      }),
    ));

  it('never lets an account go negative', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        const { engine } = settle(entries);
        expect([
          Array.from(engine.balances).filter((balance) => balance < 0),
          engine.counters.negativeBalances,
        ]).toStrictEqual([[], 0]);
      }),
    ));

  it('accounts for every message in exactly one counter', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        const { accepted, insufficientFunds, duplicates, invalid } =
          settle(entries).engine.counters;
        expect(accepted + insufficientFunds + duplicates + invalid).toBe(entries.length);
      }),
    ));

  it('tallies each outcome in the counter that carries its name', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        const { engine, outcomes } = settle(entries);
        const tally = (name) => outcomes.filter((outcome) => outcome === name).length;
        expect(engine.counters).toStrictEqual({
          accepted: tally('accepted'),
          insufficientFunds: tally('insufficientFunds'),
          duplicates: tally('duplicate'),
          invalid: tally('invalid'),
          negativeBalances: 0,
        });
      }),
    ));

  it('journals exactly the accepted payments', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        const { engine, outcomes } = settle(entries);
        expect(engine.journalEntries).toBe(
          outcomes.filter((outcome) => outcome === ACCEPTED).length,
        );
      }),
    ));

  it('settles an EndToEndId at most once', () =>
    fc.assert(
      fc.property(orders, (entries) => {
        const { outcomes } = settle(entries);
        const settled = entries
          .filter((_, index) => outcomes[index] === ACCEPTED)
          .map((entry) => entry.endToEndId);
        expect(settled.filter((id, index) => settled.indexOf(id) !== index)).toStrictEqual([]);
      }),
    ));

  it('replays to the same chain, whatever the order of the run', () =>
    fc.assert(
      fc.property(fc.array(order, { maxLength: 100 }), (entries) => {
        expect(settle(entries).engine.report().chain).toBe(settle(entries).engine.report().chain);
      }),
    ));

  it('moves the chain exactly when a payment is accepted', () =>
    fc.assert(
      fc.property(fc.array(order, { maxLength: 100 }), (entries) => {
        const engine = new PixEngine();
        const log = entries.map((entry) => {
          const before = engine.chain;
          const outcome = engine.handle(JSON.stringify(entry));
          return [outcome, engine.chain !== before];
        });
        expect(log).toStrictEqual(log.map(([outcome]) => [outcome, outcome === ACCEPTED]));
      }),
    ));

  it('moves exactly the amount between exactly the two accounts of an accepted payment', () =>
    fc.assert(
      fc.property(order, (entry) => {
        const engine = new PixEngine();
        const before = Float64Array.from(engine.balances);
        const outcome = engine.handle(JSON.stringify(entry));
        const changed = engine.balances.reduce(
          (accounts, balance, index) =>
            balance === before[index] ? accounts : [...accounts, index],
          [],
        );
        const expected =
          outcome === ACCEPTED && entry.amount > 0
            ? [entry.from, entry.to].sort((a, b) => a - b)
            : [];
        expect(changed).toStrictEqual(expected);
      }),
    ));

  it('never throws and never creates money for any JSON value sent as a message', () =>
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const engine = new PixEngine();
        const outcome = engine.handle(JSON.stringify(value));
        expect([
          Object.values(PixEngine.OUTCOMES).includes(outcome),
          engine.report().conserved,
          Array.from(engine.balances).filter((balance) => !Number.isFinite(balance)),
        ]).toStrictEqual([true, true, []]);
      }),
    ));

  it('treats a payload as valid only when its amount is a positive number and both accounts are different integers in range', () =>
    fc.assert(
      fc.property(
        fc.record({
          endToEndId: fc.string({ minLength: 1, maxLength: 6 }),
          from: fc.oneof(
            fc.integer({ min: -3, max: 10003 }),
            fc.double({ noNaN: true }),
            fc.string(),
          ),
          to: fc.oneof(fc.integer({ min: -3, max: 10003 }), fc.string()),
          amount: fc.oneof(
            fc.double({ noNaN: true, noDefaultInfinity: true, min: -10, max: 10 }),
            fc.string(),
          ),
        }),
        (entry) => {
          const account = (value) => Number.isInteger(value) && value >= 0 && value <= 9999;
          const valid =
            typeof entry.amount === 'number' &&
            entry.amount > 0 &&
            account(entry.from) &&
            account(entry.to) &&
            entry.from !== entry.to;
          const outcome = new PixEngine().handle(JSON.stringify(entry));
          expect(outcome === PixEngine.OUTCOMES.INVALID).toBe(!valid);
        },
      ),
    ));
});
