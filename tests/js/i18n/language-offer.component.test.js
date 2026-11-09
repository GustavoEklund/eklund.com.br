import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LanguageOffer } from '@site/js/i18n/language-offer.js';
import { Translator } from '@site/js/i18n/translator.js';

const DICTIONARIES = {
  'pt-BR': { meta: { title: 'T', description: 'D' } },
  'en-US': { meta: { title: 'T', description: 'D' } },
};
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ENGLISH_READER = { page: 'pt-BR', chosen: null, languages: ['en-GB'], userAgent: CHROME };

describe('LanguageOffer.wanted', () => {
  it.each([
    ['an English browser on the Portuguese page, with no choice made', ENGLISH_READER, true],
    [
      'a browser that lists English before Portuguese',
      { ...ENGLISH_READER, languages: ['en-US', 'pt-BR'] },
      true,
    ],
    [
      'a browser that lists a language the site does not translate before English',
      { ...ENGLISH_READER, languages: ['de', 'en-AU'] },
      true,
    ],
    ['a Portuguese browser', { ...ENGLISH_READER, languages: ['pt-BR'] }, false],
    [
      'a browser that lists Portuguese before English',
      { ...ENGLISH_READER, languages: ['pt-PT', 'en-US'] },
      false,
    ],
    [
      'a browser in a language the site does not translate',
      { ...ENGLISH_READER, languages: ['fr'] },
      false,
    ],
    ['a browser that lists no language', { ...ENGLISH_READER, languages: [] }, false],
    ['a visitor who chose Portuguese', { ...ENGLISH_READER, chosen: 'pt-BR' }, false],
    ['a visitor who chose English', { ...ENGLISH_READER, chosen: 'en-US' }, false],
    ['the English page', { ...ENGLISH_READER, page: 'en-US' }, false],
    ['a crawler', { ...ENGLISH_READER, userAgent: GOOGLEBOT }, false],
  ])('%s: %s', (_description, visitor, expected) => {
    expect(LanguageOffer.wanted(visitor)).toBe(expected);
  });
});

describe('LanguageOffer', () => {
  let translator, onAccept, onDecline, root, focusAfter;
  const offer = (visitor = ENGLISH_READER) =>
    new LanguageOffer({ root, translator, visitor, onAccept, onDecline, focusAfter });
  /** Clicks and reports whether the offer cancelled the click; the document cancels it last, so this page never leaves. */
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
  const link = () => root.querySelector('a');
  const button = () => root.querySelector('button');

  beforeEach(() => {
    document.body.innerHTML =
      '<aside id="offer" hidden><p>I also wrote this page in English.</p><a href="/en/" data-locale="en-US"><span>Read it in English</span></a><button type="button">Stay in Portuguese</button></aside><main id="main" tabindex="-1"></main>';
    root = document.getElementById('offer');
    focusAfter = document.getElementById('main');
    translator = new Translator({ dictionaries: DICTIONARIES, locale: 'pt-BR' });
    onAccept = vi.fn();
    onDecline = vi.fn();
  });

  it('shows itself to a visitor it is meant for, and returns itself', () => {
    const shown = offer();
    expect([shown.install(), shown.open, root.hidden]).toStrictEqual([shown, true, false]);
  });

  it('stays hidden, and listens to nothing, for a visitor it is not meant for', () => {
    const hidden = offer({ ...ENGLISH_READER, chosen: 'pt-BR' }).install();
    const event = click(link());
    click(button());
    expect([
      hidden.open,
      onAccept.mock.calls.length,
      onDecline.mock.calls.length,
      event.defaultPrevented,
    ]).toStrictEqual([false, 0, 0, false]);
  });

  it('switches to English through onAccept, as the header link does, and keeps the browser from leaving', () => {
    offer().install();
    const event = click(root.querySelector('a span'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenNthCalledWith(1, 'en-US');
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])(
    'leaves a click with %s to the browser, which opens the English page its own way',
    (modifier) => {
      offer().install();
      const event = click(link(), { [modifier]: true });
      expect([onAccept.mock.calls.length, event.defaultPrevented]).toStrictEqual([0, false]);
    },
  );

  it('closes once the page is in English, whatever switched it', () => {
    const shown = offer().install();
    translator.setLocale('en-US');
    expect(shown.open).toBe(false);
  });

  it('saves Portuguese as the choice when declined, closes, and hands the focus to the main content', () => {
    const shown = offer().install();
    button().focus();
    click(button());
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenNthCalledWith(1, 'pt-BR');
    expect([shown.open, document.activeElement]).toStrictEqual([false, focusAfter]);
  });

  it('leaves the focus where it is when it closes without holding it', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const shown = offer().install();
    outside.focus();
    translator.setLocale('en-US');
    expect([shown.open, document.activeElement]).toStrictEqual([false, outside]);
  });

  it('ignores a click on its text', () => {
    const shown = offer().install();
    click(root.querySelector('p'));
    expect([shown.open, onAccept.mock.calls.length, onDecline.mock.calls.length]).toStrictEqual([
      true,
      0,
      0,
    ]);
  });
});
