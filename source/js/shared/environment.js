export class Environment {
  /** The header button is pressed: data-motion on the root element says "paused". */
  static get motionPaused() {
    return document.documentElement.dataset.motion === 'paused';
  }

  /**
   * Motion is off. Once the page has set data-motion (before its first paint: from the visitor's saved choice, else from the system
   * setting) that attribute is the answer, so playing again works for a visitor whose system asks for less motion. Before that
   * the system setting decides.
   */
  static get prefersReducedMotion() {
    const chosen = document.documentElement.dataset.motion;
    return chosen ? chosen === 'paused' : matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  static get hasFinePointer() {
    return matchMedia('(pointer: fine)').matches;
  }

  static get isWideViewport() {
    return matchMedia('(min-width: 900px)').matches;
  }

  static get isApplePlatform() {
    return /Mac|iPhone|iPad/.test(navigator.platform);
  }

  static get supportsPopover() {
    return 'popover' in HTMLElement.prototype;
  }

  static get supportsScrollTimeline() {
    return CSS.supports('animation-timeline', 'scroll()');
  }
}
