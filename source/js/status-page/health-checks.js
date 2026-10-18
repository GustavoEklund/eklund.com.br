import { Formatter } from '../shared/format.js';
import { ContrastAudit } from '../shared/contrast-audit.js';

export const Level = Object.freeze({ OPERATIONAL: 0, DEGRADED: 1, DOWN: 2 });

/**
 * One component of this page. Subclasses answer `evaluate()` with { level, detail };
 * every text lives in the dictionary under status.checks.<key>.
 */
export class HealthCheck {
  #translator;
  #key;

  constructor(translator, key) {
    this.#translator = translator;
    this.#key = key;
  }

  get nameKey() {
    return `status.checks.${this.#key}.name`;
  }
  get name() {
    return this.#translator.t(this.nameKey);
  }

  evaluate() {
    throw new Error(`${this.constructor.name} must implement evaluate()`);
  }
  /**
   * The longest text this check's detail can take, so its row can keep that much room while the real text is still being measured.
   * Null for a check whose detail has its final size from the first reading.
   */
  reserve() {
    return null;
  }
  result(level, detail) {
    return { level, detail };
  }
  text(suffix, params) {
    return this.#translator.t(`status.checks.${this.#key}.${suffix}`, params);
  }
  pluralText(suffix, count, params) {
    return this.#translator.plural(`status.checks.${this.#key}.${suffix}`, count, params);
  }
}

export class DocumentCheck extends HealthCheck {
  #readings;
  constructor({ translator, readings }) {
    super(translator, 'document');
    this.#readings = readings;
  }
  evaluate() {
    const m = this.#readings;
    return this.result(
      Level.OPERATIONAL,
      this.text('detail', {
        kilobytes: Math.round(m.transferredBytes / 1024),
        requests: this.pluralText('requests', m.requestCount),
        files: m.ownResources.length + 1,
      }),
    );
  }
  /** Four digits of kilobytes, three of requests and files: the page can only grow past what it shows when the first reading is taken. */
  reserve() {
    return this.text('detail', {
      kilobytes: 9999,
      requests: this.pluralText('requests', 999),
      files: 999,
    });
  }
}

export class FontsCheck extends HealthCheck {
  constructor({ translator }) {
    super(translator, 'fonts');
  }
  evaluate() {
    const loaded = new Set(
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replace(/"/g, ''))
        .filter((family) => !family.endsWith(' Fallback')),
    ).size;
    return this.result(
      loaded >= 3 ? Level.OPERATIONAL : Level.DEGRADED,
      this.text('detail', { loaded }),
    );
  }
}

export class GlobeCheck extends HealthCheck {
  #globe;
  constructor({ translator, globe }) {
    super(translator, 'globe');
    this.#globe = globe;
  }
  evaluate() {
    const globe = this.#globe;
    if (!globe) return this.result(Level.DOWN, this.text('unavailable'));
    const degraded = globe.isRunning && globe.frameRate && globe.frameRate < 24;
    const fps = globe.isRunning ? `${globe.frameRate || '—'} fps` : this.text('paused');
    return this.result(
      degraded ? Level.DEGRADED : Level.OPERATIONAL,
      this.text('detail', {
        points: Formatter.integer(globe.pointCount * globe.instanceCount),
        fps,
        dpr: globe.pixelRatio,
      }),
    );
  }
  /** The longer of "999 fps" and the paused text: the globe stops when it scrolls off the screen, and the row must not grow then. */
  reserve() {
    const globe = this.#globe;
    if (!globe) return null;
    const [longest] = ['999 fps', this.text('paused')].sort((a, b) => b.length - a.length);
    return this.text('detail', {
      points: Formatter.integer(globe.pointCount * globe.instanceCount),
      fps: longest,
      dpr: globe.pixelRatio,
    });
  }
}

export class MainThreadCheck extends HealthCheck {
  #readings;
  constructor({ translator, readings }) {
    super(translator, 'mainThread');
    this.#readings = readings;
  }
  evaluate() {
    const count = this.#readings.longTaskCount;
    return this.result(
      count > 2 ? Level.DEGRADED : Level.OPERATIONAL,
      this.pluralText('detail', count),
    );
  }
  /** Two digits of long tasks, in the plural, which is the longer form. */
  reserve() {
    return this.pluralText('detail', 99);
  }
}

export class LayoutShiftCheck extends HealthCheck {
  #readings;
  constructor({ translator, readings }) {
    super(translator, 'layoutShift');
    this.#readings = readings;
  }
  evaluate() {
    const cls = this.#readings.cumulativeLayoutShift;
    return this.result(
      cls > 0.1 ? Level.DEGRADED : Level.OPERATIONAL,
      this.text('detail', { value: Formatter.decimal(cls, 3) }),
    );
  }
}

export class DependenciesCheck extends HealthCheck {
  constructor({ translator }) {
    super(translator, 'dependencies');
  }
  evaluate() {
    return this.result(Level.OPERATIONAL, this.text('detail', { images: document.images.length }));
  }
}

export class PlatformCheck extends HealthCheck {
  constructor({ translator }) {
    super(translator, 'platform');
  }
  evaluate() {
    const features = [
      ['view transitions', !!document.startViewTransition],
      ['scroll-driven', CSS.supports('animation-timeline', 'scroll()')],
      ['light-dark()', CSS.supports('color', 'light-dark(#000,#fff)')],
      ['popover', 'popover' in HTMLElement.prototype],
    ];
    return this.result(
      Level.OPERATIONAL,
      features.map(([name, supported]) => `${name} ${supported ? '✓' : '✗'}`).join(' · '),
    );
  }
}

/**
 * WCAG 2.2 contrast of the colors this page shows right now (AA: 4.5:1 for text, 3:1 for large text and for
 * controls and graphics). It measures once at load and again after every change of theme or hue.
 */
export class ContrastCheck extends HealthCheck {
  /** After the colors stop moving (a theme switch is a view transition), CSS transitions still run for up to a third of a second. */
  static SETTLE_MS = 500;

