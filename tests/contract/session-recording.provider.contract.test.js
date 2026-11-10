import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import fc from 'fast-check';
import { DeletionRequest } from '../../edge/src/deletion-request.js';
import { ReportVocabulary as Words } from '../../edge/src/report-vocabulary.js';
import { SessionChunk } from '../../edge/src/session-chunk.js';
import { SessionChunks } from '../support/session-chunks.js';

const schema = (name) =>
  JSON.parse(readFileSync(new URL(`./schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const CHUNK = schema('session-chunk');
const DELETION = schema('session-deletion');
const ajv = new Ajv({ allErrors: true, strict: true });
const validChunk = ajv.compile(CHUNK);
const validDeletion = ajv.compile(DELETION);
/** [what the schema says, what the collector says] about one chunk, and about one deletion. */
const chunkVerdicts = (chunk) => [validChunk(chunk), SessionChunk.parse(JSON.stringify(chunk)).ok];
const deletionVerdicts = (body) => [
  validDeletion(body),
  DeletionRequest.parse(JSON.stringify(body)).ok,
];

/** Chunks the schema allows, built from the closed lists and the limits of the contract. */
const CHUNKS = fc.record({
  v: fc.constant(1),
  code: fc.uuid({ version: 4 }),
  seq: fc.integer({ min: 0, max: 999 }),
  version: fc.tuple(fc.nat(999), fc.nat(999), fc.nat(999)).map((parts) => parts.join('.')),
  page: fc.constantFrom(...Words.RECORDED_PAGES),
  language: fc.constantFrom(...Words.LANGUAGES),
  events: fc.array(
    fc.record({
      type: fc.integer({ min: 0, max: 6 }),
      data: fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue({ maxDepth: 2 })),
      timestamp: fc.integer({ min: 1_577_836_800_000, max: 4_102_444_800_000 }),
    }),
    { maxLength: 20 },
  ),
  clicks: fc.array(
    fc.record({
      region: fc.constantFrom(...Words.REGIONS),
      viewport: fc.constantFrom(...Words.VIEWPORT_WIDTHS),
      x: fc.double({ min: 0, max: 1, noNaN: true }),
      y: fc.double({ min: 0, max: 1, noNaN: true }),
      at: fc.integer({ min: 0, max: 86_400_000 }),
    }),
    { maxLength: 20 },
  ),
});

describe('the session recording contracts, against the collector that reads them', () => {
  it('have the closed lists and the limits of the collector, value for value', () => {
    const { properties } = CHUNK;
    expect([
      properties.page.enum,
      properties.language.enum,
      properties.seq.maximum,
      properties.events.maxItems,
      properties.clicks.maxItems,
      properties.clicks.items.properties.region.enum,
      properties.clicks.items.properties.viewport.enum,
      properties.code.pattern,
      DELETION.properties.codes.maxItems,
      DELETION.properties.codes.items.pattern,
    ]).toStrictEqual([
      Words.RECORDED_PAGES,
      Words.LANGUAGES,
      SessionChunk.LIMITS.sequence,
      SessionChunk.LIMITS.events,
      SessionChunk.LIMITS.clicks,
      Words.REGIONS,
      Words.VIEWPORT_WIDTHS,
      SessionChunk.CODE.source,
      DeletionRequest.LIMITS.codes,
      SessionChunk.CODE.source,
    ]);
  });

  it('allow the complete chunk and a deletion of two codes, and so does the collector', () => {
    expect([
      chunkVerdicts(SessionChunks.complete()),
      deletionVerdicts({ v: 1, codes: [SessionChunks.CODE, SessionChunks.OTHER] }),
    ]).toStrictEqual([
      [true, true],
      [true, true],
    ]);
  });

  it('refuse, with the collector, every chunk and deletion outside the contract', () => {
    const outside = [
      ...[
        (chunk) => (chunk.v = 2),
        (chunk) => (chunk.visitor = 'someone@example.com'),
        (chunk) => (chunk.code = 'someone'),
        (chunk) => (chunk.page = '/termos/'),
        (chunk) => (chunk.seq = 1_000),
        (chunk) => (chunk.events[0].typed = 'secret'),
        (chunk) => (chunk.events[0].type = 9),
        (chunk) => (chunk.events[0].data = 'text'),
        (chunk) => (chunk.clicks[0].region = 'button#send'),
        (chunk) => (chunk.clicks[0].x = 2),
        (chunk) => (chunk.clicks[0].selector = '#contato a'),
      ].map((change) => chunkVerdicts(SessionChunks.with(change))),
      deletionVerdicts({ v: 1, codes: [] }),
      deletionVerdicts({ v: 1, codes: ['*'] }),
      deletionVerdicts({ v: 1, codes: [SessionChunks.CODE], everything: true }),
    ];
    expect(outside).toStrictEqual(outside.map(() => [false, false]));
  });

  it('agree with the collector on any chunk built from the closed lists', () => {
    fc.assert(
      fc.property(CHUNKS, (chunk) => {
        expect(chunkVerdicts(chunk)).toStrictEqual([true, true]);
      }),
      { numRuns: 300 },
    );
  });
});
