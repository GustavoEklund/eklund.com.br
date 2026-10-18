import { Dom } from '../shared/dom.js';
import { Numbers } from '../shared/math.js';
import { Formatter } from '../shared/format.js';
import { SERVICE_COLORS } from './trace-builder.js';

const ZOOM_PADDING = 1.04;
const ZOOM_STEP = 2;
const FULL_VIEW_TOLERANCE = 1e-9;

/** Renders a trace (from `buildTrace`) like a tracing dashboard: minimap, span rows, zoom, details. */
export class TraceViewer {
  #root;
  #builder;
  #translator;
  #rows;
  #ruler;
  #minimap;
  #detail;
  #resetButton;
  #zoomInButton;
  #zoomOutButton;
  #detailHtml = '';
  #trace = null;
  #range = null;
  #selectedIndex = -1;
  #drag = null;
  #skipNextClick = false;
  #minimapDragStart = null;

  constructor({ root, builder, translator }) {
    this.#root = root;
    this.#builder = builder;
    this.#translator = translator;
    this.#rows = root.querySelector('#trace-rows');
    this.#ruler = root.querySelector('#trace-ruler');
    this.#minimap = root.querySelector('#trace-minimap');
    this.#detail = root.querySelector('#trace-detail');
    this.#resetButton = root.querySelector('#trace-reset');
    this.#zoomInButton = root.querySelector('#trace-zoom-in');
    this.#zoomOutButton = root.querySelector('#trace-zoom-out');
  }

  mount() {
    this.#detailHtml = this.#hintHtml(); // the markup already shows the hint: do not rewrite it, a live region would read it again
    this.#bindEvents();
    this.#translator.onChange(() => this.render());
    new ResizeObserver(() => {
      if (this.#trace) this.#layoutOverlay();
    }).observe(this.#root);
    Dom.observeVisibility(
      this.#root,
      (visible) => {
        if (visible) {
          this.render();
          this.#root.classList.add('is-revealed');
        }
      },
      0.15,
    );
  }

  render() {
    const trace = this.#builder.build();
    if (!trace) return;
    this.#trace = trace;
    this.#renderToolbar(trace);
    const [rangeStart, rangeEnd] = this.#visibleRange();
    const span = rangeEnd - rangeStart;
    const percent = (value) => `${(((value - rangeStart) / span) * 100).toFixed(3)}%`;
    const step = Numbers.niceStep(
      span,
      Numbers.clamp(Math.floor(this.#ruler.clientWidth / 110), 2, 7),
    );
    let ticks = '',
      tickLines = '';
    for (let tick = Math.ceil(rangeStart / step) * step; tick <= rangeEnd; tick += step) {
      ticks += `<i style="--x:${percent(tick)}"><b>${Formatter.tickTime(tick)}</b></i>`;
      tickLines += `<i class="tick" style="--x:${percent(tick)}"></i>`;
    }
    this.#ruler.innerHTML = ticks;
    const rowsHtml = trace.spans
      .map((item, index) => {
        const duration = item.end - item.start;
        const visible = item.end > rangeStart && item.start < rangeEnd;
        const barStart = Math.max(item.start, rangeStart),
          barEnd = Math.min(item.end, rangeEnd);
        const bar = visible
          ? `<i class="span-bar" style="--start:${percent(barStart)};--width:${(((barEnd - barStart) / span) * 100).toFixed(3)}%"></i>`
          : '';
        return `<div class="trace-row depth-${item.depth}${index === this.#selectedIndex ? ' is-selected' : ''}" role="option" id="${TraceViewer.#rowId(index)}" aria-selected="${index === this.#selectedIndex}" data-index="${index}" style="--service-color:var(--${SERVICE_COLORS[item.service]});--i:${index}"><span class="col-name">${item.name}</span><span class="col-service"><i></i>${this.#serviceLabel(item.service)}</span><span class="col-duration">${Formatter.milliseconds(duration)}</span><span class="col-share">${Formatter.percent(duration / trace.total)}</span><span class="col-lane">${bar}</span></div>`;
      })
      .join('');
    const marksHtml = trace.marks
      .filter(([, time]) => time >= rangeStart && time <= rangeEnd)
      .map(
        ([name, time, color]) =>
          `<div class="trace-mark${(time - rangeStart) / span > 0.85 ? ' is-flipped' : ''}" style="--x:${percent(time)};--c:var(--${color})"><b>${name} · ${Formatter.milliseconds(time)}</b></div>`,
      )
      .join('');
    this.#rows.innerHTML = `${rowsHtml}<div class="trace-overlay" id="trace-overlay" aria-hidden="true">${tickLines}${marksHtml}<div class="playhead" id="trace-playhead"><b></b></div><div class="selection-box" id="trace-selection"></div></div>`;
    this.#layoutOverlay();
    this.#renderMinimap(trace, rangeStart, span);
    this.#resetButton.hidden = !this.#range;
    this.#showDetail(this.#selectedIndex);
    this.#syncActiveRow();
  }

  static #rowId(index) {
    return `trace-span-${index}`;
  }

  #renderToolbar(trace) {
    const text = (selector, value) => {
      this.#root.querySelector(selector).textContent = value;
    };
    text('#trace-id', trace.id);
    text('#trace-duration', Formatter.milliseconds(trace.total));
    text('#trace-span-count', trace.spans.length);
    text('#trace-service-count', trace.serviceCount);
    text('#trace-start', Formatter.clockWithMilliseconds(trace.startedAt));
  }

  #serviceLabel(service) {
    return this.#translator.t(`trace.services.${service}`);
  }

  #renderMinimap(trace, rangeStart, span) {
    const items = trace.spans.filter((item) => item.depth);
    this.#minimap.innerHTML =
      items
        .map(
          (item, index) =>
            `<i style="left:${((item.start / trace.total) * 100).toFixed(2)}%;width:${Math.max(0.4, ((item.end - item.start) / trace.total) * 100).toFixed(2)}%;top:${((index / items.length) * 100).toFixed(1)}%;background:var(--${SERVICE_COLORS[item.service]})"></i>`,
        )
        .join('') +
      `<b style="left:${((rangeStart / trace.total) * 100).toFixed(2)}%;width:${((span / trace.total) * 100).toFixed(2)}%"></b>`;
  }

