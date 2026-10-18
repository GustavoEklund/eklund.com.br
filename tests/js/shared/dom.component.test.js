import { describe, it, expect, beforeEach } from 'vitest';
import { Dom } from '@site/js/shared/dom.js';

describe('Dom in a real browser', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<main id="root" style="height:200px;width:300px"><p class="item">one</p></main>';
  });

  it('writes the number zero, which a falsy check would swallow', () => {
    const element = Dom.require('.item');
    Dom.setText(element, 0);
    expect(element.textContent).toBe('0');
  });

  it('builds SVG elements that the browser treats as SVG graphics', () => {
    const svg = Dom.svg('svg', { viewBox: '0 0 10 10', width: 10, height: 10 });
    const path = Dom.svg('path', { d: 'M0,0L10,0' });
    svg.append(path);
    document.body.append(svg);
    expect(path).toBeInstanceOf(SVGPathElement);
    expect(path.getTotalLength()).toBe(10);
  });

  it('reports a laid-out element as visible through a real IntersectionObserver', async () => {
    const visible = await new Promise((resolve) => {
      const observer = Dom.observeVisibility(Dom.require('#root'), (isVisible) => {
        observer.disconnect();
        resolve(isVisible);
      });
    });
    expect(visible).toBe(true);
  });

  it('reports an element without a box as hidden, as content-visibility would leave it', async () => {
    const root = Dom.require('#root');
    root.style.display = 'none';
    const visible = await new Promise((resolve) => {
      const observer = Dom.observeVisibility(root, (isVisible) => {
        observer.disconnect();
        resolve(isVisible);
      });
    });
    expect(visible).toBe(false);
  });

  it('escapes markup so it can be placed in innerHTML', () => {
    const element = Dom.require('.item');
    element.innerHTML = Dom.escapeHtml('<b>x</b> & y');
    expect(element.textContent).toBe('<b>x</b> & y');
    expect(element.querySelector('b')).toBeNull();
  });
});
