import { createTestHarness } from 'wrangler';

/** The Worker of edge/, run by wrangler in workerd with a local D1 that starts empty for every test. */
export class EdgeWorker {
  static ORIGIN = 'https://eklund.com.br';
  static MIRROR = 'https://gustavo.eklund.com.br';
  /** The time it takes workerd to start on a slow CI machine. */
  static START_TIMEOUT_MS = 60_000;

  #server;
  #worker;

  constructor() {
    this.#server = createTestHarness({
      workers: [
        {
          configPath: new URL('../../edge/wrangler.jsonc', import.meta.url),
          vars: { ORIGINS: `${EdgeWorker.ORIGIN} ${EdgeWorker.MIRROR}` },
        },
      ],
    });
    this.#worker = this.#server.getWorker('eklund');
  }

  async start() {
    await this.#server.listen();
  }

  /** Empties the storage and applies the migrations again. */
  async reset() {
    await this.#server.reset();
    await this.#worker.applyD1Migrations('DB');
  }

  async stop() {
    await this.#server.close();
  }

  fetch(path, init = {}) {
    return this.#worker.fetch(`https://eklund.example.workers.dev${path}`, init);
  }

  /** A report as a page would send it: a plain-text POST from the site's origin, by a phone in Brazil. */
  send(report, headers = {}, cf = { country: 'BR' }) {
    return this.fetch('/v1/page', {
      method: 'POST',
      body: typeof report === 'string' ? report : JSON.stringify(report),
      cf,
      headers: {
        origin: EdgeWorker.ORIGIN,
        'content-type': 'text/plain;charset=UTF-8',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        ...headers,
      },
    });
  }

  scheduled(scheduledTime) {
    return this.#worker.scheduled({ cron: '17 6 * * *', scheduledTime });
  }

  async database() {
    return (await this.#worker.getEnv()).DB;
  }

  /** Every row of a query, in the order the query gives them. */
  async rows(sql, ...values) {
    const database = await this.database();
    return (
      await database
        .prepare(sql)
        .bind(...values)
        .all()
    ).results;
  }
}
