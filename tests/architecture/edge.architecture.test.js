import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EdgeSource } from '../support/edge-source.js';

/** The two Workers, and the script that composes the replay page in the browser, as main.js composes the site. */
const ENTRIES = ['panel/index.js', 'src/index.js'];
const BOOT = 'panel/browser/replay-start.js';
const MODULES = EdgeSource.modules();
const CLASSES = MODULES.filter((path) => !ENTRIES.includes(path) && path !== BOOT);
const pascalCase = (name) =>
  name
    .replace(/\.js$/, '')
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

describe('the Workers of edge/', () => {
  it('names every module in kebab-case, and no two alike apart from the entries, which their folder tells apart', () => {
    const names = MODULES.map((path) => basename(path));
    const tested = [...CLASSES, BOOT].map((path) => basename(path));
    expect([
      names.filter((name) => !/^[a-z0-9]+(-[a-z0-9]+)*\.js$/.test(name)),
      tested.filter((name, index) => tested.indexOf(name) !== index),
    ]).toStrictEqual([[], []]);
  });

  it('exports one class from each module, named after its file; only the entries export a Worker', () => {
    expect(
      CLASSES.map((path) => [
        path,
        [
          ...EdgeSource.read(path).matchAll(/^export (?:class|const|function|default) ?(\w*)/gm),
        ].map(([, name]) => name),
      ]),
    ).toStrictEqual(CLASSES.map((path) => [path, [pascalCase(basename(path))]]));
  });

  it('runs nothing when a module loads: at the top level there are only imports, constants and classes', () => {
    const loose = MODULES.filter((path) => path !== BOOT).flatMap((path) =>
      EdgeSource.read(path)
        .replace(/`[^`]*`/g, '``') // the lines of a template literal are text, not statements
        .split('\n')
        .filter((line) => /^[a-z]/i.test(line))
        .filter(
          (line) =>
            !/^(import |export (class|default \{)|class |const [A-Z_]+ =|const [A-Z_]+ =$|\})/.test(
              line,
            ),
        )
        .map((line) => [path, line]),
    );
    expect(loose).toStrictEqual([]);
  });

  it('imports only its own modules, the three packages of the readings, and in the panel the reading classes of the collector', () => {
    expect(
      MODULES.flatMap((path) =>
        EdgeSource.importsOf(path)
          .filter((specifier) => !/^\.\/[a-z0-9-]+\.js$/.test(specifier))
          .map((specifier) => [path, specifier]),
      ),
    ).toStrictEqual([
      ['panel/events-page.js', '../src/report-vocabulary.js'],
      ['panel/heat-map-page.js', '../src/report-vocabulary.js'],
      ['panel/index.js', '../src/reading-queries.js'],
      ['panel/index.js', './browser/panel.css'],
      ['panel/index.js', './browser/replay-player.js'],
      ['panel/index.js', './browser/replay-start.js'],
      ['panel/index.js', './vendor/rrweb-replay.js'],
      ['panel/index.js', './vendor/rrweb-replay.css'],
      ['panel/lab-page.js', '../src/reading-queries.js'],
      ['panel/overview-page.js', '../src/calendar.js'],
      ['panel/panel-query.js', '../src/calendar.js'],
      ['panel/panel-query.js', '../src/reading-inputs.js'],
      ['panel/recordings-page.js', '../src/reading-queries.js'],
      ['panel/recordings-page.js', '../src/report-vocabulary.js'],
      ['panel/replay-page.js', '../src/recording-store.js'],
      ['panel/replay-page.js', '../src/session-chunk.js'],
      ['panel/vitals-page.js', '../src/reading-inputs.js'],
      ['panel/vitals-page.js', '../src/report-vocabulary.js'],
      ['src/index.js', '@cloudflare/workers-oauth-provider'],
      ['src/reading-handler.js', '@modelcontextprotocol/server'],
      ['src/reading-inputs.js', 'zod'],
      ['src/reading-server.js', '@modelcontextprotocol/server'],
    ]);
  });

  it('gives the panel its bindings only through ReadOnlyBindings, and the collector imports nothing of the panel', () => {
    const entry = EdgeSource.read('panel/index.js');
    expect([
      [...entry.matchAll(/env\.(DB|REPORTS)\b/g)].map(([found]) => found),
      [...entry.matchAll(/ReadOnlyBindings\.(\w+)\(env\.(\w+)\)/g)].map(([, kind, name]) => [
        kind,
        name,
      ]),
      MODULES.filter((path) => path.startsWith('src/')).filter((path) =>
        EdgeSource.importsOf(path).some((specifier) => specifier.includes('panel')),
      ),
    ]).toStrictEqual([
      ['env.DB', 'env.REPORTS'],
      [
        ['database', 'DB'],
        ['bucket', 'REPORTS'],
      ],
      [],
    ]);
  });

  it('keeps a test for each module, beside the others in tests/edge, except the entries that the Worker tests cover', () => {
    expect(
      CLASSES.filter(
        (path) =>
          !existsSync(
            join(
              import.meta.dirname,
              '..',
              'edge',
              basename(path).replace(/\.js$/, '.edge.test.js'),
            ),
          ),
      ),
    ).toStrictEqual([]);
  });
});
