// Builds tests/contract/fixtures/schema-org-subset.json: the part of the schema.org vocabulary that the JSON-LD in
// index.html uses, so tests/contract/json-ld.contract.test.js can check types, properties and value types offline.
// It lists every type used with all its ancestors and the properties each one may carry, and for those properties
// the types their values may have. It fails when index.html uses a type or property that schema.org does not define.
// usage: node tools/schema-org-subset.mjs [path-or-url-of-schemaorg-current-https.jsonld]
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_VOCABULARY =
  'https://raw.githubusercontent.com/schemaorg/schemaorg/main/data/releases/29.3/schemaorg-current-https.jsonld';
const OUTPUT = join(PROJECT, 'tests', 'contract', 'fixtures', 'schema-org-subset.json');

/** The schema.org vocabulary as a graph of classes and properties. */
class Vocabulary {
  #classes = new Map();
  #properties = new Map();

  constructor(graph) {
    for (const node of graph) {
      const types = [node['@type']].flat();
      if (types.includes('rdfs:Class')) this.#classes.set(Vocabulary.#name(node['@id']), node);
      if (types.includes('rdf:Property')) this.#properties.set(Vocabulary.#name(node['@id']), node);
    }
  }

  static #name(id) {
    return id.replace(/^(schema:|https?:\/\/schema\.org\/)/, '');
  }

  static #ids(value) {
    return [value ?? []].flat().map((entry) => Vocabulary.#name(entry['@id']));
  }

  hasClass(name) {
    return this.#classes.has(name);
  }

  hasProperty(name) {
    return this.#properties.has(name);
  }

  /** Every ancestor class of a class, nearest first. */
  ancestors(name) {
    const found = [];
    const visit = (current) => {
      for (const parent of Vocabulary.#ids(this.#classes.get(current)?.['rdfs:subClassOf'])) {
        if (!found.includes(parent)) {
          found.push(parent);
          visit(parent);
        }
      }
    };
    visit(name);
    return found;
  }

  /** The properties whose domain includes the class or one of its ancestors, sorted. */
  propertiesOf(name) {
    const chain = new Set([name, ...this.ancestors(name)]);
    return [...this.#properties.entries()]
      .filter(([, node]) =>
        Vocabulary.#ids(node['schema:domainIncludes']).some((domain) => chain.has(domain)),
      )
      .map(([property]) => property)
      .sort();
  }

  rangeOf(property) {
    return Vocabulary.#ids(this.#properties.get(property)['schema:rangeIncludes']).sort();
  }
}

/** The types and properties a JSON-LD document uses. */
class UsedTerms {
  types = new Set();
  properties = new Set();

  constructor(node) {
    this.#visit(node);
  }

  #visit(value) {
    if (Array.isArray(value)) return value.forEach((item) => this.#visit(item));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '@type') [child].flat().forEach((type) => this.types.add(type));
      else if (!key.startsWith('@')) {
        this.properties.add(key);
        this.#visit(child);
      } else if (key === '@graph') this.#visit(child);
    }
  }
}

const source = process.argv[2] ?? DEFAULT_VOCABULARY;
const text = /^https?:/.test(source)
  ? await (await fetch(source)).text()
  : await readFile(source, 'utf8');
const vocabulary = new Vocabulary(JSON.parse(text)['@graph']);
const html = await readFile(join(PROJECT, 'source', 'index.html'), 'utf8');
const jsonLd = JSON.parse(
  html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
);
const used = new UsedTerms(jsonLd);

const unknown = [
  ...[...used.types].filter((type) => !vocabulary.hasClass(type)).map((type) => `type ${type}`),
  ...[...used.properties]
    .filter((property) => !vocabulary.hasProperty(property))
    .map((property) => `property ${property}`),
];
if (unknown.length) throw new Error(`schema.org does not define: ${unknown.join(', ')}`);

const types = {};
for (const type of [...used.types].sort())
  types[type] = { extends: vocabulary.ancestors(type), properties: vocabulary.propertiesOf(type) };
const properties = {};
for (const property of [
  ...new Set(Object.values(types).flatMap((entry) => entry.properties)),
].sort())
  properties[property] = vocabulary.rangeOf(property);
const dataTypes = {};
for (const name of new Set(Object.values(properties).flat()))
  if (vocabulary.hasClass(name)) dataTypes[name] = vocabulary.ancestors(name);

await writeFile(
  OUTPUT,
  `${JSON.stringify({ vocabulary: 'schemaorg-current-https.jsonld, schema.org release 29.3', types, properties, hierarchy: dataTypes }, null, 1)}\n`,
);
console.log(
  `wrote ${OUTPUT}: ${Object.keys(types).length} types, ${Object.keys(properties).length} properties`,
);
