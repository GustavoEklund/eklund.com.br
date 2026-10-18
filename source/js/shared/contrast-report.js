import { Contrast } from './contrast.js';

/**
 * The pairs one ContrastAudit measured. A pair is { kind, label, labels, count, ratio, minimum, enhanced, large, foreground, background },
 * one for each distinct combination, with the (up to six) distinct labels of the elements that have it;
 * `kind` is 'text' or 'component', and `minimum` is the ratio WCAG 2.2 asks of it at level AA.
 */
export class ContrastReport {
  #pairs;
  #skipped;
  #labels;

  constructor(pairs, skipped = 0, labels = []) {
    this.#pairs = pairs;
    this.#skipped = skipped;
    this.#labels = labels;
  }

  get pairs() {
    return this.#pairs;
  }
  /** Elements the audit could not judge: an unreadable background, a color it cannot parse. */
  get skipped() {
    return this.#skipped;
  }
  /** Every label that matched an element, whichever pair it ended up in. */
  get labels() {
    return this.#labels;
  }
  get count() {
    return this.#pairs.length;
  }
  get failing() {
    return this.#pairs.filter((pair) => pair.ratio < pair.minimum);
  }
  get passing() {
    return this.count - this.failing.length;
  }
  /** Pairs that also reach 1.4.6 (AAA); component pairs have no AAA level and count when they pass. */
  get enhanced() {
    return this.#pairs.filter((pair) => pair.ratio >= pair.enhanced).length;
  }

  /** Lowest ratio of the kind, truncated to two decimals; 21 when there is no such pair. `large` picks large text, which only has to reach 3:1. */
  lowest(kind, large = false) {
    const ratios = this.#pairs
      .filter((pair) => pair.kind === kind && pair.large === large)
      .map((pair) => pair.ratio);
    return Contrast.truncate(ratios.length ? Math.min(...ratios) : 21);
  }

  get lowestText() {
    return this.lowest('text');
  }
  get lowestComponent() {
    return this.lowest('component');
  }
}
