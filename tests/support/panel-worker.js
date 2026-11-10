import { createTestHarness } from 'wrangler';

/** The panel of edge/, run by wrangler in workerd with a local D1 and R2 that start empty for every test. */
export class PanelWorker {
  static ORIGIN = 'https://eklund-panel.example.workers.dev';
  static START_TIMEOUT_MS = 60_000;

  #server;
  #worker;

  /** `vars` override the variables of edge/panel.wrangler.jsonc, such as the team of FakeAccess. */
  constructor(vars = {}) {
    this.#server = createTestHarness({
      workers: [{ configPath: new URL('../../edge/panel.wrangler.jsonc', import.meta.url), vars }],
    });
    this.#worker = this.#server.getWorker('eklund-panel');
  }

  async start() {
    await this.#server.listen();
  }

  /** Empties the storage and applies the collector's migrations, which the panel only reads. */
  async reset() {
    await this.#server.reset();
    await this.#worker.applyD1Migrations('DB');
  }

  async stop() {
    await this.#server.close();
  }

  /** A request as Access forwards it, with `token` in Cf-Access-Jwt-Assertion when there is one. */
  fetch(path, { token = null, ...init } = {}) {
    return this.#worker.fetch(`${PanelWorker.ORIGIN}${path}`, {
      ...init,
      headers: { ...(token ? { 'cf-access-jwt-assertion': token } : {}), ...init.headers },
    });
  }

  async database() {
    return (await this.#worker.getEnv()).DB;
  }

  async reports() {
    return (await this.#worker.getEnv()).REPORTS;
  }
}
