import { describe, it, expect } from 'vitest';
import { DeletionRequest } from '../../edge/src/deletion-request.js';
import { SessionChunks } from '../support/session-chunks.js';

const parse = (body) => DeletionRequest.parse(JSON.stringify(body));

describe('DeletionRequest.parse', () => {
  it('reads the codes of the recordings to delete, each once', () => {
    expect(
      parse({ v: 1, codes: [SessionChunks.CODE, SessionChunks.OTHER, SessionChunks.CODE] }),
    ).toStrictEqual({ ok: true, codes: [SessionChunks.CODE, SessionChunks.OTHER] });
  });

  it('takes up to 50 codes in one request', () => {
    const codes = Array.from(
      { length: 51 },
      (_, index) => `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
    );
    expect([
      parse({ v: 1, codes: codes.slice(0, 50) }).codes.length,
      parse({ v: 1, codes }).reason,
    ]).toStrictEqual([50, 'codes is not a list of 1 to 50 codes']);
  });

  it('refuses anything that is not a list of codes: another field, a pattern, an empty list, a long text', () => {
    expect([
      DeletionRequest.parse('codes').reason,
      DeletionRequest.parse('null').reason,
      parse({ v: 1, codes: [SessionChunks.CODE], all: true }).reason,
      parse({ codes: [SessionChunks.CODE] }).reason,
      parse({ v: 1, codes: [] }).reason,
      parse({ v: 1, codes: SessionChunks.CODE }).reason,
      parse({ v: 1, codes: ['%'] }).reason,
      parse({ v: 1, codes: [`${SessionChunks.CODE} OR 1=1`] }).reason,
      DeletionRequest.parse(' '.repeat(4_097)).reason,
    ]).toStrictEqual([
      'the request is not JSON',
      'the request is not an object',
      'the request has an unknown field, all',
      'v is not a version this collector reads',
      'codes is not a list of 1 to 50 codes',
      'codes is not a list of 1 to 50 codes',
      'a code does not have the expected form',
      'a code does not have the expected form',
      'the request is too long',
    ]);
  });
});
