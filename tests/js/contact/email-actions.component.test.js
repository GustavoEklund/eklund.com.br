import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailActions } from '@site/js/contact/email-actions.js';

const EMAIL = 'hello@eklund.com.br';
const click = (element, init = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
};
const flush = () => new Promise((resolve) => queueMicrotask(resolve));
const stubMedia = (matching) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: matching.includes(query) })),
  );
const isOpen = (toast) => toast.matches(':popover-open');

describe('EmailActions', () => {
  let writeText, toast, link;

  beforeEach(() => {
    document.body.innerHTML = `
      <a id="email" href="mailto:${EMAIL}" data-copy="${EMAIL}" style="display:block;width:200px;height:100px;position:absolute;left:100px;top:100px">mail</a>
      <button id="other" data-copy="${EMAIL}">copy</button>
      <div id="toast" popover="manual">copied</div>`;
    link = document.getElementById('email');
    toast = document.getElementById('toast');
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const install = () => new EmailActions({ emailLink: link, toast }).install();

  it('copies the address instead of opening the mail client, and shows the toast', async () => {
    install();
    const event = click(link);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenNthCalledWith(1, EMAIL);
    expect(isOpen(toast)).toBe(true);
  });

  it('tells whoever asked that the address was copied, once, after the toast opened', async () => {
    const onCopied = vi.fn(() => isOpen(toast));
    new EmailActions({ emailLink: link, toast, onCopied }).install();
    click(link);
    await flush();
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(onCopied.mock.results).toStrictEqual([{ type: 'return', value: true }]);
  });

  it('copies from any element that carries data-copy', async () => {
    install();
    click(document.getElementById('other'));
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenNthCalledWith(1, EMAIL);
  });

  it('hides the toast 1800 ms later and not before', async () => {
    install();
    click(link);
    await flush();
    vi.advanceTimersByTime(1799);
    expect(isOpen(toast)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isOpen(toast)).toBe(false);
  });

  it.each([
    ['meta', { metaKey: true }],
    ['control', { ctrlKey: true }],
  ])('leaves a %s-click to the browser', async (_name, modifier) => {
    install();
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    const event = click(link, modifier);
    await flush();
    expect([event.defaultPrevented, writeText.mock.calls.length, isOpen(toast)]).toStrictEqual([
      true,
      0,
      false,
    ]);
  });

  it('stays quiet when the clipboard refuses: no toast, no error', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    install();
    click(link);
    await flush();
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(isOpen(toast)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not say it copied when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const onCopied = vi.fn();
    new EmailActions({ emailLink: link, toast, onCopied }).install();
    click(link);
    await flush();
    await flush();
    expect(onCopied).toHaveBeenCalledTimes(0);
  });

  it('pulls the big link toward the pointer: 12% across and 25% down from its center', () => {
    stubMedia(['(pointer: fine)']);
    install();
    const rect = link.getBoundingClientRect();
    link.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + rect.width / 2 + 100,
        clientY: rect.top + rect.height / 2 + 40,
      }),
    );
    expect(link.style.translate).toBe('12px 10px');
    link.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + rect.width / 2 - 50,
        clientY: rect.top + rect.height / 2 - 20,
      }),
    );
    // The link has already moved 12px and 10px, so its center is measured from there: (-50 - 12) * .12 and (-20 - 10) * .25.
    expect(link.style.translate).toBe('-7.44px -7.5px');
  });

  it('lets go when the pointer leaves', () => {
    stubMedia(['(pointer: fine)']);
    install();
    const rect = link.getBoundingClientRect();
    link.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + rect.width / 2 + 100,
        clientY: rect.top + rect.height / 2,
      }),
    );
    link.dispatchEvent(new PointerEvent('pointerleave'));
    expect(link.style.translate).toBe('0px');
  });

  it.each([
    ['there is no fine pointer', []],
    ['the visitor prefers reduced motion', ['(pointer: fine)', '(prefers-reduced-motion: reduce)']],
  ])('does not pull the link when %s', (_label, matching) => {
    stubMedia(matching);
    install();
    const rect = link.getBoundingClientRect();
    link.dispatchEvent(
      new PointerEvent('pointermove', { clientX: rect.left + 190, clientY: rect.top + 90 }),
    );
    expect(link.style.translate).toBe('');
  });

  it('does not pull the link while motion is paused, and pulls it again as soon as motion is played, on the same page', () => {
    stubMedia(['(pointer: fine)']);
    install();
    const rect = link.getBoundingClientRect();
    const move = () =>
      link.dispatchEvent(
        new PointerEvent('pointermove', { clientX: rect.left + 190, clientY: rect.top + 90 }),
      );
    document.documentElement.dataset.motion = 'paused';
    move();
    const paused = link.style.translate;
    document.documentElement.dataset.motion = 'full';
    move();
    expect([paused, link.style.translate]).toStrictEqual(['', '10.8px 10px']);
  });

  it('still copies when the pull is off', async () => {
    stubMedia([]);
    install();
    click(link);
    await flush();
    expect(writeText).toHaveBeenNthCalledWith(1, EMAIL);
  });
});
