import { Numbers } from '../shared/math.js';
import { Dom } from '../shared/dom.js';
import { Formatter } from '../shared/format.js';

const SHIFT_MULTIPLIER = 10;
const HUE_WHEEL_STEP = 5;
const VALUE_DECIMALS = 6; // 31 steps of .05 are 1.5500000000000003 in floating point, and aria-valuenow shows the number as it is

/** A number you drag sideways (or nudge with arrows and the wheel; double click resets). */
export class Scrubber {
  #element;
  #min;
  #max;
  #step;
  #pixelsPerStep;
  #nudge;
  #defaultValue;
  #format;
  #onChange;
  #value;
  #drag = null;

  constructor(element, { format, onChange, initialValue }) {
    this.#element = element;
    this.#min = +element.dataset.min;
    this.#max = +element.dataset.max;
    this.#step = +element.dataset.step;
    this.#pixelsPerStep = +element.dataset.pixelsPerStep;
    this.#nudge = +element.dataset.nudge;
    this.#defaultValue = +element.dataset.default;
    this.#format = format;
    this.#onChange = onChange;
    this.#value = initialValue ?? this.#defaultValue;
  }

  get value() {
    return this.#value;
  }

  mount() {
    const element = this.#element;
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-active');
      this.#drag = { x: event.clientX, value: this.#value };
    });
    element.addEventListener('pointermove', (event) => {
      if (this.#drag)
        this.set(
          this.#drag.value +
            ((event.clientX - this.#drag.x) / this.#pixelsPerStep) *
              this.#step *
              (event.shiftKey ? SHIFT_MULTIPLIER : 1),
        );
    });
    const release = () => {
      this.#drag = null;
      element.classList.remove('is-active');
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('dblclick', () => this.set(this.#defaultValue));
    element.addEventListener('keydown', (event) => {
      const target = this.#valueForKey(event);
      if (target === null) return;
      event.preventDefault();
      this.set(target);
    });
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.set(
          this.#value -
            Math.sign(event.deltaY) * this.#step * (this.#max >= 360 ? HUE_WHEEL_STEP : 1),
        );
      },
      { passive: false },
    );
    this.set(this.#value, false);
    return this;
  }

  set(nextValue, notify = true) {
    this.#value = Numbers.clamp(
      Number((Math.round(nextValue / this.#step) * this.#step).toFixed(VALUE_DECIMALS)),
      this.#min,
      this.#max,
    );
    this.#element.setAttribute('aria-valuenow', this.#value);
    this.render();
    if (notify) this.#onChange(this.#value);
  }

  /** One coarse step up or down (a single click can do what dragging does, through the command palette). */
  nudge(direction) {
    this.set(this.#value + direction * this.#nudge);
  }

  /** The slider keys: arrows by one step (ten with Shift), Page keys by a coarse step, Home and End to the ends. */
  #valueForKey(event) {
    const unit = this.#step * (event.shiftKey ? SHIFT_MULTIPLIER : 1);
    const values = {
      ArrowRight: this.#value + unit,
      ArrowUp: this.#value + unit,
      ArrowLeft: this.#value - unit,
      ArrowDown: this.#value - unit,
      PageUp: this.#value + this.#nudge,
      PageDown: this.#value - this.#nudge,
      Home: this.#min,
      End: this.#max,
    };
    return values[event.key] ?? null;
  }

  /** Redraws the number; the format may depend on the active language. */
  render() {
    const text = this.#format(this.#value);
    this.#element.textContent = text;
    this.#element.setAttribute('aria-valuetext', text);
  }
}

/** The HUD chip above the globe: hue, speed and point multiplier scrubbers. */
export class GlobeControls {
  #root;
  #globe;
  #theme;
  #onInstancesChange;
  #translator;
  #scrubbers = {};

  constructor({ root, globe, theme, onInstancesChange, translator }) {
    this.#root = root;
    this.#globe = globe;
    this.#theme = theme;
    this.#onInstancesChange = onInstancesChange;
    this.#translator = translator;
  }

  mount() {
    const handlers = {
      hue: {
        format: (value) => `${Math.round(value)}°`,
        onChange: (value) => this.#theme.setHue(value),
        initialValue: this.#theme.hue,
      },
      speed: {
        format: (value) => `${Formatter.trimmed(+value)}×`,
        onChange: (value) => this.#globe?.setSpeed(value),
      },
      instances: {
        format: (value) => `×${value}`,
        onChange: (value) => {
          this.#globe?.setInstances(value);
          this.#onInstancesChange?.(value);
        },
      },
    };
    for (const element of Dom.queryAll('.scrubber', this.#root)) {
      const key = element.dataset.control;
      this.#scrubbers[key] = new Scrubber(element, handlers[key]).mount();
    }
    this.#translator.onChange(() =>
      Object.values(this.#scrubbers).forEach((scrubber) => scrubber.render()),
    );
    return this;
  }

  /** One coarse step of a control, for people who cannot drag: key is hue, speed or instances, direction 1 or -1. */
  nudge(key, direction) {
    this.#scrubbers[key].nudge(direction);
  }

  randomizeHue() {
    this.#scrubbers.hue.set(this.#theme.randomizeHue());
    this.#globe?.kick();
  }
}
