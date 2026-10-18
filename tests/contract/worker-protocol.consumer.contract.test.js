import { existsSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorkerPool } from '@site/js/load-test/worker-pool.js';
import { RampScenario } from '@site/js/load-test/ramp-scenario.js';
import { WorkerContract } from './support/worker-contract.js';
import { ConsumerFields } from './support/consumer-fields.js';
import { ExpectedErrors } from './support/expected-errors.js';
import { RecordingWorker, ScriptedWorker } from './support/fake-workers.js';

const VALID = { valid: true, errors: null };
const WORKER_URL = new URL('../../source/js/load-test/pix-engine.worker.js', import.meta.url).href;
const COUNTERS = {
  accepted: 0,
  insufficientFunds: 0,
  duplicates: 0,
  invalid: 0,
  negativeBalances: 0,
};

describe('what the consumer sends', () => {
  it('sends warm, tick and done, in that order', () => {
    expect(ConsumerFields.commandsSent).toStrictEqual(['warm', 'tick', 'done']);
  });

  it('has one command schema and one reply schema for each of them', () => {
    expect(WorkerContract.names).toStrictEqual([
      'command-warm',
      'command-tick',
      'command-done',
      'reply-warm',
      'reply-tick',
      'reply-done',
    ]);
  });

  it('sends only commands the worker handles, and the worker handles nothing else', () => {
    expect(ConsumerFields.commandsHandledByTheWorker).toStrictEqual(ConsumerFields.commandsSent);
  });

  it('spawns the worker script from the same folder, as a module worker', () => {
    expect(ConsumerFields.workerScript).toStrictEqual(['./pix-engine.worker.js', 'module']);
    expect(
      existsSync(new URL('../../source/js/load-test/pix-engine.worker.js', import.meta.url)),
    ).toBe(true);
  });

  it.each([0, 2.5, 5, 7, 10, 15, 17.5, 20, 25])(
    'builds a valid tick for the ramp at %f s',
    (seconds) => {
      expect(
        WorkerContract.validate('command-tick', {
          command: 'tick',
          fraction: RampScenario.fractionAt(seconds),
        }),
      ).toStrictEqual(VALID);
    },
  );

  it('builds valid warm and done commands', () => {
    expect(WorkerContract.validate('command-warm', { command: 'warm' })).toStrictEqual(VALID);
    expect(WorkerContract.validate('command-done', { command: 'done' })).toStrictEqual(VALID);
  });

  it('picks the schema from the command name', () => {
    expect(WorkerContract.commandSchemaName({ command: 'tick', fraction: 1 })).toBe('command-tick');
  });
});

