import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordingCodes } from '@site/js/privacy/recording-codes.js';

const ADDRESS = 'https://eklund.eklund.workers.dev/v1/session/delete';
const NOW = Date.UTC(2026, 10, 9, 12);
const DAY = 86_400_000;
const CODES = [
  '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
];
const SENT = {
  method: 'POST',
  keepalive: true,
  mode: 'cors',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};
const code = (index) => `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** A stand-in for Preferences that holds values in a map. */
class MemoryStorage {
  values = new Map();
  read(key) {
    return this.values.get(key) ?? null;
  }
  write(key, value) {
    this.values.set(key, String(value));
  }
}

describe('RecordingCodes', () => {
  let storage, now, fetch, codes;
  const stored = () => JSON.parse(storage.values.get('recordings'));

  beforeEach(() => {
    storage = new MemoryStorage();
    now = NOW;
    fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    codes = new RecordingCodes({ address: ADDRESS, storage, now: () => now, fetch });
  });

  it('holds nothing at first, and keeps each new code in localStorage for 30 days', () => {
    const before = [codes.held(), codes.codes];
    codes.add(CODES[0]);
    now += DAY;
    codes.add(CODES[1]);
    expect([before, codes.held(), codes.codes, stored()]).toStrictEqual([
      [false, []],
      true,
      [CODES[0], CODES[1]],
      [
        { code: CODES[0], expires: NOW + 30 * DAY },
        { code: CODES[1], expires: NOW + 31 * DAY },
      ],
    ]);
  });

  it('drops a code once its 30 days are over, from storage too', () => {
    codes.add(CODES[0]);
    now += DAY;
    codes.add(CODES[1]);
    now = NOW + 30 * DAY;
    expect([codes.codes, stored()]).toStrictEqual([
      [CODES[1]],
      [{ code: CODES[1], expires: NOW + 31 * DAY }],
    ]);
  });

  it('reads anything stored that is not a list of codes as none', () => {
    const read = (value) => {
      storage.values.set('recordings', value);
      return codes.codes;
    };
    expect([
      read('not json'),
      read('{"code":"x"}'),
      read(JSON.stringify([{ code: 'someone', expires: NOW + DAY }, { code: CODES[2] }, null])),
      read(JSON.stringify([{ code: CODES[2], expires: NOW + DAY }])),
    ]).toStrictEqual([[], [], [], [CODES[2]]]);
  });

  it('asks the collector to delete the recordings of every code it holds, then forgets them', async () => {
    codes.add(CODES[0]);
    codes.add(CODES[1]);
    await codes.deleteAll();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(1, ADDRESS, {
      ...SENT,
      body: JSON.stringify({ v: 1, codes: [CODES[0], CODES[1]] }),
    });
    expect([codes.held(), stored()]).toStrictEqual([false, []]);
  });

  it('sends at most 50 codes a request', async () => {
    for (let index = 0; index < 51; index++) codes.add(code(index));
    await codes.deleteAll();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(1, ADDRESS, {
      ...SENT,
      body: JSON.stringify({ v: 1, codes: Array.from({ length: 50 }, (_, index) => code(index)) }),
    });
    expect(fetch).toHaveBeenNthCalledWith(2, ADDRESS, {
      ...SENT,
      body: JSON.stringify({ v: 1, codes: [code(50)] }),
    });
    expect(codes.held()).toBe(false);
  });

  it('sends nothing when it holds no code', async () => {
    await codes.deleteAll();
    expect([fetch.mock.calls.length, storage.values.has('recordings')]).toStrictEqual([0, false]);
  });

  it('keeps the codes it could not delete and rejects, so the visitor can try again', async () => {
    for (let index = 0; index < 51; index++) codes.add(code(index));
    fetch
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('too many', { status: 429 }));
    const failed = await codes.deleteAll().catch((error) => error.message);
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offline = await codes.deleteAll().catch((error) => error.message);
    expect([failed, offline, codes.codes]).toStrictEqual([
      'the collector answered 429',
      'Failed to fetch',
      [code(50)],
    ]);
  });

  it('forgets the codes without a request where the page sends nothing, which also records nothing', async () => {
    const nowhere = new RecordingCodes({ address: null, storage, now: () => now, fetch });
    nowhere.add(CODES[0]);
    await nowhere.deleteAll();
    expect([fetch.mock.calls.length, nowhere.held()]).toStrictEqual([0, false]);
  });

  it('uses the browser by default: localStorage, the clock and fetch', () => {
    const codes = new RecordingCodes({ address: ADDRESS });
    localStorage.removeItem('recordings');
    codes.add(CODES[2]);
    const kept = JSON.parse(localStorage.getItem('recordings'));
    localStorage.removeItem('recordings');
    expect([
      kept.map(({ code: kept }) => kept),
      kept[0].expires > Date.now() + 29 * DAY,
    ]).toStrictEqual([[CODES[2]], true]);
  });
});
