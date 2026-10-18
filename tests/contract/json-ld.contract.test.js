// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import jsonld from 'jsonld';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { Locale } from '@site/js/i18n/locale.js';
import { SiteSource, DictionaryLeaves } from '../support/site-source.js';
import { SchemaOrgSubset } from './support/schema-org-subset.js';

const ORIGIN = 'https://eklund.com.br';
const CONTEXT = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'schema-org-context.jsonld'), 'utf8'),
);
const DICTIONARIES = { 'pt-BR': PT_BR, 'en-US': EN_US };

/** Serves the schema.org context from the fixture and refuses everything else, so the tests never reach the network. */
const documentLoader = async (url) => {
  if (
    ![
      'https://schema.org',
      'https://schema.org/',
      'http://schema.org',
      'http://schema.org/',
    ].includes(url)
  )
    throw new Error(`unexpected request for ${url}`);
  return { contextUrl: null, document: CONTEXT, documentUrl: url };
};

const blocks = [
  ...SiteSource.read('index.html').matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ),
].map(([, json]) => json);
const document_ = JSON.parse(blocks[0]);
const graph = document_['@graph'];
const byType = (type) => graph.find((node) => node['@type'] === type);
/** The value a language map holds for a language. */
const inLanguage = (values, language) =>
  [values]
    .flat()
    .filter((entry) => entry['@language'] === language)
    .map((entry) => entry['@value']);

/** The quads a node and everything nested in it must produce: one per type, one per property value, plus the nested nodes' own. */
const expectedQuads = (node) =>
  [node['@type'] ?? []].flat().length +
  Object.entries(node)
    .filter(([key]) => !key.startsWith('@'))
    .reduce(
      (total, [, value]) =>
        total +
        [value]
          .flat()
          .reduce(
            (sum, item) =>
              sum + 1 + (typeof item === 'object' && '@type' in item ? expectedQuads(item) : 0),
            0,
          ),
      0,
    );

