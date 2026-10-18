import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool } from '@site/js/load-test/worker-pool.js';
import { RecordingWorker, ScriptedWorker } from '../../contract/support/fake-workers.js';

const WORKER_PATH = ['js', 'load-test', 'pix-engine.worker.js'];
const summarize = (entries) =>
  entries.map(({ worker, call, message, options }) => [
    worker,
    call,
    ...(call === 'new' ? [options] : call === 'postMessage' ? [message] : []),
  ]);

describe('WorkerPool', () => {
  beforeEach(() => {
    RecordingWorker.reset();
    ScriptedWorker.script = (index, message) => ({ from: index, echo: message });
    ScriptedWorker.delays = [];
    vi.stubGlobal('Worker', ScriptedWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports the size it was given', () => expect(new WorkerPool(3).size).toBe(3));

  describe('spawn', () => {
    it('starts one module worker per slot, in order', () => {
      new WorkerPool(3).spawn();
      expect(summarize(RecordingWorker.log)).toStrictEqual([
        [0, 'new', { type: 'module' }],
        [1, 'new', { type: 'module' }],
        [2, 'new', { type: 'module' }],
      ]);
    });

    it('loads the engine worker script that sits next to the pool', () => {
      new WorkerPool(2).spawn();
      const [first, second] = RecordingWorker.log.map((entry) =>
        new URL(entry.url).pathname.split('/').slice(-3),
      );
      expect([first, second]).toStrictEqual([WORKER_PATH, WORKER_PATH]);
    });

    it('starts nothing for a pool of zero', () => {
      new WorkerPool(0).spawn();
      expect(RecordingWorker.log).toStrictEqual([]);
    });

    it('stops the previous workers before starting new ones when spawned again', () => {
      const pool = new WorkerPool(2);
      pool.spawn();
      pool.spawn();
      expect(summarize(RecordingWorker.log)).toStrictEqual([
        [0, 'new', { type: 'module' }],
        [1, 'new', { type: 'module' }],
        [0, 'terminate'],
        [1, 'terminate'],
        [2, 'new', { type: 'module' }],
        [3, 'new', { type: 'module' }],
      ]);
      expect(RecordingWorker.instances.map((worker) => worker.terminated)).toStrictEqual([
        true,
        true,
        false,
        false,
      ]);
    });
  });

  describe('terminate', () => {
    it('stops every worker, in order, and forgets them', async () => {
      const pool = new WorkerPool(2);
      pool.spawn();
      pool.terminate();
      expect(summarize(RecordingWorker.log).slice(2)).toStrictEqual([
        [0, 'terminate'],
        [1, 'terminate'],
      ]);
      expect(await pool.broadcast({ command: 'tick' })).toStrictEqual([]);
    });

    it('does nothing before any spawn', () => {
      new WorkerPool(2).terminate();
      expect(RecordingWorker.log).toStrictEqual([]);
    });

    it('does not stop the same worker twice', () => {
      const pool = new WorkerPool(1);
      pool.spawn();
      pool.terminate();
      pool.terminate();
      expect(summarize(RecordingWorker.log)).toStrictEqual([
        [0, 'new', { type: 'module' }],
        [0, 'terminate'],
      ]);
    });
  });

  describe('broadcast', () => {
    it('sends the same message object to every worker, in order, and nothing else', async () => {
      const pool = new WorkerPool(3);
      pool.spawn();
      const message = { command: 'tick', fraction: 0.5 };
      await pool.broadcast(message);
      const posted = RecordingWorker.log.filter((entry) => entry.call === 'postMessage');
      expect(posted.map((entry) => entry.worker)).toStrictEqual([0, 1, 2]);
      expect(posted.map((entry) => Object.is(entry.message, message))).toStrictEqual([
        true,
        true,
        true,
      ]);
      expect(RecordingWorker.log).toHaveLength(6);
    });

    it('resolves with every reply, in worker order', async () => {
      const pool = new WorkerPool(3);
      pool.spawn();
      expect(await pool.broadcast({ command: 'warm' })).toStrictEqual([
        { from: 0, echo: { command: 'warm' } },
        { from: 1, echo: { command: 'warm' } },
        { from: 2, echo: { command: 'warm' } },
      ]);
    });

    it('keeps worker order even when the replies arrive in another order', async () => {
      ScriptedWorker.delays = [30, 0, 15];
      const pool = new WorkerPool(3);
      pool.spawn();
      const replies = await pool.broadcast({ command: 'done' });
      expect(replies.map((reply) => reply.from)).toStrictEqual([0, 1, 2]);
    });

    it('waits for the slowest worker: 39 ms is too early, 40 ms is enough', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      ScriptedWorker.delays = [0, 0, 40];
      const pool = new WorkerPool(3);
      pool.spawn();
      let settled = false;
      pool.broadcast({ command: 'done' }).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(39);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      vi.useRealTimers();
    });

    it('resolves with an empty list when there are no workers', async () => {
      expect(await new WorkerPool(2).broadcast({ command: 'tick' })).toStrictEqual([]);
      expect(RecordingWorker.log).toStrictEqual([]);
    });

    it('handles consecutive broadcasts, each reply going to the broadcast that asked for it', async () => {
      const pool = new WorkerPool(2);
      pool.spawn();
      const first = await pool.broadcast({ command: 'warm' });
      const second = await pool.broadcast({ command: 'tick', fraction: 1 });
      expect([
        first.map((reply) => reply.echo.command),
        second.map((reply) => reply.echo.command),
      ]).toStrictEqual([
        ['warm', 'warm'],
        ['tick', 'tick'],
      ]);
    });

    it('listens for the reply before it posts the message', async () => {
      const pool = new WorkerPool(1);
      pool.spawn();
      const [worker] = RecordingWorker.instances;
      let listenerWhenPosted = null;
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (message) => {
        listenerWhenPosted = typeof worker.onmessage;
        post(message);
      };
      await pool.broadcast({ command: 'warm' });
      expect(listenerWhenPosted).toBe('function');
    });
  });
});
