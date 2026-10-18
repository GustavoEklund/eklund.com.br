import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool } from '@site/js/load-test/worker-pool.js';
import { PixEngine } from '@site/js/load-test/pix-engine.js';
import { WorkerContract } from './support/worker-contract.js';
import { FakeClock } from './support/fake-clock.js';
import { RecordingWorker, ShellWorker } from './support/fake-workers.js';

const VALID = { valid: true, errors: null };
const COUNTER_KEYS = ['accepted', 'insufficientFunds', 'duplicates', 'invalid', 'negativeBalances'];
const TICK_KEYS = ['durations', ...COUNTER_KEYS];
const REPORT_KEYS = ['conserved', 'minimumBalance', 'journalEntries', 'chain', ...COUNTER_KEYS];
// With the fake clock every call to performance.now() is one millisecond: the 250 ms warm-up fits 83 batches, and a 48 ms tick budget fits 16.
const BATCHES_PER_TICK = (83 / 250) * 48;

const validationsOf = (schema, replies) =>
  replies.map((reply) => WorkerContract.validate(schema, reply));
const allValid = (count) => Array.from({ length: count }, () => VALID);
const counted = (reply) =>
  reply.accepted + reply.insufficientFunds + reply.duplicates + reply.invalid;
const counters = (reply) => Object.fromEntries(COUNTER_KEYS.map((key) => [key, reply[key]]));

