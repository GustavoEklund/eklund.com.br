const SECTION_IDS = ['status', 'perfil', 'arquitetura', 'carga', 'historico', 'contato'];

/** The page under test: where things are, and the few actions that take more than one call. */
export class SitePage {
  static SECTION_IDS = SECTION_IDS;

  #page;

  constructor(page) {
    this.#page = page;
  }

  get page() {
    return this.#page;
  }

  // --- document -------------------------------------------------------------------------------
  get html() {
    return this.#page.locator('html');
  }
  get metaDescription() {
    return this.#page.locator('meta[name=description]');
  }
  section(id) {
    return this.#page.locator(`#${id}`);
  }

  // --- header ---------------------------------------------------------------------------------
  get logo() {
    return this.#page.locator('.logo');
  }
  navLink(id) {
    return this.#page.locator(`.nav-link[href="#${id}"]`);
  }
  localeLink(tag) {
    return this.#page.locator(`.locale-switcher a[data-locale="${tag}"]`);
  }
  get themeToggle() {
    return this.#page.locator('#theme-toggle');
  }
  get paletteButton() {
    return this.#page.locator('#command-palette-button');
  }
  get sourceButton() {
    return this.#page.locator('#source-button');
  }
  get sourceLink() {
    return this.#page.locator('#source-link');
  }

  // --- command palette ------------------------------------------------------------------------
  get palette() {
    return this.#page.locator('#command-palette');
  }
  get paletteInput() {
    return this.#page.locator('#command-palette-input');
  }
  get paletteOptions() {
    return this.#page.locator('#command-palette-list li');
  }
  get paletteSelected() {
    return this.#page.locator('#command-palette-list li[aria-selected=true]');
  }
  get paletteEmpty() {
    return this.#page.locator('#command-palette-empty');
  }

  // --- globe ----------------------------------------------------------------------------------
  get globe() {
    return this.#page.locator('#globe');
  }
  get globeCanvas() {
    return this.#page.locator('#globe-canvas');
  }
  get pointsChip() {
    return this.#page.locator('#chip-points');
  }
  get framesChip() {
    return this.#page.locator('#chip-fps');
  }

  // --- architecture ---------------------------------------------------------------------------
  get followButton() {
    return this.#page.locator('#architecture-follow');
  }
  get architectureCaption() {
    return this.#page.locator('#architecture-caption');
  }
  get architectureTooltip() {
    return this.#page.locator('#architecture-tooltip');
  }
  get architectureNodes() {
    return this.#page.locator('#architecture-svg g.node');
  }
  get architectureEdges() {
    return this.#page.locator('#architecture-svg path.edge');
  }
  architectureNode(id) {
    return this.#page.locator(`#architecture-svg g.node[data-id="${id}"]`);
  }

  // --- load test ------------------------------------------------------------------------------
  get loadTestRoot() {
    return this.#page.locator('#load-test');
  }
  get loadTestProgress() {
    return this.#page.locator('#load-test-progress i');
  }
  get loadTestState() {
    return this.#page.locator('#load-test-state');
  }
  get loadTestRun() {
    return this.#page.locator('#load-test-run');
  }
  get loadTestWorkers() {
    return this.#page.locator('#load-test-workers');
  }
  get terminalLines() {
    return this.#page.locator('#load-test-terminal .terminal-line');
  }
  get terminalOk() {
    return this.#page.locator('#load-test-terminal .terminal-line.is-ok span');
  }
  get terminalFail() {
    return this.#page.locator('#load-test-terminal .terminal-line.is-fail');
  }
  summaryCell(metric) {
    return this.#page.locator(`#load-test-summary [data-metric="${metric}"] dd`);
  }

  /** The number in a summary tile, without its unit. */
  summaryNumber(metric) {
    return this.summaryCell(metric).evaluate((cell) => cell.firstChild.textContent);
  }

  // --- history, contact, cursor ---------------------------------------------------------------
  get jobCards() {
    return this.#page.locator('#history .job-card');
  }
  get jobHeaders() {
    return this.#page.locator('#history .job-header');
  }
  get emailLink() {
    return this.#page.locator('#email-link');
  }
  get heroEmailButton() {
    return this.#page.locator('.hero-actions [data-copy]');
  }
  get copiedToast() {
    return this.#page.locator('#copied-toast');
  }
  get cursorDot() {
    return this.#page.locator('.cursor-dot');
  }
  get cursorRing() {
    return this.#page.locator('.cursor-ring');
  }
  get cursorLabel() {
    return this.#page.locator('.cursor-ring span');
  }
  get scrollbarPercent() {
    return this.#page.locator('#scrollbar .scrollbar-thumb b');
  }
  get scrollbarMarks() {
    return this.#page.locator('#scrollbar .scrollbar-marks i');
  }

