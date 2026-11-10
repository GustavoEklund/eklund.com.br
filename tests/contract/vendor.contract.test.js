import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteSource } from '../support/site-source.js';

const PROJECT = join(import.meta.dirname, '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8'));
const installed = (path) => readFileSync(join(PROJECT, 'node_modules', path));

/**
 * source/js/vendor/ holds the libraries the browser runs (0011), each a copy of its npm file, because source/ runs without a
 * build. The copy moves only with the version pinned in package.json, so Dependabot, the release age and the trust policy of
 * 0007 still choose it. After an update: cp node_modules/web-vitals/dist/web-vitals.attribution.js{,.map} source/js/vendor/
 */
const COPIES = [
  ['js/vendor/web-vitals.attribution.js', 'web-vitals/dist/web-vitals.attribution.js'],
  ['js/vendor/web-vitals.attribution.js.map', 'web-vitals/dist/web-vitals.attribution.js.map'],
  ['js/vendor/web-vitals-LICENSE.txt', 'web-vitals/LICENSE'],
];

describe('the libraries in source/js/vendor', () => {
  it('are the only files there', () => {
    expect(SiteSource.files('js/vendor')).toStrictEqual(COPIES.map(([copy]) => copy).sort());
  });

  it('are byte for byte the files of the version that package.json pins', () => {
    expect(
      COPIES.map(([copy, original]) => [copy, SiteSource.bytes(copy).equals(installed(original))]),
    ).toStrictEqual(COPIES.map(([copy]) => [copy, true]));
  });

  it('come from an exact version, a runtime dependency, which is the one installed', () => {
    const { version } = JSON.parse(installed('web-vitals/package.json').toString('utf8'));
    expect([MANIFEST.dependencies['web-vitals'], /^\d+\.\d+\.\d+$/.test(version)]).toStrictEqual([
      version,
      true,
    ]);
  });

  it('are the attribution build of web-vitals 6, under the Apache License 2.0', () => {
    const { license } = JSON.parse(installed('web-vitals/package.json').toString('utf8'));
    expect([MANIFEST.dependencies['web-vitals'].split('.')[0], license]).toStrictEqual([
      '6',
      'Apache-2.0',
    ]);
  });
});
