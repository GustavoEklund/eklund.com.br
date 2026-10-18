import { describe, it, expect } from 'vitest';
import { LandDecoder } from '@site/js/globe/land-decoder.js';

const encode = (bytes) => btoa(String.fromCharCode(...bytes));
const decoder = (bytes, ringCount = 4) =>
  new LandDecoder({ ringCount, bitsetBase64: encode(bytes) });

// Four rings of latitude -67.5, -22.5, 22.5 and 67.5 degrees hold 3, 7, 7 and 3 samples: 20 bits.
const ALL_LAND = [0xff, 0xff, 0x0f];
const ALL_LAND_DOTS = [
  [-0.3826834261417389, -0.9238795042037964, 4.6865204697224915e-17, 0],
  [0.19134171307086945, -0.9238795042037964, 0.3314135670661926, 0.6180340051651001],
  [0.19134171307086945, -0.9238795042037964, -0.3314135670661926, 0.2360679805278778],
  [-0.8323866724967957, -0.3826834261417389, 0.4008563160896301, 0.8541019558906555],
  [-0.20558252930641174, -0.3826834261417389, 0.9007159471511841, 0.4721359610557556],
  [0.5760294795036316, -0.3826834261417389, 0.7223181128501892, 0.09016993641853333],
  [0.9238795042037964, -0.3826834261417389, -0, 0.708203911781311],
  [0.5760294795036316, -0.3826834261417389, -0.7223181128501892, 0.32623791694641113],
  [-0.20558252930641174, -0.3826834261417389, -0.9007159471511841, 0.9442719221115112],
  [-0.8323866724967957, -0.3826834261417389, -0.4008563160896301, 0.5623058676719666],
  [-0.9238795042037964, 0.3826834261417389, 1.1314261121795038e-16, 0.18033987283706665],
  [-0.5760294795036316, 0.3826834261417389, 0.7223181128501892, 0.7983738780021667],
  [0.20558252930641174, 0.3826834261417389, 0.9007159471511841, 0.41640785336494446],
  [0.8323866724967957, 0.3826834261417389, 0.4008563160896301, 0.03444182872772217],
  [0.8323866724967957, 0.3826834261417389, -0.4008563160896301, 0.6524758338928223],
  [0.20558252930641174, 0.3826834261417389, -0.9007159471511841, 0.2705098092556],
  [-0.5760294795036316, 0.3826834261417389, -0.7223181128501892, 0.8885437846183777],
  [-0.19134171307086945, 0.9238795042037964, 0.3314135670661926, 0.5065777897834778],
  [0.3826834261417389, 0.9238795042037964, -0, 0.1246117651462555],
  [-0.19134171307086945, 0.9238795042037964, -0.3314135670661926, 0.7426457405090332],
];
/** The dot a ring and a slot should produce, rounded to single precision like the Float32Array it lands in. */
const dot = (ring, slot, samples, seed, ringCount = 4) => {
  const latitude = -Math.PI / 2 + ((ring + 0.5) * Math.PI) / ringCount;
  const longitude = ((slot + (ring % 2 ? 0.5 : 0)) * 2 * Math.PI) / samples - Math.PI;
  return [
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    -Math.cos(latitude) * Math.sin(longitude),
    seed,
  ].map(Math.fround);
};
const seedOf = (sampleIndex) => (Math.imul(sampleIndex, 2654435761) >>> 0) / 4294967296;

describe('LandDecoder', () => {
  it('decodes nothing from an empty bitset', () => {
    const { count, positions, angularStep } = decoder([0, 0, 0]).decode();
    expect([count, Array.from(positions), angularStep]).toStrictEqual([0, [], Math.PI / 4]);
  });

  it('decodes every sample when every bit is set: 20 dots in rings of 3, 7, 7 and 3', () => {
    const { count, positions, angularStep } = decoder(ALL_LAND).decode();
    expect(count).toBe(20);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(angularStep).toBe(Math.PI / 4);
    expect(Array.from(positions)).toStrictEqual(ALL_LAND_DOTS.flat());
  });

  it('computes each dot from its ring, slot and sample index', () => {
    const rings = [
      [3, 0],
      [7, 3],
      [7, 10],
      [3, 17],
    ];
    const expected = rings.flatMap(([samples, first], ring) =>
      Array.from({ length: samples }, (_, slot) => dot(ring, slot, samples, seedOf(first + slot))),
    );
    expect(ALL_LAND_DOTS).toStrictEqual(expected);
  });

  it('gives dots the seed of their sample index: 0 for the first, then the golden-ratio sequence', () => {
    const seeds = ALL_LAND_DOTS.map(([, , , seed]) => seed);
    expect(seeds.slice(0, 3)).toStrictEqual([0, 0.6180340051651001, 0.2360679805278778]);
    expect(decoder(ALL_LAND).decode().positions).toStrictEqual(
      decoder(ALL_LAND).decode().positions,
    );
  });

  it('reads bit 0 as the least significant bit of the first byte: ring 0, slot 0', () => {
    const { count, positions } = decoder([0b1, 0, 0]).decode();
    expect([count, Array.from(positions)]).toStrictEqual([1, dot(0, 0, 3, 0)]);
  });

  it('indexes across ring boundaries and shifts odd rings by half a step: bit 9 is ring 1, slot 6', () => {
    const { count, positions } = decoder([0, 0b10, 0]).decode();
    expect([count, Array.from(positions)]).toStrictEqual([1, dot(1, 6, 7, seedOf(9))]);
  });

  it('does not shift even rings: bit 10 is ring 2, slot 0', () => {
    const { count, positions } = decoder([0, 0b100, 0]).decode();
    expect([count, Array.from(positions)]).toStrictEqual([1, dot(2, 0, 7, seedOf(10))]);
  });

  it('places southern rings below the equator and northern ones above, at sin(latitude)', () => {
    expect([
      decoder([0b1, 0, 0]).decode().positions[1],
      decoder([0, 0, 0b1000]).decode().positions[1],
    ]).toStrictEqual([
      Math.fround(Math.sin(-Math.PI / 2 + (0.5 * Math.PI) / 4)),
      Math.fround(Math.sin(-Math.PI / 2 + (3.5 * Math.PI) / 4)),
    ]);
  });

  it('emits dots in bitset order', () => {
    const { count, positions } = decoder([0b101, 0, 0]).decode();
    expect([count, Array.from(positions)]).toStrictEqual([
      2,
      [...dot(0, 0, 3, 0), ...dot(0, 2, 3, seedOf(2))],
    ]);
  });

  it('counts only the bits it owns, ignoring padding in the last byte', () => {
    expect(decoder([0xff, 0xff, 0xff]).decode().count).toBe(20);
  });

  it('samples each ring of the real 180-ring grid at round(2 pi cos(lat) / step): 3 at the poles, 360 at the equator', () => {
    const rings = 180,
      step = Math.PI / rings;
    const perRing = Array.from({ length: rings }, (_, ring) =>
      Math.floor((2 * Math.PI * Math.cos(-Math.PI / 2 + (ring + 0.5) * step)) / step + 0.5),
    );
    const total = perRing.reduce((sum, value) => sum + value, 0);
    expect([perRing[0], perRing[rings - 1], perRing[rings / 2]]).toStrictEqual([3, 3, 360]);
    const { count, positions } = decoder(
      Array.from({ length: Math.ceil(total / 8) }, () => 0xff),
      rings,
    ).decode();
    expect([count, positions.length]).toStrictEqual([total, total * 4]);
  });
});
