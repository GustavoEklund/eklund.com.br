import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { SiteSource, DictionaryLeaves } from '../support/site-source.js';
import { FontFaceRules } from './support/font-face-rules.js';

const FONTS_CSS = 'css/foundation/fonts.css';
const WOFF2_MAGIC = Buffer.from('wOF2');
const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const GREEK_RANGE = 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF';

const faces = FontFaceRules.parse(SiteSource.read(FONTS_CSS));
const webFaces = faces.filter((face) => face.src.some((source) => source.url));
const standIns = faces.filter((face) => face.src.every((source) => source.local));
const indexHtml = SiteSource.read('index.html');
const fontFiles = SiteSource.files('fonts').filter((file) => file.endsWith('.woff2'));
/** The path of a font file as the stylesheet writes it, resolved from css/foundation/ to a path under source/. */
const resolved = (url) => url.replace('../../', '');

describe('self-hosted fonts', () => {
  describe('the @font-face rules', () => {
    it('declare the four web faces of the three families, with their axes, display strategy and character ranges', () => {
      expect(
        webFaces.map((face) => [
          face['font-family'],
          face['font-style'],
          face['font-weight'],
          face['font-stretch'] ?? null,
          face['font-display'],
          face.src,
          face['unicode-range'],
        ]),
      ).toStrictEqual([
        [
          'Bricolage Grotesque',
          'normal',
          '200 800',
          '75% 100%',
          'swap',
          [{ url: '../../fonts/bricolage-grotesque-latin.woff2', format: 'woff2' }],
          LATIN_RANGE,
        ],
        [
          'Instrument Serif',
          'italic',
          '400',
          null,
          'swap',
          [{ url: '../../fonts/instrument-serif-italic-latin.woff2', format: 'woff2' }],
          LATIN_RANGE,
        ],
        [
          'JetBrains Mono',
          'normal',
          '400 800',
          null,
          'swap',
          [{ url: '../../fonts/jetbrains-mono-latin.woff2', format: 'woff2' }],
          LATIN_RANGE,
        ],
        [
          'JetBrains Mono',
          'normal',
          '400 800',
          null,
          'swap',
          [{ url: '../../fonts/jetbrains-mono-greek.woff2', format: 'woff2' }],
          GREEK_RANGE,
        ],
      ]);
    });

    it('serve every web face from a WOFF2 file declared as woff2, and nothing else', () => {
      expect(
        webFaces
          .flatMap((face) => face.src)
          .map((source) => [source.format, source.url.endsWith('.woff2')]),
      ).toStrictEqual(Array.from({ length: 4 }, () => ['woff2', true]));
    });

    it('declare the three metric-matched stand-ins with local() sources and the size and vertical overrides that keep the swap still', () => {
      expect(
        standIns.map((face) => [
          face['font-family'],
          face['font-style'] ?? 'normal',
          face.src,
          face['size-adjust'],
          face['ascent-override'],
          face['descent-override'],
          face['line-gap-override'],
        ]),
      ).toStrictEqual([
        [
          'Bricolage Grotesque Fallback',
          'normal',
          [
            { local: 'Arial' },
            { local: 'Liberation Sans' },
            { local: 'Arimo' },
            { local: 'Helvetica' },
          ],
          '82.95%',
          '112.11%',
          '32.55%',
          '0%',
        ],
        [
          'Instrument Serif Fallback',
          'italic',
          [
            { local: 'Times New Roman Italic' },
            { local: 'Liberation Serif Italic' },
            { local: 'Tinos Italic' },
            { local: 'Times Italic' },
          ],
          '86.32%',
          '114.69%',
          '35.91%',
          '0%',
        ],
        [
          'JetBrains Mono Fallback',
          'normal',
          [
            { local: 'Courier New' },
            { local: 'Liberation Mono' },
            { local: 'Cousine' },
            { local: 'Courier' },
          ],
          '99.98%',
          '102.02%',
          '30%',
          '0%',
        ],
      ]);
    });

    it('put each stand-in right after its web family in the font stacks of tokens.css', () => {
      const tokens = Object.fromEntries(
        [
          ...SiteSource.read('css/foundation/tokens.css').matchAll(
            /--(font-(?:display|serif|mono)):\s*([^;]+);/g,
          ),
        ].map(([, name, value]) => [
          name,
          value
            .split(',')
            .map((family) => family.trim().replace(/["']/g, ''))
            .slice(0, 2),
        ]),
      );
      expect(tokens).toStrictEqual({
        'font-display': ['Bricolage Grotesque', 'Bricolage Grotesque Fallback'],
        'font-serif': ['Instrument Serif', 'Instrument Serif Fallback'],
        'font-mono': ['JetBrains Mono', 'JetBrains Mono Fallback'],
      });
    });
  });

  describe('the files', () => {
    it('are exactly the ones the stylesheet references, all of them in source/fonts/', () => {
      expect(webFaces.map((face) => resolved(face.src[0].url)).sort()).toStrictEqual(fontFiles);
    });

    it('start with the WOFF2 signature', () => {
      expect(
        fontFiles.map((file) => [file, SiteSource.bytes(file).subarray(0, 4).equals(WOFF2_MAGIC)]),
      ).toStrictEqual(fontFiles.map((file) => [file, true]));
    });

    it('declare in their header the length the file really has', () => {
      expect(fontFiles.map((file) => [file, SiteSource.bytes(file).readUInt32BE(8)])).toStrictEqual(
        fontFiles.map((file) => [file, SiteSource.bytes(file).length]),
      );
    });

    it('come with the license text of each family, which is the SIL Open Font License 1.1', () => {
      const licenses = SiteSource.files('fonts').filter((file) => file.endsWith('-OFL.txt'));
      expect(
        licenses.map((file) => [
          file,
          SiteSource.read(file).split('\n')[0],
          SiteSource.read(file).includes('SIL OPEN FONT LICENSE Version 1.1'),
        ]),
      ).toStrictEqual([
        [
          'fonts/bricolage-grotesque-OFL.txt',
          'Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)',
          true,
        ],
        [
          'fonts/instrument-serif-OFL.txt',
          'Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif)',
          true,
        ],
        [
          'fonts/jetbrains-mono-OFL.txt',
          'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)',
          true,
        ],
      ]);
    });

    it('make up the whole folder: four fonts and three licenses', () => {
      expect(SiteSource.files('fonts')).toStrictEqual([
        'fonts/bricolage-grotesque-OFL.txt',
        'fonts/bricolage-grotesque-latin.woff2',
        'fonts/instrument-serif-OFL.txt',
        'fonts/instrument-serif-italic-latin.woff2',
        'fonts/jetbrains-mono-OFL.txt',
        'fonts/jetbrains-mono-greek.woff2',
        'fonts/jetbrains-mono-latin.woff2',
      ]);
    });
  });

  describe('the page', () => {
    it('preloads the three Latin files of the first screen as cross-origin WOFF2 fonts, and no other file', () => {
      const preloads = [...indexHtml.matchAll(/<link rel="preload"([^>]*)>/g)].map(
        ([, attributes]) => attributes.trim(),
      );
      expect(preloads).toStrictEqual([
        'as="font" type="font/woff2" href="fonts/bricolage-grotesque-latin.woff2" crossorigin',
        'as="font" type="font/woff2" href="fonts/instrument-serif-italic-latin.woff2" crossorigin',
        'as="font" type="font/woff2" href="fonts/jetbrains-mono-latin.woff2" crossorigin',
      ]);
    });

    it('links the font stylesheet right after tokens.css, which keeps the layer order declaration first', () => {
      const stylesheets = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(
        ([, href]) => href,
      );
      expect(stylesheets.slice(0, 2)).toStrictEqual([
        'css/foundation/tokens.css',
        'css/foundation/fonts.css',
      ]);
    });

    it('opens no connection to any other host: no preconnect, no external stylesheet, font or script', () => {
      const external = [
        ...indexHtml.matchAll(
          /<(?:link|script|img|source)\b[^>]*\s(?:href|src)="(https?:\/\/[^"]+)"[^>]*>/g,
        ),
      ].map(([tag, url]) => [tag.match(/\srel="([^"]+)"/)?.[1] ?? null, url]);
      expect(external).toStrictEqual([
        ['canonical', 'https://eklund.com.br/'],
        ['alternate', 'https://eklund.com.br/'],
        ['alternate', 'https://eklund.com.br/en/'],
        ['alternate', 'https://eklund.com.br/'],
      ]);
      expect(indexHtml.includes('rel="preconnect"')).toBe(false);
    });
  });

  describe('third parties', () => {
    const GOOGLE_FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
    const tracked = (folder) =>
      SiteSource.files(folder).filter((file) =>
        /\.(html|css|js|mjs|svg|json|webmanifest|txt|xml)$/.test(file),
      );

    it('are never named in the site: no Google Fonts host in any shipped text file, in .htaccess or in the tools', () => {
      const tools = join(import.meta.dirname, '..', '..', 'tools');
      // measure-sections.mjs still answers those hosts with empty files, a leftover of the days they were requested; harmless, so not counted here.
      const toolFiles = readdirSync(tools)
        .filter((file) => file.endsWith('.mjs') && file !== 'measure-sections.mjs')
        .map((file) => ['tools/' + file, readFileSync(join(tools, file), 'utf8')]);
      const siteFiles = [...tracked('.'), '.htaccess'].map((file) => [
        `source/${file}`,
        SiteSource.read(file),
      ]);
      expect(
        [...siteFiles, ...toolFiles]
          .filter(([, text]) => GOOGLE_FONT_HOSTS.test(text))
          .map(([file]) => file),
      ).toStrictEqual([]);
    });
  });

  describe('coverage of the text', () => {
    it('leaves only symbols and arrows to the system font: every letter the site prints is inside a shipped character range', () => {
      const text =
        [...DictionaryLeaves.of(PT_BR), ...DictionaryLeaves.of(EN_US)]
          .map(([, value]) => String(value))
          .join(' ') + indexHtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      const ranges = [LATIN_RANGE, GREEK_RANGE]
        .flatMap((list) => list.split(', '))
        .map((range) =>
          range
            .slice(2)
            .split('-')
            .map((hex) => parseInt(hex, 16)),
        )
        .map(([from, to = from]) => [from, to]);
      const outside = [...new Set(text)]
        .filter(
          (character) =>
            !ranges.some(
              ([from, to]) => character.codePointAt(0) >= from && character.codePointAt(0) <= to,
            ),
        )
        .sort();
      expect(outside).toStrictEqual(['→', '↗', '↵', '≥', '⌘', '▶', '✓', '✦', '❯']);
    });
  });
});