  // --- actions --------------------------------------------------------------------------------
  /** Opens the page and waits until the scripts mounted every feature and the display fonts settled. */
  async open(path = '/') {
    try {
      await this.#page.goto(path);
    } catch (error) {
      // The root address sends a reader of English to /en/ from the head of the page, which interrupts this navigation with that one.
      if (!/interrupted by another navigation/.test(error.message)) throw error;
    }
    await this.#page.waitForFunction(
      () =>
        document.documentElement.classList.contains('fonts-ready') && window.eklund !== undefined,
    );
    return this;
  }

  async pressPaletteShortcut() {
    await this.#page.keyboard.press('Control+K');
  }

  async openPalette() {
    await this.pressPaletteShortcut();
    await this.palette.waitFor({ state: 'visible' });
  }

  async storedValue(key) {
    return this.#page.evaluate((name) => localStorage.getItem(name), key);
  }

  async storeValue(key, value) {
    await this.#page.evaluate(([name, stored]) => localStorage.setItem(name, stored), [key, value]);
  }

  /** The distance from the top of the viewport to the top of an element, in whole pixels. */
  sectionTop(id) {
    return this.#page.evaluate(
      (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().top) + 0,
      `#${id}`,
    ); // + 0 turns -0 into 0
  }

  /** The offset a section is meant to land at when scrolled to (its scroll-margin-top), in whole pixels. */
  sectionScrollMargin(id) {
    return this.#page.evaluate(
      (selector) =>
        Math.round(
          parseFloat(getComputedStyle(document.querySelector(selector)).scrollMarginTop) || 0,
        ),
      `#${id}`,
    );
  }

  /** Puts a section at the top of the viewport at once (no smooth scroll) and lets it render. */
  async jumpTo(id) {
    await this.#page.evaluate(
      (selector) =>
        document.querySelector(selector).scrollIntoView({ behavior: 'instant', block: 'start' }),
      `#${id}`,
    );
    await this.waitForScrollToStop();
  }

  /**
   * Centres an element in the viewport at once, clear of the fixed header. Sections further down are laid out lazily with
   * placeholder heights, so the first jump can land off target; it repeats until the element's centre is on the middle of the screen.
   */
  async centerOn(selector) {
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.#page.evaluate(
        (target) =>
          document.querySelector(target).scrollIntoView({ behavior: 'instant', block: 'center' }),
        selector,
      );
      await this.waitForScrollToStop();
      const offset = await this.#page.evaluate((target) => {
        const rect = document.querySelector(target).getBoundingClientRect();
        return Math.round(rect.top + rect.height / 2 - innerHeight / 2);
      }, selector);
      if (offset === 0) return;
    }
    throw new Error(`Could not centre ${selector}: the page kept moving`);
  }

  /** Waits until the page stopped scrolling (twelve frames without movement, so a smooth scroll is over) and returns where it stopped. */
  async waitForScrollToStop() {
    return this.#page.evaluate(async () => {
      let last = -1,
        stable = 0;
      while (stable < 12) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        stable = Math.abs(scrollY - last) < 0.5 ? stable + 1 : 0;
        last = scrollY;
      }
      return Math.round(scrollY);
    });
  }

  /**
   * Whether a section sits where scrolling to it should leave it: at its scroll-margin-top, or, for the last
   * section that cannot reach the top, with the page scrolled all the way down. Waits until scrolling stopped.
   */
  async landedOn(id) {
    await this.waitForScrollToStop();
    return this.#page.evaluate((selector) => {
      const section = document.querySelector(selector);
      const top = Math.round(section.getBoundingClientRect().top),
        margin = Math.round(parseFloat(getComputedStyle(section).scrollMarginTop) || 0);
      const atBottom = Math.round(scrollY + innerHeight) === document.documentElement.scrollHeight;
      return top === margin || (atBottom && top <= margin);
    }, `#${id}`);
  }

  /** Scrolls from the top to the bottom one viewport at a time, re-measuring the page each step because sections lay out lazily. */
  async scrollThroughPage() {
    return this.#page.evaluate(async () => {
      const frames = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); // two frames: let the step render, not a timed sleep
      let steps = 0;
      scrollTo({ top: 0, behavior: 'instant' });
      await frames();
      while (scrollY + innerHeight < document.documentElement.scrollHeight - 1) {
        scrollBy({ top: Math.round(innerHeight * 0.8), behavior: 'instant' });
        await frames();
        steps++;
      }
      return {
        steps,
        bottom: Math.round(scrollY + innerHeight),
        height: document.documentElement.scrollHeight,
      };
    });
  }

  /** Whether the page is wider than the viewport (0 means no horizontal scrolling). */
  horizontalOverflow() {
    return this.#page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }

  expandedStates() {
    return this.jobHeaders.evaluateAll((headers) =>
      headers.map((header) => header.getAttribute('aria-expanded')),
    );
  }
}
