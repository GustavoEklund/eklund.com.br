/** Summary statistics over batch durations, sorted once and reused for every percentile. */
export class DurationSummary {
  #sorted;
  #sum = 0;

  constructor(durations) {
    this.#sorted = Float32Array.from(durations).sort();
    for (const value of this.#sorted) this.#sum += value;
  }

  get count() {
    return this.#sorted.length;
  }

  get min() {
    return this.#sorted[0] ?? 0;
  }

  get max() {
    return this.#sorted[this.#sorted.length - 1] ?? 0;
  }

  get average() {
    return this.count ? this.#sum / this.count : 0;
  }

  percentile(fraction) {
    if (!this.count) return 0;
    return this.#sorted[Math.min(this.count - 1, Math.floor(fraction * this.count))];
  }
}
