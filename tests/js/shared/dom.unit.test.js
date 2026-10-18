import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Dom } from '@site/js/shared/dom.js';

describe('Dom', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<main id="root"><p class="item">one</p><p class="item">two</p></main>';
  });

  describe('query and queryAll', () => {
    it('finds the first match or null', () => {
      expect(Dom.query('.item').textContent).toBe('one');
      expect(Dom.query('.nope')).toBeNull();
    });

    it('scopes the search to a root element', () => {
      document.body.insertAdjacentHTML('beforeend', '<aside><p class="item">other</p></aside>');
      expect(Dom.query('.item', Dom.require('aside')).textContent).toBe('other');
    });

    it('returns a real array of every match', () => {
      const items = Dom.queryAll('.item');
      expect(Array.isArray(items)).toBe(true);
      expect(items.map((item) => item.textContent)).toStrictEqual(['one', 'two']);
      expect(Dom.queryAll('.nope')).toStrictEqual([]);
    });

    it('scopes queryAll to a root element', () => {
      expect(Dom.queryAll('p', Dom.require('#root'))).toHaveLength(2);
      expect(Dom.queryAll('p', Dom.require('.item'))).toHaveLength(0);
    });
  });

  describe('require', () => {
    it('returns the element', () => expect(Dom.require('#root').id).toBe('root'));
    it('scopes to a root', () =>
      expect(Dom.require('.item', Dom.require('#root')).textContent).toBe('one'));
    it('throws with the selector in the message', () =>
      expect(() => Dom.require('#absent')).toThrow('Missing element: #absent'));
  });

  describe('setText', () => {
    it('writes the text', () => {
      const element = Dom.require('.item');
      Dom.setText(element, 'changed');
      expect(element.textContent).toBe('changed');
    });

    it('accepts numbers', () => {
      const element = Dom.require('.item');
      Dom.setText(element, 7);
      expect(element.textContent).toBe('7');
    });

    it('leaves the DOM alone when the text is unchanged', () => {
      const element = Dom.require('.item');
      const textNode = element.firstChild;
      Dom.setText(element, 'one');
      expect(element.firstChild).toBe(textNode);
    });

    it('ignores a missing element', () => expect(() => Dom.setText(null, 'x')).not.toThrow());
  });

  describe('svg', () => {
    it('creates an element in the SVG namespace', () => {
      const element = Dom.svg('circle');
      expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(element.localName).toBe('circle');
    });

    it('sets attributes', () => {
      const element = Dom.svg('rect', { width: 10, class: 'box' });
      expect(element.getAttribute('width')).toBe('10');
      expect(element.getAttribute('class')).toBe('box');
    });

    it('sets text content when given, including an empty string', () => {
      expect(Dom.svg('text', {}, 'hello').textContent).toBe('hello');
      expect(Dom.svg('text', {}, '').textContent).toBe('');
      expect(Dom.svg('text').textContent).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('escapes ampersands and angle brackets that open tags', () =>
      expect(Dom.escapeHtml('a & b <i>')).toBe('a &amp; b &lt;i>'));
    it('escapes the ampersand first so entities are not double-escaped', () =>
      expect(Dom.escapeHtml('<')).toBe('&lt;'));
    it('escapes every occurrence', () => expect(Dom.escapeHtml('<<&&')).toBe('&lt;&lt;&amp;&amp;'));
  });

  describe('observeVisibility', () => {
    let observers;

    beforeEach(() => {
      observers = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback, options) {
            this.callback = callback;
            this.options = options;
            this.observed = [];
            observers.push(this);
          }
          observe(element) {
            this.observed.push(element);
          }
        },
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    const entry = (isIntersecting, width, height) => [
      { isIntersecting, boundingClientRect: { width, height } },
    ];

    it('creates one observer, observes the element once and returns the observer', () => {
      const element = Dom.require('#root');
      const result = Dom.observeVisibility(element, () => {}, 0.4);
      expect(observers).toHaveLength(1);
      expect(result).toBe(observers[0]);
      expect(observers[0].observed).toStrictEqual([element]);
      expect(observers[0].options).toStrictEqual({ threshold: 0.4 });
    });

    it('defaults to a zero threshold', () => {
      Dom.observeVisibility(Dom.require('#root'), () => {});
      expect(observers[0].options).toStrictEqual({ threshold: 0 });
    });

    it('does not call back until the observer reports', () => {
      const onChange = vi.fn();
      Dom.observeVisibility(Dom.require('#root'), onChange);
      expect(onChange).toHaveBeenCalledTimes(0);
    });

    it('reports true, once, for an intersecting element that has a box', () => {
      const onChange = vi.fn();
      Dom.observeVisibility(Dom.require('#root'), onChange);
      observers[0].callback(entry(true, 100, 50));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenNthCalledWith(1, true);
    });

    it.each([
      ['not intersecting', false, 100, 50],
      ['zero width (content-visibility skipped it)', true, 0, 50],
      ['zero height', true, 100, 0],
      ['no box at all', false, 0, 0],
    ])('reports false, once, when %s', (_label, intersecting, width, height) => {
      const onChange = vi.fn();
      Dom.observeVisibility(Dom.require('#root'), onChange);
      observers[0].callback(entry(intersecting, width, height));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenNthCalledWith(1, false);
    });

    it('only looks at the first entry of a batch', () => {
      const onChange = vi.fn();
      Dom.observeVisibility(Dom.require('#root'), onChange);
      observers[0].callback([...entry(false, 100, 50), ...entry(true, 100, 50)]);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenNthCalledWith(1, false);
    });
  });
});
