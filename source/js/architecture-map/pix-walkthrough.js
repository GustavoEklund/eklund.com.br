import { Dom } from '../shared/dom.js';
import { Formatter } from '../shared/format.js';
import { Diagram } from './diagram.js';

const MIN_STEP_MS = 190;
const REAL_TIME_FACTOR = 0.7;
const END_CAPTION_MS = 4000;

/** Moves a tracked packet along the walkthrough steps while a caption narrates and a simulated clock runs. */
export class PixWalkthrough {
  #edgesById;
  #layer;
  #caption;
  #button;
  #translator;
  #steps = Diagram.walkthrough();
  #state = null;

  constructor({ edgesById, layer, caption, button, translator }) {
    this.#edgesById = edgesById;
    this.#layer = layer;
    this.#caption = caption;
    this.#button = button;
    this.#translator = translator;
  }

  get isActive() {
    return this.#state !== null;
  }

  start() {
    if (this.#state) return;
    const packet = Dom.svg('circle', { class: 'packet-tracked', r: 5 });
    const halo = Dom.svg('circle', { class: 'packet-halo', r: 11 });
    this.#layer.append(halo, packet);
    this.#state = { stepIndex: 0, progress: 0, packet, halo, clockMs: 0 };
    this.#caption.hidden = false;
    this.#button.disabled = true;
  }

  advance(deltaSeconds) {
    const state = this.#state;
    const step = this.#steps[state.stepIndex];
    if (!step) return this.#finish();
    const track = this.#trackFor(step);
    const realMs = Math.max(MIN_STEP_MS, step.ms * REAL_TIME_FACTOR);
    if (state.progress === 0) {
      for (const edge of Object.values(this.#edgesById))
        edge.path.classList.toggle('is-highlighted', edge === track.edge);
      if (step.caption)
        this.#caption.innerHTML = `${step.milestone ? `<i>${step.milestone}</i>` : ''}<b>${Formatter.seconds(state.clockMs)}</b>${this.#translator.t(`architecture.walkthrough.${step.caption}`)}`;
    }
    const usedMs = Math.min(deltaSeconds * 1000, (1 - state.progress) * realMs); // a frame longer than what the step still needs does not run the clock past it
    state.progress = Math.min(1, state.progress + usedMs / realMs);
    state.clockMs += (usedMs * step.ms) / realMs;
    const [x, y] = track.pointAt(state.progress);
    for (const circle of [state.packet, state.halo]) {
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
    }
    if (state.progress >= 1) {
      state.stepIndex++;
      state.progress = 0;
    }
  }

  #trackFor(step) {
    if (step.bus) {
      const [fromX, toX] = step.bus,
        y = Diagram.BUS.centerY;
      return { edge: null, pointAt: (k) => [fromX + (toX - fromX) * k, y] };
    }
    const edge = this.#edgesById[step.edge];
    return {
      edge,
      pointAt: (k) => {
        const point = edge.path.getPointAtLength(
          step.reversed ? edge.length * (1 - k) : edge.length * k,
        );
        return [point.x, point.y];
      },
    };
  }

  #finish() {
    this.#state.packet.remove();
    this.#state.halo.remove();
    this.#state = null;
    this.#caption.innerHTML = this.#translator.t('architecture.walkthrough.done');
    setTimeout(() => {
      this.#caption.hidden = true;
    }, END_CAPTION_MS);
    this.#button.disabled = false;
    for (const edge of Object.values(this.#edgesById)) edge.path.classList.remove('is-highlighted');
  }
}