describe('the worker script, driven the way WorkerPool drives it', () => {
  let pool;

  const spawn = async (size) => {
    await ShellWorker.prepare(size);
    vi.stubGlobal('Worker', ShellWorker);
    pool = new WorkerPool(size);
    pool.spawn();
  };

  beforeEach(() => {
    FakeClock.install();
    RecordingWorker.reset();
  });

  afterEach(() => {
    FakeClock.restore();
    vi.unstubAllGlobals();
    RecordingWorker.reset();
    ShellWorker.handlers = [];
    ShellWorker.replies = [];
  });

  describe('warm', () => {
    it('answers with batchesPerTick and nothing else', async () => {
      await spawn(2);
      const replies = await pool.broadcast({ command: 'warm' });
      expect(replies).toStrictEqual([
        { batchesPerTick: BATCHES_PER_TICK },
        { batchesPerTick: BATCHES_PER_TICK },
      ]);
      expect(ShellWorker.replies.map(({ keys }) => keys)).toStrictEqual([
        ['batchesPerTick'],
        ['batchesPerTick'],
      ]);
      expect(validationsOf('reply-warm', replies)).toStrictEqual(allValid(2));
    });

    it('does not transfer any buffer', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      expect(
        ShellWorker.replies.map(({ transferredByteLengths }) => transferredByteLengths),
      ).toStrictEqual([[]]);
    });

    it('zeroes the counters but keeps the journal it wrote while warming up', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const [report] = await pool.broadcast({ command: 'done' });
      expect(report).toStrictEqual({
        conserved: true,
        minimumBalance: 24.950000000000045,
        journalEntries: 82427,
        chain: '807aa9f8',
        accepted: 0,
        insufficientFunds: 0,
        duplicates: 0,
        invalid: 0,
        negativeBalances: 0,
      });
    });
  });

  describe('tick', () => {
    it('answers with Float32Array durations and the five counters, in that order', async () => {
      await spawn(2);
      await pool.broadcast({ command: 'warm' });
      const replies = await pool.broadcast({ command: 'tick', fraction: 1 });
      expect(ShellWorker.replies.slice(2).map(({ keys }) => keys)).toStrictEqual([
        TICK_KEYS,
        TICK_KEYS,
      ]);
      expect(replies[0].durations).toBeInstanceOf(Float32Array);
      expect(replies[1].durations).toBeInstanceOf(Float32Array);
      expect(validationsOf('reply-tick', replies)).toStrictEqual(allValid(2));
    });

    it('runs round(batchesPerTick * fraction) batches and reports one duration per batch', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const [reply] = await pool.broadcast({ command: 'tick', fraction: 1 });
      expect(reply.durations).toStrictEqual(new Float32Array(16).fill(1));
      expect(counted(reply)).toBe(16 * PixEngine.BATCH_SIZE);
      expect(counters(reply)).toStrictEqual({
        accepted: 15896,
        insufficientFunds: 13,
        duplicates: 90,
        invalid: 1,
        negativeBalances: 0,
      });
    });

    it('moves the durations buffer to the page instead of copying it', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      await pool.broadcast({ command: 'tick', fraction: 1 });
      const [tick] = ShellWorker.replies.slice(1);
      expect(tick.transfersTheDurationsBuffer).toBe(true);
      expect(tick.transferredByteLengths).toStrictEqual([64]);
    });

    it('stops at the time budget and then sends a view that is shorter than its buffer', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const [reply] = await pool.broadcast({ command: 'tick', fraction: 3 });
      expect(ShellWorker.replies.at(-1).durationsView).toStrictEqual({
        length: 16,
        byteOffset: 0,
        bufferByteLength: 192,
      });
      expect(reply.durations.length).toBe(16);
      expect(reply.durations.buffer.byteLength).toBe(192);
      expect([...reply.durations]).toStrictEqual(Array.from({ length: 16 }, () => 1));
    });

    it('runs one batch at fraction 0, so the ramp-down never goes fully silent', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const [reply] = await pool.broadcast({ command: 'tick', fraction: 0 });
      expect(reply.durations).toStrictEqual(new Float32Array(1).fill(1));
      expect(counted(reply)).toBe(PixEngine.BATCH_SIZE);
    });

    it('runs one batch when nobody warmed the worker up', async () => {
      await spawn(1);
      const [reply] = await pool.broadcast({ command: 'tick', fraction: 1 });
      expect(reply.durations).toStrictEqual(new Float32Array(1).fill(1));
      expect(counters(reply)).toStrictEqual({
        accepted: 988,
        insufficientFunds: 4,
        duplicates: 8,
        invalid: 0,
        negativeBalances: 0,
      });
    });

    it('reports counters that add up over the ticks, since the end of the warm-up', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const ticks = [];
      for (const fraction of [1, 3, 0])
        ticks.push((await pool.broadcast({ command: 'tick', fraction }))[0]);
      expect(ticks.map(counted)).toStrictEqual([16000, 32000, 33000]);
      expect(ticks.map((tick) => tick.accepted)).toStrictEqual([15896, 31804, 32799]);
      expect(ticks.map((tick) => tick.duplicates)).toStrictEqual([90, 165, 170]);
    });
  });

  describe('done', () => {
    it('answers with the final report: the four fields the consumer reads, then the counters', async () => {
      await spawn(2);
      await pool.broadcast({ command: 'warm' });
      await pool.broadcast({ command: 'tick', fraction: 1 });
      await pool.broadcast({ command: 'tick', fraction: 3 });
      await pool.broadcast({ command: 'tick', fraction: 0 });
      const reports = await pool.broadcast({ command: 'done' });
      const expected = {
        conserved: true,
        minimumBalance: 42.62999999999994,
        journalEntries: 115226,
        chain: '6d0d2484',
        accepted: 32799,
        insufficientFunds: 29,
        duplicates: 170,
        invalid: 2,
        negativeBalances: 0,
      };
      expect(reports).toStrictEqual([expected, expected]);
      expect(ShellWorker.replies.slice(-2).map(({ keys }) => keys)).toStrictEqual([
        REPORT_KEYS,
        REPORT_KEYS,
      ]);
      expect(validationsOf('reply-done', reports)).toStrictEqual(allValid(2));
    });

    it('reports the same numbers as the last tick, because both read the same counters', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const [tick] = await pool.broadcast({ command: 'tick', fraction: 1 });
      const [report] = await pool.broadcast({ command: 'done' });
      expect(counters(report)).toStrictEqual(counters(tick));
    });

    it('can be asked twice and gives the same report', async () => {
      await spawn(1);
      await pool.broadcast({ command: 'warm' });
      const first = await pool.broadcast({ command: 'done' });
      const second = await pool.broadcast({ command: 'done' });
      expect(second).toStrictEqual(first);
    });

    it('starts from the empty ledger and the FNV-1a offset when nothing happened', async () => {
      await spawn(1);
      const [report] = await pool.broadcast({ command: 'done' });
      expect(report).toStrictEqual({
        conserved: true,
        minimumBalance: 0,
        journalEntries: 0,
        chain: (2166136261).toString(16),
        accepted: 0,
        insufficientFunds: 0,
        duplicates: 0,
        invalid: 0,
        negativeBalances: 0,
      });
    });
  });

  describe('workers are independent', () => {
    it('keeps a separate engine in each worker', async () => {
      await spawn(2);
      await pool.broadcast({ command: 'warm' });
      const [first, second] = RecordingWorker.instances;
      const heard = [];
      second.onmessage = ({ data }) => heard.push(data);
      first.onmessage = () => {};
      first.postMessage({ command: 'tick', fraction: 1 });
      second.postMessage({ command: 'done' });
      await vi.waitFor(() => expect(heard).toHaveLength(1));
      expect(counted(heard[0])).toBe(0);
    });
  });

  describe('unknown commands', () => {
    it('gets no reply at all, so a consumer must never send one', async () => {
      await spawn(1);
      const [worker] = RecordingWorker.instances;
      const heard = [];
      worker.onmessage = ({ data }) => heard.push(data);
      worker.postMessage({ command: 'reboot' });
      worker.postMessage({});
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(heard).toStrictEqual([]);
      expect(ShellWorker.replies).toStrictEqual([]);
    });
  });
});
