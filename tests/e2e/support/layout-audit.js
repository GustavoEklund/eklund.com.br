/** Measurements the WCAG layout criteria ask for, taken in the page: what is cut off, what is too wide, what is too small to hit. */
export class LayoutAudit {
  /** Lets the entrance animations finish (they would still be growing the globe chips), by pausing motion, which also fixes their end state. */
  static async settle(page) {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          document.documentElement.dataset.motion = 'paused';
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  }

  /**
   * Elements that cut off some of their own text: they clip (overflow hidden or clip), and a line of text the reader
   * can see sits partly outside their box. Text that is hidden from assistive technology, such as the decorative
   * marquee, does not count.
   */
  static clippedText(page) {
    return page.evaluate(() => {
      const clips = (value) => value === 'hidden' || value === 'clip';
      const describe = (element) =>
        `${element.localName}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}`;
      const scrolls = (value) => value === 'auto' || value === 'scroll';
      /** Text inside a scroller that sits between the text and the clipping element can be scrolled to. */
      const reachableByScrolling = (node, element) => {
        for (
          let ancestor = node.parentElement;
          ancestor && ancestor !== element;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (scrolls(style.overflowX) || scrolls(style.overflowY)) return true;
        }
        return false;
      };
      const textIsCut = (element) => {
        const box = element.getBoundingClientRect();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (
            !node.textContent.trim() ||
            parent.closest(
              '[aria-hidden="true"], [hidden], .visually-hidden, svg, details:not([open]) > :not(summary)',
            ) ||
            getComputedStyle(parent).visibility === 'hidden' ||
            reachableByScrolling(node, element)
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width === 0 || rect.height === 0) continue;
            if (
              rect.right > box.right + 1 ||
              rect.left < box.left - 1 ||
              rect.bottom > box.bottom + 1 ||
              rect.top < box.top - 1
            )
              return true;
          }
        }
        return false;
      };
      return [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            element.closest(
              '[aria-hidden="true"], [hidden], dialog:not([open]), svg, details:not([open]) > :not(summary)',
            ) ||
            element.matches('main')
          )
            return false;
          return (clips(style.overflowX) || clips(style.overflowY)) && textIsCut(element);
        })
        .map(describe);
    });
  }

  /** Elements that stick out past the right edge of the screen, other than inside the regions that scroll sideways on purpose. */
  static widerThanScreen(page, scrollRegions) {
    return page.evaluate((regions) => {
      const describe = (element) =>
        `${element.localName}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}`;
      return [...document.querySelectorAll('body *')]
        .filter((element) => {
          if (element.closest(regions.join(','))) return false;
          const style = getComputedStyle(element);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            element.closest('svg, [aria-hidden="true"]')
          )
            return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.right > document.documentElement.clientWidth + 1;
        })
        .map(describe);
    }, scrollRegions);
  }

  /**
   * Targets smaller than 24 x 24 CSS px that do not meet the spacing exception of WCAG 2.5.8: a 24 px circle centered on
   * the target must touch no other target and no circle of another undersized target. Links inside a sentence are exempt.
   */
  static undersizedTargets(page, minimum = 24) {
    return page.evaluate((size) => {
      const selector =
        'a[href], button, input, select, textarea, summary, [role=slider], [role=option], [tabindex="0"]';
      const describe = (element) =>
        `${element.localName}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}${element.getAttribute('data-locale') ? `[${element.getAttribute('data-locale')}]` : ''}`;
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(element).visibility !== 'hidden' &&
          !element.closest('[hidden], dialog:not([open]), [inert]')
        );
      };
      const isInline = (element) =>
        element.localName === 'a' &&
        getComputedStyle(element).display === 'inline' &&
        element.parentElement.matches('p, li, span, small');
      const targets = [...document.querySelectorAll(selector)].filter(visible);
      const small = targets.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (rect.width < size || rect.height < size) && !isInline(element);
      });
      const circle = (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };
      const touchesCircle = (rect, center) => {
        const dx = Math.max(rect.left - center.x, 0, center.x - rect.right),
          dy = Math.max(rect.top - center.y, 0, center.y - rect.bottom);
        return dx * dx + dy * dy < (size / 2) ** 2;
      };
      return small
        .filter((element) => {
          const center = circle(element);
          const hitsTarget = targets.some(
            (other) =>
              other !== element &&
              !element.contains(other) &&
              !other.contains(element) &&
              touchesCircle(other.getBoundingClientRect(), center),
          );
          const hitsCircle = small.some(
            (other) =>
              other !== element &&
              Math.hypot(circle(other).x - center.x, circle(other).y - center.y) < size,
          );
          return hitsTarget || hitsCircle;
        })
        .map(
          (element) =>
            `${describe(element)} ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`,
        );
    }, minimum);
  }
}
