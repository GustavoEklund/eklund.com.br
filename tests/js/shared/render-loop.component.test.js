import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderLoop } from '@site/js/shared/render-loop.js';
import { WindowListeners } from '../../support/window-listeners.js';

describe('RenderLoop', () => {
  let element, onFrame, frames, clock, listeners, observers, hidden;
  const runFrame = (now) => {
    const queued = frames.splice(0);
    for (const callback of queued) callback(now);
  };

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="stage"></canvas>';
    element = document.getElementById('stage');
    onFrame = vi.fn();
    frames = [];
    clock = 1000;
    hidden = false;
    observers = [];
    listeners = new WindowListeners().track();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          this.observed = [];
          observers.push(this);
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
    delete document.hidden;
  });

  const report = (visible) =>
    observers[0].callback([
      {
        isIntersecting: visible,
        boundingClientRect: { width: visible ? 10 : 0, height: visible ? 10 : 0 },
      },
    ]);

  describe('without observing', () => {
    it('does not run until started, and observes nothing', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      expect([loop.isRunning, frames.length, observers.length, listeners.registered]).toStrictEqual(
        [false, 0, 0, []],
      );
    });

    it('starts on request, asking for a single frame even when started twice', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      loop.start();
      expect([loop.isRunning, window.requestAnimationFrame.mock.calls.length]).toStrictEqual([
        true,
        1,
      ]);
    });

    it('stops by itself, without calling the frame callback, once shouldRun says no, and runs again when asked to start after it says yes', () => {
      let allowed = true;
      const loop = new RenderLoop(element, onFrame, { observe: false, shouldRun: () => allowed });
      loop.start();
      runFrame(1016);
      allowed = false;
      runFrame(1032);
      expect([onFrame.mock.calls, loop.isRunning, frames.length]).toStrictEqual([
        [[1016, 0.016]],
        false,
        0,
      ]);
      allowed = true;
      clock = 2000;
      loop.start();
      runFrame(2016);
      expect([onFrame.mock.calls, loop.isRunning, frames.length]).toStrictEqual([
        [
          [1016, 0.016],
          [2016, 0.016],
        ],
        true,
        1,
      ]);
    });

    it('calls the frame callback with the time and the seconds since the last frame', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      runFrame(1016);
      runFrame(1032);
      expect(onFrame.mock.calls).toStrictEqual([
        [1016, 0.016],
        [1032, 0.016],
      ]);
    });

    it('caps the step at 50 ms after a stall', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      runFrame(3000);
      expect(onFrame.mock.calls).toStrictEqual([[3000, 0.05]]);
    });

    it('caps the step at the maxDelta it was given, and passes smaller steps through', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false, maxDelta: 1 });
      loop.start();
      runFrame(1500);
      runFrame(9000);
      expect(onFrame.mock.calls).toStrictEqual([
        [1500, 0.5],
        [9000, 1],
      ]);
    });

    it('reports a zero step for a frame at the very instant it started', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      runFrame(1000);
      expect(onFrame).toHaveBeenNthCalledWith(1, 1000, 0);
    });

    it('schedules the next frame after each one', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      runFrame(1016);
      expect(frames).toHaveLength(1);
      runFrame(1032);
      expect(frames).toHaveLength(1);
    });

    it('stops when the tab is hidden, and can be started again', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      hidden = true;
      runFrame(1016);
      expect([loop.isRunning, frames.length, onFrame.mock.calls.length]).toStrictEqual([
        false,
        0,
        0,
      ]);
      hidden = false;
      loop.start();
      runFrame(1032);
      expect(onFrame).toHaveBeenCalledTimes(1);
    });
  });

  describe('renderOnce', () => {
    it('draws one frame at the current time with a zero step while stopped', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      clock = 1234;
      loop.renderOnce();
      expect(onFrame.mock.calls).toStrictEqual([[1234, 0]]);
    });

    it('does nothing while the loop is running', () => {
      const loop = new RenderLoop(element, onFrame, { observe: false });
      loop.start();
      loop.renderOnce();
      expect(onFrame).toHaveBeenCalledTimes(0);
    });
  });

  describe('observing', () => {
    it('watches the element with the given threshold and listens for tab visibility', () => {
      new RenderLoop(element, onFrame, { threshold: 0.25 });
      expect(observers).toHaveLength(1);
      expect([observers[0].observed, observers[0].options]).toStrictEqual([
        [element],
        { threshold: 0.25 },
      ]);
      expect(listeners.registered).toStrictEqual(['visibilitychange']);
    });

    it('does not run before the element is on screen', () => {
      const loop = new RenderLoop(element, onFrame);
      expect([loop.isRunning, frames.length]).toStrictEqual([false, 0]);
    });

    it('starts when the element scrolls into view', () => {
      const loop = new RenderLoop(element, onFrame);
      report(true);
      expect([loop.isRunning, frames.length]).toStrictEqual([true, 1]);
    });

    it('stops at the next frame once the element leaves the screen', () => {
      const loop = new RenderLoop(element, onFrame);
      report(true);
      runFrame(1016);
      report(false);
      runFrame(1032);
      expect([loop.isRunning, frames.length, onFrame.mock.calls.length]).toStrictEqual([
        false,
        0,
        1,
      ]);
    });

    it('does not start for an element without a box, as content-visibility leaves it', () => {
      const loop = new RenderLoop(element, onFrame);
      report(false);
      expect(loop.isRunning).toBe(false);
    });

    it('resumes when the tab becomes visible again while the element is on screen', () => {
      const loop = new RenderLoop(element, onFrame);
      report(true);
      hidden = true;
      runFrame(1016);
      expect(loop.isRunning).toBe(false);
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      expect([loop.isRunning, frames.length]).toStrictEqual([true, 1]);
    });

    it('stays stopped when the tab returns but the element is off screen', () => {
      const loop = new RenderLoop(element, onFrame);
      document.dispatchEvent(new Event('visibilitychange'));
      expect([loop.isRunning, frames.length]).toStrictEqual([false, 0]);
    });

    it('stays stopped while the tab is still hidden', () => {
      const loop = new RenderLoop(element, onFrame);
      report(true);
      runFrame(1016);
      hidden = true;
      runFrame(1032);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(loop.isRunning).toBe(false);
    });
  });
});
