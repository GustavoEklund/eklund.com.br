import { Contrast } from './contrast.js';
import { ContrastReport } from './contrast-report.js';
import { ContrastTargets } from './contrast-targets.js';

const PAGE_BASE = { r: 255, g: 255, b: 255, a: 1 };
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'CANVAS']);
const GRADIENT_COLOR = /(?:oklch|oklab|rgba?|color)\([^)]*\)/;
const GENERATED = /::(before|after)/;
const STATE_PSEUDO_CLASSES = /:(hover|focus|focus-visible|focus-within|active|popover-open)/g;
const SLICE_MS = 6;
const MAX_LABELS = 6;
const SETTLED_PROPERTIES = new Set(['color', 'background-color', 'fill', 'stroke', 'opacity']);

/**
 * Measures the contrast of what is on the page right now, from computed styles only, so the result does not
 * depend on scroll position, on content-visibility or on what the globe draws.
 * Text is measured against the background colors of its ancestors (a linear gradient counts as its first color,
 * an SVG label as the rectangle painted just before it). The WebGL globe and the film grain are not sampled.
 * An animated opacity counts as settled, as 1. With `settleTransitions`, color and opacity transitions that are still
 * running are finished before the page is read, so the numbers are the ones the page ends up with, not a mid-fade blend.
 */
export class ContrastAudit {
  #document;
  #surfaces = new Map();
  #opacities = new Map();
  #generated = null;
  #probe = null;
  #pairs = new Map();
  #labels = new Set();
  #skipped = 0;
  #queue = Promise.resolve();

  #settleTransitions;

  constructor(doc = document, { settleTransitions = false } = {}) {
    this.#document = doc;
    this.#settleTransitions = settleTransitions;
  }

  /** @returns {ContrastReport} one pair for each distinct foreground, background and size */
  measure() {
    for (const _ of this.#steps()) {
      /* run to the end */
    }
    return this.#report();
  }

  /** The same measurement in slices of a few milliseconds, so a page that measures itself never holds the main thread. Runs queue up, one at a time. */
  measureWithoutBlocking() {
    const run = async () => {
      let sliceStart = performance.now();
      for (const _ of this.#steps()) {
        if (performance.now() - sliceStart > SLICE_MS) {
          await ContrastAudit.#yieldToBrowser();
          this.#settle();
          sliceStart = performance.now();
        }
      }
      return this.#report();
    };
    this.#queue = this.#queue.then(run, run);
    return this.#queue;
  }

