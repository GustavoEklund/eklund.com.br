/** Accent- and case-insensitive subsequence matching that rewards consecutive characters. */
export class FuzzyMatch {
  /** Lower case, with every accent (the combining marks U+0300 to U+036F) taken off. */
  static normalize(text) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /** How well `candidate` matches `queryText` (both normalized); -1 when the query is not a subsequence of it. */
  static score(queryText, candidate) {
    let position = 0,
      score = 0,
      streak = 0;
    for (const character of candidate) {
      if (position < queryText.length && character === queryText[position]) {
        position++;
        streak++;
        score += streak * 2;
      } else streak = 0;
    }
    return position === queryText.length ? score : -1;
  }
}
