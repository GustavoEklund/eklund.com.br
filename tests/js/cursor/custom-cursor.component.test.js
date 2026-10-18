import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomCursor } from '@site/js/cursor/custom-cursor.js';
import { Environment } from '@site/js/shared/environment.js';
import { WindowListeners } from '../../support/window-listeners.js';

const FINE = '(pointer: fine)',
  REDUCED = '(prefers-reduced-motion: reduce)';
const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );
const normalized = (property, value) => {
  const probe = document.createElement('i');
  probe.style[property] = value;
  return probe.style[property];
};

describe('CustomCursor', () => {
  let dot, ring, label, listeners, frames, cursor;
  const runFrame = () => {
    const queued = frames.splice(0);
    for (const callback of queued) callback(0);
  };
  const over = (target, init = {}) =>
    target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', ...init }),
    );
  const move = (x, y) =>
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
  const install = () => {
    cursor = new CustomCursor({ dot, ring });
    cursor.install();
    return cursor;
  };
  const mode = () => ring.className;

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = `
      <div id="dot" popover="manual" class="cursor-dot"></div>
      <div id="ring" popover="manual" class="cursor-ring"><span></span></div>
      <p id="paragraph" style="margin:0">text</p>
      <a id="link" href="#x">link</a>
      <div id="plain" style="height:20px"></div>
      <button id="plain-button" style="position:absolute;left:300px;top:300px;width:100px;height:40px;border-radius:12px" data-cursor="abrir">labelled</button>
      <button id="sticky" class="btn" style="position:absolute;left:500px;top:100px;width:120px;height:40px;border-radius:20px">sticky</button>
      <article class="job-card" style="position:absolute;left:100px;top:400px;width:400px;height:100px">
        <div class="job-header" style="width:400px;height:60px"><span id="job-title">Job</span><button class="job-toggle" style="position:absolute;left:340px;top:10px;width:40px;height:40px;border-radius:20px">+</button></div>
      </article>
      <dialog id="dialog">modal</dialog>`;
    dot = document.getElementById('dot');
    ring = document.getElementById('ring');
    label = ring.querySelector('span');
    document.documentElement.classList.remove('has-custom-cursor');
    stubMedia([FINE]);
    listeners = new WindowListeners().track();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  });

  afterEach(() => {
    listeners.release();
    for (const element of [dot, ring]) if (element.matches(':popover-open')) element.hidePopover();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('has-custom-cursor');
    document.body.removeAttribute('style');
  });

  describe('isSupported', () => {
    it.each([
      [[FINE], true],
      [[], false],
      [[FINE, REDUCED], true],
      [[REDUCED], false],
    ])('is %j -> %s', (matching, expected) => {
      stubMedia(matching);
      expect(CustomCursor.isSupported()).toBe(expected);
    });
  });

  describe('install', () => {
    it('does nothing without a fine pointer', () => {
      stubMedia([]);
      install();
      expect([
        document.documentElement.classList.contains('has-custom-cursor'),
        listeners.registered,
        frames.length,
        dot.matches(':popover-open'),
      ]).toStrictEqual([false, [], 0, false]);
    });

    it('turns the custom cursor on, shows both popovers and starts the loop with one frame', () => {
      install();
      expect([
        document.documentElement.classList.contains('has-custom-cursor'),
        ring.matches(':popover-open'),
        dot.matches(':popover-open'),
        frames.length,
      ]).toStrictEqual([true, true, true, 1]);
    });

    it('registers its listeners in a fixed order', () => {
      install();
      expect(listeners.registered).toStrictEqual([
        'toggle',
        'pointermove',
        'pointerdown',
        'pointerup',
        'mouseleave',
        'mouseenter',
        'pointerover',
      ]);
    });
  });

  describe('pointer', () => {
    beforeEach(() => install());

    it('moves the dot to the pointer, centered on it', () => {
      move(120, 80);
      expect(dot.style.translate).toBe(
        normalized('translate', 'calc(120px - 50%) calc(80px - 50%)'),
      );
    });

    it('dims the ring while a button is down and restores it on release', () => {
      window.dispatchEvent(new PointerEvent('pointerdown'));
      expect(ring.style.opacity).toBe('0.6');
      window.dispatchEvent(new PointerEvent('pointerup'));
      expect(ring.style.opacity).toBe('');
    });

    it('hides both parts when the pointer leaves the document and shows them when it returns', () => {
      document.dispatchEvent(new Event('mouseleave'));
      expect([dot.style.opacity, ring.style.opacity]).toStrictEqual(['0', '0']);
      document.dispatchEvent(new Event('mouseenter'));
      expect([dot.style.opacity, ring.style.opacity]).toStrictEqual(['', '']);
    });
  });

  describe('modes', () => {
    beforeEach(() => install());

    it('is a plain ring over empty space', () => {
      over(document.getElementById('plain'));
      expect([mode(), label.textContent, dot.classList.contains('is-hidden')]).toStrictEqual([
        'cursor-ring',
        '',
        false,
      ]);
    });

    it('turns into a text caret over text', () => {
      over(document.getElementById('paragraph'));
      expect(mode()).toBe('cursor-ring is-text');
    });

    it('marks links', () => {
      over(document.getElementById('link'));
      expect(mode()).toBe('cursor-ring is-link');
    });

    it('shows the data-cursor text as a label and hides the dot', () => {
      over(document.getElementById('plain-button'));
      expect([mode(), label.textContent, dot.classList.contains('is-hidden')]).toStrictEqual([
        'cursor-ring is-label',
        'abrir',
        true,
      ]);
    });

    it('goes back to nothing when the pointer moves to empty space', () => {
      over(document.getElementById('link'));
      over(document.body);
      expect([mode(), dot.classList.contains('is-hidden')]).toStrictEqual(['cursor-ring', false]);
    });

    it('does not rewrite the ring when the mode does not change', () => {
      over(document.getElementById('link'));
      ring.className = 'touched-by-test';
      over(document.getElementById('link'));
      expect(mode()).toBe('touched-by-test');
    });

    it.each([['touch'], ['pen']])(
      'ignores %s pointers: there is no hover to follow',
      (pointerType) => {
        over(document.getElementById('link'), { pointerType });
        expect(mode()).toBe('cursor-ring');
      },
    );

    it('wraps a button in a ring 14 px larger than it, with its corner radius, and hides the dot', () => {
      over(document.getElementById('sticky'));
      expect([
        mode(),
        ring.style.width,
        ring.style.height,
        ring.style.borderRadius,
        dot.classList.contains('is-hidden'),
      ]).toStrictEqual(['cursor-ring is-stuck', '134px', '54px', '20px', true]);
    });

    it('wraps the small toggle when the pointer is over any part of the job header', () => {
      over(document.getElementById('job-title'));
      expect([mode(), ring.style.width, ring.style.height, ring.style.borderRadius]).toStrictEqual([
        'cursor-ring is-stuck',
        '54px',
        '54px',
        '20px',
      ]);
    });

    it('clears the ring size when it stops sticking', () => {
      over(document.getElementById('sticky'));
      over(document.getElementById('link'));
      expect([mode(), ring.style.width, ring.style.height, ring.style.borderRadius]).toStrictEqual([
        'cursor-ring is-link',
        '',
        '',
        '',
      ]);
    });
  });

  describe('the ring follows the pointer', () => {
    beforeEach(() => install());
    const ringTransform = (x, y, angle, stretch) =>
      normalized(
        'transform',
        `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad) scale(${stretch}, ${1 / stretch}) rotate(${-angle}rad)`,
      );

    it('eases 17% of the way to the pointer each frame, stretching along its motion', () => {
      const startX = innerWidth / 2,
        startY = innerHeight / 2;
      move(startX + 100, startY);
      runFrame();
      const x = startX + 100 * 0.17,
        speed = 100 * 0.17;
      expect(ring.style.transform).toBe(
        ringTransform(x, startY, 0, 1 + Math.min(speed * 0.014, 0.5)),
      );
      expect(frames).toHaveLength(1);
    });

    it('stretches by at most 50%', () => {
      const startX = innerWidth / 2,
        startY = innerHeight / 2;
      move(startX + 5000, startY);
      runFrame();
      expect(ring.style.transform).toBe(ringTransform(startX + 5000 * 0.17, startY, 0, 1.5));
    });

    it('does not stretch over text', () => {
      over(document.getElementById('paragraph'));
      const startX = innerWidth / 2,
        startY = innerHeight / 2;
      move(startX + 100, startY);
      runFrame();
      expect(ring.style.transform).toBe(ringTransform(startX + 100 * 0.17, startY, 0, 1));
    });
  });

  describe('while motion is paused', () => {
    const startX = () => innerWidth / 2,
      startY = () => innerHeight / 2;
    const sticky = () => document.getElementById('sticky');
    const still = (x, y) =>
      normalized(
        'transform',
        `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${Math.atan2(y - startY(), x - startX())}rad) scale(1, 1) rotate(${-Math.atan2(y - startY(), x - startX())}rad)`,
      );
    beforeEach(() => {
      document.documentElement.dataset.motion = 'paused';
    });
    afterEach(() => {
      delete document.documentElement.dataset.motion;
    });

    it('is still installed, with its listeners and its first frame: it only follows the pointer', () => {
      install();
      expect([
        document.documentElement.classList.contains('has-custom-cursor'),
        ring.matches(':popover-open'),
        dot.matches(':popover-open'),
        frames.length,
        listeners.registered.includes('pointermove'),
      ]).toStrictEqual([true, true, true, 1, true]);
    });

    it('puts the ring on the pointer at once, with no stretch, instead of easing toward it', () => {
      install();
      move(startX() + 100, startY());
      runFrame();
      expect(ring.style.transform).toBe(still(startX() + 100, startY()));
    });

    it('moves the dot like always', () => {
      install();
      move(120, 80);
      expect(dot.style.translate).toBe(
        normalized('translate', 'calc(120px - 50%) calc(80px - 50%)'),
      );
    });

    it('does not lean a button toward the pointer, and puts the ring on the middle of the button', () => {
      install();
      over(sticky());
      const rect = sticky().getBoundingClientRect();
      const centerX = rect.left + rect.width / 2,
        centerY = rect.top + rect.height / 2;
      move(centerX + 30, centerY + 10);
      runFrame();
      expect([sticky().style.translate, ring.style.transform]).toStrictEqual([
        '',
        still(centerX, centerY),
      ]);
    });

    it('puts a button back that was leaning when motion is paused', () => {
      delete document.documentElement.dataset.motion;
      install();
      over(sticky());
      const rect = sticky().getBoundingClientRect();
      move(rect.left + rect.width / 2 + 30, rect.top + rect.height / 2);
      runFrame();
      expect(sticky().style.translate).toBe(normalized('translate', `${30 * 0.22}px 0px`));
      document.documentElement.dataset.motion = 'paused';
      runFrame();
      expect(sticky().style.translate).toBe('');
    });

    it('is still the same when the system asks for less motion and the visitor has not chosen', () => {
      delete document.documentElement.dataset.motion;
      stubMedia([FINE, REDUCED]);
      install();
      move(startX() + 100, startY());
      runFrame();
      expect(ring.style.transform).toBe(still(startX() + 100, startY()));
    });

    it('eases and stretches again when motion is played, even on a system that asks for less', () => {
      stubMedia([FINE, REDUCED]);
      install();
      move(startX() + 100, startY());
      runFrame();
      document.documentElement.dataset.motion = 'full';
      move(startX() + 200, startY());
      runFrame();
      const x = startX() + 100 + 100 * 0.17;
      expect(ring.style.transform).toBe(
        normalized(
          'transform',
          `translate(${x}px, ${startY()}px) translate(-50%, -50%) rotate(0rad) scale(${1 + Math.min(100 * 0.17 * 0.014, 0.5)}, ${1 / (1 + Math.min(100 * 0.17 * 0.014, 0.5))}) rotate(-0rad)`,
        ),
      );
    });
  });

  describe('the magnet', () => {
    beforeEach(() => install());
    const sticky = () => document.getElementById('sticky');
    const center = () => {
      const rect = sticky().getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };

    it('pulls the button 22% of the way toward the pointer', () => {
      over(sticky());
      const [centerX, centerY] = center();
      move(centerX + 30, centerY + 10);
      runFrame();
      expect(sticky().style.translate).toBe(
        normalized('translate', `${30 * 0.22}px ${10 * 0.22}px`),
      );
    });

    it('leads the ring to the button center plus 18% of the pointer offset, with 30% easing', () => {
      const startX = innerWidth / 2,
        startY = innerHeight / 2;
      over(sticky());
      const [centerX, centerY] = center();
      move(centerX + 30, centerY + 10);
      runFrame();
      const targetX = centerX + 30 * 0.18,
        targetY = centerY + 10 * 0.18;
      const x = startX + (targetX - startX) * 0.3,
        y = startY + (targetY - startY) * 0.3;
      const angle = Math.atan2(y - startY, x - startX);
      expect(ring.style.transform).toBe(
        normalized(
          'transform',
          `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad) scale(1, 1) rotate(${-angle}rad)`,
        ),
      );
    });

    it('lets go and puts the button back when the pointer is more than 28 px outside it', () => {
      over(sticky());
      const [centerX, centerY] = center();
      move(centerX, centerY);
      runFrame();
      move(sticky().getBoundingClientRect().right + 29, centerY);
      runFrame();
      expect([sticky().style.translate, mode(), ring.style.width]).toStrictEqual([
        '',
        'cursor-ring',
        '',
      ]);
    });

    it('holds on while the pointer is within 28 px of the button', () => {
      over(sticky());
      move(sticky().getBoundingClientRect().right + 28, center()[1]);
      runFrame();
      expect(mode()).toBe('cursor-ring is-stuck');
    });

    it('holds on to the toggle while the pointer is anywhere in the job header', () => {
      const toggle = document.querySelector('.job-toggle');
      over(document.getElementById('job-title'));
      const header = document.querySelector('.job-header').getBoundingClientRect();
      const rect = toggle.getBoundingClientRect();
      const pointerX = header.left + 5,
        pointerY = header.top + 5;
      move(pointerX, pointerY);
      runFrame();
      const centerX = rect.left + rect.width / 2,
        centerY = rect.top + rect.height / 2;
      expect([mode(), toggle.style.translate]).toStrictEqual([
        'cursor-ring is-stuck',
        normalized(
          'translate',
          `${(pointerX - centerX) * 0.22}px ${(pointerY - centerY) * 0.22}px`,
        ),
      ]);
    });

    it('releases the toggle when the pointer leaves the whole header by more than 28 px', () => {
      const toggle = document.querySelector('.job-toggle');
      over(document.getElementById('job-title'));
      const header = document.querySelector('.job-header').getBoundingClientRect();
      move(header.left + 5, header.bottom + 29);
      runFrame();
      expect([toggle.style.translate, mode()]).toStrictEqual(['', 'cursor-ring']);
    });

    it('does not move a link or an ordinary element, only buttons marked as sticky', () => {
      over(document.getElementById('link'));
      move(5, 5);
      runFrame();
      expect(document.getElementById('link').style.translate).toBe('');
    });

    it('releases the button when the pointer moves on to another target', () => {
      over(sticky());
      const [centerX, centerY] = center();
      move(centerX + 30, centerY);
      runFrame();
      over(document.getElementById('link'));
      expect([sticky().style.translate, mode()]).toStrictEqual(['', 'cursor-ring is-link']);
    });

    it('releases it when the pointer leaves the window', () => {
      over(sticky());
      document.dispatchEvent(new Event('mouseleave'));
      expect([sticky().style.translate, mode()]).toStrictEqual(['', 'cursor-ring']);
    });
  });

  describe('modal dialogs', () => {
    const flushMutations = () => new Promise((resolve) => queueMicrotask(resolve));

    it('puts both parts back on top, ring first and dot last, when a dialog opens', async () => {
      install();
      const order = [];
      vi.spyOn(ring, 'showPopover').mockImplementation(() => order.push('ring'));
      vi.spyOn(dot, 'showPopover').mockImplementation(() => order.push('dot'));
      document.getElementById('dialog').setAttribute('open', '');
      await flushMutations();
      expect(order).toStrictEqual(['ring', 'dot']);
    });

    it('hides a popover that is already open before showing it again', async () => {
      install();
      const hide = vi.spyOn(ring, 'hidePopover');
      document.getElementById('dialog').setAttribute('open', '');
      await flushMutations();
      expect(hide).toHaveBeenCalledTimes(1);
    });

    it('does the same when anything else in the page toggles a popover, but not for its own', () => {
      install();
      const show = vi.spyOn(ring, 'showPopover');
      const other = document.createElement('div');
      document.body.append(other);
      other.dispatchEvent(new Event('toggle'));
      expect(show).toHaveBeenCalledTimes(1);
      dot.dispatchEvent(new Event('toggle'));
      ring.dispatchEvent(new Event('toggle'));
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('without popover support, brings the system cursor back while a dialog is open', async () => {
      vi.spyOn(Environment, 'supportsPopover', 'get').mockReturnValue(false);
      install();
      const root = document.documentElement;
      expect(root.classList.contains('has-custom-cursor')).toBe(true);
      document.getElementById('dialog').setAttribute('open', '');
      await flushMutations();
      expect(root.classList.contains('has-custom-cursor')).toBe(false);
      document.getElementById('dialog').removeAttribute('open');
      await flushMutations();
      expect(root.classList.contains('has-custom-cursor')).toBe(true);
    });
  });
});