  #visibleRange() {
    return this.#range || [0, this.#trace.total * ZOOM_PADDING];
  }

  #layoutOverlay() {
    const lane = this.#rows.querySelector('.col-lane');
    const overlay = this.#rows.querySelector('#trace-overlay');
    if (lane && overlay) {
      overlay.style.left = `${lane.offsetLeft}px`;
      overlay.style.width = `${lane.offsetWidth}px`;
    }
  }

  #showDetail(index) {
    const item = this.#trace?.spans[index];
    const html = item ? this.#detailHtmlOf(item) : this.#hintHtml();
    // The detail is a live region: writing the same markup again would make a screen reader read it again.
    if (html === this.#detailHtml) return;
    this.#detailHtml = html;
    this.#detail.innerHTML = html;
  }

  #hintHtml() {
    return `<p class="trace-hint" data-i18n="trace.hint">${this.#translator.t('trace.hint')}</p>`;
  }

  #detailHtmlOf(item) {
    const t = (key) => this.#translator.t(key);
    const duration = item.end - item.start;
    const attributes = Object.entries(item.attributes)
      .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
      .join('');
    return `<div class="trace-detail-header"><b>${item.name}</b><span class="col-service" style="--service-color:var(--${SERVICE_COLORS[item.service]})"><i></i>${this.#serviceLabel(item.service)}</span><span>${t('trace.detail.start')} <b>${Formatter.milliseconds(item.start)}</b></span><span>${t('trace.detail.duration')} <b>${Formatter.milliseconds(duration)}</b></span><span>${t('trace.detail.share')} <b>${Formatter.percent(duration / this.#trace.total)}</b></span></div><dl class="trace-attributes">${attributes}</dl>`;
  }

  #select(index, scrollIntoView = false) {
    this.#selectedIndex = index;
    Dom.queryAll('.trace-row', this.#rows).forEach((row) => {
      const selected = +row.dataset.index === index;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
    this.#syncActiveRow();
    this.#showDetail(index);
    if (scrollIntoView)
      this.#rows
        .querySelector(`.trace-row[data-index="${index}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }

  /** Points the listbox at the selected span, so a screen reader follows the keyboard selection. */
  #syncActiveRow() {
    if (this.#selectedIndex < 0) this.#rows.removeAttribute('aria-activedescendant');
    else this.#rows.setAttribute('aria-activedescendant', TraceViewer.#rowId(this.#selectedIndex));
  }

  /** Zooms around the selected span (or the middle of the current view) by a factor; a full view is the widest. */
  #zoomBy(factor) {
    const [rangeStart, rangeEnd] = this.#visibleRange();
    const selected = this.#trace.spans[this.#selectedIndex];
    const center = selected ? (selected.start + selected.end) / 2 : (rangeStart + rangeEnd) / 2;
    const width = (rangeEnd - rangeStart) / factor;
    const widest = this.#trace.total * ZOOM_PADDING;
    // A view zoomed in and out again can come back one rounding error short of the full width: that is the full view.
    if (width >= widest * (1 - FULL_VIEW_TOLERANCE)) {
      this.#range = null;
      this.render();
      return;
    }
    const start = Numbers.clamp(center - width / 2, 0, widest - width);
    this.#zoom(start, start + width);
  }

  #zoom(from, to) {
    if (Math.abs(to - from) < 2) return;
    this.#range = [Math.min(from, to), Math.max(from, to)];
    this.render();
  }

  #laneFraction(clientX) {
    const rect = this.#rows.querySelector('#trace-overlay').getBoundingClientRect();
    return Numbers.clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  #fractionToTime(fraction) {
    const [rangeStart, rangeEnd] = this.#visibleRange();
    return rangeStart + fraction * (rangeEnd - rangeStart);
  }

  /** Listbox keys act on the span list only; Escape works from anywhere in the viewer. */
  #onKeyDown(event) {
    if (!this.#trace) return;
    if (event.key === 'Escape') {
      this.#range = null;
      this.#select(-1);
      this.render();
      return;
    }
    if (event.target !== this.#rows) return;
    const last = this.#trace.spans.length - 1;
    const target = {
      ArrowDown: this.#selectedIndex + 1,
      ArrowUp: this.#selectedIndex - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      this.#select(Numbers.clamp(target, 0, last), true);
      return;
    }
    const zoom = { '+': ZOOM_STEP, '=': ZOOM_STEP, '-': 1 / ZOOM_STEP }[event.key];
    if (zoom) {
      event.preventDefault();
      this.#zoomBy(zoom);
    }
    if (event.key === '0') {
      this.#range = null;
      this.render();
    }
  }

  #bindEvents() {
    const rows = this.#rows;
    const rowOf = (event) => event.target.closest?.('.trace-row');
    rows.addEventListener('pointerover', (event) => {
      const row = rowOf(event);
      if (row && !this.#drag) this.#showDetail(+row.dataset.index);
    });
    rows.addEventListener('pointerleave', () => {
      if (!this.#drag) this.#showDetail(this.#selectedIndex);
    });
    rows.addEventListener('click', (event) => {
      if (this.#skipNextClick) {
        this.#skipNextClick = false;
        return;
      }
      const row = rowOf(event);
      if (row) this.#select(+row.dataset.index === this.#selectedIndex ? -1 : +row.dataset.index);
    });
    rows.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.col-lane')) return;
      this.#drag = { startFraction: this.#laneFraction(event.clientX), moved: false };
      rows.setPointerCapture(event.pointerId);
    });
    rows.addEventListener('pointermove', (event) => {
      const fraction = this.#laneFraction(event.clientX);
      const playhead = rows.querySelector('#trace-playhead');
      if (playhead) {
        playhead.style.setProperty('--x', `${fraction * 100}%`);
        playhead.classList.toggle('is-flipped', fraction > 0.8);
        playhead.firstElementChild.textContent = Formatter.milliseconds(
          this.#fractionToTime(fraction),
        );
      }
      if (this.#drag) {
        const from = Math.min(this.#drag.startFraction, fraction),
          to = Math.max(this.#drag.startFraction, fraction);
        if (to - from > 0.005) this.#drag.moved = true;
        const box = rows.querySelector('#trace-selection');
        box.classList.toggle('is-visible', this.#drag.moved);
        box.style.setProperty('--start', `${from * 100}%`);
        box.style.setProperty('--width', `${(to - from) * 100}%`);
      }
    });
    const endDrag = (event) => {
      if (!this.#drag) return;
      const fraction = this.#laneFraction(event.clientX);
      if (this.#drag.moved) {
        this.#skipNextClick = true;
        this.#zoom(this.#fractionToTime(this.#drag.startFraction), this.#fractionToTime(fraction));
      }
      this.#drag = null;
      rows.querySelector('#trace-selection')?.classList.remove('is-visible');
    };
    rows.addEventListener('pointerup', endDrag);
    rows.addEventListener('pointercancel', () => {
      this.#drag = null;
    });

    const minimapTime = (clientX) => {
      const rect = this.#minimap.getBoundingClientRect();
      return Numbers.clamp((clientX - rect.left) / rect.width, 0, 1) * this.#trace.total;
    };
    this.#minimap.addEventListener('pointerdown', (event) => {
      this.#minimapDragStart = minimapTime(event.clientX);
      this.#minimap.setPointerCapture(event.pointerId);
    });
    this.#minimap.addEventListener('pointerup', (event) => {
      if (this.#minimapDragStart === null) return;
      const end = minimapTime(event.clientX);
      if (Math.abs(end - this.#minimapDragStart) > this.#trace.total * 0.01)
        this.#zoom(this.#minimapDragStart, end);
      this.#minimapDragStart = null;
    });
    this.#resetButton.addEventListener('click', () => {
      this.#range = null;
      this.render();
    });
    this.#zoomInButton.addEventListener('click', () => this.#zoomBy(ZOOM_STEP));
    this.#zoomOutButton.addEventListener('click', () => this.#zoomBy(1 / ZOOM_STEP));
    this.#root.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }
}
