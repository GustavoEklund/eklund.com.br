import { SessionChunk } from './session-chunk.js';

const LIMITS = { characters: 4_096, codes: 50 };

/**
 * What a browser sends to have its recordings deleted (0010): the codes it kept, and nothing else. A code is a random UUID made
 * for one recording, so the request names only what that browser recorded and cannot reach anyone else's. The contract is
 * tests/contract/schemas/session-deletion.schema.json.
 */
export class DeletionRequest {
  static LIMITS = LIMITS;

  /** `{ ok: true, codes }`, each code once, or `{ ok: false, reason }`. */
  static parse(text) {
    if (text.length > LIMITS.characters) return { ok: false, reason: 'the request is too long' };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'the request is not JSON' };
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return { ok: false, reason: 'the request is not an object' };
    const unknown = Object.keys(body).filter((field) => field !== 'v' && field !== 'codes');
    if (unknown.length)
      return { ok: false, reason: `the request has an unknown field, ${unknown[0]}` };
    if (body.v !== 1) return { ok: false, reason: 'v is not a version this collector reads' };
    const { codes } = body;
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > LIMITS.codes)
      return { ok: false, reason: `codes is not a list of 1 to ${LIMITS.codes} codes` };
    if (!codes.every((code) => typeof code === 'string' && SessionChunk.CODE.test(code)))
      return { ok: false, reason: 'a code does not have the expected form' };
    return { ok: true, codes: [...new Set(codes)] };
  }
}
