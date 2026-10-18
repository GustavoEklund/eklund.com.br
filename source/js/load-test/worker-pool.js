/** Owns the engine workers and turns their postMessage protocol into promises. */
export class WorkerPool {
  #size;
  #workers = [];

  constructor(size) {
    this.#size = size;
  }

  get size() {
    return this.#size;
  }

  spawn() {
    this.terminate();
    this.#workers = Array.from(
      { length: this.#size },
      () => new Worker(new URL('./pix-engine.worker.js', import.meta.url), { type: 'module' }),
    );
  }

  terminate() {
    for (const worker of this.#workers) worker.terminate();
    this.#workers = [];
  }

  /** Sends one message to every worker and resolves with every reply. */
  broadcast(message) {
    return Promise.all(
      this.#workers.map(
        (worker) =>
          new Promise((resolve) => {
            worker.onmessage = (event) => resolve(event.data);
            worker.postMessage(message);
          }),
      ),
    );
  }
}
