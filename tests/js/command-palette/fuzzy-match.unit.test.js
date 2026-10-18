import { describe, it, expect } from 'vitest';
import { FuzzyMatch } from '@site/js/command-palette/fuzzy-match.js';

describe('FuzzyMatch.normalize', () => {
  it.each([
    ['Configurações', 'configuracoes'],
    ['AÇÃO', 'acao'],
    ['Histórico', 'historico'],
    ['crème brûlée', 'creme brulee'],
    ['already plain', 'already plain'],
    ['', ''],
  ])('turns %j into %j', (text, expected) => expect(FuzzyMatch.normalize(text)).toBe(expected));

  it('also removes accents written as a letter plus a combining mark', () => {
    expect(FuzzyMatch.normalize('e\u0301')).toBe('e');
  });

  it('keeps digits, spaces and symbols', () =>
    expect(FuzzyMatch.normalize('Ctrl+K 2')).toBe('ctrl+k 2'));
});

describe('FuzzyMatch.score', () => {
  it.each([
    ['abc', 'abc', 12],
    ['ab', 'ab', 6],
    ['a', 'a', 2],
    ['aa', 'aab', 6],
    ['ab', 'a x b', 4],
    ['ab', 'axxb', 4],
    ['ac', 'abc', 4],
    ['bc', 'abc', 6],
    ['go', 'go to profile', 6],
    ['gp', 'go to profile', 4],
  ])('scores query %j in %j as %d', (query, candidate, expected) =>
    expect(FuzzyMatch.score(query, candidate)).toBe(expected),
  );

  it('restarts the run of consecutive letters at every gap', () => {
    expect(FuzzyMatch.score('abc', 'ab c')).toBe(2 + 4 + 2);
    expect(FuzzyMatch.score('abc', 'a bc')).toBe(2 + 2 + 4);
  });

  it.each([
    ['ba', 'ab'],
    ['abc', 'ab'],
    ['z', 'abc'],
    ['aa', 'a'],
    ['a', ''],
  ])('is -1 when %j is not a subsequence of %j', (query, candidate) => {
    expect(FuzzyMatch.score(query, candidate)).toBe(-1);
  });

  it('is 0 for an empty query, which matches everything with no merit', () => {
    expect([FuzzyMatch.score('', 'anything'), FuzzyMatch.score('', '')]).toStrictEqual([0, 0]);
  });

  it('ranks consecutive letters above scattered ones', () => {
    expect([FuzzyMatch.score('ab', 'ab'), FuzzyMatch.score('ab', 'a-b')]).toStrictEqual([6, 4]);
  });

  it('is case sensitive: normalize both sides first', () => {
    expect([
      FuzzyMatch.score('a', 'A'),
      FuzzyMatch.score(FuzzyMatch.normalize('A'), FuzzyMatch.normalize('Á')),
    ]).toStrictEqual([-1, 2]);
  });
});
