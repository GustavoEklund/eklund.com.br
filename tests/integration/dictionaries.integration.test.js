import { describe, it, expect } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Locale } from '@site/js/i18n/locale.js';
import { Diagram } from '@site/js/architecture-map/diagram.js';
import { DictionaryLeaves } from '../support/site-source.js';

const LOCALES = { 'pt-BR': PT_BR, 'en-US': EN_US };
const leaves = (dictionary) => DictionaryLeaves.of(dictionary);
const strings = (dictionary) => leaves(dictionary).filter(([, value]) => typeof value === 'string');

describe('the dictionaries', () => {
  it('are registered for exactly the supported locales, and the default is Portuguese', () => {
    expect(Object.keys(Dictionaries.BY_LOCALE)).toStrictEqual(Locale.SUPPORTED);
    expect([
      Dictionaries.BY_LOCALE['pt-BR'] === PT_BR,
      Dictionaries.BY_LOCALE['en-US'] === EN_US,
    ]).toStrictEqual([true, true]);
  });

  it('define the same keys in the same order', () => {
    expect(leaves(EN_US).map(([path]) => path)).toStrictEqual(leaves(PT_BR).map(([path]) => path));
  });

  it('give every key the same kind of value in both languages', () => {
    const kind = (value) => (Array.isArray(value) ? 'array' : typeof value);
    expect(leaves(EN_US).map(([path, value]) => [path, kind(value)])).toStrictEqual(
      leaves(PT_BR).map(([path, value]) => [path, kind(value)]),
    );
  });

  it('use the same {placeholders} for every string in both languages', () => {
    const placeholders = (dictionary) =>
      strings(dictionary).map(([path, value]) => [path, DictionaryLeaves.placeholders(value)]);
    expect(placeholders(EN_US)).toStrictEqual(placeholders(PT_BR));
  });

  it('keep lists the same length: three levels and three banners', () => {
    const lists = (dictionary) =>
      leaves(dictionary)
        .filter(([, value]) => Array.isArray(value))
        .map(([path, value]) => [path, value.length]);
    expect(lists(PT_BR)).toStrictEqual([
      ['status.levels', 3],
      ['status.banners', 3],
    ]);
    expect(lists(EN_US)).toStrictEqual(lists(PT_BR));
  });

  it.each(Object.entries(LOCALES))(
    'hold no empty text, no padding and no em dash in %s',
    (_locale, dictionary) => {
      const bad = strings(dictionary)
        .filter(([, value]) => value === '' || value !== value.trim() || value.includes('—'))
        .map(([path]) => path);
      expect(bad).toStrictEqual([]);
    },
  );

  it.each(Object.entries(LOCALES))(
    'hold no double spaces in %s, except the terminal line that aligns its columns',
    (_locale, dictionary) => {
      expect(
        strings(dictionary)
          .filter(([, value]) => /  /.test(value))
          .map(([path]) => path),
      ).toStrictEqual(['loadTest.log.running']);
    },
  );

  it.each(Object.entries(LOCALES))(
    'give every plural entry in %s both a one and an other form',
    (_locale, dictionary) => {
      const entries = (node, prefix = '') =>
        Object.entries(node).flatMap(([key, value]) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const isPlural = 'one' in value || 'other' in value;
          return isPlural
            ? [[`${prefix}${key}`, Object.keys(value)]]
            : entries(value, `${prefix}${key}.`);
        });
      expect(entries(dictionary).filter(([, forms]) => forms.join() !== 'one,other')).toStrictEqual(
        [],
      );
    },
  );

  describe('cover what the code looks up', () => {
    const lookup = (dictionary, path) =>
      path.split('.').reduce((node, part) => node?.[part], dictionary);

    it.each(Object.entries(LOCALES))(
      'have a title, subtitle and description for each of the 30 map nodes in %s',
      (_locale, dictionary) => {
        const missing = Object.keys(Diagram.NODES).flatMap((id) =>
          ['title', 'subtitle', 'description']
            .filter(
              (field) =>
                typeof lookup(dictionary, `architecture.nodes.${id}.${field}`) !== 'string',
            )
            .map((field) => `${id}.${field}`),
        );
        expect([missing, Object.keys(dictionary.architecture.nodes)]).toStrictEqual([
          [],
          Object.keys(Diagram.NODES),
        ]);
      },
    );

    it.each(Object.entries(LOCALES))(
      'have a label for every zone and the RSFN band in %s',
      (_locale, dictionary) => {
        const ids = [
          ...Diagram.ZONES.map((zone) => zone.label).filter(Boolean),
          ...Diagram.ZONE_LABELS.map((label) => label.id),
          Diagram.NETWORK_BAND.label,
        ];
        expect([
          ids.filter((id) => typeof dictionary.architecture.zones[id] !== 'string'),
          Object.keys(dictionary.architecture.zones),
        ]).toStrictEqual([[], ['channels', 'aws', 'cluster', 'managed', 'centralBank', 'rsfn']]);
      },
    );

    it.each(Object.entries(LOCALES))(
      'have a caption for every walkthrough step that speaks, and for the ending, in %s',
      (_locale, dictionary) => {
        const captions = Diagram.walkthrough()
          .map((step) => step.caption)
          .filter((caption) => caption !== undefined);
        expect([
          captions.filter(
            (caption) => typeof dictionary.architecture.walkthrough[caption] !== 'string',
          ),
          Object.keys(dictionary.architecture.walkthrough).filter((id) => !captions.includes(id)),
        ]).toStrictEqual([[], ['done']]);
      },
    );

    it.each(Object.entries(LOCALES))(
      'name the six trace services, the five spans and the attributes the builder writes in %s',
      (_locale, dictionary) => {
        expect(Object.keys(dictionary.trace.services)).toStrictEqual([
          'navigation',
          'network',
          'document',
          'script',
          'assets',
          'fonts',
        ]);
        expect(Object.keys(dictionary.trace.spans)).toStrictEqual([
          'connection',
          'parse',
          'globeSetup',
          'globeFirstFrame',
        ]);
        expect(Object.keys(dictionary.trace.values)).toStrictEqual([
          'network',
          'handshake',
          'reused',
          'unavailable',
        ]);
        expect(Object.keys(dictionary.trace.attributes)).toStrictEqual([
          'type',
          'protocol',
          'status',
          'transferred',
          'compressedBody',
          'rawBody',
          'redirects',
          'delivery',
          'host',
          'tls',
          'domNodes',
          'modules',
          'dependencies',
          'points',
          'shaders',
          'drawCalls',
          'dpr',
          'canvas',
          'blocksRender',
          'spans',
          'webgl2',
        ]);
      },
    );

    it.each(Object.entries(LOCALES))(
      'describe the eight status checks and the incident texts in %s',
      (_locale, dictionary) => {
        expect(Object.keys(dictionary.status.checks)).toStrictEqual([
          'document',
          'fonts',
          'globe',
          'mainThread',
          'layoutShift',
          'dependencies',
          'platform',
          'contrast',
        ]);
        expect(Object.keys(dictionary.status.incidents)).toStrictEqual([
          'title',
          'none',
          'resolved',
          'layoutShift',
          'longTask',
          'lowFps',
          'loadTest',
        ]);
      },
    );

    it.each(Object.entries(LOCALES))(
      'have every command the palette registers in %s',
      (_locale, dictionary) => {
        expect(Object.keys(dictionary.palette.commands)).toStrictEqual([
          'status',
          'profile',
          'architecture',
          'followPix',
          'load',
          'runLoad',
          'history',
          'contact',
          'copyEmail',
          'toggleTheme',
          'randomHue',
          'goHome',
          'shader',
          'github',
          'source',
          'linkedin',
          'switchLocale',
          'pauseMotion',
          'resumeMotion',
          'hueUp',
          'hueDown',
          'speedUp',
          'speedDown',
          'pointsUp',
          'pointsDown',
          'spinGlobe',
        ]);
      },
    );
  });
});
