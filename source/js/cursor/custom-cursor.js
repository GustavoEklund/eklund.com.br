import { Numbers } from '../shared/math.js';
import { Environment } from '../shared/environment.js';

const HOVER_TARGETS =
  '[data-cursor], .btn, .icon-button, .job-toggle, .job-header, a, button, summary, input, label, canvas, p, h1, h2, h3, li, dt, dd';
const STICKY_TARGETS = '.btn, .icon-button, .job-toggle';
const LINK_TARGETS = 'a, button, summary, input, label';
const MODE_CLASSES = { link: 'is-link', text: 'is-text', label: 'is-label', stuck: 'is-stuck' };
const MAGNET_STRENGTH = 0.22;
const MAGNET_RELEASE_DISTANCE_PX = 28; // pointer this far outside the area that triggered the magnet: let go

/** A dot that follows the pointer and a ring that lags, sticks to buttons and turns into labels. */
export class CustomCursor {
  #dot;
  #ring;
  #label;
  #pointerX = innerWidth / 2;
  #pointerY = innerHeight / 2;
  #ringX = this.#pointerX;
  #ringY = this.#pointerY;
  #stuckTo = null;
  #stickRegion = null; // the area whose hover keeps the magnet on (a whole job header for its small toggle)
  #mode = '';

  constructor({ dot, ring }) {
    this.#dot = dot;
    this.#ring = ring;
    this.#label = ring.querySelector('span');
  }

  /**
   * A cursor only follows the pointer, which the visitor moves, so it stays when motion is paused; what stops is its own movement
   * (the ring trailing behind, stretching, and the buttons leaning toward it).
   */
  static isSupported() {
    return Environment.hasFinePointer;
  }

