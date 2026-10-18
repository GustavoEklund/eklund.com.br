// Runs Stryker once per module listed in stryker.config.mjs, so every module has its own report and a slow one cannot starve the rest.
// Each run only starts the tests that import the module (`vitest related`), which keeps a mutant to a couple of seconds.
// usage: node tools/mutation.mjs [part-of-a-module-path ...]    reports: reports/mutation/<module>.html and .json
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPORTS = join(PROJECT, 'reports', 'mutation');
const COUNTED = ['Killed', 'Timeout', 'Survived', 'NoCoverage'];

class ModuleMutation {
  #file;
  #base;
  #directory;

  constructor(file, base, directory) {
    this.#file = file;
    this.#base = base;
    this.#directory = directory;
  }

  get name() {
    return basename(this.#file, '.js');
  }

  run() {
    const configPath = join(this.#directory, `${this.name}.stryker.config.mjs`);
    const config = {
      ...this.#base,
      mutate: [this.#file],
      commandRunner: {
        command: `pnpm exec vitest related ${this.#file} --run --config vitest.mutation.config.js --bail 1`,
      },
      reporters: ['clear-text', 'json', 'html'],
      jsonReporter: { fileName: `reports/mutation/${this.name}.json` },
      htmlReporter: { fileName: `reports/mutation/${this.name}.html` },
      thresholds: { high: 90, low: 75, break: null },
    };
    writeFileSync(configPath, `export default ${JSON.stringify(config)};\n`);
    const run = spawnSync('pnpm', ['exec', 'stryker', 'run', configPath], {
      cwd: PROJECT,
      stdio: 'inherit',
    });
    return run.status === 0 ? this.#tally() : null;
  }

  #tally() {
    const report = JSON.parse(readFileSync(join(REPORTS, `${this.name}.json`), 'utf8'));
    const counts = Object.fromEntries(COUNTED.map((status) => [status, 0]));
    for (const { mutants } of Object.values(report.files))
      for (const { status } of mutants) if (status in counts) counts[status]++;
    return { module: this.#file, ...counts, score: ModuleMutation.score(counts) };
  }

  static score(counts) {
    const total = COUNTED.reduce((sum, status) => sum + counts[status], 0);
    return total === 0 ? 100 : Math.round(((counts.Killed + counts.Timeout) / total) * 10000) / 100;
  }
}

const { default: base } = await import(pathToFileURL(join(PROJECT, 'stryker.config.mjs')));
const filters = process.argv.slice(2);
const files = base.mutate.filter(
  (file) => filters.length === 0 || filters.some((part) => file.includes(part)),
);
mkdirSync(REPORTS, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'mutation-'));
const results = files.map((file) => new ModuleMutation(file, base, directory).run());
rmSync(directory, { recursive: true, force: true });

const failed = files.filter((_, index) => results[index] === null);
const table = results.filter(Boolean);
console.log('\nmodule'.padEnd(52) + 'killed  timeout  survived  no coverage  score');
for (const row of table)
  console.log(
    row.module.padEnd(51) +
      [row.Killed, row.Timeout, row.Survived, row.NoCoverage]
        .map((value) => String(value).padStart(7))
        .join(' ') +
      `${String(row.score).padStart(8)}%`,
  );
const sum = (status) => table.reduce((total, row) => total + row[status], 0);
const overall = ModuleMutation.score(
  Object.fromEntries(COUNTED.map((status) => [status, sum(status)])),
);
console.log(
  `\noverall ${overall}%  (${failed.length ? `run failed for: ${failed.join(', ')}` : 'every module ran'})`,
);
process.exit(failed.length || overall < base.thresholds.break ? 1 : 0);
