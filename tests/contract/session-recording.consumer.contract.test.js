import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import fc from 'fast-check';
import { DeletionRequest } from '../../edge/src/deletion-request.js';
import { ReportVocabulary as Words } from '../../edge/src/report-vocabulary.js';
import { SessionChunk } from '../../edge/src/session-chunk.js';
import { ClickPlaces } from '../../source/js/field-report/click-places.js';
import { RecordingBatch } from '../../source/js/field-report/recording-batch.js';
import { SiteVersion } from '../../source/js/field-report/site-version.js';
import { RecordingCodes } from '../../source/js/privacy/recording-codes.js';
import { SiteSource } from '../support/site-source.js';

const schema = (name) =>
  JSON.parse(readFileSync(new URL(`./schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validChunk = ajv.compile(schema('session-chunk'));
const validDeletion = ajv.compile(schema('session-deletion'));
/** [what the schema says, what the collector says] about the text a page sends. */
const chunkVerdicts = (text) => [validChunk(JSON.parse(text)), SessionChunk.parse(text).ok];
const MAIN = SiteSource.read('js/main.js');

/** rrweb's events as the recorder emits them, with whatever data, and the clicks the page places. */
const EVENTS = fc.array(
  fc.record({
    type: fc.integer({ min: 0, max: 6 }),
    data: fc.dictionary(fc.string({ maxLength: 6 }), fc.jsonValue({ maxDepth: 2 })),
    timestamp: fc.integer({ min: 1_600_000_000_000, max: 2_000_000_000_000 }),
  }),
  { maxLength: 30 },
);
const CLICKS = fc.array(
  fc.record({
    clientX: fc.double({ min: -500, max: 5_000, noNaN: true }),
    clientY: fc.double({ min: -500, max: 5_000, noNaN: true }),
    width: fc.integer({ min: 1, max: 4_000 }),
    height: fc.integer({ min: 1, max: 4_000 }),
    region: fc.option(fc.constantFrom(...Words.REGIONS.filter((region) => region !== 'other'))),
    now: fc.double({ min: -10, max: 1e9, noNaN: true }),
  }),
  { maxLength: 30 },
);

/** A target that sits in `region`, whose box is the whole window, or in no region at all. */
const targetIn = (region, width, height) => ({
  closest: (selector) =>
    region && selector === `#${region}`
      ? { getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) }
      : null,
});

describe('the session recording contracts, against the page that sends them', () => {
  it("keeps the collector's limits on the page's side", () => {
    expect([
      RecordingBatch.LIMITS,
      RecordingCodes.CODES_PER_REQUEST,
      RecordingCodes.DAYS_KEPT,
    ]).toStrictEqual([
      {
        text: SessionChunk.LIMITS.text,
        sequence: SessionChunk.LIMITS.sequence,
        events: SessionChunk.LIMITS.events,
        clicks: SessionChunk.LIMITS.clicks,
        milliseconds: SessionChunk.LIMITS.milliseconds,
      },
      DeletionRequest.LIMITS.codes,
      30,
    ]);
  });

  it('names the parts of the page a click lands in from the closed list of the collector', () => {
    const block = MAIN.slice(MAIN.indexOf('const CLICK_REGIONS'), MAIN.indexOf('const MEASURED'));
    const named = [...block.matchAll(/\['(\w+)', '/g)].map(([, region]) => region);
    const sections = [...MAIN.matchAll(/labelKey: 'scrollbar\.\w+', selector: '#(\w+)'/g)].map(
      ([, id]) => id,
    );
    expect([...named, ...sections, 'other'].sort()).toStrictEqual([...Words.REGIONS].sort());
  });

  it('sends chunks the schema and the collector accept, whatever rrweb records and wherever the clicks land', () => {
    fc.assert(
      fc.property(
        fc.uuid({ version: 4 }),
        fc.constantFrom(...Words.RECORDED_PAGES),
        fc.constantFrom(...Words.LANGUAGES),
        EVENTS,
        CLICKS,
        (code, page, language, events, clicks) => {
          const batch = new RecordingBatch({
            code,
            version: SiteVersion.NUMBER,
            page,
            language,
            startedAt: 0,
          });
          for (const event of events) batch.addEvent(event);
          for (const { clientX, clientY, width, height, region, now } of clicks)
            batch.addClick(
              ClickPlaces.of(
                { target: targetIn(region, width, height), clientX, clientY },
                Words.REGIONS.filter((name) => name !== 'other').map((name) => [name, `#${name}`]),
                { width, height },
              ),
              now,
            );
          const texts = [];
          for (let text = batch.next(); text !== null; text = batch.next()) texts.push(text);
          expect(texts.map(chunkVerdicts)).toStrictEqual(texts.map(() => [true, true]));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('asks to delete with a body the schema and the collector accept', async () => {
    const bodies = [];
    const storage = new Map();
    const codes = new RecordingCodes({
      address: 'https://eklund.eklund.workers.dev/v1/session/delete',
      storage: {
        read: (key) => storage.get(key) ?? null,
        write: (key, value) => storage.set(key, value),
      },
      fetch: (address, { body }) => {
        bodies.push(body);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    for (const code of fc.sample(fc.uuid({ version: 4 }), { numRuns: 120, seed: 7 }))
      codes.add(code);
    await codes.deleteAll();
    expect(
      bodies.map((body) => [validDeletion(JSON.parse(body)), DeletionRequest.parse(body).ok]),
    ).toStrictEqual([
      [true, true],
      [true, true],
      [true, true],
    ]);
  });
});
