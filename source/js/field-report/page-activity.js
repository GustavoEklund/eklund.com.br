/** Three clicks this close in time and space are a rage click: the visitor expected something that did not happen. */
const RAGE_CLICKS = 3;
const RAGE_WINDOW_MS = 1_000;
const RAGE_RADIUS_PX = 30;

/**
 * The engagement a report can read from the page itself, as events from fixed lists: a section that reaches the middle of
 * the window or shows half of itself, a link that leaves the site, the first touch of a part that responds to the pointer, and rage clicks. What
 * the visitor typed and where exactly they clicked are never read.
 */
export class PageActivity {
  /** Where a rage click outside the measured sections lands. */
  static PLACES = ['header', 'footer', 'other'];

  #document;
  #sections;
  #links;
  #regions;
  #onEvent;
  #now;
  #IntersectionObserver;
  #observers = [];
  #clicks = [];
  #onClick = (event) => this.#click(event);
  #onPointerDown = (event) => this.#pointerDown(event);

  /**
   * @param {object} options
   * @param {Document} options.document
   * @param {string[]} options.sections the ids of the sections whose arrival counts
   * @param {[string, string][]} options.links [detail, address] for each link that leaves the site; the first whose address
   *   starts the link's address names it, and a mailto: link is 'email'
   * @param {[string, string][]} options.regions [detail, selector] for each part whose first touch counts
   * @param {(name: string, detail: string) => void} options.onEvent
   * @param {() => number} options.now
   * @param {typeof IntersectionObserver} [options.IntersectionObserver]
   */
  constructor({
    document,
    sections,
    links,
    regions,
    onEvent,
    now,
    IntersectionObserver = globalThis.IntersectionObserver,
  }) {
    this.#document = document;
    this.#sections = sections;
    this.#links = links;
    this.#regions = regions;
    this.#onEvent = onEvent;
    this.#now = now;
    this.#IntersectionObserver = IntersectionObserver;
  }

  install() {
    this.#document.addEventListener('click', this.#onClick);
    this.#document.addEventListener('pointerdown', this.#onPointerDown, {
      capture: true,
      passive: true,
    });
    if (this.#IntersectionObserver) {
      const sections = this.#sections
        .map((id) => this.#document.getElementById(id))
        .filter((section) => section !== null);
      // A tall section counts once it crosses a line across the middle of the window; a short one, such as the last, which
      // may never reach that line, once half of it shows.
      this.#observers = [
        [{ rootMargin: '-50% 0px -50% 0px' }, (entry) => entry.isIntersecting],
        [{ threshold: 0.5 }, (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5],
      ].map(([options, reached]) => {
        const observer = new this.#IntersectionObserver((entries) => {
          for (const entry of entries)
            if (reached(entry)) this.#onEvent('section', entry.target.id);
        }, options);
        for (const section of sections) observer.observe(section);
        return observer;
      });
    }
    return this;
  }

  stop() {
    this.#document.removeEventListener('click', this.#onClick);
    this.#document.removeEventListener('pointerdown', this.#onPointerDown, { capture: true });
    for (const observer of this.#observers) observer.disconnect();
    this.#observers = [];
    this.#clicks = [];
  }

  /** The element an event happened on, or null when it was the document or the window. */
  static #element(target) {
    return typeof target?.closest === 'function' ? target : null;
  }

  /** Runs after the page's own handlers, so a link whose click the page took over (copying the address) does not count. */
  #click(event) {
    const target = PageActivity.#element(event.target);
    const link = target?.closest('a[href]');
    if (link && !event.defaultPrevented) {
      const outbound = this.#outbound(link.href);
      if (outbound) this.#onEvent('outbound', outbound);
    }
    this.#rage(event, target);
  }

  #outbound(href) {
    if (href.startsWith('mailto:')) return 'email';
    return this.#links.find(([, address]) => href.startsWith(address))?.[0] ?? null;
  }

  #rage({ clientX, clientY }, target) {
    const now = this.#now();
    const [first] = this.#clicks;
    const close =
      first &&
      now - first.time <= RAGE_WINDOW_MS &&
      Math.hypot(clientX - first.x, clientY - first.y) <= RAGE_RADIUS_PX;
    this.#clicks = close
      ? [...this.#clicks, { time: now, x: clientX, y: clientY }]
      : [{ time: now, x: clientX, y: clientY }];
    if (this.#clicks.length < RAGE_CLICKS) return;
    this.#clicks = [];
    this.#onEvent('rage-click', this.#placeOf(target));
  }

  /** The section the click landed in, else the header or the footer of the page, else 'other'. */
  #placeOf(target) {
    const section = target?.closest('section[id]')?.id;
    if (this.#sections.includes(section)) return section;
    const [header, footer, other] = PageActivity.PLACES;
    if (target?.closest('body > header')) return header;
    if (target?.closest('body > footer')) return footer;
    return other;
  }

  #pointerDown(event) {
    const target = PageActivity.#element(event.target);
    const region = this.#regions.find(([, selector]) => target?.closest(selector));
    if (region) this.#onEvent('interact', region[0]);
  }
}
