import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EdgeSource } from '../support/edge-source.js';

const ENTRY = 'src/index.js';
const MODULES = EdgeSource.modules();
const CLASSES = MODULES.filter((path) => path !== ENTRY);
const pascalCase = (name) =>
  name
    .replace(/\.js$/, '')
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

describe('the collector of edge/', () => {
  it('names every module in kebab-case', () => {
    expect(
      MODULES.map((path) => basename(path)).filter(
        (name) => !/^[a-z0-9]+(-[a-z0-9]+)*\.js$/.test(name),
      ),
    ).toStrictEqual([]);
  });

  it('exports one class from each module, named after its file; only the entry exports the Worker', () => {
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
    const loose = MODULES.flatMap((path) =>
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

  it('imports only its own modules: nothing from the site, the tools or a package', () => {
    expect(
      MODULES.flatMap((path) =>
        EdgeSource.importsOf(path)
          .filter((specifier) => !/^\.\/[a-z0-9-]+\.js$/.test(specifier))
          .map((specifier) => [path, specifier]),
      ),
    ).toStrictEqual([]);
  });

  it('keeps a test for each module, beside the others in tests/edge, except the entry that the Worker tests cover', () => {
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
