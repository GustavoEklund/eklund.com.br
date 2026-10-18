import { readFileSync } from 'node:fs';

const LOAD_TEST = readFileSync(
  new URL('../../../source/js/load-test/load-test.js', import.meta.url),
  'utf8',
);
const WORKER_POOL = readFileSync(
  new URL('../../../source/js/load-test/worker-pool.js', import.meta.url),
  'utf8',
);
const WORKER_SHELL = readFileSync(
  new URL('../../../source/js/load-test/pix-engine.worker.js', import.meta.url),
  'utf8',
);

const firstSightings = (text, pattern) => [
  ...new Set([...text.matchAll(pattern)].map((match) => match[1])),
];

/** What the consumer code (LoadTest, WorkerPool) reads from and sends to the worker, found by scanning the source, so a new field or command fails the contract tests until the schemas follow. */
export class ConsumerFields {
  static get commandsSent() {
    return firstSightings(LOAD_TEST, /command: '(\w+)'/g);
  }

  static get warmReplyFields() {
    return firstSightings(LOAD_TEST, /budgets\.reduce\(\(sum, \{ (\w+) \}\)/g);
  }

  static get tickReplyFields() {
    return firstSightings(LOAD_TEST, /\breply\.(\w+)/g);
  }

  static get finalReportFields() {
    return firstSightings(LOAD_TEST, /\breport\.(\w+)/g);
  }

  /** [relative path of the worker script, worker type] exactly as WorkerPool passes them to `new Worker`. */
  static get workerScript() {
    const [, path, type] = WORKER_POOL.match(
      /new Worker\(new URL\('([^']+)', import\.meta\.url\), \{ type: '(\w+)' \}\)/,
    );
    return [path, type];
  }

  static get commandsHandledByTheWorker() {
    return firstSightings(WORKER_SHELL, /data\.command === '(\w+)'/g);
  }
}
