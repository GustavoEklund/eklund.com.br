import { describe, it, expect } from 'vitest';
import { PanelFormat } from '../../edge/panel/panel-format.js';

describe('PanelFormat', () => {
  it('writes counts with commas, and a dash for a value that is missing', () => {
    expect([
      PanelFormat.count(0),
      PanelFormat.count(999),
      PanelFormat.count(1_234_567.4),
      PanelFormat.count(null),
      PanelFormat.count(undefined),
    ]).toStrictEqual(['0', '999', '1,234,567', '-', '-']);
  });

  it('writes shares as percentages, with the decimals asked for', () => {
    expect([
      PanelFormat.share(0.5),
      PanelFormat.share(0.12345),
      PanelFormat.share(0.99963, 2),
      PanelFormat.share(1),
      PanelFormat.share(null),
    ]).toStrictEqual(['50%', '12.3%', '99.96%', '100%', '-']);
  });

  it('writes each metric in its unit: CLS bare, the score out of 100, the rest in milliseconds', () => {
    expect([
      PanelFormat.metric('CLS', 0.08949),
      PanelFormat.metric('cls', 0),
      PanelFormat.metric('score', 0.876),
      PanelFormat.metric('LCP', 2_345.6),
      PanelFormat.metric('tbt', 12_000),
      PanelFormat.metric('INP', null),
    ]).toStrictEqual(['0.089', '0', '88', '2,346 ms', '12,000 ms', '-']);
  });

  it('writes sizes, durations, times and p-values', () => {
    expect([
      PanelFormat.bytes(512),
      PanelFormat.bytes(12_345),
      PanelFormat.bytes(3_400_000),
      PanelFormat.duration(0),
      PanelFormat.duration(65_400),
      PanelFormat.time('2026-11-09T14:05:33.000Z'),
      PanelFormat.p(0.0004),
      PanelFormat.p(0.04321),
      PanelFormat.p(null),
      PanelFormat.p(Number.NaN),
    ]).toStrictEqual([
      '512 B',
      '12.3 kB',
      '3.4 MB',
      '0:00',
      '1:05',
      '2026-11-09 14:05 UTC',
      '< 0.001',
      '0.043',
      '-',
      '-',
    ]);
  });
});