  static #yieldToBrowser() {
    return globalThis.scheduler?.yield
      ? globalThis.scheduler.yield()
      : new Promise((resolve) => setTimeout(resolve));
  }

  #report() {
    return new ContrastReport([...this.#pairs.values()], this.#skipped, [...this.#labels]);
  }

  /** Every element is one step; a driver may pause between steps. */
  *#steps() {
    this.#surfaces.clear();
    this.#opacities.clear();
    yield* this.#bringStyleUpToDate();
    this.#settle();
    this.#pairs.clear();
    this.#labels.clear();
    this.#skipped = 0;
    try {
      yield* this.#textSteps();
      yield* this.#componentSteps();
      this.#measureTokens();
    } finally {
      this.#probe?.remove();
      this.#probe = null;
    }
  }

  /**
   * Reads one color of every element before anything is judged, when transitions are to be settled. The browser leaves the
   * style of a section that is off screen (content-visibility: auto) out of date until something reads it, and the transition
   * that a change of theme starts there begins at that moment, at its old color: settling first would find nothing to finish,
   * and the audit would measure the old color of every section below the fold.
   */
  *#bringStyleUpToDate() {
    if (!this.#settleTransitions) return;
    for (const element of this.#document.body.querySelectorAll('*')) {
      yield;
      getComputedStyle(element).getPropertyValue('color');
    }
  }

  #add(pair, label) {
    this.#labels.add(label);
    const key = [
      pair.kind,
      pair.large,
      ...Object.values(pair.foreground),
      ...Object.values(pair.background),
    ].join('|');
    const known = this.#pairs.get(key);
    if (known) {
      known.count += 1;
      if (known.labels.length < MAX_LABELS && !known.labels.includes(label))
        known.labels.push(label);
    } else {
      this.#pairs.set(key, { ...pair, label, labels: [label], count: 1 });
    }
  }

  // --- text -----------------------------------------------------------------------------------
  *#textSteps() {
    const generated = this.#generatedTextTargets();
    for (const element of this.#document.body.querySelectorAll('*')) {
      yield;
      const style = getComputedStyle(element);
      const opacity = this.#opacityOf(element, style);
      if (
        SKIPPED_TAGS.has(element.tagName) ||
        opacity === 0 ||
        !this.#isVisible(element) ||
        element.matches(':disabled, [aria-disabled="true"]') // inactive components are exempt (1.4.3, 1.4.11)
      )
        continue;
      const label = ContrastAudit.#describe(element);
      if (this.#hasOwnText(element) || (element instanceof HTMLInputElement && element.value)) {
        this.#addText({
          element,
          style,
          opacity,
          property: element instanceof SVGElement ? 'fill' : 'color',
          label,
        });
      }
      if (element instanceof HTMLInputElement && !element.value && element.placeholder) {
        this.#addText({
          element,
          style: getComputedStyle(element, '::placeholder'),
          sizeStyle: style,
          opacity,
          property: 'color',
          label: `${label}::placeholder`,
        });
      }
      for (const pseudo of generated.get(element) ?? [])
        this.#addGeneratedText(element, pseudo, opacity, label);
    }
  }

  #addText({
    element,
    style,
    sizeStyle = style,
    opacity,
    property,
    label,
    background = this.#backgroundOf(element),
  }) {
    const foreground = this.#colorOf(element, style, property, opacity);
    if (!foreground) return;
    const large = Contrast.isLargeText(Number.parseFloat(sizeStyle.fontSize), sizeStyle.fontWeight);
    this.#add(
      this.#pair(
        'text',
        foreground,
        background,
        Contrast.minimum(large),
        Contrast.enhanced(large),
        large,
      ),
      label,
    );
  }

  /** Text from `content`. A positioned box sits outside the element's own background, so it is judged on its own background over what is behind the element. */
  #addGeneratedText(element, pseudo, opacity, label) {
    const style = getComputedStyle(element, pseudo);
    if (style.display === 'none' || !ContrastAudit.#hasContentText(style.content)) return;
    const positioned = style.position === 'absolute' || style.position === 'fixed';
    const own = this.#parseOrSkip(style.backgroundColor);
    const below = positioned ? this.#backgroundBehind(element) : this.#backgroundOf(element);
    const background = own && own.a > 0 ? ContrastAudit.#stack([own], below) : below;
    this.#addText({
      element,
      style,
      opacity,
      property: 'color',
      label: `${label}${pseudo}`,
      background,
    });
  }

  /** The elements that carry text in ::before or ::after, found once from the style sheets: Map<Element, ['::before', ...]>. */
  #generatedTextTargets() {
    this.#generated ??= ContrastAudit.#generatedTextSelectors(this.#document);
    const targets = new Map();
    for (const [selector, pseudo] of this.#generated) {
      let elements;
      try {
        elements = this.#document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const element of elements) {
        const known = targets.get(element) ?? [];
        if (!known.includes(pseudo)) targets.set(element, [...known, pseudo]);
      }
    }
    return targets;
  }

  static #generatedTextSelectors(doc) {
    const found = new Map();
    const visit = (rules) => {
      for (const rule of rules) {
        if (
          rule.selectorText &&
          GENERATED.test(rule.selectorText) &&
          ContrastAudit.#hasContentText(rule.style.content)
        ) {
          for (const part of rule.selectorText.split(',')) {
            const pseudo = GENERATED.exec(part)?.[0];
            if (pseudo)
              found.set(
                `${part.replace(GENERATED, '').replace(STATE_PSEUDO_CLASSES, '').trim()}\u0000${pseudo}`,
                [part.replace(GENERATED, '').replace(STATE_PSEUDO_CLASSES, '').trim(), pseudo],
              );
          }
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of doc.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        /* a cross-origin style sheet: its rules are not readable */
      }
    }
    return [...found.values()].filter(([selector]) => selector !== '');
  }

  static #hasContentText(content) {
    return (
      Boolean(content) &&
      content !== 'none' &&
      content !== 'normal' &&
      content.replace(/^["']|["']$/g, '').trim() !== ''
    );
  }

  // --- components and tokens ------------------------------------------------------------------
  *#componentSteps() {
    for (const { label, selector, property, against } of ContrastTargets.COMPONENTS) {
      for (const element of this.#document.querySelectorAll(selector)) {
        yield;
        if (!this.#isVisible(element)) continue;
        const style = getComputedStyle(element);
        const foreground = this.#colorOf(element, style, property, this.#opacityOf(element, style));
        if (!foreground) continue;
        const backgrounds = against
          ? against.map((token) => this.#token(token))
          : [this.#backgroundBehind(element)];
        for (const background of backgrounds)
          this.#add(
            this.#pair(
              'component',
              foreground,
              background,
              Contrast.COMPONENT,
              Contrast.COMPONENT,
              false,
            ),
            label,
          );
      }
    }
  }

  #measureTokens() {
    for (const { label, foreground, background } of ContrastTargets.TOKENS) {
      this.#add(
        this.#pair(
          'component',
          this.#token(foreground),
          this.#token(background),
          Contrast.COMPONENT,
          Contrast.COMPONENT,
          false,
        ),
        label,
      );
    }
  }

  /** Jumps the running color and opacity transitions to their end, so computed styles are final values. */
  #settle() {
    if (!this.#settleTransitions) return;
    for (const animation of this.#document.getAnimations()) {
      if (
        animation instanceof CSSTransition &&
        SETTLED_PROPERTIES.has(animation.transitionProperty)
      )
        animation.finish();
    }
  }

  /** Resolves a custom property through a hidden element, so light-dark() and oklch() come back computed. */
  #token(name) {
    if (!this.#probe) {
      this.#probe = this.#document.createElement('i');
      this.#probe.hidden = true;
      this.#document.body.append(this.#probe);
    }
    this.#probe.style.color = `var(${name})`;
    return Contrast.parse(getComputedStyle(this.#probe).color);
  }

  // --- colors and surfaces --------------------------------------------------------------------
  #pair(kind, foreground, background, minimum, enhanced, large) {
    return {
      kind,
      foreground,
      background,
      minimum,
      enhanced,
      large,
      ratio: Contrast.ratio(foreground, background),
    };
  }

  /** The color a property paints with, as the screen shows it: opacity applied, null when it paints nothing. */
  #colorOf(element, style, property, opacity) {
    const value = style.getPropertyValue(property);
    if (!value || value === 'none') return null;
    const color = this.#parseOrSkip(value);
    if (!color) return null;
    const fillOpacity =
      property === 'fill' || property === 'stroke'
        ? Number.parseFloat(style.getPropertyValue(`${property}-opacity`))
        : 1;
    const alpha = color.a * opacity * (Number.isFinite(fillOpacity) ? fillOpacity : 1);
    return alpha === 0 ? null : { ...color, a: alpha };
  }

  /** What is painted under the element's own text: its background and everything behind it. */
  #backgroundOf(element) {
    if (!this.#surfaces.has(element)) {
      const layers = this.#layersOf(element);
      const opaque = layers.some((layer) => layer.a === 1);
      const below =
        opaque || !element.parentElement ? PAGE_BASE : this.#backgroundOf(element.parentElement);
      this.#surfaces.set(element, ContrastAudit.#stack(layers, below));
    }
    return this.#surfaces.get(element);
  }

  /** What is painted behind the element itself: the surface of its parent. */
  #backgroundBehind(element) {
    const parent = element.parentElement;
    const below = parent ? this.#backgroundOf(parent) : PAGE_BASE;
    const shape = this.#shapeBeneath(element);
    return shape ? ContrastAudit.#stack([shape], below) : below;
  }

  /** Background layers of one element, topmost first. */
  #layersOf(element) {
    const style = getComputedStyle(element);
    const layers = [];
    const shape = this.#shapeBeneath(element);
    if (shape) layers.push(shape);
    const gradient = style.backgroundImage.startsWith('linear-gradient(')
      ? GRADIENT_COLOR.exec(style.backgroundImage)
      : null;
    if (gradient) layers.push(this.#parseOrSkip(gradient[0]));
    layers.push(this.#parseOrSkip(style.backgroundColor));
    return layers.filter((layer) => layer && layer.a > 0);
  }

  #parseOrSkip(css) {
    try {
      return Contrast.parse(css);
    } catch {
      this.#skipped += 1;
      return null;
    }
  }

  /** Product of the opacity of the element and its ancestors, which are always visited first. */
  #opacityOf(element, style) {
    if (!this.#opacities.has(element)) {
      const own =
        style.opacity === '1' || element.getAnimations().length
          ? 1
          : Number.parseFloat(style.opacity);
      const inherited = element.parentElement
        ? (this.#opacities.get(element.parentElement) ?? 1)
        : 1;
      this.#opacities.set(element, own * inherited);
    }
    return this.#opacities.get(element);
  }

  #isVisible(element) {
    return element.checkVisibility({ visibilityProperty: true });
  }

  #hasOwnText(element) {
    return [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '',
    );
  }

  /** The rectangle an SVG label or mark sits on: the last `rect` painted before it in the nearest group that has one. */
  #shapeBeneath(element) {
    if (!(element instanceof SVGElement) || element.tagName === 'rect') return null;
    for (
      let group = element.parentElement;
      group instanceof SVGElement && group.tagName !== 'svg';
      group = group.parentElement
    ) {
      let beneath = null;
      for (const child of group.children) {
        if (child === element || child.contains(element)) break;
        if (child.tagName === 'rect' && getComputedStyle(child).fill !== 'none') beneath = child;
      }
      if (beneath) {
        const style = getComputedStyle(beneath);
        const fill = this.#parseOrSkip(style.fill);
        return fill && { ...fill, a: fill.a * Number.parseFloat(style.fillOpacity) };
      }
    }
    return null;
  }

  /** Paints the layers, topmost first, over an opaque base. */
  static #stack(layers, base) {
    return [...layers].reverse().reduce((below, layer) => Contrast.over(layer, below), base);
  }

  static #describe(element) {
    const own = element.id
      ? `#${element.id}`
      : element.classList[0]
        ? `.${element.classList[0]}`
        : '';
    return `${element.tagName.toLowerCase()}${own}`;
  }
}
