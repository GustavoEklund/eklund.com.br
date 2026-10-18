import { Environment } from '../shared/environment.js';

/** The top progress bar is CSS-driven; this is the JS fallback for browsers without scroll timelines. */
export class ReadingProgress {
  #bar;

  constructor(bar) {
    this.#bar = bar;
  }

  install() {
    if (Environment.supportsScrollTimeline) return;
    const page = document.documentElement;
    addEventListener(
      'scroll',
      () => {
        this.#bar.style.scale = `${scrollY / Math.max(1, page.scrollHeight - innerHeight)} 1`;
      },
      { passive: true },
    );
  }
}
