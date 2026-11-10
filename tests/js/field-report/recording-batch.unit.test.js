import { describe, it, expect } from 'vitest';
import { RecordingBatch } from '@site/js/field-report/recording-batch.js';

const CODE = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const T = 1_793_241_000_000;
const RECORDING = { code: CODE, version: '1.2.0', page: '/en/', language: 'en-US', startedAt: 500 };
const META = {
  type: 4,
  data: { href: 'https://eklund.com.br/en/?utm_source=mail&q=x#contact', width: 1280, height: 800 },
  timestamp: T,
};
const SNAPSHOT = {
  type: 2,
  data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { left: 0, top: 0 } },
  timestamp: T + 5,
};
const CLICK = { type: 3, data: { source: 2, type: 2, id: 42, x: 10, y: 20 }, timestamp: T + 900 };

describe('RecordingBatch', () => {
  it('sends nothing until something is recorded', () => {
    expect(new RecordingBatch(RECORDING).next()).toBeNull();
  });

  it("makes a chunk of the events and clicks that wait, with the recording's code and order, numbered from 0", () => {
    const batch = new RecordingBatch(RECORDING);
    batch.addEvent(META);
    batch.addEvent(SNAPSHOT);
    batch.addClick({ region: 'status', viewport: '1280-1535', x: 0.25, y: 0.5 }, 1_400.4);
    const first = JSON.parse(batch.next());
    batch.addEvent(CLICK);
    const second = JSON.parse(batch.next());
    expect([first, second, batch.next(), batch.size]).toStrictEqual([
      {
        v: 1,
        code: CODE,
        seq: 0,
        version: '1.2.0',
        page: '/en/',
        language: 'en-US',
        events: [
          {
            type: 4,
            data: { href: 'https://eklund.com.br/en/', width: 1280, height: 800 },
            timestamp: T,
          },
          SNAPSHOT,
        ],
        clicks: [{ region: 'status', viewport: '1280-1535', x: 0.25, y: 0.5, at: 900 }],
      },
      {
        v: 1,
        code: CODE,
        seq: 1,
        version: '1.2.0',
        page: '/en/',
        language: 'en-US',
        events: [CLICK],
        clicks: [],
      },
      null,
      0,
    ]);
  });

  it('keeps of each event only its type, data and time, and counts the characters that wait', () => {
    const batch = new RecordingBatch(RECORDING);
    batch.addEvent({ ...CLICK, delay: 3, extra: 'x' });
    expect([batch.size, JSON.parse(batch.next()).events]).toStrictEqual([
      JSON.stringify(CLICK).length,
      [CLICK],
    ]);
  });

  it('sends an address it cannot read as empty', () => {
    const batch = new RecordingBatch(RECORDING);
    batch.addEvent({ ...META, data: { ...META.data, href: 'not an address' } });
    expect(JSON.parse(batch.next()).events[0].data.href).toBe('');
  });

  it('drops an event too large for any chunk, and says so', () => {
    const batch = new RecordingBatch(RECORDING);
    const huge = { type: 3, data: { text: 'x'.repeat(700_000) }, timestamp: T };
    expect([batch.addEvent(huge), batch.addEvent(CLICK), batch.size]).toStrictEqual([
      false,
      true,
      JSON.stringify(CLICK).length,
    ]);
  });

  it('splits what waits into chunks that fit the collector, in order', () => {
    const batch = new RecordingBatch(RECORDING);
    const large = (index) => ({
      type: 3,
      data: { index, text: 'x'.repeat(300_000) },
      timestamp: T + index,
    });
    for (const index of [0, 1, 2]) batch.addEvent(large(index));
    const chunks = [batch.next(), batch.next(), batch.next()];
    expect(
      chunks.map((text) => {
        if (text === null) return null;
        const { seq, events } = JSON.parse(text);
        return [
          seq,
          events.map(({ data }) => data.index),
          new TextEncoder().encode(text).length < 2_097_152,
        ];
      }),
    ).toStrictEqual([[0, [0, 1], true], [1, [2], true], null]);
  });

  it('takes at most 200 clicks a chunk, each at most a day from the start', () => {
    const batch = new RecordingBatch(RECORDING);
    for (let index = 0; index < 201; index++)
      batch.addClick({ region: 'other', viewport: '0-359', x: 0, y: 0 }, index === 0 ? 0 : 1e9);
    const { clicks } = JSON.parse(batch.next());
    expect([clicks.length, clicks[0].at, clicks[1].at]).toStrictEqual([200, 0, 86_400_000]);
  });

  it('stops after its thousandth chunk, the last the collector takes', () => {
    const batch = new RecordingBatch(RECORDING);
    const orders = [];
    for (let index = 0; index < 1_001; index++) {
      batch.addEvent(CLICK);
      orders.push(JSON.parse(batch.next() ?? 'null')?.seq ?? null);
    }
    batch.addEvent(CLICK);
    expect([
      orders.at(0),
      orders.at(998),
      orders.at(999),
      orders.at(1_000),
      batch.exhausted,
      batch.next(),
    ]).toStrictEqual([0, 998, 999, null, true, null]);
  });
});
