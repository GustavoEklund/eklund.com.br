import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FuzzyMatch } from '@site/js/command-palette/fuzzy-match.js';

const word = fc.string({ unit: fc.constantFrom(...'abcdef gh'), maxLength: 12 });
const isSubsequence = (query, candidate) => {
  let position = 0;
  for (const character of candidate)
    if (position < query.length && character === query[position]) position++;
  return position === query.length;
};

describe('FuzzyMatch properties', () => {
  it('scores a string against itself as n * (n + 1): every letter extends the run', () =>
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'abcdef'), minLength: 1, maxLength: 12 }),
        (text) => {
          expect(FuzzyMatch.score(text, text)).toBe(text.length * (text.length + 1));
        },
      ),
    ));

  it('matches exactly when the query is a subsequence of the candidate', () =>
    fc.assert(
      fc.property(word, word, (query, candidate) => {
        expect(FuzzyMatch.score(query, candidate) >= 0).toBe(isSubsequence(query, candidate));
      }),
    ));

  it('scores a match with an even number, since every step adds twice the run, and a non-match with -1', () =>
    fc.assert(
      fc.property(word, word, (query, candidate) => {
        const score = FuzzyMatch.score(query, candidate);
        expect(isSubsequence(query, candidate) ? score % 2 : score).toBe(
          isSubsequence(query, candidate) ? 0 : -1,
        );
      }),
    ));

  it('normalizing is idempotent', () =>
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(FuzzyMatch.normalize(FuzzyMatch.normalize(text))).toBe(FuzzyMatch.normalize(text));
      }),
    ));
});
