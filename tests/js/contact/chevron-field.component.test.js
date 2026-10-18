import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChevronField } from '@site/js/contact/chevron-field.js';
import { RecordingContext } from '../../support/recording-context.js';
import { WindowListeners } from '../../support/window-listeners.js';

const FINE = '(pointer: fine)',
  REDUCED = '(prefers-reduced-motion: reduce)';
const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );

describe('ChevronField', () => {
  let canvas, context, colors, listeners, frames, resizeObservers, visibilityObservers;
  const create = () => new ChevronField(canvas, colors);

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML =
      '<canvas id="field" style="display:block;width:540px;height:270px"></canvas>';
    canvas = document.getElementById('field');
    context = new RecordingContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    colors = {
      accentBytes: vi.fn(() => [200, 240, 60]),
      foregroundBytes: vi.fn(() => [100, 110, 120]),
    };
    stubMedia([FINE]);
    vi.stubGlobal('devicePixelRatio', 2);
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    listeners = new WindowListeners().track();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    resizeObservers = [];
    visibilityObservers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          this.observed = [];
          resizeObservers.push(this);
        }
        observe(target) {
          this.observed.push(target);
        }
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          this.observed = [];
          visibilityObservers.push(this);
        }
        observe(target) {
          this.observed.push(target);
        }
      },
    );
  });

  afterEach(() => {
    listeners.release();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.motion;
    document.body.removeAttribute('style');
  });

  it('asks the canvas for an alpha, desynchronized 2D context', () => {
    create();
    expect(canvas.getContext).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).toHaveBeenNthCalledWith(1, '2d', {
      alpha: true,
      desynchronized: true,
    });
  });

  describe('mount', () => {
    it('reads the accent and text colors once and sizes the bitmap for the pixel ratio, capped at 1.5', () => {
      create().mount();
      expect([
        colors.accentBytes.mock.calls.length,
        colors.foregroundBytes.mock.calls.length,
        canvas.width,
        canvas.height,
      ]).toStrictEqual([1, 1, 810, 405]);
    });

    it('uses the real pixel ratio below the cap', () => {
      vi.stubGlobal('devicePixelRatio', 1);
      create().mount();
      expect([canvas.width, canvas.height]).toStrictEqual([540, 270]);
    });

    it('lays out a grid of glyphs at a 54 px gap, one more than fits in each direction: 11 x 6 = 66', () => {
      stubMedia([FINE, REDUCED]);
      create().mount();
      context.calls = [];
      resizeObservers[0].callback();
      expect(context.callsTo('moveTo')).toHaveLength(66);
    });

    it('uses a 64 px gap without a fine pointer: 10 x 6 = 60 glyphs', () => {
      stubMedia([REDUCED]);
      create().mount();
      context.calls = [];
      resizeObservers[0].callback();
      expect(context.callsTo('moveTo')).toHaveLength(60);
    });

    it('paints once at mount under reduced motion: the first resize draws the still frame and nothing draws again', () => {
      stubMedia([FINE, REDUCED]);
      create().mount();
      expect(context.callsTo('moveTo')).toHaveLength(66);
    });

    it('watches the canvas size', () => {
      create().mount();
      expect([resizeObservers.length, resizeObservers[0].observed]).toStrictEqual([1, [canvas]]);
    });

    it('keeps its loop for visitors who prefer reduced motion, but the loop stops at its first frame and draws nothing', () => {
      stubMedia([FINE, REDUCED]);
      create().mount();
      context.calls = [];
      visibilityObservers[0].callback([
        { isIntersecting: true, boundingClientRect: { width: 540, height: 270 } },
      ]);
      expect(frames).toHaveLength(1);
      frames.shift()(6000);
      expect([context.callsTo('moveTo').length, frames.length]).toStrictEqual([0, 0]);
    });

    it('with motion, starts a render loop on the canvas and tracks the pointer and the cursor leaving', () => {
      create().mount();
      expect([
        visibilityObservers.length,
        visibilityObservers[0].observed,
        listeners.registered,
      ]).toStrictEqual([1, [canvas], ['scroll', 'visibilitychange', 'pointermove', 'mouseleave']]);
    });

    it('does not track the pointer on a touch device', () => {
      stubMedia([]);
      create().mount();
      expect(listeners.registered).toStrictEqual(['scroll', 'visibilitychange']);
    });
  });

  describe('the motion setting', () => {
    const onScreen = () =>
      visibilityObservers[0].callback([
        { isIntersecting: true, boundingClientRect: { width: 540, height: 270 } },
      ]);

    it('stops drawing when the visitor pauses motion, and draws again after sync() once it is back on', () => {
      const field = create();
      field.mount();
      onScreen();
      context.calls = [];
      frames.shift()(6000);
      expect([context.callsTo('moveTo').length, frames.length]).toStrictEqual([66, 1]);
      document.documentElement.dataset.motion = 'paused';
      context.calls = [];
      frames.shift()(6016);
      expect([context.callsTo('moveTo').length, frames.length]).toStrictEqual([0, 0]);
      delete document.documentElement.dataset.motion;
      field.sync();
      expect(frames).toHaveLength(1);
      frames.shift()(6032);
      expect([context.callsTo('moveTo').length, frames.length]).toStrictEqual([66, 1]);
    });
  });

  describe('following the pointer', () => {
    const FRAME_MS = 16;
    let clock;
    const start = () => {
      create().mount();
      visibilityObservers[0].callback([
        { isIntersecting: true, boundingClientRect: { width: 540, height: 270 } },
      ]);
      clock = 6000;
    };
    /** Runs `count` frames of the render loop, 16 ms apart. */
    const run = (count) => {
      for (let frame = 0; frame < count; frame++) {
        frames.shift()(clock);
        clock += FRAME_MS;
      }
    };
    const pointerTo = (clientX, clientY) =>
      window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY }));
    const draws = () => context.callsTo('clearRect').length;
    /** The stroke colors of the last frame that drew, in the order they were first used. */
    const strokeColors = () => [
      ...new Set(
        context.writes.filter(([name]) => name === 'strokeStyle').map(([, value]) => value),
      ),
    ];
    /** The glyphs of the last batch of the last frame, the most lit ones: where each chevron starts. */
    const brightest = () => {
      const batches = [];
      let current = [];
      for (const [name, ...args] of context.calls) {
        if (name === 'beginPath') current = [];
        else if (name === 'moveTo') current.push(args);
        else if (name === 'stroke') batches.push(current);
      }
      return batches.at(-1);
    };
    const rounded = (positions) =>
      positions.map((position) => position.map((value) => Math.round(value * 100) / 100));
    const lastFrame = () => {
      context.calls = [];
      context.writes = [];
      while (draws() === 0) run(1);
      return strokeColors();
    };

    it('lights up the glyphs around the pointer, in ten steps from the text color to the accent, the brightest on either side of it', () => {
      start();
      pointerTo(270, 135);
      run(60);
      const text = [100, 110, 120],
        accent = [200, 240, 60];
      const steps = Array.from({ length: 10 }, (_, level) => {
        const channel = (i) => Math.round(text[i] + ((accent[i] - text[i]) * level) / 9);
        return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
      });
      expect(lastFrame()).toStrictEqual(steps);
      expect(rounded(brightest())).toStrictEqual([
        [216.15, 96.09],
        [258.48, 163.69],
      ]);
    });

    it('goes back to wandering on its own when the cursor leaves the page: 400 frames later the brightest glyphs are where the wandering light is, not at the pointer', () => {
      start();
      pointerTo(270, 135);
      run(60);
      document.dispatchEvent(new Event('mouseleave'));
      run(400);
      lastFrame();
      expect(rounded(brightest())).toStrictEqual([
        [62.47, 154.52],
        [-3.47, 204.66],
        [113.56, 224.4],
      ]);
    });

    it('draws every frame while the pointer is near, 13 frames being 13 draws', () => {
      start();
      pointerTo(270, 135);
      context.calls = [];
      run(13);
      expect(draws()).toBe(13);
    });

    it('draws only every fourth frame while the pointer is more than 300 px outside the canvas and nothing is lit: 13 frames, 4 draws, at frames 1, 4, 8 and 12', () => {
      start();
      pointerTo(3000, 3000);
      context.calls = [];
      const drawn = [];
      for (let frame = 1; frame <= 13; frame++) {
        const before = draws();
        run(1);
        if (draws() > before) drawn.push(frame);
      }
      expect(drawn).toStrictEqual([1, 4, 8, 12]);
    });

    it('draws every frame again as soon as the pointer comes back near', () => {
      start();
      pointerTo(3000, 3000);
      run(30);
      pointerTo(270, 135);
      context.calls = [];
      run(13);
      expect(draws()).toBe(13);
    });

    it('measures the canvas again when the page scrolls, so the pointer is read against where the canvas is now', () => {
      start();
      pointerTo(270, 135);
      run(60);
      canvas.style.marginTop = '900px';
      window.dispatchEvent(new Event('scroll'));
      run(120);
      expect(lastFrame()).toStrictEqual(['rgb(100 110 120)']);
    });

    it('reads the colors from the theme again every 60 frames of drawing, the one at mount counting as the first', () => {
      start();
      pointerTo(270, 135);
      run(58);
      const before = colors.accentBytes.mock.calls.length;
      run(1);
      expect([before, colors.accentBytes.mock.calls.length]).toStrictEqual([1, 2]);
    });
  });

  describe('drawing', () => {
    beforeEach(() => stubMedia([FINE, REDUCED]));
    const draw = () => {
      context.calls = [];
      context.writes = [];
      resizeObservers[0].callback();
    };

    it('scales to the pixel ratio and clears the whole canvas before painting', () => {
      create().mount();
      draw();
      expect(context.calls.slice(0, 2)).toStrictEqual([
        ['setTransform', 1.5, 0, 0, 1.5, 0, 0],
        ['clearRect', 0, 0, 540, 270],
      ]);
    });

    it('paints every glyph exactly once, as a chevron of one move and two lines', () => {
      create().mount();
      draw();
      expect([context.callsTo('moveTo').length, context.callsTo('lineTo').length]).toStrictEqual([
        66, 132,
      ]);
    });

    it('opens a batch for every breath level and edge band (3 x 4) and strokes the 6 that have glyphs', () => {
      create().mount();
      draw();
      expect([context.callsTo('beginPath').length, context.callsTo('stroke').length]).toStrictEqual(
        [12, 6],
      );
    });

    it('fades each breath level in four steps toward the top and bottom edges, then leaves the alpha at 1', () => {
      create().mount();
      draw();
      expect(
        context.writes.filter(([name]) => name === 'globalAlpha').map(([, value]) => value),
      ).toStrictEqual([
        0.0125, 0.025, 0.037500000000000006, 0.05, 0.02, 0.04, 0.06, 0.08, 0.0275, 0.055, 0.0825,
        0.11, 1,
      ]);
    });

    it('starts with the first chevron of the grid, as a move and two lines', () => {
      create().mount();
      draw();
      expect(context.calls.slice(0, 6)).toStrictEqual([
        ['setTransform', 1.5, 0, 0, 1.5, 0, 0],
        ['clearRect', 0, 0, 540, 270],
        ['beginPath'],
        ['moveTo', -7.25, -10],
        ['lineTo', -2.75, -5],
        ['lineTo', -7.25, 0],
      ]);
    });

    it('uses round caps and joins', () => {
      create().mount();
      draw();
      expect(context.writes.slice(0, 2)).toStrictEqual([
        ['lineCap', 'round'],
        ['lineJoin', 'round'],
      ]);
    });

    it('draws resting glyphs in the text color at 1.6 px', () => {
      create().mount();
      draw();
      const used = (name) => [
        ...new Set(
          context.writes.filter(([written]) => written === name).map(([, value]) => value),
        ),
      ];
      expect([used('strokeStyle'), used('lineWidth')]).toStrictEqual([['rgb(100 110 120)'], [1.6]]);
    });
  });

  describe('resize', () => {
    it('rebuilds the grid and the bitmap when the canvas changes size', () => {
      stubMedia([FINE, REDUCED]);
      create().mount();
      canvas.style.width = '270px';
      canvas.style.height = '108px';
      context.calls = [];
      resizeObservers[0].callback();
      expect([canvas.width, canvas.height, context.callsTo('moveTo').length]).toStrictEqual([
        405, 162, 18,
      ]);
    });
  });

  describe('recolor', () => {
    it('reads both colors again from the theme', () => {
      const field = create();
      field.mount();
      field.recolor();
      expect([
        colors.accentBytes.mock.calls.length,
        colors.foregroundBytes.mock.calls.length,
      ]).toStrictEqual([2, 2]);
    });
  });
});
