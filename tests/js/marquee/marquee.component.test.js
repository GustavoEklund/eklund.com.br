import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Marquee } from '@site/js/marquee/marquee.js';
import { WindowListeners } from '../../support/window-listeners.js';

const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );
const REDUCED = '(prefers-reduced-motion: reduce)';

describe('Marquee', () => {
  let element, tracks, listeners, frameQueue;
  const solid = () => element.querySelector('.marquee-row-solid .marquee-track');
  const outline = () => element.querySelector('.marquee-row-outline .marquee-track');
  const animationOf = (track) => track.getAnimations()[0];
  const runFrame = () => {
    const queued = frameQueue.splice(0);
    for (const callback of queued) callback(0);
  };
  const pointer = (type, clientX = 0) =>
    new PointerEvent(type, { bubbles: true, clientX, pointerId: 3 });

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = `
      <div id="marquee">
        <div class="marquee-row-solid"><div class="marquee-track" style="width:3000px;height:20px"></div></div>
        <div class="marquee-row-outline"><div class="marquee-track" style="width:3000px;height:20px"></div></div>
      </div>
      <div id="tall" style="height:5000px"></div>`;
    element = document.getElementById('marquee');
    tracks = [solid(), outline()];
    element.setPointerCapture = vi.fn();
    stubMedia([]);
    listeners = new WindowListeners().track();
    frameQueue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    });
  });

  afterEach(async () => {
    for (const animation of document.getAnimations()) animation.cancel();
    delete document.documentElement.dataset.motion;
    listeners.release();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('style');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  it('builds both rows held still for visitors who prefer reduced motion, and lets the one pending frame lapse', () => {
    stubMedia([REDUCED]);
    new Marquee(element).start();
    expect(document.getAnimations().map((animation) => animation.playState)).toStrictEqual([
      'paused',
      'paused',
    ]);
    expect([frameQueue.length, listeners.registered]).toStrictEqual([1, ['scroll']]);
    runFrame();
    expect(frameQueue.length).toBe(0);
  });

  it('builds both rows held still when the page loads with motion paused, and plays them when motion is switched on', () => {
    document.documentElement.dataset.motion = 'paused';
    const marquee = new Marquee(element);
    marquee.start();
    runFrame();
    const states = () => tracks.map((track) => animationOf(track).playState);
    expect(states()).toStrictEqual(['paused', 'paused']);
    document.documentElement.dataset.motion = 'full';
    marquee.sync();
    expect([states(), frameQueue.length]).toStrictEqual([['running', 'running'], 1]);
  });

  it('plays them when the visitor chooses motion on a system that asks for less', () => {
    stubMedia([REDUCED]);
    document.documentElement.dataset.motion = 'full';
    const marquee = new Marquee(element);
    marquee.start();
    expect(tracks.map((track) => animationOf(track).playState)).toStrictEqual([
      'running',
      'running',
    ]);
    expect(marquee).toBeInstanceOf(Marquee);
  });

  it('does not start a drag while motion is off, so the rows stay where they are', () => {
    document.documentElement.dataset.motion = 'paused';
    new Marquee(element).start();
    element.dispatchEvent(pointer('pointerdown', 100));
    element.dispatchEvent(pointer('pointermove', 160));
    expect([
      element.classList.contains('is-dragging'),
      element.setPointerCapture.mock.calls.length,
      element.style.getPropertyValue('--skew'),
      tracks.map((track) => animationOf(track).currentTime),
    ]).toStrictEqual([false, 0, '', [0, 0]]);
  });

  it('loops every track for 30 s, the solid row forward and the outline row backward', () => {
    new Marquee(element).start();
    const [forward, backward] = tracks.map((track) => animationOf(track));
    expect(document.getAnimations()).toHaveLength(2);
    expect(
      [forward, backward].map((animation) => [
        animation.effect.getTiming().duration,
        animation.effect.getTiming().iterations,
      ]),
    ).toStrictEqual([
      [30000, Infinity],
      [30000, Infinity],
    ]);
    expect(forward.effect.getKeyframes().map((frame) => frame.transform)).toStrictEqual([
      'translateX(0px)',
      'translateX(-100%)',
    ]);
    expect(backward.effect.getKeyframes().map((frame) => frame.transform)).toStrictEqual([
      'translateX(-100%)',
      'translateX(0px)',
    ]);
  });

  it('asks for exactly one animation frame to begin with', () => {
    new Marquee(element).start();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('registers one passive scroll listener on the window', () => {
    new Marquee(element).start();
    expect(listeners.registered).toStrictEqual(['scroll']);
  });

  describe('dragging', () => {
    beforeEach(() => {
      new Marquee(element).start();
      for (const track of tracks) {
        animationOf(track).pause();
        animationOf(track).currentTime = 10000;
      }
    });

    it('marks the element and captures the pointer on press', () => {
      element.dispatchEvent(pointer('pointerdown', 500));
      expect(element.classList.contains('is-dragging')).toBe(true);
      expect(element.setPointerCapture).toHaveBeenCalledTimes(1);
      expect(element.setPointerCapture).toHaveBeenNthCalledWith(1, 3);
    });

    it('moves the rows opposite ways by the drag distance: 30 px of 3000 px is 300 ms of a 30 s loop', () => {
      element.dispatchEvent(pointer('pointerdown', 500));
      element.dispatchEvent(pointer('pointermove', 530));
      expect(tracks.map((track) => animationOf(track).currentTime)).toStrictEqual([9700, 10300]);
    });

    it('wraps around the loop in both directions', () => {
      for (const track of tracks) animationOf(track).currentTime = 100;
      element.dispatchEvent(pointer('pointerdown', 500));
      element.dispatchEvent(pointer('pointermove', 530));
      expect(tracks.map((track) => animationOf(track).currentTime)).toStrictEqual([29800, 400]);
    });

    it('skews against the drag direction, 0.6 degrees per pixel, up to 14', () => {
      element.dispatchEvent(pointer('pointerdown', 500));
      element.dispatchEvent(pointer('pointermove', 510));
      expect(element.style.getPropertyValue('--skew')).toBe('-6deg');
      element.dispatchEvent(pointer('pointermove', 490));
      expect(element.style.getPropertyValue('--skew')).toBe('12deg');
      element.dispatchEvent(pointer('pointermove', 590));
      expect(element.style.getPropertyValue('--skew')).toBe('-14deg');
    });

    it('measures each move from the previous one', () => {
      element.dispatchEvent(pointer('pointerdown', 500));
      element.dispatchEvent(pointer('pointermove', 530));
      element.dispatchEvent(pointer('pointermove', 560));
      expect(tracks.map((track) => animationOf(track).currentTime)).toStrictEqual([9400, 10600]);
    });

    it('ignores moves when no drag began', () => {
      element.dispatchEvent(pointer('pointermove', 530));
      expect([
        tracks.map((track) => animationOf(track).currentTime),
        element.style.getPropertyValue('--skew'),
      ]).toStrictEqual([[10000, 10000], '']);
    });

    it.each([['pointerup'], ['pointercancel']])('lets go on %s', (type) => {
      element.dispatchEvent(pointer('pointerdown', 500));
      element.dispatchEvent(pointer(type, 500));
      element.dispatchEvent(pointer('pointermove', 560));
      expect([
        element.classList.contains('is-dragging'),
        tracks.map((track) => animationOf(track).currentTime),
      ]).toStrictEqual([false, [10000, 10000]]);
    });

    it('ignores a release when nothing was dragged', () => {
      element.dispatchEvent(pointer('pointerup', 0));
      expect(element.classList.contains('is-dragging')).toBe(false);
    });
  });

  describe('speed', () => {
    beforeEach(() => new Marquee(element).start());
    const rates = () => tracks.map((track) => animationOf(track).playbackRate);
    /** Scrolls and resolves once the scroll event has fired, so the marquee has read it. */
    const scrollBy = (top) =>
      new Promise((resolve) => {
        window.addEventListener('scroll', () => resolve(), { once: true });
        window.scrollTo({ top, behavior: 'instant' });
      });

    it('stays at normal speed and no skew while nothing happens', () => {
      runFrame();
      expect([rates(), element.style.getPropertyValue('--skew')]).toStrictEqual([[1, 1], '0deg']);
    });

    it('slows down to 12% of the speed under the pointer, easing 8% of the way each frame', () => {
      element.dispatchEvent(pointer('pointerenter'));
      runFrame();
      expect(rates()).toStrictEqual([1 + (0.12 - 1) * 0.08, 1 + (0.12 - 1) * 0.08]);
      runFrame();
      const first = 1 + (0.12 - 1) * 0.08;
      expect(rates()).toStrictEqual([first + (0.12 - first) * 0.08, first + (0.12 - first) * 0.08]);
    });

    it('speeds back up when the pointer leaves', () => {
      element.dispatchEvent(pointer('pointerenter'));
      runFrame();
      const slowed = 1 + (0.12 - 1) * 0.08;
      element.dispatchEvent(pointer('pointerleave'));
      runFrame();
      expect(rates()).toStrictEqual([slowed + (1 - slowed) * 0.08, slowed + (1 - slowed) * 0.08]);
    });

    it('speeds up and skews with scrolling: 100 px of scroll targets rate 7, then the velocity decays by 15% a frame', async () => {
      await scrollBy(100);
      runFrame();
      expect(rates()).toStrictEqual([1 + (7 - 1) * 0.08, 1 + (7 - 1) * 0.08]);
      expect(element.style.getPropertyValue('--skew')).toBe('-10.2deg');
      runFrame();
      expect(element.style.getPropertyValue('--skew')).toBe('-8.7deg');
    });

    it('stands still while it is being dragged', () => {
      element.dispatchEvent(pointer('pointerdown', 500));
      runFrame();
      expect(rates()).toStrictEqual([1 + (0 - 1) * 0.08, 1 + (0 - 1) * 0.08]);
    });

    it('asks for the next frame after every frame', () => {
      runFrame();
      runFrame();
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(3);
    });
  });

  describe('the motion setting', () => {
    let marquee;
    const playStates = () => tracks.map((track) => animationOf(track).playState);
    beforeEach(() => {
      marquee = new Marquee(element);
      marquee.start();
    });

    it('pauses both rows when the visitor switches motion off, and stops asking for frames once the pending one has run', () => {
      document.documentElement.dataset.motion = 'paused';
      marquee.sync();
      expect([playStates(), frameQueue.length]).toStrictEqual([['paused', 'paused'], 1]);
      runFrame();
      expect([
        frameQueue.length,
        tracks.map((track) => animationOf(track).playbackRate),
      ]).toStrictEqual([0, [1, 1]]);
    });

    it('plays them again, from where they stopped, and asks for a frame when motion is back on', () => {
      document.documentElement.dataset.motion = 'paused';
      marquee.sync();
      runFrame();
      const positions = tracks.map((track) => animationOf(track).currentTime);
      delete document.documentElement.dataset.motion;
      marquee.sync();
      expect([
        playStates(),
        frameQueue.length,
        positions.every((position) => position !== null),
      ]).toStrictEqual([['running', 'running'], 1, true]);
    });

    it('does not queue a second frame when one is already waiting', () => {
      marquee.sync();
      marquee.sync();
      expect(frameQueue.length).toBe(1);
    });

    it('does nothing when the marquee has not started yet', () => {
      document.body
        .querySelectorAll('.marquee-track')
        .forEach((track) => track.getAnimations().forEach((animation) => animation.cancel()));
      const idle = new Marquee(element);
      frameQueue.length = 0;
      idle.sync();
      expect(frameQueue.length).toBe(0);
    });
  });
});
