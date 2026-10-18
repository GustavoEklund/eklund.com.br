import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Translator } from '@site/js/i18n/translator.js';

const PT_BR = {
  meta: { title: 'Título', description: 'Descrição' },
  hello: 'Olá, {name}',
  onlyPortuguese: 'só em português',
  count: 5,
  nested: { deep: { key: 'fundo' } },
  items: { one: '{count} item', other: '{count} itens' },
  withHtml: 'um <b>negrito</b>',
  label: 'rótulo',
  tip: 'dica',
  twice: '{x} e {x}',
};
const EN_US = {
  meta: { title: 'Title', description: 'Description' },
  hello: 'Hello, {name}',
  nested: { deep: { key: 'deep' } },
  items: { one: '{count} item', other: '{count} items' },
  withHtml: 'a <b>bold</b>',
  label: 'label',
  tip: 'tip',
};
const DICTIONARIES = { 'pt-BR': PT_BR, 'en-US': EN_US };

const translatorFor = (locale = 'pt-BR') => new Translator({ dictionaries: DICTIONARIES, locale });

describe('Translator lookup', () => {
  let warn;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('exposes the active locale', () => expect(translatorFor('en-US').locale).toBe('en-US'));
  it('finds flat and nested keys', () => {
    const translator = translatorFor();
    expect(translator.t('label')).toBe('rótulo');
    expect(translator.t('nested.deep.key')).toBe('fundo');
  });

  it('fills {placeholders}', () =>
    expect(translatorFor().t('hello', { name: 'Gustavo' })).toBe('Olá, Gustavo'));
  it('fills a placeholder every time it appears', () =>
    expect(translatorFor().t('twice', { x: 'a' })).toBe('a e a'));
  it('keeps the placeholder when the parameter is missing', () =>
    expect(translatorFor().t('hello', {})).toBe('Olá, {name}'));
  it('prints a zero parameter', () =>
    expect(translatorFor().t('hello', { name: 0 })).toBe('Olá, 0'));
  it('leaves placeholders alone when no params are given', () =>
    expect(translatorFor().t('hello')).toBe('Olá, {name}'));

  it('converts non-string values to text', () => expect(translatorFor().t('count')).toBe('5'));

  it('falls back to Portuguese when the active locale lacks the key, and warns once', () => {
    const translator = translatorFor('en-US');
    expect(translator.t('onlyPortuguese')).toBe('só em português');
    expect(translator.t('onlyPortuguese')).toBe('só em português');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenNthCalledWith(1, '[i18n] missing "onlyPortuguese" in en-US');
  });

  it('returns the key itself when no dictionary has it', () => {
    const translator = translatorFor('en-US');
    expect(translator.t('nothing.here')).toBe('nothing.here');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenNthCalledWith(1, '[i18n] missing "nothing.here" in en-US');
  });

  it('warns separately for each missing key', () => {
    const translator = translatorFor();
    translator.t('a.b');
    translator.t('c.d');
    translator.t('a.b');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, '[i18n] missing "a.b" in pt-BR');
    expect(warn).toHaveBeenNthCalledWith(2, '[i18n] missing "c.d" in pt-BR');
  });

  it('does not warn for keys that exist', () => {
    translatorFor('en-US').t('label');
    expect(warn).toHaveBeenCalledTimes(0);
  });

  it('does not walk through a string as if it were a branch', () =>
    expect(translatorFor().t('label.extra')).toBe('label.extra'));

  it('does not read through a null entry', () => {
    const translator = new Translator({
      dictionaries: { 'pt-BR': { gap: null }, 'en-US': {} },
      locale: 'pt-BR',
    });
    expect(translator.t('gap.inside')).toBe('gap.inside');
    expect(warn).toHaveBeenNthCalledWith(1, '[i18n] missing "gap.inside" in pt-BR');
  });

  it.each([['label.length'], ['label.0'], ['count.toFixed'], ['nested.deep.key.length']])(
    'does not treat %s, a property of a string or a number, as a translation',
    (key) => {
      const translator = translatorFor();
      expect(translator.t(key)).toBe(key);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenNthCalledWith(1, `[i18n] missing "${key}" in pt-BR`);
    },
  );

  it('interpolates into the Portuguese fallback too', () => {
    const translator = new Translator({
      dictionaries: { 'pt-BR': { greet: 'Oi {who}' }, 'en-US': {} },
      locale: 'en-US',
    });
    expect(translator.t('greet', { who: 'você' })).toBe('Oi você');
  });
});