describe('what the consumer requires of the replies', () => {
  it('reads batchesPerTick from the warm reply, and the schema requires it', () => {
    expect(ConsumerFields.warmReplyFields).toStrictEqual(['batchesPerTick']);
    expect(WorkerContract.schema('reply-warm').required).toStrictEqual(
      ConsumerFields.warmReplyFields,
    );
  });

  it('reads the durations and the five counters from the tick reply, and the schema requires them', () => {
    expect(ConsumerFields.tickReplyFields).toStrictEqual([
      'durations',
      'accepted',
      'insufficientFunds',
      'duplicates',
      'invalid',
      'negativeBalances',
    ]);
    expect(WorkerContract.schema('reply-tick').required).toStrictEqual(
      ConsumerFields.tickReplyFields,
    );
  });

  it('reads four fields from the final report, and the schema requires them', () => {
    expect(ConsumerFields.finalReportFields).toStrictEqual([
      'conserved',
      'minimumBalance',
      'journalEntries',
      'chain',
    ]);
    expect(WorkerContract.schema('reply-done').required).toStrictEqual(
      ConsumerFields.finalReportFields,
    );
  });

  it('does not require anything the consumer never reads', () => {
    const everything = ['reply-warm', 'reply-tick', 'reply-done'].flatMap(
      (name) => WorkerContract.schema(name).required,
    );
    const readByConsumer = [
      ...ConsumerFields.warmReplyFields,
      ...ConsumerFields.tickReplyFields,
      ...ConsumerFields.finalReportFields,
    ];
    expect(everything).toStrictEqual(readByConsumer);
  });

  it('tolerates fields it does not know, in every reply', () => {
    expect(
      WorkerContract.validate('reply-warm', { batchesPerTick: 16, workerVersion: 2 }),
    ).toStrictEqual(VALID);
    expect(
      WorkerContract.validate('reply-tick', {
        durations: new Float32Array([1]),
        ...COUNTERS,
        heapUsed: 12,
      }),
    ).toStrictEqual(VALID);
    expect(
      WorkerContract.validate('reply-done', {
        conserved: true,
        minimumBalance: 0,
        journalEntries: 0,
        chain: '811c9dc5',
        ...COUNTERS,
        uptime: 3,
      }),
    ).toStrictEqual(VALID);
  });

  it('accepts the durations as a Float32Array, a Float32Array view or a plain array', () => {
    const buffer = new Float32Array([9, 1, 2, 9]);
    expect(
      WorkerContract.validate('reply-tick', { durations: buffer.subarray(1, 3), ...COUNTERS }),
    ).toStrictEqual(VALID);
    expect(
      WorkerContract.validate('reply-tick', { durations: new Float32Array(0), ...COUNTERS }),
    ).toStrictEqual(VALID);
    expect(
      WorkerContract.validate('reply-tick', { durations: [1.5, 2.5], ...COUNTERS }),
    ).toStrictEqual(VALID);
  });
});

describe('what the schemas refuse', () => {
  it('refuses a command with another name', () => {
    expect(WorkerContract.validate('command-warm', { command: 'cold' })).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.constant('/command', 'warm')],
    });
  });

  it('refuses a command without its name', () => {
    expect(WorkerContract.validate('command-done', {})).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.required('command')],
    });
  });

  it('refuses a tick without a fraction', () => {
    expect(WorkerContract.validate('command-tick', { command: 'tick' })).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.required('fraction')],
    });
  });

  it('refuses a tick fraction above 1, below 0 or written as text', () => {
    expect(
      WorkerContract.validate('command-tick', { command: 'tick', fraction: 1.5 }),
    ).toStrictEqual({ valid: false, errors: [ExpectedErrors.maximum('/fraction', 1)] });
    expect(
      WorkerContract.validate('command-tick', { command: 'tick', fraction: -0.1 }),
    ).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.minimum('/fraction', '#/properties/fraction/minimum', 0)],
    });
    expect(
      WorkerContract.validate('command-tick', { command: 'tick', fraction: '1' }),
    ).toStrictEqual({ valid: false, errors: [ExpectedErrors.type('/fraction', 'number')] });
  });

  it('refuses a warm reply without batchesPerTick or with zero', () => {
    expect(WorkerContract.validate('reply-warm', {})).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.required('batchesPerTick')],
    });
    expect(WorkerContract.validate('reply-warm', { batchesPerTick: 0 })).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.exclusiveMinimum('/batchesPerTick', 0)],
    });
  });

  it('names every missing field of a tick reply, in the order the consumer reads them', () => {
    expect(WorkerContract.validate('reply-tick', {})).toStrictEqual({
      valid: false,
      errors: [
        'durations',
        'accepted',
        'insufficientFunds',
        'duplicates',
        'invalid',
        'negativeBalances',
      ].map((name) => ExpectedErrors.required(name)),
    });
  });

  it('refuses a negative duration and points at its position', () => {
    expect(
      WorkerContract.validate('reply-tick', { durations: new Float32Array([1, -1]), ...COUNTERS }),
    ).toStrictEqual({
      valid: false,
      errors: [ExpectedErrors.minimum('/durations/1', '#/properties/durations/items/minimum', 0)],
    });
  });

  it('refuses a counter that is not a whole number', () => {
    expect(
      WorkerContract.validate('reply-tick', { durations: [1], ...COUNTERS, accepted: 1.5 }),
    ).toStrictEqual({ valid: false, errors: [ExpectedErrors.type('/accepted', 'integer')] });
  });

  it('refuses a final report whose chain is not eight lowercase hex digits', () => {
    expect(
      WorkerContract.validate('reply-done', {
        conserved: true,
        minimumBalance: 0,
        journalEntries: 0,
        chain: 'XYZ',
      }),
    ).toStrictEqual({ valid: false, errors: [ExpectedErrors.pattern('/chain', '^[0-9a-f]{8}$')] });
  });

  it('refuses a final report whose conserved flag is not a boolean', () => {
    expect(
      WorkerContract.validate('reply-done', {
        conserved: 'yes',
        minimumBalance: 0,
        journalEntries: 0,
        chain: '811c9dc5',
      }),
    ).toStrictEqual({ valid: false, errors: [ExpectedErrors.type('/conserved', 'boolean')] });
  });
});

