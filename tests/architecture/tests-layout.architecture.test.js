import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EdgeSource } from '../support/edge-source.js';
import { SiteSource } from '../support/site-source.js';

const TESTS = join(import.meta.dirname, '..');
const filesUnder = (directory) =>
  readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
const ALL_TESTS = filesUnder(TESTS)
  .filter((path) => path.endsWith('.js'))
  .map((path) => relative(TESTS, path));
const SCANNED = ALL_TESTS.filter(
  (path) => path !== 'architecture/tests-layout.architecture.test.js',
); // its own samples are deliberately loose
const MIRRORED = ALL_TESTS.filter((path) => path.startsWith('js/'));

/** The text of each top-level argument of every `name(...)` call in a source text, with nested brackets kept whole. */
class CallArguments {
  static of(source, name) {
    const calls = [];
    for (const start of source.matchAll(new RegExp(`${name}\\(`, 'g'))) {
      const parts = [];
      let depth = 1,
        from = start.index + start[0].length,
        index = from;
      for (; index < source.length && depth > 0; index++) {
        const character = source[index];
        if ('([{'.includes(character)) depth++;
        else if (')]}'.includes(character)) depth--;
        else if (character === ',' && depth === 1) {
          parts.push(source.slice(from, index).trim());
          from = index + 1;
        }
      }
      const last = source.slice(from, index - 1).trim();
      if (last !== '') parts.push(last); // a trailing comma, as the formatter writes in a multi-line call, adds no argument
      calls.push(parts);
    }
    return calls;
  }
}

describe('how the tests are written', () => {
  it('uses no asymmetric matcher, which would accept any value of a kind', () => {
    const found = SCANNED.flatMap((path) =>
      [
        ...readFileSync(join(TESTS, path), 'utf8').matchAll(
          /expect\.(any|anything|stringContaining|objectContaining|arrayContaining|stringMatching)\(/g,
        ),
      ].map(([, matcher]) => [path, matcher]),
    );
    expect(found).toStrictEqual([]);
  });

  it('compares floating point results to at least ten digits', () => {
    const loose = SCANNED.flatMap((path) =>
      CallArguments.of(readFileSync(join(TESTS, path), 'utf8'), 'toBeCloseTo')
        .filter((args) => args.length !== 2 || !/^\d+$/.test(args[1]) || Number(args[1]) < 10)
        .map((args) => [path, args.join(', ')]),
    );
    expect(loose).toStrictEqual([]);
  });

  it('knows how to read a call with nested brackets', () => {
    expect(
      CallArguments.of(
        'a.toBeCloseTo(Math.exp(-.5), 12); b.toBeCloseTo([1, 2][0], 3)',
        'toBeCloseTo',
      ),
    ).toStrictEqual([
      ['Math.exp(-.5)', '12'],
      ['[1, 2][0]', '3'],
    ]);
  });

  it('reads a call that ends in a trailing comma as having the same arguments', () => {
    expect(
      CallArguments.of('a.toBeCloseTo(\n  (1 + 2) ** 2,\n  12,\n)', 'toBeCloseTo'),
    ).toStrictEqual([['(1 + 2) ** 2', '12']]);
  });
});

describe('where the tests live', () => {
  it('mirrors source/js: every test sits beside a module of the same name, in the same feature folder', () => {
    const orphans = MIRRORED.filter((path) => {
      const [, feature, file] = path.split('/');
      const module = file.replace(/\.(unit|property|component)\.test\.js$/, '.js');
      return (
        !/\.(unit|property|component)\.test\.js$/.test(file) ||
        !existsSync(join(SiteSource.root, 'js', feature, module))
      );
    });
    expect(orphans).toStrictEqual([]);
  });

  it('keeps a test for each module of the site, except these, which other suites cover', () => {
    const tested = new Set(
      MIRRORED.map((path) => {
        const [, feature, file] = path.split('/');
        return `js/${feature}/${file.replace(/\.(unit|property|component)\.test\.js$/, '.js')}`;
      }),
    );
    const untested = SiteSource.files('js').filter((file) => !tested.has(file));
    expect(untested).toStrictEqual([
      'js/globe/land-bitset.js',
      'js/i18n/dictionaries.js',
      'js/i18n/locales/en-us.js',
      'js/i18n/locales/pt-br.js',
      'js/load-test/pix-engine.worker.js',
      'js/main.js',
    ]);
  });

  it('mirrors edge/src: every test of tests/edge sits beside a module of the collector with the same name', () => {
    expect(
      ALL_TESTS.filter((path) => path.startsWith('edge/')).filter(
        (path) =>
          !path.endsWith('.edge.test.js') ||
          !existsSync(
            join(EdgeSource.root, 'src', path.slice(5).replace(/\.edge\.test\.js$/, '.js')),
          ),
      ),
    ).toStrictEqual([]);
  });

  it('puts end-to-end, BDD, build, contract, integration and architecture tests in their own folders', () => {
    expect([...new Set(ALL_TESTS.map((path) => path.split('/')[0]))].sort()).toStrictEqual([
      'architecture',
      'build',
      'contract',
      'e2e',
      'edge',
      'features',
      'integration',
      'js',
      'support',
    ]);
  });
});