describe('JSON-LD', () => {
  let page;
  beforeAll(() => {
    page = SiteSource.html();
  });
  const visibleText = (locale) =>
    `${page.body.textContent} ${DictionaryLeaves.of(DICTIONARIES[locale])
      .map(([, value]) => String(value).replace(/<[^>]+>/g, ''))
      .join(' ')}`.replace(/\s+/g, ' ');

  describe('the document', () => {
    it('is a single block in the head, parsed as valid JSON, with the schema.org context and a graph of three nodes', () => {
      expect([
        blocks.length,
        page.head.querySelectorAll('script[type="application/ld+json"]').length,
        document_['@context'],
        graph.map((node) => node['@type']),
      ]).toStrictEqual([1, 1, 'https://schema.org', ['Person', 'WebSite', 'ProfilePage']]);
    });

    it('gives each node a stable @id on the site origin, the same on every build', () => {
      expect([
        ...graph.map((node) => node['@id']),
        graph[2].primaryImageOfPage['@id'],
      ]).toStrictEqual([
        `${ORIGIN}/#person`,
        `${ORIGIN}/#website`,
        `${ORIGIN}/#profile`,
        `${ORIGIN}/#social-card`,
      ]);
    });

    it('links the nodes only by ids that the graph defines', () => {
      const defined = new Set([
        ...graph.map((node) => node['@id']),
        graph[2].primaryImageOfPage['@id'],
      ]);
      const referenced = [];
      const walk = (value) => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (!value || typeof value !== 'object') return;
        if (Object.keys(value).length === 1 && '@id' in value) referenced.push(value['@id']);
        else
          Object.entries(value)
            .filter(([key]) => key !== '@id')
            .forEach(([, child]) => walk(child));
      };
      graph.forEach(walk);
      expect([referenced.sort(), referenced.filter((id) => !defined.has(id))]).toStrictEqual([
        [`${ORIGIN}/#person`, `${ORIGIN}/#person`, `${ORIGIN}/#person`, `${ORIGIN}/#website`],
        [],
      ]);
    });

    it('carries no contact details: the email and phone stay out of structured data, the visible contact section is untouched', () => {
      const properties = new Set();
      const walk = (value) => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (value && typeof value === 'object')
          Object.entries(value).forEach(([key, child]) => {
            properties.add(key);
            walk(child);
          });
      };
      walk(document_);
      expect([
        properties.has('email'),
        properties.has('telephone'),
        blocks[0].includes('@eklund.com.br'),
      ]).toStrictEqual([false, false, false]);
    });
  });

  describe('processed by a JSON-LD 1.1 processor', () => {
    it('expands in safe mode, which refuses a lossy construct such as a dropped term or a value that is not an IRI', async () => {
      const expanded = await jsonld.expand(document_, { documentLoader, safe: true });
      expect(expanded.map((node) => node['@type'])).toStrictEqual([
        ['http://schema.org/Person'],
        ['http://schema.org/WebSite'],
        ['http://schema.org/ProfilePage'],
      ]);
    });

    it('keeps every statement: the quads the document yields are the ones counted in the source, none lost on the way', async () => {
      const quads = await jsonld.toRDF(document_, {
        format: 'application/n-quads',
        documentLoader,
      });
      expect(quads.trim().split('\n').length).toBe(
        graph.reduce((total, node) => total + expectedQuads(node), 0),
      );
    });

    it('resolves every term to a schema.org IRI (the context maps unknown words there too, so the vocabulary tests below are what catch a typo)', async () => {
      const expanded = await jsonld.expand(document_, { documentLoader, safe: true });
      const iris = new Set();
      const walk = (value) => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (key === '@type') child.forEach((type) => iris.add(type));
          else if (!key.startsWith('@')) {
            iris.add(key);
            walk(child);
          }
        }
      };
      walk(expanded);
      expect([...iris].filter((iri) => !iri.startsWith('http://schema.org/'))).toStrictEqual([]);
    });

    it('compacts back to the same graph, and flattens to one node per entity with the references intact', async () => {
      const expanded = await jsonld.expand(document_, { documentLoader });
      const compacted = await jsonld.compact(expanded, 'https://schema.org', { documentLoader });
      // The schema.org context aliases @id and @type to id and type.
      expect(compacted['@graph'].map((node) => [node.id, node.type])).toStrictEqual(
        graph.map((node) => [node['@id'], node['@type']]),
      );
      const flattened = await jsonld.flatten(document_, null, { documentLoader });
      const ids = flattened.map((node) => node['@id']);
      expect(ids.filter((id) => id.startsWith(ORIGIN))).toStrictEqual([
        `${ORIGIN}/#person`,
        `${ORIGIN}/#profile`,
        `${ORIGIN}/#social-card`,
        `${ORIGIN}/#website`,
      ]);
    });

    it('declares which language every text is in: each language map holds one value for each supported locale', () => {
      const maps = [];
      for (const node of graph)
        for (const [property, value] of Object.entries(node)) {
          const tagged = [value]
            .flat()
            .filter((entry) => entry && typeof entry === 'object' && '@language' in entry);
          if (tagged.length)
            maps.push([node['@type'], property, tagged.map((entry) => entry['@language'])]);
        }
      expect(maps).toStrictEqual([
        ['Person', 'jobTitle', Locale.SUPPORTED],
        ['Person', 'description', Locale.SUPPORTED],
        ['Person', 'knowsAbout', Locale.SUPPORTED],
        ['ProfilePage', 'name', Locale.SUPPORTED],
      ]);
      expect(Intl.getCanonicalLocales(Locale.SUPPORTED)).toStrictEqual(Locale.SUPPORTED);
    });
  });

  describe('schema.org vocabulary', () => {
    it('only uses types and properties schema.org defines for those types, with values of the types it allows', () => {
      expect(SchemaOrgSubset.problems(graph)).toStrictEqual([]);
    });

    it('rejects what it should: an unknown property, a text where a node belongs, a relative sameAs link, a wrong type', () => {
      const broken = [
        {
          '@type': 'Person',
          '@id': 'a',
          jobTitles: 'x',
          worksFor: 'OKTO',
          sameAs: ['/relative'],
          address: { '@type': 'ImageObject' },
        },
      ];
      expect(SchemaOrgSubset.problems(broken)).toStrictEqual([
        'a: Person has no property jobTitles',
        'a.worksFor: a string where Organization is expected',
        'a.sameAs: /relative is not an absolute URL',
        'a.address: a ImageObject where PostalAddress or Text is expected',
      ]);
    });

    it('knows the hierarchy it needs: an educational organization is an organization, a profile page is a web page', () => {
      expect([
        SchemaOrgSubset.isA('EducationalOrganization', 'Organization'),
        SchemaOrgSubset.isA('ProfilePage', 'CreativeWork'),
        SchemaOrgSubset.isA('Person', 'Organization'),
        SchemaOrgSubset.isA('URL', 'Text'),
      ]).toStrictEqual([true, true, false, true]);
    });
  });

  describe('what it states is what the page shows', () => {
    const person = byType('Person');

    it('names the person as the page heading does, and links to the same address as the canonical link and og:url', () => {
      expect([
        person.name,
        page.querySelector('h1.hero-name').textContent,
        person.url,
        page.querySelector('link[rel=canonical]').getAttribute('href'),
        graph[1].url,
        graph[2].url,
      ]).toStrictEqual([
        'Gustavo Eklund',
        'Gustavo Eklund',
        `${ORIGIN}/`,
        `${ORIGIN}/`,
        `${ORIGIN}/`,
        `${ORIGIN}/`,
      ]);
    });

    it('gives the job title and the description in each language exactly as the dictionary of that language words them', () => {
      expect(
        Locale.SUPPORTED.map((locale) => [
          inLanguage(person.jobTitle, locale),
          inLanguage(person.description, locale),
          inLanguage(graph[2].name, locale),
        ]),
      ).toStrictEqual(
        Locale.SUPPORTED.map((locale) => [
          [DICTIONARIES[locale].profile.board.roleValue],
          [DICTIONARIES[locale].meta.description],
          [DICTIONARIES[locale].meta.title],
        ]),
      );
    });

    it('names the employer, the school and the place that the profile shows', () => {
      expect([person.worksFor.name, person.alumniOf.name, person.address]).toStrictEqual([
        'OKTO Payments',
        'Fatec Taubaté',
        {
          '@type': 'PostalAddress',
          addressLocality: 'Taubaté',
          addressRegion: 'SP',
          addressCountry: 'BR',
        },
      ]);
      expect(
        Locale.SUPPORTED.map((locale) => [
          visibleText(locale).includes('OKTO Payments'),
          visibleText(locale).includes('Fatec Taubaté'),
          DICTIONARIES[locale].hero.eyebrow.includes('Taubaté'),
        ]),
      ).toStrictEqual([
        [true, true, true],
        [true, true, true],
      ]);
    });

    it('lists as sameAs the two profiles the contact section links to, and no other address', () => {
      const links = [...page.querySelectorAll('a[href^="https://"]')].map((link) =>
        link.getAttribute('href'),
      );
      expect([person.sameAs, person.sameAs.filter((url) => !links.includes(url))]).toStrictEqual([
        ['https://github.com/GustavoEklund', 'https://www.linkedin.com/in/gustavo-eklund'],
        [],
      ]);
    });

    it('claims to know only what the profile text says it uses, in the language it is stated in', () => {
      const plain = person.knowsAbout.filter((topic) => typeof topic === 'string');
      const unsaid = plain.filter(
        (topic) => !Locale.SUPPORTED.every((locale) => visibleText(locale).includes(topic)),
      );
      const mapped = person.knowsAbout
        .filter((topic) => typeof topic === 'object')
        .filter((topic) => !visibleText(topic['@language']).includes(topic['@value']));
      expect([plain, unsaid, mapped]).toStrictEqual([
        [
          'Pix',
          'Open Finance',
          'Go',
          'TypeScript',
          'DDD',
          'Clean Architecture',
          'CQRS',
          'Event Sourcing',
        ],
        [],
        [],
      ]);
    });

    it('states the languages and the image the site really has', () => {
      expect([
        graph[1].inLanguage,
        graph[2].inLanguage,
        graph[2].primaryImageOfPage.url,
        page.querySelector('meta[property="og:image"]').getAttribute('content'),
        SiteSource.exists('assets/brand/social-card.png'),
      ]).toStrictEqual([
        Locale.SUPPORTED,
        Locale.SUPPORTED,
        `${ORIGIN}/assets/brand/social-card.png`,
        `${ORIGIN}/assets/brand/social-card.png`,
        true,
      ]);
    });

    it('makes no claim the page does not: no date of modification, no photo, no former name', () => {
      expect(
        Object.keys(person).concat(Object.keys(graph[1]), Object.keys(graph[2])),
      ).toStrictEqual([
        '@type',
        '@id',
        'name',
        'url',
        'jobTitle',
        'description',
        'worksFor',
        'alumniOf',
        'address',
        'sameAs',
        'knowsAbout',
        '@type',
        '@id',
        'url',
        'name',
        'inLanguage',
        'publisher',
        'author',
        '@type',
        '@id',
        'url',
        'name',
        'inLanguage',
        'isPartOf',
        'mainEntity',
        'primaryImageOfPage',
      ]);
    });
  });
});
