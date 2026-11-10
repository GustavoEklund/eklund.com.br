import { describe, it, expect } from 'vitest';
import { PanelHtml } from '../../edge/panel/panel-html.js';

const HTML = PanelHtml.html;

describe('PanelHtml', () => {
  it('escapes every value put into the markup, so text from a visitor stays text', () => {
    const message = `<img src=x onerror="alert('x')">&`;
    expect(HTML`<p title="${message}">${message}</p>`.toString()).toBe(
      '<p title="&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;">&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;</p>',
    );
  });

  it('keeps the markup it built, joins lists, and writes nothing for null, undefined and false', () => {
    const items = ['a<b', 'c'].map((item) => HTML`<li>${item}</li>`);
    expect(
      HTML`<ul>${items}</ul>${null}${undefined}${false}${0}${PanelHtml.raw('<hr>')}`.toString(),
    ).toBe('<ul><li>a&lt;b</li><li>c</li></ul>0<hr>');
  });

  it('escapes a string on its own', () => {
    expect(PanelHtml.escape(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
});
