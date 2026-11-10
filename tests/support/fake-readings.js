/**
 * ReadingQueries for the tests of the panel's pages: each reading answers what `answers[name](input)` gives, and every call
 * is recorded with its input, in order.
 */
export class FakeReadings {
  calls = [];

  #answers;

  constructor(answers) {
    this.#answers = answers;
  }

  async run(name, input) {
    this.calls.push([name, input]);
    if (!this.#answers[name]) throw new Error(`no answer for ${name}`);
    return this.#answers[name](input);
  }

  async recording(code) {
    this.calls.push(['recording', code]);
    return this.#answers.recording ? this.#answers.recording(code) : null;
  }

  /** A sample as the readings describe one. */
  static sample(size, minimum = 20) {
    return { size, minimum, enough: size >= minimum };
  }

  /** The answer of `vitals` with these metrics, each `[name, p75, loads]`, and their targets. */
  static vitals(input, metrics, targets = {}) {
    return {
      from: input.from,
      to: input.to,
      page: input.page ?? null,
      device: input.device ?? null,
      version: input.version ?? null,
      metrics: metrics.map(([metric, p75, loads]) => ({
        metric,
        p75,
        good: 0.5,
        needs_improvement: 0.25,
        poor: 0.25,
        targets: targets[metric] ?? [],
        sample: FakeReadings.sample(loads),
      })),
    };
  }
}
