import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocaleSwitcher } from '@site/js/i18n/locale-switcher.js';
import { Translator } from '@site/js/i18n/translator.js';

const DICTIONARIES = {
  'pt-BR': { meta: { title: 'T', description: 'D' } },
  'en-US': { meta: { title: 'T', description: 'D' } },
};
const current = () =>
  [...document.querySelectorAll('#switcher a')].map((link) => [
    link.dataset.locale,
    link.getAttribute('aria-current'),
  ]);

describe('LocaleSwitcher', () => {
  let translator, onSelect, root;
  /**
   * Clicks and reports whether the switcher took the click over (cancelled it). The click is cancelled last, on the document,
   * whatever the switcher did: a click nothing cancelled would make this test page follow the link and leave.
   */
  const click = (element, init = {}) => {
    const outcome = { defaultPrevented: false };
    const finish = (event) => {
      outcome.defaultPrevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener('click', finish, { once: true });
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    document.removeEventListener('click', finish);
    return outcome;
  };

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="switcher"><a href="/" data-locale="pt-BR"><span>PT</span></a><a href="/en/" data-locale="en-US">EN</a><i id="gap">·</i></div>';
    root = document.getElementById('switcher');
    translator = new Translator({ dictionaries: DICTIONARIES, locale: 'pt-BR' });
    onSelect = vi.fn();
  });

  it('marks the current language on install and returns itself', () => {
    const switcher = new LocaleSwitcher({ root, translator, onSelect });
    expect(switcher.install()).toBe(switcher);
    expect(current()).toStrictEqual([
      ['pt-BR', 'true'],
      ['en-US', null],
    ]);
    expect(onSelect).toHaveBeenCalledTimes(0);
  });

  it('reports the clicked language, once, and keeps the browser from following the link', () => {
    new LocaleSwitcher({ root, translator, onSelect }).install();
    const event = click(document.querySelector('[data-locale="en-US"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'en-US');
    expect(event.defaultPrevented).toBe(true);
  });

  it('resolves a click on an element inside the link to that link', () => {
    new LocaleSwitcher({ root, translator, onSelect }).install();
    click(document.querySelector('[data-locale="pt-BR"] span'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'pt-BR');
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])(
    'leaves a click with %s to the browser, which opens the page in its own way',
    (modifier) => {
      new LocaleSwitcher({ root, translator, onSelect }).install();
      const event = click(document.querySelector('[data-locale="en-US"]'), { [modifier]: true });
      expect([onSelect.mock.calls.length, event.defaultPrevented]).toStrictEqual([0, false]);
    },
  );

  it('ignores clicks that are not on a language link', () => {
    new LocaleSwitcher({ root, translator, onSelect }).install();
    const events = [click(document.getElementById('gap')), click(root)];
    expect([
      onSelect.mock.calls.length,
      events.map((event) => event.defaultPrevented),
    ]).toStrictEqual([0, [false, false]]);
  });

  it('does not change the current language by itself, only when the translator changes language', () => {
    new LocaleSwitcher({ root, translator, onSelect }).install();
    click(document.querySelector('[data-locale="en-US"]'));
    expect(current()).toStrictEqual([
      ['pt-BR', 'true'],
      ['en-US', null],
    ]);
    translator.setLocale('en-US');
    expect(current()).toStrictEqual([
      ['pt-BR', null],
      ['en-US', 'true'],
    ]);
    translator.setLocale('pt-BR');
    expect(current()).toStrictEqual([
      ['pt-BR', 'true'],
      ['en-US', null],
    ]);
  });

  it('renders from the translator locale whenever render is called', () => {
    const switcher = new LocaleSwitcher({ root, translator, onSelect });
    switcher.render();
    expect(current()).toStrictEqual([
      ['pt-BR', 'true'],
      ['en-US', null],
    ]);
  });
});