describe('WorkerPool, the consumer of the protocol', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    RecordingWorker.reset();
    ScriptedWorker.script = () => ({});
    ScriptedWorker.delays = [];
  });

  const poolOf = (size) => {
    vi.stubGlobal('Worker', ScriptedWorker);
    return new WorkerPool(size);
  };

  it('reports the size it was given', () => expect(poolOf(3).size).toBe(3));

  it('spawns one module worker per slot', () => {
    poolOf(2).spawn();
    expect(RecordingWorker.log).toStrictEqual([
      { worker: 0, call: 'new', url: WORKER_URL, options: { type: 'module' } },
      { worker: 1, call: 'new', url: WORKER_URL, options: { type: 'module' } },
    ]);
  });

  it('sends the same message to every worker, in order, and answers with the replies in worker order', async () => {
    ScriptedWorker.script = (index, message) => ({ from: index, heard: message.command });
    ScriptedWorker.delays = [30, 10, 0];
    const pool = poolOf(3);
    pool.spawn();
    RecordingWorker.log = [];
    const replies = await pool.broadcast({ command: 'warm' });
    expect(replies).toStrictEqual([
      { from: 0, heard: 'warm' },
      { from: 1, heard: 'warm' },
      { from: 2, heard: 'warm' },
    ]);
    expect(RecordingWorker.log).toStrictEqual([
      { worker: 0, call: 'postMessage', message: { command: 'warm' } },
      { worker: 1, call: 'postMessage', message: { command: 'warm' } },
      { worker: 2, call: 'postMessage', message: { command: 'warm' } },
    ]);
  });

  it('delivers a tick with its fraction untouched', async () => {
    ScriptedWorker.script = (index, message) => ({ fraction: message.fraction });
    const pool = poolOf(1);
    pool.spawn();
    expect(await pool.broadcast({ command: 'tick', fraction: 0.25 })).toStrictEqual([
      { fraction: 0.25 },
    ]);
  });

  it('terminates the previous workers before it spawns new ones', () => {
    const pool = poolOf(2);
    pool.spawn();
    RecordingWorker.log = [];
    pool.spawn();
    expect(RecordingWorker.log).toStrictEqual([
      { worker: 0, call: 'terminate' },
      { worker: 1, call: 'terminate' },
      { worker: 2, call: 'new', url: WORKER_URL, options: { type: 'module' } },
      { worker: 3, call: 'new', url: WORKER_URL, options: { type: 'module' } },
    ]);
  });

  it('terminates every worker and then has nobody left to ask', async () => {
    const pool = poolOf(2);
    pool.spawn();
    RecordingWorker.log = [];
    pool.terminate();
    expect(RecordingWorker.log).toStrictEqual([
      { worker: 0, call: 'terminate' },
      { worker: 1, call: 'terminate' },
    ]);
    expect(await pool.broadcast({ command: 'done' })).toStrictEqual([]);
    expect(RecordingWorker.log).toStrictEqual([
      { worker: 0, call: 'terminate' },
      { worker: 1, call: 'terminate' },
    ]);
  });

  it('asks nobody before the first spawn', async () => {
    expect(await poolOf(4).broadcast({ command: 'warm' })).toStrictEqual([]);
    expect(RecordingWorker.log).toStrictEqual([]);
  });
});
