import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SiteSource } from '../support/site-source.js';

const PROJECT = join(import.meta.dirname, '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8'));
const installed = (path) => readFileSync(join(PROJECT, 'node_modules', path));

/**
 * source/js/vendor/ holds the libraries the browser runs (0011), each a copy of its npm file, because source/ runs without a
 * build. The copy moves only with the version pinned in package.json, so Dependabot, the release age and the trust policy of
 * 0007 still choose it. After an update: cp node_modules/web-vitals/dist/web-vitals.attribution.js{,.map} source/js/vendor/
 * and cp node_modules/@rrweb/record/dist/record.js{,.map} source/js/vendor/
 */
const COPIES = [
  ['js/vendor/record.js', '@rrweb/record/dist/record.js'],
  ['js/vendor/record.js.map', '@rrweb/record/dist/record.js.map'],
  ['js/vendor/web-vitals.attribution.js', 'web-vitals/dist/web-vitals.attribution.js'],
  ['js/vendor/web-vitals.attribution.js.map', 'web-vitals/dist/web-vitals.attribution.js.map'],
  ['js/vendor/web-vitals-LICENSE.txt', 'web-vitals/LICENSE'],
];
/**
 * @rrweb/record ships without its license text, so the copy beside it is the LICENSE of rrweb's repository at the tag of the
 * pinned version (https://github.com/rrweb-io/rrweb/blob/@rrweb/record@2.2.1/LICENSE).
 */
const RRWEB_LICENSE = 'js/vendor/rrweb-LICENSE.txt';
const PACKAGES = ['@rrweb/record', 'web-vitals'];

describe('the libraries in source/js/vendor', () => {
  it('are the only files there', () => {
    expect(SiteSource.files('js/vendor')).toStrictEqual(
      [...COPIES.map(([copy]) => copy), RRWEB_LICENSE].sort(),
    );
  });

  it('are byte for byte the files of the version that package.json pins', () => {
    expect(
      COPIES.map(([copy, original]) => [copy, SiteSource.bytes(copy).equals(installed(original))]),
    ).toStrictEqual(COPIES.map(([copy]) => [copy, true]));
  });

  it('come from an exact version, a runtime dependency, which is the one installed', () => {
    expect(
      PACKAGES.map((name) => {
        const { version } = JSON.parse(installed(`${name}/package.json`).toString('utf8'));
        return [name, MANIFEST.dependencies[name] === version, /^\d+\.\d+\.\d+$/.test(version)];
      }),
    ).toStrictEqual(PACKAGES.map((name) => [name, true, true]));
  });

  it('are the attribution build of web-vitals 6, under the Apache License 2.0', () => {
    const { license } = JSON.parse(installed('web-vitals/package.json').toString('utf8'));
    expect([MANIFEST.dependencies['web-vitals'].split('.')[0], license]).toStrictEqual([
      '6',
      'Apache-2.0',
    ]);
  });

  it('are the recorder of rrweb 2, under the MIT License, whose text is beside it', () => {
    const { license } = JSON.parse(installed('@rrweb/record/package.json').toString('utf8'));
    const text = SiteSource.read(RRWEB_LICENSE).split('\n');
    expect([
      MANIFEST.dependencies['@rrweb/record'].split('.')[0],
      license,
      text.slice(0, 3),
      text.length,
    ]).toStrictEqual([
      '2',
      'MIT',
      [
        'MIT License',
        '',
        'Copyright (c) 2018 Contributors (https://github.com/rrweb-io/rrweb/graphs/contributors)',
      ],
      22,
    ]);
  });
});

/**
 * edge/panel/vendor/ holds rrweb's replayer, which only the owner's panel serves, after its check of the Access token
 * (docs/decisions/0015-the-panel-behind-cloudflare-access.md); the site never loads it. The Worker imports it as text, so it
 * is a copy of npm's file, pinned like the site's. After an update: cp node_modules/@rrweb/replay/dist/replay.js
 * edge/panel/vendor/rrweb-replay.js and cp node_modules/@rrweb/replay/dist/style.css edge/panel/vendor/rrweb-replay.css
 */
const PANEL = join(PROJECT, 'edge', 'panel', 'vendor');
const PANEL_COPIES = [
  ['rrweb-replay.js', '@rrweb/replay/dist/replay.js'],
  ['rrweb-replay.css', '@rrweb/replay/dist/style.css'],
];

describe("rrweb's replayer in edge/panel/vendor", () => {
  it('is the only thing there, with the license text of rrweb beside it, the same as the copy beside the recorder', () => {
    expect([
      readdirSync(PANEL).sort(),
      readFileSync(join(PANEL, 'rrweb-LICENSE.txt')).equals(SiteSource.bytes(RRWEB_LICENSE)),
    ]).toStrictEqual([['rrweb-LICENSE.txt', 'rrweb-replay.css', 'rrweb-replay.js'], true]);
  });

  it('is byte for byte the files of the version that package.json pins, the same version as the recorder', () => {
    const { version } = JSON.parse(installed('@rrweb/replay/package.json').toString('utf8'));
    expect([
      PANEL_COPIES.map(([copy, original]) => [
        copy,
        readFileSync(join(PANEL, copy)).equals(installed(original)),
      ]),
      MANIFEST.dependencies['@rrweb/replay'] === version,
      /^\d+\.\d+\.\d+$/.test(version),
      version === MANIFEST.dependencies['@rrweb/record'],
    ]).toStrictEqual([PANEL_COPIES.map(([copy]) => [copy, true]), true, true, true]);
  });
});
