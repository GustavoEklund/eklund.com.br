import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Globe } from '@site/js/globe/globe.js';
import { LandDecoder } from '@site/js/globe/land-decoder.js';
import { LAND_BITSET_BASE64, LAND_RING_COUNT } from '@site/js/globe/land-bitset.js';
import { Destinations } from '@site/js/globe/destinations.js';
import { GlobeShaders } from '@site/js/globe/shaders.js';
import { FakeGl } from '../../support/fake-gl.js';
import { WindowListeners } from '../../support/window-listeners.js';

const LAND_COUNT = new LandDecoder({
  ringCount: LAND_RING_COUNT,
  bitsetBase64: LAND_BITSET_BASE64,
}).decode().count;
const HOME_YAW = -((Destinations.HOME.longitude * Math.PI) / 180) - Math.PI / 2;
const HOME_PITCH = Math.min(
  0.6,
  Math.max(-0.6, ((Destinations.HOME.latitude * Math.PI) / 180) * 0.55),
);
const COLORS = {
  accent: [0.1, 0.2, 0.3],
  accentSecondary: [0.4, 0.5, 0.6],
  globeBody: [0.7, 0.8, 0.9],
  globeDot: [0.2, 0.4, 0.6],
  background: [0, 0, 0],
};
const FOCAL = 0.64 * Math.sqrt(8);

/** The rotation matrix the globe uploads for a yaw and a pitch, in single precision. */
const rotation = (yaw, pitch) => {
  const ca = Math.cos(yaw),
    sa = Math.sin(yaw),
    cb = Math.cos(pitch),
    sb = Math.sin(pitch);
  return [ca, sb * sa, -cb * sa, 0, cb, sb, sa, -sb * ca, cb * ca].map(Math.fround);
};