  install() {
    if (!CustomCursor.isSupported()) return;
    document.documentElement.classList.add('has-custom-cursor');
    this.#keepAboveDialogs();
    addEventListener('pointermove', (event) => this.#onPointerMove(event), { passive: true });
    addEventListener('pointerdown', () => {
      this.#ring.style.opacity = 0.6;
    });
    addEventListener('pointerup', () => {
      this.#ring.style.opacity = '';
    });
    document.addEventListener('mouseleave', () => {
      this.#dot.style.opacity = this.#ring.style.opacity = 0;
      this.#release();
    });
    document.addEventListener('mouseenter', () => {
      this.#dot.style.opacity = this.#ring.style.opacity = '';
    });
    addEventListener('pointerover', (event) => this.#onPointerOver(event));
    requestAnimationFrame(this.#animate);
  }

  /**
   * A modal <dialog> sits in the top layer, above any z-index, so it would hide the cursor (and the system cursor is
   * hidden on this site). The cursor elements are popovers, which also live in the top layer, and showing them again
   * after a dialog opens puts them on top. Without popover support the system cursor comes back while a dialog is open.
   */
  #keepAboveDialogs() {
    const sync = () => this.#syncWithTopLayer();
    const observer = new MutationObserver(sync);
    for (const dialog of document.querySelectorAll('dialog'))
      observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    document.addEventListener(
      'toggle',
      (event) => {
        if (event.target !== this.#dot && event.target !== this.#ring) sync();
      },
      true,
    );
    sync();
  }

  #syncWithTopLayer() {
    if (!Environment.supportsPopover) {
      document.documentElement.classList.toggle(
        'has-custom-cursor',
        !document.querySelector('dialog[open]'),
      );
      return;
    }
    for (const element of [this.#ring, this.#dot]) {
      // the dot is shown last, so it stays above the ring
      if (element.matches(':popover-open')) element.hidePopover();
      element.showPopover();
    }
  }

  #onPointerMove(event) {
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
    this.#dot.style.translate = `calc(${this.#pointerX}px - 50%) calc(${this.#pointerY}px - 50%)`;
  }

  #onPointerOver(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return; // touch and pen have no hover to follow
    const target = event.target.closest?.(HOVER_TARGETS);
    if (this.#stuckTo && this.#stuckTo !== target) this.#release();
    if (!target) return this.#setMode('');
    if (target.dataset.cursor) return this.#setMode('label', target.dataset.cursor);
    const jobHeader = target.closest('.job-header');
    if (jobHeader)
      return this.#stickTo(jobHeader.closest('.job-card').querySelector('.job-toggle'), jobHeader);
    if (target.matches(STICKY_TARGETS)) return this.#stickTo(target);
    if (target.matches(LINK_TARGETS)) return this.#setMode('link');
    this.#setMode('text');
  }

  #setMode(mode, text = '') {
    if (mode === this.#mode && text === this.#label.textContent) return;
    this.#mode = mode;
    this.#ring.className = `cursor-ring${mode ? ` ${MODE_CLASSES[mode]}` : ''}`;
    this.#label.textContent = text;
    this.#dot.classList.toggle('is-hidden', mode === 'stuck' || mode === 'label');
    if (mode !== 'stuck')
      this.#ring.style.width = this.#ring.style.height = this.#ring.style.borderRadius = '';
  }

  /** Lets go of the stuck button and puts it back where the layout placed it. */
  #release() {
    if (!this.#stuckTo) return;
    this.#stuckTo.style.translate = '';
    this.#stuckTo = null;
    this.#stickRegion = null;
    this.#setMode('');
  }

  #isFarFrom(rect) {
    const dx = Math.max(rect.left - this.#pointerX, 0, this.#pointerX - rect.right);
    const dy = Math.max(rect.top - this.#pointerY, 0, this.#pointerY - rect.bottom);
    return Math.hypot(dx, dy) > MAGNET_RELEASE_DISTANCE_PX;
  }

  #stickTo(element, region = element) {
    this.#stuckTo = element;
    this.#stickRegion = region;
    const rect = element.getBoundingClientRect();
    this.#setMode('stuck');
    this.#ring.style.width = `${rect.width + 14}px`;
    this.#ring.style.height = `${rect.height + 14}px`;
    this.#ring.style.borderRadius = getComputedStyle(element).borderRadius;
  }

  #animate = () => {
    const still = Environment.prefersReducedMotion;
    let targetX = this.#pointerX,
      targetY = this.#pointerY;
    if (this.#stuckTo && this.#isFarFrom(this.#stickRegion.getBoundingClientRect()))
      this.#release();
    if (this.#stuckTo) {
      const rect = this.#stuckTo.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2,
        centerY = rect.top + rect.height / 2;
      const pull = still ? 0 : 0.18;
      targetX = centerX + (this.#pointerX - centerX) * pull;
      targetY = centerY + (this.#pointerY - centerY) * pull;
      if (this.#stuckTo.matches(STICKY_TARGETS))
        this.#stuckTo.style.translate = still
          ? ''
          : `${(this.#pointerX - centerX) * MAGNET_STRENGTH}px ${(this.#pointerY - centerY) * MAGNET_STRENGTH}px`;
    }
    const easing = still ? 1 : this.#stuckTo ? 0.3 : 0.17;
    const nextX = Numbers.lerp(this.#ringX, targetX, easing),
      nextY = Numbers.lerp(this.#ringY, targetY, easing);
    const velocityX = nextX - this.#ringX,
      velocityY = nextY - this.#ringY;
    this.#ringX = nextX;
    this.#ringY = nextY;
    const speed = Math.hypot(velocityX, velocityY);
    const angle = Math.atan2(velocityY, velocityX);
    const stretch =
      still || this.#mode === 'stuck' || this.#mode === 'text'
        ? 1
        : 1 + Math.min(speed * 0.014, 0.5);
    this.#ring.style.transform = `translate(${this.#ringX}px, ${this.#ringY}px) translate(-50%, -50%) rotate(${angle}rad) scale(${stretch}, ${1 / stretch}) rotate(${-angle}rad)`;
    requestAnimationFrame(this.#animate);
  };
}
