import { describe, it, expect } from 'vitest';
import { Gzip } from '../../edge/src/gzip.js';
import { SessionChunks } from '../support/session-chunks.js';

describe('Gzip', () => {
  it('compresses a text that it, and any other gzip reader, inflates back as it was', async () => {
    const text = `{"events":[${'{"type":3},'.repeat(500)}{"type":4}],"é":"ção"}`;
    const bytes = await Gzip.deflate(text);
    expect([
      Gzip.is(bytes),
      bytes.byteLength < text.length / 10,
      await Gzip.inflate(bytes, 10_000),
      await SessionChunks.inflate(bytes),
    ]).toStrictEqual([true, true, { ok: true, text }, text]);
  });

  it('knows gzip by its first two bytes', () => {
    expect([
      Gzip.is(new Uint8Array([0x1f, 0x8b, 8])),
      Gzip.is(new TextEncoder().encode('{"v":1}')),
      Gzip.is(new Uint8Array([0x1f])),
      Gzip.is(new Uint8Array()),
    ]).toStrictEqual([true, false, false, false]);
  });

  it('stops inflating once the text passes its limit, so a small body cannot grow into a huge one', async () => {
    const bomb = await Gzip.deflate('0'.repeat(5_000_000));
    expect([bomb.byteLength < 10_000, await Gzip.inflate(bomb, 1_000_000)]).toStrictEqual([
      true,
      { ok: false, reason: 'too long' },
    ]);
  });

  it('refuses bytes that are not gzip, or whose text is not UTF-8', async () => {
    expect([
      await Gzip.inflate(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4]), 1_000),
      await Gzip.inflate(await Gzip.deflate(new Uint8Array([0xc3, 0x28])), 1_000),
      Gzip.text(new TextEncoder().encode('plain')),
      Gzip.text(new Uint8Array([0xff])),
    ]).toStrictEqual([
      { ok: false, reason: 'not gzip' },
      { ok: false, reason: 'not UTF-8' },
      { ok: true, text: 'plain' },
      { ok: false, reason: 'not UTF-8' },
    ]);
  });
});
