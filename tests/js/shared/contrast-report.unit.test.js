import { describe, it, expect } from 'vitest';
import { ContrastReport } from '@site/js/shared/contrast-report.js';

const pair = (
  kind,
  ratio,
  {
    large = false,
    minimum = kind === 'text' && !large ? 4.5 : 3,
    enhanced = kind === 'text' ? (large ? 4.5 : 7) : 3,
  } = {},
) => ({ kind, ratio, large, minimum, enhanced, label: kind, labels: [kind], count: 1 });

const PAIRS = [
  pair('text', 4.629999),
  pair('text', 7.5),
  pair('text', 4.49),
  pair('text', 3.62, { large: true }),
  pair('text', 5.2),
  pair('component', 3.249),
  pair('component', 2.99),
  pair('component', 12),
];

describe('ContrastReport', () => {
  const report = new ContrastReport(PAIRS, 3);

  it('hands back the pairs and the number of elements it could not judge', () => {
    expect([report.pairs, report.skipped]).toStrictEqual([PAIRS, 3]);
  });

  it('judges nothing skipped when it is not told', () =>
    expect(new ContrastReport([]).skipped).toBe(0));

  it('hands back every label that matched an element, none when it is not told', () => {
    expect([
      new ContrastReport(PAIRS, 0, ['p', 'a.link']).labels,
      new ContrastReport(PAIRS).labels,
    ]).toStrictEqual([['p', 'a.link'], []]);
  });

  it('counts the pairs', () => expect(report.count).toBe(8));

  it('lists the pairs under their minimum, and counts the rest as passing', () => {
    expect(report.failing).toStrictEqual([PAIRS[2], PAIRS[6]]);
    expect(report.passing).toBe(6);
  });

  it('treats a ratio equal to the minimum as passing', () => {
    expect(new ContrastReport([pair('text', 4.5), pair('component', 3)]).failing).toStrictEqual([]);
  });

  it('counts the pairs that also reach the enhanced level: the 7.5 text, and the 3.249 and 12 components, which have none above 3', () => {
    expect(report.enhanced).toBe(3);
  });

  it('gives the lowest ratio of regular text, cut to two decimals, large text kept apart', () => {
    expect([report.lowest('text'), report.lowest('text', true), report.lowestText]).toStrictEqual([
      4.49, 3.62, 4.49,
    ]);
  });

  it('gives the lowest ratio of components', () =>
    expect([report.lowest('component'), report.lowestComponent]).toStrictEqual([2.99, 2.99]));

  it('cuts instead of rounding: 4.629999 is 4.62', () =>
    expect(new ContrastReport([pair('text', 4.629999)]).lowestText).toBe(4.62));

  it('says 21 for a kind without a pair', () => {
    const empty = new ContrastReport([]);
    expect([
      empty.lowestText,
      empty.lowestComponent,
      empty.lowest('text', true),
      empty.count,
      empty.passing,
      empty.enhanced,
      empty.failing,
    ]).toStrictEqual([21, 21, 21, 0, 0, 0, []]);
  });
});
