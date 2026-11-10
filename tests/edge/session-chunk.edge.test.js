import { describe, it, expect } from 'vitest';
import { SessionChunk } from '../../edge/src/session-chunk.js';
import { SessionChunks } from '../support/session-chunks.js';

const reasonOf = (change) =>
  SessionChunk.parse(JSON.stringify(SessionChunks.with(change))).reason ?? 'accepted';

describe('SessionChunk.parse', () => {
  it('reads a complete chunk: its code and order, the page, the span of its events and its clicks', () => {
    expect(SessionChunk.parse(JSON.stringify(SessionChunks.complete()))).toStrictEqual({
      ok: true,
      chunk: {
        code: SessionChunks.CODE,
        seq: 0,
        version: '1.2.0',
        page: '/',
        language: 'pt-BR',
        events: 3,
        first: SessionChunks.STARTED,
        last: SessionChunks.STARTED + 4_000,
        clicks: [{ region: 'status', viewport: '1280-1535', x: 0.25, y: 0.5, at: 4_000 }],
      },
    });
  });

  it('reads a chunk with only clicks, and keeps a position to a thousandth of its part', () => {
    const { chunk } = SessionChunk.parse(
      JSON.stringify(
        SessionChunks.with((body) => {
          body.events = [];
          body.clicks = [
            { region: 'hero', viewport: '0-359', x: 0.123456, y: 1, at: 0 },
            { region: 'other', viewport: '1536+', x: 0, y: 0.0004, at: 86_400_000 },
          ];
        }),
      ),
    );
    expect([chunk.events, chunk.first, chunk.last, chunk.clicks]).toStrictEqual([
      0,
      null,
      null,
      [
        { region: 'hero', viewport: '0-359', x: 0.123, y: 1, at: 0 },
        { region: 'other', viewport: '1536+', x: 0, y: 0, at: 86_400_000 },
      ],
    ]);
  });

  it('refuses a chunk that is not JSON, or whose fields are missing, unknown or of another version', () => {
    expect([
      SessionChunk.parse('{').reason,
      SessionChunk.parse('[]').reason,
      reasonOf((body) => delete body.clicks),
      reasonOf((body) => (body.visitor = 'someone')),
      reasonOf((body) => (body.v = 2)),
    ]).toStrictEqual([
      'the chunk is not JSON',
      'the chunk is not an object',
      'the chunk has no clicks',
      'the chunk has an unknown field, visitor',
      'v is not a version this collector reads',
    ]);
  });

  it('refuses a code that is not a random UUID, an order past 999, a page that does not record, and an unknown release', () => {
    expect([
      reasonOf((body) => (body.code = 'someone@example.com')),
      reasonOf((body) => (body.code = SessionChunks.CODE.toUpperCase())),
      reasonOf((body) => (body.seq = 1_000)),
      reasonOf((body) => (body.seq = -1)),
      reasonOf((body) => (body.page = '/privacidade/')),
      reasonOf((body) => (body.language = 'fr')),
      reasonOf((body) => (body.version = 'latest')),
    ]).toStrictEqual([
      'code does not have the expected form',
      'code does not have the expected form',
      'seq is not a whole number between 0 and 999',
      'seq is not a whole number between 0 and 999',
      'page is not one of the allowed values',
      'language is not one of the allowed values',
      'version does not have the expected form',
    ]);
  });

  it("refuses an event that is not one of rrweb's, out of time, without data, or with fields of its own", () => {
    expect([
      reasonOf((body) => (body.events = 'events')),
      reasonOf((body) => (body.events[0].type = 7)),
      reasonOf((body) => (body.events[0].timestamp = 1_000)),
      reasonOf((body) => (body.events[0].timestamp += 0.5)),
      reasonOf((body) => (body.events[1].data = [])),
      reasonOf((body) => (body.events[2].typed = 'secret')),
      reasonOf((body) => (body.events = Array.from({ length: 10_001 }, () => body.events[0]))),
    ]).toStrictEqual([
      'events is not a list',
      'events[0].type is not one of the allowed values',
      'events[0].timestamp is not a whole number between 1577836800000 and 4102444800000',
      'events[0].timestamp is not a whole number between 1577836800000 and 4102444800000',
      'events[1].data is not an object',
      'events[2] has an unknown field, typed',
      'events has more than 10000 items',
    ]);
  });

  it('refuses a click outside the closed lists, outside its part, or with more than its fields', () => {
    expect([
      reasonOf((body) => (body.clicks[0].region = 'main')),
      reasonOf((body) => (body.clicks[0].viewport = '1280')),
      reasonOf((body) => (body.clicks[0].x = 1.01)),
      reasonOf((body) => (body.clicks[0].y = '0.5')),
      reasonOf((body) => (body.clicks[0].at = 86_400_001)),
      reasonOf((body) => (body.clicks[0].target = 'button#send')),
      reasonOf((body) => (body.clicks = Array.from({ length: 201 }, () => body.clicks[0]))),
    ]).toStrictEqual([
      'clicks[0].region is not one of the allowed values',
      'clicks[0].viewport is not one of the allowed values',
      'clicks[0].x is not a number between 0 and 1',
      'clicks[0].y is not a number between 0 and 1',
      'clicks[0].at is not a whole number between 0 and 86400000',
      'clicks[0] has an unknown field, target',
      'clicks has more than 200 items',
    ]);
  });
});
