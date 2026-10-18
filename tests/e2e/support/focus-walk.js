const MAX_STOPS = 150;

/** Presses Tab from the top of the page and describes every stop, until the focus leaves the page (it reaches the body again). */
export class FocusWalk {
  static async tabThrough(page) {
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const stops = [];
    for (let press = 0; press < MAX_STOPS; press++) {
      await page.keyboard.press('Tab');
      const stop = await FocusWalk.#describeFocus(page);
      if (stop === null) return stops;
      stops.push(stop);
    }
    throw new Error(
      `The focus never left the page in ${MAX_STOPS} presses of Tab: a keyboard trap`,
    );
  }

  /** What the focused element is, in words a person would use, and what the focus ring and the page around it look like. */
  static #describeFocus(page) {
    return page.evaluate(() => {
      const element = document.activeElement;
      if (element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const points = [
        [0.5, 0.5],
        [0.1, 0.1],
        [0.9, 0.1],
        [0.1, 0.9],
        [0.9, 0.9],
      ]
        .map(([x, y]) => [rect.left + rect.width * x, rect.top + rect.height * y])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
      const reachable = points.some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === element || element.contains(hit));
      });
      const text = (element.getAttribute('aria-label') ?? element.textContent)
        .replace(/\s+/g, ' ')
        .trim();
      // Something that does not change with the copy: the id, the language, the control, the link target, or the first class.
      const href = element.getAttribute('href');
      const identity =
        element.id ||
        element.dataset.locale ||
        element.dataset.control ||
        (href && href !== '#' ? href : null) ||
        element.classList[0] ||
        (element.localName === 'summary' ? element.parentElement.classList[0] : null) ||
        href;
      return {
        identity: `${element.localName}:${identity}`,
        label:
          `${element.localName}${element.getAttribute('role') ? `[${element.getAttribute('role')}]` : ''} ${text.slice(0, 40)}`.trim(),
        ring: { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) },
        inView: rect.width > 0 && rect.height > 0 && points.length > 0,
        reachable,
      };
    });
  }
}