describe('Translator.has', () => {
  it('is true for keys in the active dictionary', () =>
    expect(translatorFor().has('nested.deep.key')).toBe(true));
  it('is false for keys it only has in another locale', () =>
    expect(translatorFor('en-US').has('onlyPortuguese')).toBe(false));
  it('is false for unknown keys and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translatorFor().has('nope')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(0);
    warn.mockRestore();
  });
});

describe('Translator.plural', () => {
  it('uses the singular for one in English and the plural for zero', () => {
    const translator = translatorFor('en-US');
    expect(translator.plural('items', 1)).toBe('1 item');
    expect(translator.plural('items', 0)).toBe('0 items');
    expect(translator.plural('items', 2)).toBe('2 items');
  });

  it('follows Portuguese rules, where zero is singular', () => {
    const translator = translatorFor();
    expect(translator.plural('items', 0)).toBe('0 item');
    expect(translator.plural('items', 1)).toBe('1 item');
    expect(translator.plural('items', 2)).toBe('2 itens');
  });

  it('merges extra params next to count', () => {
    const translator = new Translator({
      dictionaries: {
        'pt-BR': {
          cores: { one: '{count} núcleo de {vendor}', other: '{count} núcleos de {vendor}' },
        },
      },
      locale: 'pt-BR',
    });
    expect(translator.plural('cores', 8, { vendor: 'AMD' })).toBe('8 núcleos de AMD');
  });

  it('falls back to "other" when the exact category is missing', () => {
    const translator = new Translator({
      dictionaries: { 'pt-BR': { things: { other: '{count} coisas' } } },
      locale: 'pt-BR',
    });
    expect(translator.plural('things', 1)).toBe('1 coisas');
  });

  it('lets params override nothing but count', () => {
    expect(translatorFor().plural('items', 3, { count: 99 })).toBe('99 itens');
  });
});

