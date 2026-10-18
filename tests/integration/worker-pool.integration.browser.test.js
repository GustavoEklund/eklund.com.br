import { describe, it, expect, afterEach } from 'vitest';
import { WorkerPool } from '@site/js/load-test/worker-pool.js';

const COUNTERS = ['accepted', 'insufficientFunds', 'duplicates', 'invalid', 'negativeBalances'];
const sum = (reply) => reply.accepted + reply.insufficientFunds + reply.duplicates + reply.invalid;

describe('WorkerPool with the real engine worker', () => {
  let pool;
  afterEach(() => pool?.terminate());

  it('reports its size and starts with no workers to talk to', async () => {
    pool = new WorkerPool(3);
    expect([pool.size, await pool.broadcast({ command: 'warm' })]).toStrictEqual([3, []]);
  });

  it('answers warm with a pace for one tick, once per worker', async () => {
    pool = new WorkerPool(2);
    pool.spawn();
    const replies = await pool.broadcast({ command: 'warm' });
    expect(replies.map((reply) => Object.keys(reply))).toStrictEqual([
      ['batchesPerTick'],
      ['batchesPerTick'],
    ]);
    expect(
      replies.map((reply) => Number.isFinite(reply.batchesPerTick) && reply.batchesPerTick > 0),
    ).toStrictEqual([true, true]);
  });

  it('answers a tick with Float32 durations and counters that account for every payment of every batch', async () => {
    pool = new WorkerPool(2);
    pool.spawn();
    await pool.broadcast({ command: 'warm' });
    const replies = await pool.broadcast({ command: 'tick', fraction: 1 });
    expect(replies.map((reply) => Object.keys(reply))).toStrictEqual([
      ['durations', ...COUNTERS],
      ['durations', ...COUNTERS],
    ]);
    expect(
      replies.map((reply) => [
        reply.durations instanceof Float32Array,
        reply.durations.byteLength,
        sum(reply),
        reply.negativeBalances,
      ]),
    ).toStrictEqual(
      replies.map((reply) => [true, reply.durations.length * 4, reply.durations.length * 1000, 0]),
    );
    expect(replies.map((reply) => reply.durations.length >= 1)).toStrictEqual([true, true]);
  });

  it('finishes with a report that conserves the money, has an 8-digit hex chain and no negative balances', async () => {
    pool = new WorkerPool(2);
    pool.spawn();
    await pool.broadcast({ command: 'warm' });
    const [first, second] = await pool.broadcast({ command: 'tick', fraction: 1 });
    const reports = await pool.broadcast({ command: 'done' });
    expect(reports.map((report) => Object.keys(report))).toStrictEqual(
      reports.map(() => ['conserved', 'minimumBalance', 'journalEntries', 'chain', ...COUNTERS]),
    );
    expect(
      reports.map((report) => [
        report.conserved,
        report.negativeBalances,
        report.chain.length,
        Number.parseInt(report.chain, 16).toString(16).padStart(8, '0') === report.chain,
      ]),
    ).toStrictEqual([
      [true, 0, 8, true],
      [true, 0, 8, true],
    ]);
    expect(reports.map(sum)).toStrictEqual([sum(first), sum(second)]);
  });

  it('counts cumulatively from the warm-up: the second tick includes the first, and the report ends on the second', async () => {
    pool = new WorkerPool(1);
    pool.spawn();
    await pool.broadcast({ command: 'warm' });
    const [first] = await pool.broadcast({ command: 'tick', fraction: 1 });
    const [second] = await pool.broadcast({ command: 'tick', fraction: 1 });
    const [report] = await pool.broadcast({ command: 'done' });
    expect([sum(second), sum(report)]).toStrictEqual([
      sum(first) + second.durations.length * 1000,
      sum(second),
    ]);
  });

  it('replaces its workers when spawned again, starting a fresh ledger', async () => {
    pool = new WorkerPool(1);
    pool.spawn();
    await pool.broadcast({ command: 'warm' });
    await pool.broadcast({ command: 'tick', fraction: 1 });
    pool.spawn();
    const [report] = await pool.broadcast({ command: 'done' });
    expect([report.journalEntries, sum(report)]).toStrictEqual([0, 0]);
  });

  it('has no workers after terminate, so a broadcast has nobody to ask', async () => {
    pool = new WorkerPool(2);
    pool.spawn();
    pool.terminate();
    expect(await pool.broadcast({ command: 'done' })).toStrictEqual([]);
  });
});
