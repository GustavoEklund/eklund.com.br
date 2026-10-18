import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeController } from '@site/js/theme/theme-controller.js';
import { Preferences } from '@site/js/shared/storage.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const stubReducedMotion = (reduced) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)' })),
  );

describe('ThemeController', () => {
  let colors, controller, write;

  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="">';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    colors = { backgroundAsCss: vi.fn(() => 'rgb(1 2 3)') };
    write = vi.spyOn(Preferences, 'write').mockImplementation(() => {});
    controller = new ThemeController(colors);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  describe('theme', () => {
    it('is dark unless the page says light', () => {
      expect(controller.theme).toBe('dark');
      document.documentElement.dataset.theme = 'light';
      expect(controller.theme).toBe('light');
      document.documentElement.dataset.theme = 'sepia';
      expect(controller.theme).toBe('dark');
    });
  });

  describe('apply', () => {
    it('sets the theme, saves it, updates the browser chrome color and tells the listeners, once each', () => {
      const first = vi.fn(),
        second = vi.fn();
      controller.onColorsChange(first);
      controller.onColorsChange(second);
      controller.apply('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenNthCalledWith(1, 'theme', 'light');
      expect(document.querySelector('meta[name=theme-color]').content).toBe('rgb(1 2 3)');
      expect(colors.backgroundAsCss).toHaveBeenCalledTimes(1);
      expect([first.mock.calls, second.mock.calls]).toStrictEqual([[[]], [[]]]);
    });

    it('reads the background after the theme changed, so the chrome color matches the new theme', () => {
      colors.backgroundAsCss.mockImplementation(
        () => `rgb(${document.documentElement.dataset.theme})`,
      );
      controller.apply('light');
      expect(document.querySelector('meta[name=theme-color]').content).toBe('rgb(light)');
    });

    it('tells the listeners only after the chrome color is set', () => {
      let seen;
      controller.onColorsChange(() => {
        seen = document.querySelector('meta[name=theme-color]').content;
      });
      controller.apply('dark');
      expect(seen).toBe('rgb(1 2 3)');
    });
  });

  describe('toggle without view transitions', () => {
    beforeEach(() => stubReducedMotion(true));

    it('flips dark to light and back, applying each', () => {
      controller.toggle();
      expect(controller.theme).toBe('light');
      controller.toggle();
      expect(controller.theme).toBe('dark');
      expect(write.mock.calls).toStrictEqual([
        ['theme', 'light'],
        ['theme', 'dark'],
      ]);
    });
  });

  describe('toggle with a view transition', () => {
    let animate, startViewTransition, transition, finish, fail;

    beforeEach(() => {
      stubReducedMotion(false);
      animate = vi.spyOn(document.documentElement, 'animate').mockImplementation(() => ({}));
      transition = {
        ready: Promise.resolve(),
        finished: new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      };
      startViewTransition = vi.fn((update) => {
        update();
        return transition;
      });
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: startViewTransition,
      });
    });
    afterEach(() => {
      delete document.startViewTransition;
    });

    it('applies the new theme inside the transition callback, once', () => {
      controller.toggle({ clientX: 100, clientY: 50 });
      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(controller.theme).toBe('light');
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenNthCalledWith(1, 'theme', 'light');
    });

    it('grows a circle from the pointer to the farthest corner once the transition is ready', async () => {
      controller.toggle({ clientX: 100, clientY: 50 });
      await transition.ready;
      await Promise.resolve();
      const radius = Math.hypot(Math.max(100, innerWidth - 100), Math.max(50, innerHeight - 50));
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate).toHaveBeenNthCalledWith(
        1,
        { clipPath: ['circle(0 at 100px 50px)', `circle(${radius}px at 100px 50px)`] },
        {
          duration: 650,
          easing: 'cubic-bezier(.2,.8,.2,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });

    it('starts the circle at the center of the window without a pointer event', async () => {
      controller.toggle();
      await transition.ready;
      await Promise.resolve();
      const x = innerWidth / 2,
        y = innerHeight / 2;
      expect(animate.mock.calls[0][0].clipPath[0]).toBe(`circle(0 at ${x}px ${y}px)`);
    });

    it('does not animate before the transition is ready', () => {
      transition.ready = new Promise(() => {});
      controller.toggle({ clientX: 1, clientY: 1 });
      expect(animate).toHaveBeenCalledTimes(0);
    });

    describe('settled', () => {
      const pending = async (promise) => {
        const marker = Symbol('pending');
        return (await Promise.race([promise, Promise.resolve(marker)])) === marker;
      };

      it('is already resolved when no theme switch is running', async () => {
        expect(await pending(controller.settled)).toBe(false);
      });

      it('waits for the view transition of a switch, then is resolved again at once', async () => {
        controller.toggle({ clientX: 1, clientY: 1 });
        expect(await pending(controller.settled)).toBe(true);
        finish();
        await transition.finished;
        await Promise.resolve();
        expect(await pending(controller.settled)).toBe(false);
      });

      it('resolves, and does not reject, when the browser skips the transition', async () => {
        controller.toggle({ clientX: 1, clientY: 1 });
        const settled = controller.settled;
        fail(new DOMException('skipped', 'AbortError'));
        expect(await settled).toBeUndefined();
      });

      it('follows the newest switch when a second one starts before the first ends', async () => {
        controller.toggle({ clientX: 1, clientY: 1 });
        const first = transition;
        let finishSecond;
        transition = {
          ready: Promise.resolve(),
          finished: new Promise((resolve) => {
            finishSecond = resolve;
          }),
        };
        controller.toggle({ clientX: 1, clientY: 1 });
        finish();
        await first.finished;
        await Promise.resolve();
        expect(await pending(controller.settled)).toBe(true);
        finishSecond();
        await transition.finished;
        await Promise.resolve();
        expect(await pending(controller.settled)).toBe(false);
      });
    });
  });

  describe('toggle in a browser without view transitions', () => {
    it('applies the theme directly', () => {
      stubReducedMotion(false);
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: undefined,
      });
      controller.toggle({ clientX: 5, clientY: 5 });
      delete document.startViewTransition;
      expect(controller.theme).toBe('light');
    });
  });

  describe('hue', () => {
    it('defaults to 128', () => expect(controller.hue).toBe(128));

    it('sets --hue, saves it and notifies on the next frame, not synchronously', async () => {
      const listener = vi.fn();
      controller.onColorsChange(listener);
      controller.setHue(200);
      expect(document.documentElement.style.getPropertyValue('--hue')).toBe('200');
      expect(controller.hue).toBe(200);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenNthCalledWith(1, 'hue', 200);
      expect(listener).toHaveBeenCalledTimes(0);
      await nextFrame();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('picks a random whole hue from 0 to 360, applies it and returns it', () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(controller.randomizeHue()).toBe(180);
      expect(random).toHaveBeenCalledTimes(1);
      expect(controller.hue).toBe(180);
      expect(write).toHaveBeenNthCalledWith(1, 'hue', 180);
    });

    it('rounds the random hue', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3333);
      expect(controller.randomizeHue()).toBe(120);
    });

    it('reads back a hue of 0, which is pure red and not the default', () => {
      controller.setHue(0);
      expect(controller.hue).toBe(0);
    });

    it('reads back a fractional hue', () => {
      controller.setHue(210.5);
      expect(controller.hue).toBe(210.5);
    });

    it('falls back to the default when --hue holds something that is not a number', () => {
      document.documentElement.style.setProperty('--hue', 'blue');
      expect(controller.hue).toBe(128);
    });
  });
});
