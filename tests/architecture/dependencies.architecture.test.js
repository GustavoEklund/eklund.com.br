import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SiteSource } from '../support/site-source.js';

const PROJECT = join(import.meta.dirname, '..', '..');
const BIN = join(PROJECT, 'node_modules', '.bin', 'depcruise');
const CONFIG = join(PROJECT, '.dependency-cruiser.cjs');

/** Runs dependency-cruiser over `source` in a working directory and returns [rule, from, to] for every violation, sorted. */
class Cruiser {
  static run(cwd) {
    const run = spawnSync(BIN, ['source', '--config', CONFIG, '--output-type', 'json'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const { summary } = JSON.parse(run.stdout);
    return {
      cruised: summary.totalCruised,
      dependencies: summary.totalDependenciesCruised,
      violations: summary.violations
        .map(({ rule, from, to }) => [rule.name, from, to])
        .sort((a, b) => a.join().localeCompare(b.join())),
    };
  }
}

describe('the real site', () => {
  it('cruises every module of the site, imports nothing it should not, and breaks none of the rules', () => {
    const modules = SiteSource.files('js').filter(
      (file) => !file.endsWith('land-bitset.js'),
    ).length;
    const { cruised, violations } = Cruiser.run(PROJECT);
    expect([cruised, violations]).toStrictEqual([modules, []]);
  });
});

describe('each rule catches what it is for', () => {
  let directory;
  const write = (path, content) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  const MAIN =
    "import { Cursor } from './cursor/cursor.js';\nimport { Marquee } from './marquee/marquee.js';\nimport { Locale } from './i18n/locale.js';\nexport class App { parts = [Cursor, Marquee, Locale]; }\n";
  /** A tiny valid site: main imports three parts, the feature and i18n import shared. */
  const baseline = () => {
    write('source/js/main.js', MAIN);
    write(
      'source/js/cursor/cursor.js',
      "import { Dom } from '../shared/dom.js';\nexport class Cursor { dom = Dom; }\n",
    );
    write('source/js/shared/dom.js', 'export class Dom {}\n');
    write('source/js/marquee/marquee.js', 'export class Marquee {}\n');
    write(
      'source/js/i18n/locale.js',
      "import { Dom } from '../shared/dom.js';\nexport class Locale { dom = Dom; }\n",
    );
  };
  const imports = (file, line) => write(file, `${line}\nexport class Changed {}\n`);
  const violationsOf = (rule) =>
    Cruiser.run(directory).violations.filter(([name]) => name === rule);

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'depcruise-rules-'));
    baseline();
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('passes a clean tree', () => {
    write('source/js/hero/hero.js', 'export class Hero {}\n');
    write(
      'source/js/main.js',
      MAIN.replace(
        'export class App',
        "import { Hero } from './hero/hero.js';\nexport class App",
      ).replace('[Cursor,', '[Hero, Cursor,'),
    );
    expect(Cruiser.run(directory)).toStrictEqual({ cruised: 6, dependencies: 6, violations: [] });
  });

  it('forbids one feature importing another', () => {
    imports('source/js/cursor/cursor.js', "import { Marquee } from '../marquee/marquee.js';");
    expect(violationsOf('no-feature-to-feature')).toStrictEqual([
      ['no-feature-to-feature', 'source/js/cursor/cursor.js', 'source/js/marquee/marquee.js'],
    ]);
  });

  it('forbids shared/ reaching into a feature', () => {
    imports('source/js/shared/dom.js', "import { Marquee } from '../marquee/marquee.js';");
    expect(violationsOf('shared-stays-low-level')).toStrictEqual([
      ['shared-stays-low-level', 'source/js/shared/dom.js', 'source/js/marquee/marquee.js'],
    ]);
  });

  it('forbids i18n/ reaching into a feature', () => {
    imports('source/js/i18n/locale.js', "import { Marquee } from '../marquee/marquee.js';");
    expect(violationsOf('i18n-stays-low-level')).toStrictEqual([
      ['i18n-stays-low-level', 'source/js/i18n/locale.js', 'source/js/marquee/marquee.js'],
    ]);
  });

  it('forbids anything but the browser importing main.js', () => {
    imports('source/js/shared/dom.js', "import { App } from '../main.js';");
    expect(violationsOf('nothing-imports-main')).toStrictEqual([
      ['nothing-imports-main', 'source/js/shared/dom.js', 'source/js/main.js'],
    ]);
  });

  it('forbids a loop between two modules, reporting it once', () => {
    write('source/js/shared/a.js', "import { B } from './b.js';\nexport class A { b = B; }\n");
    write('source/js/shared/b.js', "import { A } from './a.js';\nexport class B { a = A; }\n");
    write('source/js/shared/dom.js', "import { A } from './a.js';\nexport class Dom { a = A; }\n");
    expect(violationsOf('no-circular')).toStrictEqual([
      ['no-circular', 'source/js/shared/a.js', 'source/js/shared/b.js'],
    ]);
  });

  it('forbids runtime dependencies, Node built-ins included', () => {
    imports('source/js/shared/dom.js', "import { readFileSync } from 'node:fs';");
    expect(violationsOf('no-dependencies')).toStrictEqual([
      ['no-dependencies', 'source/js/shared/dom.js', 'fs'],
    ]);
  });

  it('forbids a module nobody imports', () => {
    write('source/js/hero/orphan.js', 'export class Orphan {}\n');
    expect(violationsOf('no-orphans')).toStrictEqual([
      ['no-orphans', 'source/js/hero/orphan.js', 'source/js/hero/orphan.js'],
    ]);
  });

  it('lets the worker stand alone, since the page starts it by URL', () => {
    write('source/js/load-test/pix-engine.worker.js', 'onmessage = () => {};\n');
    expect(violationsOf('no-orphans')).toStrictEqual([]);
  });

  it('forbids the site importing from tests/', () => {
    write('tests/helper.js', 'export class Helper {}\n');
    imports('source/js/shared/dom.js', "import { Helper } from '../../../tests/helper.js';");
    expect(violationsOf('tests-not-in-source')).toStrictEqual([
      ['tests-not-in-source', 'source/js/shared/dom.js', 'tests/helper.js'],
    ]);
  });
});
