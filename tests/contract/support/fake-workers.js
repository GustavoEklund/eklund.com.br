import { vi } from 'vitest';

/** Stands in for the browser's Worker: records every call in one shared log and delivers replies asynchronously, like postMessage does. */
export class RecordingWorker {
  static instances = [];
  static log = [];

  index;
  onmessage = null;
  terminated = false;

  static reset() {
    RecordingWorker.instances = [];
    RecordingWorker.log = [];
  }

  constructor(url, options) {
    this.index = RecordingWorker.instances.length;
    RecordingWorker.instances.push(this);
    RecordingWorker.log.push({ worker: this.index, call: 'new', url: url.href, options });
  }

  postMessage(message) {
    RecordingWorker.log.push({ worker: this.index, call: 'postMessage', message });
    this.respond(structuredClone(message));
  }

  terminate() {
    this.terminated = true;
    RecordingWorker.log.push({ worker: this.index, call: 'terminate' });
  }

  deliver(data, delay = 0) {
    setTimeout(() => this.onmessage?.({ data }), delay);
  }

  respond() {
    throw new Error('respond() is implemented by the subclasses');
  }
}

/** Answers from a function, optionally late, to test how a consumer copes without involving the real worker. */
export class ScriptedWorker extends RecordingWorker {
  static script = () => ({});
  static delays = [];

  respond(message) {
    this.deliver(
      ScriptedWorker.script(this.index, message),
      ScriptedWorker.delays[this.index] ?? 0,
    );
  }
}

/** Runs the real pix-engine.worker.js in this process, one module instance per worker, and answers like the browser would: replies are cloned and their transfer list moves the buffers. */
export class ShellWorker extends RecordingWorker {
  static handlers = [];
  static replies = [];
  static #active = null;

  /** Imports the worker script `count` times; each import is a separate engine with its own onmessage. */
  static async prepare(count) {
    ShellWorker.handlers = [];
    ShellWorker.replies = [];
    vi.stubGlobal('onmessage', null);
    vi.stubGlobal('postMessage', (data, transfer = []) =>
      ShellWorker.#active.receive(data, transfer),
    );
    for (let copy = 0; copy < count; copy++) {
      vi.resetModules();
      await import('@site/js/load-test/pix-engine.worker.js');
      ShellWorker.handlers.push(globalThis.onmessage);
    }
  }

  #handler;

  constructor(url, options) {
    super(url, options);
    this.#handler = ShellWorker.handlers[this.index];
  }

  respond(message) {
    ShellWorker.#active = this;
    try {
      this.#handler({ data: message });
    } finally {
      ShellWorker.#active = null;
    }
  }

  receive(data, transfer) {
    ShellWorker.replies.push({
      worker: this.index,
      keys: Object.keys(data),
      transferredByteLengths: transfer.map((buffer) => buffer.byteLength),
      transfersTheDurationsBuffer: transfer.length === 1 && transfer[0] === data.durations?.buffer,
      durationsView: data.durations
        ? {
            length: data.durations.length,
            byteOffset: data.durations.byteOffset,
            bufferByteLength: data.durations.buffer.byteLength,
          }
        : null,
    });
    this.deliver(structuredClone(data, { transfer }));
  }
}