describe('Translator markup', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="description" content="x" data-i18n-attr="content:meta.description">';
    document.body.innerHTML = '';
  });

  it('translates text, html and attributes in one pass', () => {
    document.body.innerHTML = `
      <p id="text" data-i18n="label">?</p>
      <p id="html" data-i18n-html="withHtml">?</p>
      <button id="attrs" data-i18n-attr="aria-label:label; title:tip;">?</button>`;
    translatorFor().applyTo(document);
    expect(document.getElementById('text').textContent).toBe('rótulo');
    expect(document.getElementById('html').innerHTML).toBe('um <b>negrito</b>');
    expect(document.getElementById('attrs').getAttribute('aria-label')).toBe('rótulo');
    expect(document.getElementById('attrs').getAttribute('title')).toBe('dica');
  });

  it('treats the text key as plain text, not markup', () => {
    document.body.innerHTML = '<p data-i18n="withHtml"></p>';
    translatorFor().applyTo(document);
    expect(document.querySelector('p').textContent).toBe('um <b>negrito</b>');
    expect(document.querySelectorAll('p b')).toHaveLength(0);
  });

  it('also translates the root element when it carries the attribute', () => {
    document.body.innerHTML = '<p data-i18n-attr="title:tip"><span data-i18n="label"></span></p>';
    translatorFor().applyTo(document.querySelector('p'));
    expect(document.querySelector('p').getAttribute('title')).toBe('dica');
    expect(document.querySelector('span').textContent).toBe('rótulo');
  });

  it('only touches the given subtree', () => {
    document.body.innerHTML =
      '<section><i data-i18n="label"></i></section><aside><i data-i18n="label">untouched</i></aside>';
    translatorFor().applyTo(document.querySelector('section'));
    expect(document.querySelector('section i').textContent).toBe('rótulo');
    expect(document.querySelector('aside i').textContent).toBe('untouched');
  });

  it('keeps attribute keys that contain a colon after the first one', () => {
    const translator = new Translator({
      dictionaries: { 'pt-BR': { a: 'valor' } },
      locale: 'pt-BR',
    });
    document.body.innerHTML = '<i data-i18n-attr="data-x:a"></i>';
    translator.applyTo(document);
    expect(document.querySelector('i').getAttribute('data-x')).toBe('valor');
  });

  it('trims the attribute name and the key around the colon', () => {
    document.body.innerHTML = '<i data-i18n-attr="  title  :  tip  ;  aria-label :label"></i>';
    translatorFor().applyTo(document);
    expect([
      document.querySelector('i').getAttribute('title'),
      document.querySelector('i').getAttribute('aria-label'),
    ]).toStrictEqual(['dica', 'rótulo']);
  });

  it('ignores empty attribute pairs', () => {
    document.body.innerHTML = '<i data-i18n-attr=" ; title:tip ;; "></i>';
    translatorFor().applyTo(document);
    expect(document.querySelector('i').getAttribute('title')).toBe('dica');
  });

  it('translates the whole document by default', () => {
    document.body.innerHTML = '<p data-i18n="label"></p>';
    translatorFor().applyTo();
    expect(document.querySelector('p').textContent).toBe('rótulo');
  });

  describe('mount', () => {
    it('sets lang, title and description and translates the markup', () => {
      document.body.innerHTML = '<p data-i18n="label"></p>';
      const translator = translatorFor('en-US');
      expect(translator.mount()).toBe(translator);
      expect(document.documentElement.lang).toBe('en-US');
      expect(document.title).toBe('Title');
      expect(document.querySelector('meta[name=description]').getAttribute('content')).toBe(
        'Description',
      );
      expect(document.querySelector('p').textContent).toBe('label');
    });

    it('does not break when the page has no description tag', () => {
      document.head.innerHTML = '';
      const translator = translatorFor();
      expect(translator.mount()).toBe(translator);
      expect(document.title).toBe('Título');
    });
  });

  describe('setLocale', () => {
    it('re-translates the markup and the document, then tells the listeners', () => {
      document.body.innerHTML = '<p data-i18n="label"></p>';
      const translator = translatorFor().mount();
      const seen = [];
      translator.onChange((locale) =>
        seen.push([locale, document.querySelector('p').textContent, document.documentElement.lang]),
      );
      translator.setLocale('en-US');
      expect(translator.locale).toBe('en-US');
      expect(seen).toStrictEqual([['en-US', 'label', 'en-US']]);
      expect(document.title).toBe('Title');
      expect(document.documentElement.lang).toBe('en-US');
      expect(document.querySelector('meta[name=description]').getAttribute('content')).toBe(
        'Description',
      );
    });

    it('picks up the plural rules of the new locale', () => {
      const translator = translatorFor();
      expect(translator.plural('items', 0)).toBe('0 item');
      translator.setLocale('en-US');
      expect(translator.plural('items', 0)).toBe('0 items');
    });

    it('ignores locales without a dictionary', () => {
      const translator = translatorFor();
      const listener = vi.fn();
      translator.onChange(listener);
      translator.setLocale('fr-FR');
      expect(translator.locale).toBe('pt-BR');
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('ignores setting the locale it already has', () => {
      const translator = translatorFor();
      const listener = vi.fn();
      translator.onChange(listener);
      translator.setLocale('pt-BR');
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it('notifies every listener once, and the same function only once', () => {
      const translator = translatorFor();
      const a = vi.fn(),
        b = vi.fn();
      translator.onChange(a);
      translator.onChange(a);
      translator.onChange(b);
      translator.setLocale('en-US');
      expect(a).toHaveBeenCalledTimes(1);
      expect(a).toHaveBeenNthCalledWith(1, 'en-US');
      expect(b).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenNthCalledWith(1, 'en-US');
    });

    it('calls the listeners in the order they registered, each after the markup changed', () => {
      document.body.innerHTML = '<p data-i18n="label"></p>';
      const translator = translatorFor().mount();
      const calls = [];
      translator.onChange(() => calls.push(['first', document.querySelector('p').textContent]));
      translator.onChange(() => calls.push(['second', document.querySelector('p').textContent]));
      translator.setLocale('en-US');
      translator.setLocale('pt-BR');
      expect(calls).toStrictEqual([
        ['first', 'label'],
        ['second', 'label'],
        ['first', 'rótulo'],
        ['second', 'rótulo'],
      ]);
    });

    it('keeps the previous locale when the target has no dictionary, and the markup too', () => {
      document.body.innerHTML = '<p data-i18n="label"></p>';
      const translator = translatorFor().mount();
      translator.setLocale('fr-FR');
      expect([
        document.querySelector('p').textContent,
        document.documentElement.lang,
        document.title,
      ]).toStrictEqual(['rótulo', 'pt-BR', 'Título']);
    });
  });

  describe('bind', () => {
    it('writes the text, records the key and survives a locale change', () => {
      document.body.innerHTML = '<p></p>';
      const element = document.querySelector('p');
      const translator = translatorFor();
      translator.bind(element, 'label');
      expect(element.textContent).toBe('rótulo');
      expect(element.dataset.i18n).toBe('label');
      translator.setLocale('en-US');
      expect(element.textContent).toBe('label');
    });
  });
});
