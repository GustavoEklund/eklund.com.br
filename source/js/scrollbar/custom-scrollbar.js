import { Numbers } from '../shared/math.js';
import { Environment } from '../shared/environment.js';

const MIN_THUMB_PX = 36;

/** Replaces the native scrollbar (fine pointers only): thumb with percentage, section marks, drag to scroll. */
export class CustomScrollbar {
  #root;
  #sections;
  #translator;
  #track;
  #thumb;
  #percent;
  #marks;
  #page = document.documentElement;
  #thumbHeight = 0;
  #thumbRange = 0;
  #dragging = false;

  constructor({ root, sections, translator }) {
    this.#root = root;
    this.#sections = sections;
    this.#translator = translator;
    this.#track = root.querySelector('.scrollbar-track');
    this.#thumb = root.querySelector('.scrollbar-thumb');
    this.#percent = root.querySelector('.scrollbar-thumb b');
    this.#marks = root.querySelector('.scrollbar-marks');
  }

  install() {
    if (!Environment.hasFinePointer) return;
    this.#layout();
    addEventListener('resize', () => this.#layout());
    addEventListener('load', () => this.#layout());
    new ResizeObserver(() => this.#layout()).observe(document.body);
    addEventListener('scroll', () => this.#onScroll(), { passive: true });
    this.#marks.addEventListener('click', (event) => {
      const mark = event.target.closest('i');
      if (mark)
        document
          .querySelector(mark.dataset.target)
          .scrollIntoView({ behavior: Environment.prefersReducedMotion ? 'auto' : 'smooth' });
    });
    const root = this.#root;
    root.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.scrollbar-marks i')) return;
      this.#dragging = true;
      root.classList.add('is-dragging');
      root.setPointerCapture(event.pointerId);
      this.#scrollToPointer(event.clientY);
    });
    root.addEventListener('pointermove', (event) => {
      if (this.#dragging) this.#scrollToPointer(event.clientY);
    });
    root.addEventListener('pointerup', () => this.#endDrag());
    root.addEventListener('pointercancel', () => this.#endDrag());
  }

  #maxScroll() {
    return Math.max(1, this.#page.scrollHeight - innerHeight);
  }

  #onScroll() {
    const progress = Numbers.clamp(scrollY / this.#maxScroll(), 0, 1);
    this.#percent.textContent = `${Math.round(progress * 100)}%`;
    if (!Environment.supportsScrollTimeline)
      this.#thumb.style.translate = `-50% ${progress * this.#thumbRange}px`;
  }

  #layout() {
    const trackHeight = this.#track.getBoundingClientRect().height;
    this.#thumbHeight = Numbers.clamp(
      (trackHeight * innerHeight) / this.#page.scrollHeight,
      MIN_THUMB_PX,
      trackHeight,
    );
    this.#thumbRange = trackHeight - this.#thumbHeight;
    this.#thumb.style.setProperty('--thumb-height', `${this.#thumbHeight}px`);
    this.#thumb.style.setProperty('--thumb-range', `${this.#thumbRange}px`);
    this.#marks.innerHTML = this.#sections
      .map(({ labelKey, selector }) => {
        const y =
          (document.querySelector(selector).offsetTop / this.#page.scrollHeight) * trackHeight;
        return `<i data-label="${this.#translator.t(labelKey)}" data-i18n-attr="data-label:${labelKey}" data-target="${selector}" style="--y:${y.toFixed(1)}px"></i>`;
      })
      .join('');
    this.#onScroll();
  }

  #scrollToPointer(clientY) {
    const rect = this.#track.getBoundingClientRect();
    scrollTo({
      top:
        Numbers.clamp((clientY - rect.top - this.#thumbHeight / 2) / this.#thumbRange, 0, 1) *
        this.#maxScroll(),
      behavior: 'instant',
    });
  }

  #endDrag() {
    this.#dragging = false;
    this.#root.classList.remove('is-dragging');
  }
}