describe('Globe', () => {
  let canvas,
    gl,
    colors,
    listeners,
    frames,
    clock,
    visibility,
    resizeObservers,
    marks,
    onFirstFrame,
    globe;
  const runFrame = (now) => {
    const queued = frames.splice(0);
    for (const callback of queued) callback(now);
  };
  const frameAt = (now) => {
    clock = now;
    runFrame(now);
  };
  const make = (options = {}) => {
    globe = new Globe(canvas, gl, colors, { onFirstFrame, ...options });
    return globe;
  };
  const mountVisible = (options) => {
    make(options).mount();
    visibility[0].callback([
      { isIntersecting: true, boundingClientRect: { width: 600, height: 300 } },
    ]);
    return globe;
  };
  const matrixOfLastFrame = () => Array.from(gl.callsTo('uniformMatrix3fv').at(-1)[3]);
  const clearCalls = () => {
    gl.calls = [];
  };

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML =
      '<canvas id="stage" style="display:block;width:600px;height:300px"></canvas>';
    canvas = document.getElementById('stage');
    canvas.setPointerCapture = vi.fn();
    gl = new FakeGl();
    colors = { snapshot: vi.fn(() => COLORS) };
    onFirstFrame = vi.fn();
    listeners = new WindowListeners().track();
    frames = [];
    clock = 0;
    visibility = [];
    resizeObservers = [];
    marks = vi.spyOn(performance, 'mark').mockImplementation(() => {});
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          visibility.push(this);
        }
        observe() {}
      },
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          resizeObservers.push(this);
        }
        observe() {}
      },
    );
  });

  afterEach(() => {
    listeners.release();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('style');
  });

  describe('create', () => {
    it('asks for a premultiplied-alpha WebGL2 context with antialiasing, preferring the fast GPU', () => {
      const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
      expect(Globe.create(canvas, colors, {})).toBeInstanceOf(Globe);
      expect(getContext).toHaveBeenCalledTimes(1);
      expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
      });
    });

    it('gives nothing back when the browser has no WebGL2', () => {
      vi.spyOn(canvas, 'getContext').mockReturnValue(null);
      expect(Globe.create(canvas, colors, {})).toBeNull();
    });
  });

  describe('before it is mounted', () => {
    it('is idle, with one instance, and not running', () => {
      make();
      expect([globe.instanceCount, globe.isRunning, globe.frameRate]).toStrictEqual([1, false, 0]);
    });

    it.each([
      [2, 1280, 2],
      [3, 1280, 2],
      [1, 1280, 1],
      [2, 600, 1.5],
      [1.25, 600, 1.25],
    ])('uses a pixel ratio of %d on a %d px window: %d', (ratio, width, expected) => {
      vi.stubGlobal('devicePixelRatio', ratio);
      vi.stubGlobal('innerWidth', width);
      expect(make().pixelRatio).toBe(expected);
    });
  });

  describe('mount', () => {
    it('marks init and ready around the setup, and returns itself', () => {
      expect(make().mount()).toBe(globe);
      expect(marks.mock.calls).toStrictEqual([['globe:init'], ['globe:ready']]);
    });

    it('decodes the land and the arcs: the real number of dots and 35 routes', () => {
      make().mount();
      expect([globe.pointCount, globe.arcCount]).toStrictEqual([LAND_COUNT, 35]);
    });

    it('builds the four programs in order, each asking for the uniforms the code sets', () => {
      make().mount();
      const byProgram = (index) =>
        gl
          .callsTo('getUniformLocation')
          .filter(([, handle]) => handle === `program#${index}`)
          .map(([, , name]) => name);
      expect([1, 2, 3, 4].map(byProgram)).toStrictEqual([
        ['uSilhouetteRadius', 'uAspect', 'uBodyColor', 'uGlowColor', 'uIntro'],
        ['uRotation', 'uScale', 'uCameraDistance', 'uIntro', 'uSize', 'uDotColor', 'uDotHighlight'],
        [
          'uRotation',
          'uScale',
          'uResolution',
          'uCameraDistance',
          'uTime',
          'uWidth',
          'uIntro',
          'uColor',
        ],
        [
          'uRotation',
          'uScale',
          'uCameraDistance',
          'uSize',
          'uIntro',
          'uTime',
          'uHomeColor',
          'uDestinationColor',
        ],
      ]);
    });

    it('compiles the shader sources of the four passes, vertex then fragment, body first', () => {
      make().mount();
      expect(gl.callsTo('shaderSource').map(([, , source]) => source)).toStrictEqual(
        [
          GlobeShaders.bodyVertex,
          GlobeShaders.bodyFragment,
          GlobeShaders.dotsVertex,
          GlobeShaders.dotsFragment,
          GlobeShaders.arcsVertex,
          GlobeShaders.arcsFragment,
          GlobeShaders.pinsVertex,
          GlobeShaders.pinsFragment,
        ].map((source) => source.trim()),
      );
    });

    it('uploads four buffers: a quad, the land dots, the arc ribbons and the pins', () => {
      make().mount();
      expect(
        gl
          .callsTo('bufferData')
          .map(([, target, data, usage]) => [target, data.constructor.name, data.length, usage]),
      ).toStrictEqual([
        ['ARRAY_BUFFER', 'Float32Array', 8, 'STATIC_DRAW'],
        ['ARRAY_BUFFER', 'Float32Array', LAND_COUNT * 4, 'STATIC_DRAW'],
        ['ARRAY_BUFFER', 'Float32Array', 35 * 96 * 2 * 9, 'STATIC_DRAW'],
        ['ARRAY_BUFFER', 'Float32Array', 26 * 4, 'STATIC_DRAW'],
      ]);
    });

    it('blends with premultiplied alpha and clears to transparent', () => {
      make().mount();
      expect([
        gl.callsTo('enable'),
        gl.callsTo('blendFunc'),
        gl.callsTo('clearColor'),
      ]).toStrictEqual([
        [['enable', 'BLEND']],
        [['blendFunc', 'ONE', 'ONE_MINUS_SRC_ALPHA']],
        [['clearColor', 0, 0, 0, 0]],
      ]);
    });

    it('reads the theme colors once', () => {
      make().mount();
      expect(colors.snapshot).toHaveBeenCalledTimes(1);
    });

    it('sizes the canvas to its box times the pixel ratio and reports it', () => {
      make().mount();
      expect([canvas.width, canvas.height, globe.canvasSize]).toStrictEqual([
        1200,
        600,
        '1200×600',
      ]);
    });

    it('resizes when the canvas box changes, and draws once again', () => {
      mountVisible();
      frameAt(16);
      canvas.style.width = '300px';
      canvas.style.height = '150px';
      clearCalls();
      resizeObservers[0].callback();
      expect([canvas.width, canvas.height, globe.canvasSize, gl.callsTo('viewport')]).toStrictEqual(
        [600, 300, '600×300', []],
      );
    });

    it('does not run until the canvas is on screen, then runs', () => {
      make().mount();
      expect(globe.isRunning).toBe(true);
      frameAt(16);
      expect(gl.callsTo('drawArrays')).toStrictEqual([]);
      visibility[0].callback([
        { isIntersecting: true, boundingClientRect: { width: 600, height: 300 } },
      ]);
      frameAt(32);
      expect(gl.callsTo('drawArrays').length).toBe(37);
    });
  });

  describe('a frame', () => {
    beforeEach(() => {
      mountVisible();
      clearCalls();
    });
    const drawCalls = () =>
      gl.calls.filter(([name]) =>
        [
          'viewport',
          'clear',
          'useProgram',
          'bindVertexArray',
          'drawArrays',
          'drawArraysInstanced',
        ].includes(name),
      );

    it('draws the body, the dots, 35 arcs and the pins, in that order, with the right vertex ranges', () => {
      frameAt(16);
      expect(drawCalls()).toStrictEqual([
        ['viewport', 0, 0, 1200, 600],
        ['clear', 'COLOR_BUFFER_BIT'],
        ['useProgram', 'program#1'],
        ['bindVertexArray', 'vao#1'],
        ['drawArrays', 'TRIANGLE_STRIP', 0, 4],
        ['useProgram', 'program#2'],
        ['bindVertexArray', 'vao#2'],
        ['drawArraysInstanced', 'POINTS', 0, LAND_COUNT, 1],
        ['useProgram', 'program#3'],
        ['bindVertexArray', 'vao#3'],
        ...Array.from({ length: 35 }, (_, arc) => ['drawArrays', 'TRIANGLE_STRIP', arc * 192, 192]),
        ['useProgram', 'program#4'],
        ['bindVertexArray', 'vao#4'],
        ['drawArrays', 'POINTS', 0, 26],
      ]);
    });

    it('sets the body uniforms from the theme and the aspect ratio', () => {
      frameAt(16);
      expect(gl.callsTo('uniform1f').slice(0, 3)).toStrictEqual([
        ['uniform1f', 'loc:uSilhouetteRadius', 0.64],
        ['uniform1f', 'loc:uAspect', 2],
        ['uniform1f', 'loc:uIntro', 0],
      ]);
      expect(gl.callsTo('uniform3fv').slice(0, 2)).toStrictEqual([
        ['uniform3fv', 'loc:uBodyColor', COLORS.globeBody],
        ['uniform3fv', 'loc:uGlowColor', COLORS.accent],
      ]);
    });

    it('sets the dots uniforms: scale from the focal length and aspect, camera at 3, a point size from the angular step', () => {
      frameAt(16);
      const pointSize = 0.64 * 600 * 0.5 * (Math.PI / 180) * 0.62;
      expect(gl.callsTo('uniform2f')[0]).toStrictEqual([
        'uniform2f',
        'loc:uScale',
        FOCAL / 2,
        FOCAL,
      ]);
      expect(gl.callsTo('uniform1f').slice(3, 7)).toStrictEqual([
        ['uniform1f', 'loc:uCameraDistance', 3],
        ['uniform1f', 'loc:uIntro', 0],
        ['uniform1f', 'loc:uSize', pointSize],
        ['uniform1f', 'loc:uCameraDistance', 3],
      ]);
      expect(gl.callsTo('uniform3fv').slice(2, 4)).toStrictEqual([
        ['uniform3fv', 'loc:uDotColor', COLORS.globeDot],
        ['uniform3fv', 'loc:uDotHighlight', COLORS.accent],
      ]);
    });

    it('sets the arc resolution, width and color from the pixel ratio and the theme', () => {
      frameAt(16);
      expect(gl.callsTo('uniform2f')[1]).toStrictEqual([
        'uniform2f',
        'loc:uScale',
        FOCAL / 2,
        FOCAL,
      ]);
      expect(gl.callsTo('uniform2f')[2]).toStrictEqual(['uniform2f', 'loc:uResolution', 1200, 600]);
      expect(
        gl
          .callsTo('uniform1f')
          .map(([, location, value]) => [location, value])
          .filter(([location]) => location === 'loc:uWidth'),
      ).toStrictEqual([['loc:uWidth', 2.2]]);
    });

    it('starts with the home city facing the camera, wound in from the west by 1.6 radians', () => {
      frameAt(16);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW + 1.6, HOME_PITCH));
    });

    it('sends the same matrix to the dots, the arcs and the pins', () => {
      frameAt(16);
      const matrices = gl
        .callsTo('uniformMatrix3fv')
        .map(([, , transpose, matrix]) => [transpose, Array.from(matrix)]);
      expect(matrices).toStrictEqual(
        Array.from({ length: 3 }, () => [false, rotation(HOME_YAW + 1.6, HOME_PITCH)]),
      );
    });
  });

  describe('first frame', () => {
    it('is announced once, with a performance mark after the ready mark', () => {
      mountVisible();
      frameAt(16);
      frameAt(32);
      expect([onFirstFrame.mock.calls, marks.mock.calls]).toStrictEqual([
        [[]],
        [['globe:init'], ['globe:ready'], ['globe:first-frame']],
      ]);
    });

    it('works without a callback', () => {
      mountVisible({ onFirstFrame: undefined });
      frameAt(16);
      expect(marks.mock.calls.at(-1)).toStrictEqual(['globe:first-frame']);
    });
  });

  describe('the intro', () => {
    it('waits for startIntro, and the first call is the only one that counts', () => {
      mountVisible();
      globe.startIntro();
      const startedAt = clock;
      clock = 900;
      globe.startIntro();
      frameAt(1000);
      expect(startedAt).toBe(0);
      const eased = 1 - Math.pow(1 - 1000 / 1800, 4);
      expect(gl.callsTo('uniform1f').at(2)).toStrictEqual(['uniform1f', 'loc:uIntro', eased]);
    });

    it('unwinds the 1.6 rad spin as it eases in', () => {
      mountVisible();
      globe.startIntro();
      frameAt(900);
      const eased = 1 - Math.pow(1 - 0.5, 4);
      const delta = 0.05;
      const autoSpin = -0.07 * 1.5 * eased;
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(HOME_YAW + autoSpin * delta + 1.6 * (1 - eased), HOME_PITCH),
      );
    });

    it('is finished after 1.8 s: eased 1 and no spin offset', () => {
      mountVisible();
      globe.startIntro();
      frameAt(2000);
      expect(gl.callsTo('uniform1f').at(2)).toStrictEqual(['uniform1f', 'loc:uIntro', 1]);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(HOME_YAW + -0.07 * 1.5 * 0.05, HOME_PITCH),
      );
    });

    it('is already finished, with no spin offset, for visitors who prefer reduced motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
      );
      mountVisible();
      frameAt(16);
      expect(gl.callsTo('uniform1f').at(2)).toStrictEqual(['uniform1f', 'loc:uIntro', 1]);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW, HOME_PITCH));
    });
  });

  describe('spinning', () => {
    const finishIntro = () => {
      globe.startIntro();
      frameAt(2000);
    };
    beforeEach(() => mountVisible());

    it('turns east at 0.07 rad/s times the speed, per second of frame time', () => {
      finishIntro();
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(HOME_YAW - 0.07 * 1.5 * 0.05 - 0.07 * 1.5 * 0.016, HOME_PITCH),
      );
    });

    it('follows the speed setting', () => {
      globe.setSpeed(3);
      finishIntro();
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW - 0.07 * 3 * 0.05, HOME_PITCH));
    });

    it('slows to a quarter while the pointer is over the globe', () => {
      finishIntro();
      canvas.dispatchEvent(new PointerEvent('pointerenter'));
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(HOME_YAW - 0.07 * 1.5 * 0.05 - 0.07 * 1.5 * 0.25 * 0.016, HOME_PITCH),
      );
      canvas.dispatchEvent(new PointerEvent('pointerleave'));
      frameAt(2032);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(
          HOME_YAW - 0.07 * 1.5 * 0.05 - 0.07 * 1.5 * 0.25 * 0.016 - 0.07 * 1.5 * 0.016,
          HOME_PITCH,
        ),
      );
    });

    it('a kick adds -6 rad/s that dies away by 4% a frame', () => {
      finishIntro();
      globe.kick();
      frameAt(2016);
      const afterFirst = HOME_YAW - 0.07 * 1.5 * 0.05 + (-0.07 * 1.5 * 0.016 - 6 * 0.016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(afterFirst, HOME_PITCH));
      frameAt(2032);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(afterFirst + (-0.07 * 1.5 * 0.016 - 6 * 0.96 * 0.016), HOME_PITCH),
      );
    });
  });

  describe('dragging', () => {
    beforeEach(() => {
      mountVisible();
      globe.startIntro();
      frameAt(2000);
    });
    const drag = (type, x, y = 100, init = {}) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, pointerId: 2, ...init }),
      );
    const baseYaw = HOME_YAW - 0.07 * 1.5 * 0.05;

    it('captures the pointer on press', () => {
      drag('pointerdown', 100);
      expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1);
      expect(canvas.setPointerCapture).toHaveBeenNthCalledWith(1, 2);
    });

    it('turns the globe by the drag distance, 2.2 radians across the canvas width, and stops the auto spin while held', () => {
      drag('pointerdown', 100);
      drag('pointermove', 160);
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(baseYaw + (60 * 2.2) / 600, HOME_PITCH));
    });

    it('tilts with vertical drags and stops at 1.2 radians', () => {
      drag('pointerdown', 100, 100);
      drag('pointermove', 100, 100 + (600 * 3) / 2.2);
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(baseYaw, 1.2));
    });

    it('measures each move from the previous one', () => {
      drag('pointerdown', 100);
      drag('pointermove', 130);
      drag('pointermove', 160);
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(baseYaw + (30 * 2.2) / 600 + (30 * 2.2) / 600, HOME_PITCH),
      );
    });

    it('keeps turning after release with the last drag speed, which fades by 7% a frame', () => {
      drag('pointerdown', 100);
      drag('pointermove', 160);
      const velocity = (60 * 2.2) / 600;
      drag('pointerup', 160);
      frameAt(2016);
      const afterFirst = baseYaw + velocity + velocity + -0.07 * 1.5 * 0.016;
      expect(matrixOfLastFrame()).toStrictEqual(rotation(afterFirst, HOME_PITCH));
      frameAt(2032);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(afterFirst + velocity * 0.93 + -0.07 * 1.5 * 0.016, HOME_PITCH),
      );
    });

    it.each([['pointercancel'], ['pointerleave']])('lets go on %s', (type) => {
      drag('pointerdown', 100);
      drag(type, 100);
      drag('pointermove', 300);
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(baseYaw - 0.07 * 1.5 * 0.016, HOME_PITCH));
    });

    it('ignores moves when nothing is held', () => {
      drag('pointermove', 300);
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(baseYaw - 0.07 * 1.5 * 0.016, HOME_PITCH));
    });
  });

  describe('turning with the keyboard', () => {
    beforeEach(() => {
      mountVisible();
      globe.setSpeed(0);
      globe.startIntro();
      frameAt(2000);
    });
    const press = (key, init = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      canvas.dispatchEvent(event);
      return event;
    };

    it.each([
      ['ArrowRight', HOME_YAW + 0.12, HOME_PITCH],
      ['ArrowLeft', HOME_YAW - 0.12, HOME_PITCH],
      ['ArrowDown', HOME_YAW, HOME_PITCH + 0.12],
      ['ArrowUp', HOME_YAW, HOME_PITCH - 0.12],
    ])('%s turns the globe by 0.12 rad and stops the page from scrolling', (key, yaw, pitch) => {
      const event = press(key);
      frameAt(2016);
      expect([event.defaultPrevented, matrixOfLastFrame()]).toStrictEqual([
        true,
        rotation(yaw, pitch),
      ]);
    });

    it('turns four times as far with Shift', () => {
      press('ArrowRight', { shiftKey: true });
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW + 0.48, HOME_PITCH));
    });

    it('adds up the presses and stops the tilt at 1.2 radians', () => {
      press('ArrowRight');
      press('ArrowRight');
      for (let count = 0; count < 5; count++) press('ArrowDown', { shiftKey: true });
      frameAt(2016);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW + 0.24, 1.2));
    });

    it('leaves the other keys alone, Tab included, so the keyboard is never trapped', () => {
      const events = ['Tab', 'Enter', 'a'].map((key) => press(key));
      frameAt(2016);
      expect([events.map((event) => event.defaultPrevented), matrixOfLastFrame()]).toStrictEqual([
        [false, false, false],
        rotation(HOME_YAW, HOME_PITCH),
      ]);
    });

    it('swings back to the home city on Home, whatever way it was turned', () => {
      press('ArrowRight', { shiftKey: true });
      press('ArrowDown', { shiftKey: true });
      frameAt(2016);
      const event = press('Home');
      frameAt(2916);
      expect([event.defaultPrevented, matrixOfLastFrame()]).toStrictEqual([
        true,
        rotation(HOME_YAW, HOME_PITCH),
      ]);
    });

    it('cancels a swing back home when the visitor turns it by hand', () => {
      press('ArrowRight', { shiftKey: true });
      frameAt(2016);
      press('Home');
      press('ArrowLeft');
      frameAt(2100);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(HOME_YAW + 0.48 - 0.12, HOME_PITCH));
    });
  });

  describe('the clock the arcs and pins pulse with', () => {
    beforeEach(() => mountVisible());
    const timeUniforms = () =>
      gl
        .callsTo('uniform1f')
        .filter(([, location]) => location === 'loc:uTime')
        .map(([, , value]) => value);

    it('counts the seconds of frame time, for the arcs and the pins alike', () => {
      frameAt(16);
      expect(timeUniforms()).toStrictEqual([0.016, 0.016]);
      frameAt(32);
      expect(timeUniforms()).toStrictEqual([0.016, 0.016, 0.032, 0.032]);
    });

    it('stands still while the visitor has paused motion, and carries on from where it stood', () => {
      frameAt(16);
      document.documentElement.dataset.motion = 'paused';
      frameAt(32);
      frameAt(48);
      expect(timeUniforms()).toStrictEqual([0.016, 0.016, 0.016, 0.016, 0.016, 0.016]);
      delete document.documentElement.dataset.motion;
      frameAt(64);
      expect(timeUniforms().slice(-2)).toStrictEqual([0.032, 0.032]);
    });

    it('does not run at all for visitors who prefer reduced motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
      );
      frameAt(16);
      expect(timeUniforms()).toStrictEqual([0, 0]);
    });
  });

  describe('goHome', () => {
    const DRAG = 2727,
      DISPLACEMENT = (DRAG * 2.2) / 600;
    const BASE_YAW = HOME_YAW - 0.07 * 1.5 * 0.05;
    beforeEach(() => {
      mountVisible();
      globe.startIntro();
      frameAt(2000);
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: DRAG, clientY: 0, pointerId: 1 }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { clientX: DRAG, clientY: 0, pointerId: 1 }),
      );
    });
    const lerp = (from, to, t) => from + (to - from) * t;
    const target =
      HOME_YAW + Math.round((BASE_YAW + DISPLACEMENT - HOME_YAW) / (2 * Math.PI)) * 2 * Math.PI;

    it('goes to the home yaw of the nearest turn, here two full turns away rather than one back', () => {
      expect(Math.round((BASE_YAW + DISPLACEMENT - HOME_YAW) / (2 * Math.PI))).toBe(2);
    });

    it('swings back over 0.9 s, easing out cubically: at half time it is 87.5% of the way', () => {
      globe.goHome();
      const startedAt = clock;
      frameAt(startedAt + 450);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(lerp(BASE_YAW + DISPLACEMENT, target, 0.875), lerp(HOME_PITCH, HOME_PITCH, 0.875)),
      );
    });

    it('arrives exactly at the home city after 0.9 s', () => {
      globe.goHome();
      const startedAt = clock;
      frameAt(startedAt + 900);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(lerp(BASE_YAW + DISPLACEMENT, target, 1), HOME_PITCH),
      );
    });

    it('does not apply the leftover drag speed while homing, and resumes the slow spin once home', () => {
      globe.goHome();
      const startedAt = clock;
      frameAt(startedAt + 900);
      const home = lerp(BASE_YAW + DISPLACEMENT, target, 1);
      frameAt(startedAt + 916);
      expect(matrixOfLastFrame()).toStrictEqual(
        rotation(home + -0.07 * 1.5 * 0.016 + DISPLACEMENT, HOME_PITCH),
      );
    });

    it('is cancelled by touching the globe again', () => {
      globe.goHome();
      const startedAt = clock;
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }),
      );
      frameAt(startedAt + 450);
      expect(matrixOfLastFrame()).toStrictEqual(rotation(BASE_YAW + DISPLACEMENT, HOME_PITCH));
    });
  });

  describe('settings', () => {
    beforeEach(() => mountVisible());

    it('draws the dots once per instance for the stress mode', () => {
      globe.setInstances(8);
      clearCalls();
      frameAt(16);
      expect([globe.instanceCount, gl.callsTo('drawArraysInstanced')]).toStrictEqual([
        8,
        [['drawArraysInstanced', 'POINTS', 0, LAND_COUNT, 8]],
      ]);
    });

    it('reads the theme colors again on recolor and uses them from the next frame', () => {
      colors.snapshot.mockReturnValue({ ...COLORS, globeBody: [0.9, 0.9, 0.9] });
      globe.recolor();
      clearCalls();
      frameAt(16);
      expect([colors.snapshot.mock.calls.length, gl.callsTo('uniform3fv')[0]]).toStrictEqual([
        2,
        ['uniform3fv', 'loc:uBodyColor', [0.9, 0.9, 0.9]],
      ]);
    });
  });

  describe('frame rate', () => {
    beforeEach(() => mountVisible());
    const run = (times) => times.forEach((time) => frameAt(time));

    it('reports nothing until half a second has been sampled', () => {
      run([100, 200, 300, 400, 500]);
      expect(globe.frameRate).toBe(0);
    });

    it('then reports frames per second over the window: 6 frames in 600 ms is 10 fps', () => {
      run([100, 200, 300, 400, 500, 600]);
      expect(globe.frameRate).toBe(10);
    });

    it('rounds to a whole number', () => {
      run([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
      expect(globe.frameRate).toBe(10);
      run([
        1216, 1232, 1248, 1264, 1280, 1296, 1312, 1328, 1344, 1360, 1376, 1392, 1408, 1424, 1440,
        1456, 1472, 1488, 1504, 1520, 1536, 1552, 1568, 1584, 1600, 1616, 1632, 1648, 1664, 1680,
        1696, 1712,
      ]);
      expect(globe.frameRate).toBe(63);
    });

    it('ignores a gap longer than two seconds, such as a hidden tab: no bogus rate', () => {
      frameAt(100);
      frameAt(5000);
      expect(globe.frameRate).toBe(0);
    });

    it('is running while the loop runs', () => expect(globe.isRunning).toBe(true));
  });

  describe('lowering the pixel ratio', () => {
    // The frame that finishes the intro already closes a sample (1 fps over 2 s), so it counts as the first slow one.
    beforeEach(() => {
      mountVisible();
      globe.startIntro();
      frameAt(2000);
    });
    const slowSecond = (start) => {
      for (let step = 1; step <= 6; step++) frameAt(start + step * 100);
    };
    const fastSecond = (start) => {
      for (let step = 1; step <= 45; step++) frameAt(start + step * 12);
    };

    it('drops from 2 to 1 after four consecutive samples under 45 fps, and resizes the canvas', () => {
      slowSecond(2000);
      slowSecond(2600);
      expect([globe.pixelRatio, canvas.width]).toStrictEqual([2, 1200]);
      slowSecond(3200);
      expect([globe.pixelRatio, canvas.width, canvas.height, globe.canvasSize]).toStrictEqual([
        1,
        600,
        300,
        '600×300',
      ]);
    });

    it('starts counting again after a good sample', () => {
      slowSecond(2000);
      fastSecond(2600);
      slowSecond(3200);
      slowSecond(3800);
      slowSecond(4400);
      expect(globe.pixelRatio).toBe(2);
      slowSecond(5000);
      expect(globe.pixelRatio).toBe(1);
    });

    it('does not drop while the stress mode runs several instances', () => {
      globe.setInstances(4);
      for (let second = 0; second < 6; second++) slowSecond(2000 + second * 600);
      expect(globe.pixelRatio).toBe(2);
    });

    it('does not drop before the intro has finished', () => {
      document.body.innerHTML =
        '<canvas id="stage2" style="display:block;width:600px;height:300px"></canvas>';
      const fresh = new Globe(document.getElementById('stage2'), gl, colors, {});
      fresh.mount();
      visibility
        .at(-1)
        .callback([{ isIntersecting: true, boundingClientRect: { width: 600, height: 300 } }]);
      for (let second = 0; second < 6; second++)
        for (let step = 1; step <= 6; step++) frameAt(10000 + second * 600 + step * 100);
      expect(fresh.pixelRatio).toBe(2);
    });

    it('stays at 1 once it is at 1', () => {
      vi.stubGlobal('devicePixelRatio', 1);
      document.body.innerHTML =
        '<canvas id="stage3" style="display:block;width:600px;height:300px"></canvas>';
      const low = new Globe(document.getElementById('stage3'), gl, colors, {});
      low.mount();
      expect(low.pixelRatio).toBe(1);
    });
  });
});
