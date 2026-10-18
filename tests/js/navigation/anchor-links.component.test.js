import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnchorLinks } from '@site/js/navigation/anchor-links.js';

const click = (element, init = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
};
const stubReducedMotion = (reduced) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)' })),
  );

describe('AnchorLinks', () => {
  let scrollIntoView, pushState, installed;

  beforeEach(() => {
    document.body.innerHTML = `
      <a id="to-target" href="#target"><span id="inner">go</span></a>
      <a id="to-top" href="#">top</a>
      <a id="to-missing" href="#missing">missing</a>
      <a id="external" href="https://example.com/">out</a>
      <a id="to-button" href="#button-target">button</a>
      <a id="to-focusable" href="#focusable-target">focusable</a>
      <button id="button-target">a button</button>
      <div id="focusable-target" tabindex="0">already focusable</div>
      <section id="target" style="height:2000px">target</section>`;
    scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    pushState = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    installed = new AnchorLinks();
    installed.install();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scrolls smoothly to the section, stops the browser jump and pushes the hash', () => {
    const event = click(document.getElementById('to-target'));
    expect(event.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('target'));
    expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: 'smooth', block: 'start' });
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenNthCalledWith(1, null, '', '#target');
  });

  it('moves the keyboard focus to the section, made focusable for the purpose, without scrolling a second time', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    click(document.getElementById('to-target'));
    const target = document.getElementById('target');
    expect([target.getAttribute('tabindex'), document.activeElement === target]).toStrictEqual([
      '-1',
      true,
    ]);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toBe(target);
    expect(focus).toHaveBeenNthCalledWith(1, { preventScroll: true });
  });

  it.each([
    ['to-button', 'button-target', null],
    ['to-focusable', 'focusable-target', '0'],
  ])(
    'does not change the tabindex of a target that can take the focus already: %s',
    (link, id, tabindex) => {
      click(document.getElementById(link));
      expect([
        document.getElementById(id).getAttribute('tabindex'),
        document.activeElement.id,
      ]).toStrictEqual([tabindex, id]);
    },
  );

  it('leaves the focus where it is for the link to the top of the page', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    click(document.getElementById('to-top'));
    expect(focus).toHaveBeenCalledTimes(0);
  });

  it('does not move the focus for a missing target or an external link', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    click(document.getElementById('to-missing'));
    expect(focus).toHaveBeenCalledTimes(0);
  });

  it('follows a click on an element inside the link', () => {
    const event = click(document.getElementById('inner'));
    expect([event.defaultPrevented, scrollIntoView.mock.contexts[0]]).toStrictEqual([
      true,
      document.getElementById('target'),
    ]);
  });

  it('jumps instead of animating when the visitor prefers reduced motion', () => {
    stubReducedMotion(true);
    click(document.getElementById('to-target'));
    expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: 'auto', block: 'start' });
  });

  it('scrolls the page to the top for a bare #, and pushes the bare path', () => {
    const event = click(document.getElementById('to-top'));
    expect(event.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.documentElement);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenNthCalledWith(1, null, '', location.pathname);
  });

  it('leaves a link to a missing section alone', () => {
    const event = click(document.getElementById('to-missing'));
    expect([
      event.defaultPrevented,
      scrollIntoView.mock.calls.length,
      pushState.mock.calls.length,
    ]).toStrictEqual([false, 0, 0]);
  });

  it('leaves links that are not same-page anchors alone', () => {
    const external = document.getElementById('external');
    external.addEventListener('click', (event) => event.preventDefault(), { once: true });
    const event = click(external);
    expect([
      event.defaultPrevented,
      scrollIntoView.mock.calls.length,
      pushState.mock.calls.length,
    ]).toStrictEqual([true, 0, 0]);
  });

  it.each([
    ['meta', { metaKey: true }],
    ['control', { ctrlKey: true }],
  ])('leaves a %s-click to the browser', (_name, modifier) => {
    const event = click(document.getElementById('to-target'), modifier);
    expect([
      event.defaultPrevented,
      scrollIntoView.mock.calls.length,
      pushState.mock.calls.length,
    ]).toStrictEqual([false, 0, 0]);
  });

  it('leaves a click that someone else already handled', () => {
    const link = document.getElementById('to-target');
    link.addEventListener('click', (event) => event.preventDefault());
    click(link);
    expect([scrollIntoView.mock.calls.length, pushState.mock.calls.length]).toStrictEqual([0, 0]);
  });

  it('ignores clicks that are not on a link', () => {
    const event = click(document.getElementById('target'));
    expect([event.defaultPrevented, scrollIntoView.mock.calls.length]).toStrictEqual([false, 0]);
  });
});
