import { describe, it, expect } from 'vitest';
import { basename } from 'node:path';
import { SiteSource } from '../support/site-source.js';

/** The modules of the site that follow the code conventions: no dictionaries, no generated land data. */
const MODULES = SiteSource.files('js').filter(
  (file) => !file.includes('locales/') && !file.endsWith('land-bitset.js'),
);
const linesOf = (file) => SiteSource.read(file).split('\n');
/** [file, what matched] for every line that matches: the first capture group when the pattern has one, else the whole match. */
const matches = (pattern, files = MODULES) =>
  files.flatMap((file) =>
    linesOf(file).flatMap((line) => {
      const found = pattern.exec(line);
      return found ? [[file, found.slice(1).find((group) => group !== undefined) ?? found[0]]] : [];
    }),
  );
const exportedClasses = (file) =>
  [...SiteSource.read(file).matchAll(/^export class (\w+)/gm)].map(([, name]) => name);
const pascalCase = (fileName) =>
  fileName
    .replace(/\.worker$/, '')
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

describe('the layout of the site', () => {
  it('has one folder per feature, named after what it does, and no generic bucket', () => {
    expect(
      SiteSource.files('js')
        .map((file) => file.split('/')[1])
        .filter((part, index, parts) => part !== 'main.js' && parts.indexOf(part) === index),
    ).toStrictEqual([
      'accessibility',
      'architecture-map',
      'command-palette',
      'contact',
      'cursor',
      'dashboard',
      'globe',
      'hero',
      'history',
      'i18n',
      'load-test',
      'marquee',
      'navigation',
      'scrollbar',
      'shared',
      'status-page',
      'theme',
      'trace-viewer',
    ]);
  });

  it('names every module in kebab-case', () => {
    expect(
      MODULES.map((file) => basename(file)).filter(
        (name) => !/^[a-z0-9]+(-[a-z0-9]+)*(\.worker)?\.js$/.test(name),
      ),
    ).toStrictEqual([]);
  });

  // Ad blockers match request paths, and their lists carry rules such as /performance-metrics.js. These words are the ones
  // such rules are made of, so no file of the site may use them. `pnpm run adblock` checks the real lists.
  it('keeps tracker vocabulary out of every file name, because blockers match them by path', () => {
    const risky = [
      'ad',
      'ads',
      'advert',
      'analytics',
      'banner',
      'beacon',
      'collect',
      'metrics',
      'perf',
      'performance',
      'pixel',
      'stats',
      'statistics',
      'telemetry',
      'tracker',
      'tracking',
    ];
    const files = [
      'index.html',
      ...SiteSource.files('js'),
      ...SiteSource.files('css'),
      ...SiteSource.files('assets'),
    ];
    expect(
      files.filter((file) =>
        file.split(/[/.\-_]/).some((word) => risky.includes(word.toLowerCase())),
      ),
    ).toStrictEqual([]);
  });

  it('wraps the styles of every CSS file in a cascade layer', () => {
    expect(
      SiteSource.files('css').filter((file) => !/@layer/.test(SiteSource.read(file))),
    ).toStrictEqual([]);
  });
});

describe('everything is a class', () => {
  it('has no helper left outside a class', () => {
    expect(
      matches(
        /^(?:export )?(?:async )?function\s+(\w+)|^(?:export )?const ([A-Za-z0-9_]+) = (?:async )?(?:\([^)]*\)|[A-Za-z0-9_]+) =>/,
      ),
    ).toStrictEqual([]);
  });

  it('runs nothing when a module loads, except the worker shell that answers messages', () => {
    const calls = matches(
      /^[a-zA-Z_$][\w$.]*\(|^(addEventListener|onmessage)/,
      MODULES.filter((file) => !file.endsWith('shaders.js')),
    );
    expect(calls).toStrictEqual([['js/load-test/pix-engine.worker.js', 'onmessage']]);
  });

  it('has a class in every module except main.js and the worker shell', () => {
    expect(MODULES.filter((file) => exportedClasses(file).length === 0)).toStrictEqual([
      'js/load-test/pix-engine.worker.js',
      'js/main.js',
    ]);
  });

  it('names the class after the file when a file holds just one, apart from four that are longer on purpose', () => {
    const mismatched = MODULES.filter(
      (file) =>
        exportedClasses(file).length === 1 &&
        exportedClasses(file)[0] !== pascalCase(basename(file, '.js')),
    ).map((file) => [file, exportedClasses(file)[0]]);
    expect(mismatched).toStrictEqual([
      ['js/globe/geometry.js', 'GlobeGeometry'],
      ['js/globe/shaders.js', 'GlobeShaders'],
      ['js/shared/format.js', 'Formatter'],
      ['js/shared/storage.js', 'Preferences'],
    ]);
  });

  it('keeps several classes in a file only where they belong together', () => {
    expect(
      MODULES.filter((file) => exportedClasses(file).length > 1).map((file) => [
        file,
        exportedClasses(file),
      ]),
    ).toStrictEqual([
      ['js/dashboard/panels.js', ['LinePanel', 'UptimeStrip', 'HourlyTable']],
      ['js/globe/globe-controls.js', ['Scrubber', 'GlobeControls']],
      ['js/globe/shader-dialog.js', ['GlslHighlighter', 'ShaderDialog']],
      ['js/globe/webgl.js', ['WebGlProgram', 'VertexArray']],
      ['js/shared/math.js', ['Numbers', 'SeededRandom']],
      ['js/shared/svg-chart.js', ['ChartScales', 'SvgPaths']],
      [
        'js/status-page/health-checks.js',
        [
          'HealthCheck',
          'DocumentCheck',
          'FontsCheck',
          'GlobeCheck',
          'MainThreadCheck',
          'LayoutShiftCheck',
          'DependenciesCheck',
          'PlatformCheck',
          'ContrastCheck',
          'HealthChecks',
        ],
      ],
    ]);
  });
});

describe('language and formatting live in one place', () => {
  it('uses Intl only in the Formatter and in i18n/', () => {
    expect([...new Set(matches(/Intl\.|toLocale/).map(([file]) => file))]).toStrictEqual([
      'js/i18n/translator.js',
      'js/shared/format.js',
    ]);
  });

  it('writes locale tags only in i18n/', () => {
    expect([
      ...new Set(matches(/'pt-BR'|'en-US'|"pt-BR"|"en-US"/).map(([file]) => file)),
    ]).toStrictEqual(['js/i18n/dictionaries.js', 'js/i18n/locale.js']);
  });

  it('keeps Portuguese out of the code, apart from city names and the titles of Banco Central documents', () => {
    expect(MODULES.filter((file) => /[áàâãéêíóôõúç]/.test(SiteSource.read(file)))).toStrictEqual([
      'js/architecture-map/diagram.js',
      'js/globe/destinations.js',
    ]);
  });

  it('speaks through the console in one place only: the warning for a missing translation', () => {
    expect(matches(/console\.\w+/)).toStrictEqual([['js/i18n/translator.js', 'console.warn']]);
  });

  it('leaves no debugger, no TODO and no FIXME behind', () => {
    expect(matches(/\bdebugger\b|\bTODO\b|\bFIXME\b/)).toStrictEqual([]);
  });
});
