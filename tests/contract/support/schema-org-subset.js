import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUBSET = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'schema-org-subset.json'), 'utf8'),
);
const ABSOLUTE_URL = /^https?:\/\/[^\s/]+\S*$/;
const NUMBER_TYPES = ['Number', 'Integer', 'Float'];

/**
 * Checks compact schema.org JSON-LD against the part of the vocabulary in fixtures/schema-org-subset.json (built by
 * tools/schema-org-subset.mjs from the same index.html): the properties a type may carry and the types a value may have.
 */
export class SchemaOrgSubset {
  /** One sentence per problem found in the nodes of a graph; an empty list means the graph is valid. */
  static problems(graph) {
    const nodesById = new Map(
      graph.filter((node) => node['@id']).map((node) => [node['@id'], node]),
    );
    return graph.flatMap((node) =>
      SchemaOrgSubset.#node(node, nodesById, node['@id'] ?? node['@type']),
    );
  }

  /** Whether a type is the given one or has it among its ancestors. */
  static isA(type, expected) {
    return (
      type === expected ||
      (SUBSET.types[type]?.extends ?? SUBSET.hierarchy[type] ?? []).includes(expected)
    );
  }

  static #node(node, nodesById, path) {
    const types = [node['@type']].flat();
    const known = types.filter((type) => SUBSET.types[type]);
    if (known.length !== types.length)
      return [
        `${path}: type ${types.filter((type) => !SUBSET.types[type]).join(', ')} is not in the subset`,
      ];
    return Object.entries(node)
      .filter(([key]) => !key.startsWith('@'))
      .flatMap(([property, value]) => {
        if (!types.some((type) => SUBSET.types[type].properties.includes(property)))
          return [`${path}: ${types.join('/')} has no property ${property}`];
        const range = SUBSET.properties[property];
        return [value]
          .flat()
          .flatMap((item) => SchemaOrgSubset.#value(item, range, `${path}.${property}`, nodesById));
      });
  }

  static #value(value, range, path, nodesById) {
    if (typeof value === 'string') return SchemaOrgSubset.#literal(value, range, path);
    if (typeof value === 'number')
      return range.some((type) => NUMBER_TYPES.includes(type))
        ? []
        : [`${path}: a number where ${range.join(' or ')} is expected`];
    if ('@value' in value)
      return range.includes('Text')
        ? []
        : [`${path}: a language-tagged string where ${range.join(' or ')} is expected`];
    const node = '@type' in value ? value : nodesById.get(value['@id']);
    if (!node) return [`${path}: ${value['@id']} is not defined in the graph`];
    const compatible = [node['@type']]
      .flat()
      .some((type) => range.some((expected) => SchemaOrgSubset.isA(type, expected)));
    return [
      ...(compatible
        ? []
        : [
            `${path}: a ${[node['@type']].flat().join('/')} where ${range.join(' or ')} is expected`,
          ]),
      ...('@type' in value ? SchemaOrgSubset.#node(value, nodesById, path) : []),
    ];
  }

  static #literal(value, range, path) {
    if (range.includes('Text')) return [];
    if (range.includes('URL'))
      return ABSOLUTE_URL.test(value) ? [] : [`${path}: ${value} is not an absolute URL`];
    return [`${path}: a string where ${range.join(' or ')} is expected`];
  }
}
