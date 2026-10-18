import { Environment } from '../shared/environment.js';

/**
 * Smooth scrolling for same-document anchors, done in JS so the initial fragment
 * jump stays instant: `scroll-behavior: smooth` on the root would animate it,
 * sweeping every lazily laid-out section and registering layout shifts.
 */
export class AnchorLinks {
  install() {
    document.addEventListener('click', (event) => this.#onClick(event));
  }

  #onClick(event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    const hash = link.getAttribute('href');
    const target = hash === '#' ? document.documentElement : document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: Environment.prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    history.pushState(null, '', hash === '#' ? location.pathname : hash);
    if (hash !== '#') AnchorLinks.#moveFocusTo(target);
  }

  /** What a browser does with a fragment link: the next Tab continues from the target. Without it a skip link would skip nothing. */
  static #moveFocusTo(target) {
    if (!target.matches('a[href], button, input, summary, [tabindex]'))
      target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