  #audit;
  #theme;
  #reading = null;
  #generation = 0;
  #timer = null;

  constructor({ translator, audit, theme }) {
    super(translator, 'contrast');
    this.#audit = audit;
    this.#theme = theme;
    theme.onColorsChange(() => this.#measureAfterTransitions());
    this.#measure();
  }

  evaluate() {
    if (!this.#reading) return this.result(Level.OPERATIONAL, this.text('measuring'));
    const { report, theme, hue } = this.#reading;
    return this.result(
      report.failing.length ? Level.DEGRADED : Level.OPERATIONAL,
      this.text('detail', {
        passing: report.passing,
        pairs: report.count,
        text: Formatter.decimal(report.lowestText, 2),
        component: Formatter.decimal(report.lowestComponent, 2),
        theme: this.text(`themes.${theme}`),
        hue,
      }),
    );
  }

  /** The widest reading: two digits of pairs, the highest ratios the scale shows, the longer theme name and the last hue. */
  reserve() {
    const themes = [this.text('themes.dark'), this.text('themes.light')];
    return this.text('detail', {
      passing: 99,
      pairs: 99,
      text: Formatter.decimal(9.99, 2),
      component: Formatter.decimal(9.99, 2),
      theme: themes.reduce((longest, name) => (name.length > longest.length ? name : longest)),
      hue: 360,
    });
  }

  #measure() {
    const generation = ++this.#generation;
    const { theme, hue } = this.#theme;
    this.#audit.measureWithoutBlocking().then((report) => {
      if (generation === this.#generation) this.#reading = { report, theme, hue };
    });
  }

  #measureAfterTransitions() {
    clearTimeout(this.#timer);
    const generation = ++this.#generation;
    this.#theme.settled.then(() => {
      if (generation === this.#generation)
        this.#timer = setTimeout(() => this.#measure(), ContrastCheck.SETTLE_MS);
    });
  }
}

export class HealthChecks {
  static forThisPage({ readings, globe, translator, theme }) {
    return [
      new DocumentCheck({ translator, readings }),
      new FontsCheck({ translator }),
      new GlobeCheck({ translator, globe }),
      new MainThreadCheck({ translator, readings }),
      new LayoutShiftCheck({ translator, readings }),
      new DependenciesCheck({ translator }),
      new PlatformCheck({ translator }),
      new ContrastCheck({
        translator,
        theme,
        audit: new ContrastAudit(document, { settleTransitions: true }),
      }),
    ];
  }
}
