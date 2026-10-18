import { describe, it, expect } from 'vitest';
import { GlslHighlighter } from '@site/js/globe/shader-dialog.js';

const keyword = (word) => `<span class="tok-keyword">${word}</span>`;
const fn = (word) => `<span class="tok-function">${word}</span>`;
const number = (value) => `<span class="tok-number">${value}</span>`;
const comment = (text) => `<span class="tok-comment">${text}</span>`;

describe('GlslHighlighter', () => {
  it('marks keywords and numbers', () => {
    expect(GlslHighlighter.highlight('float x = 1.0;')).toBe(
      `${keyword('float')} x = ${number('1.0')};`,
    );
  });

  it('marks built-in functions only when they are called', () => {
    expect(GlslHighlighter.highlight('y = mix(a, b, 0.5); z = mix;')).toBe(
      `y = ${fn('mix')}(a, b, ${number('0.5')}); z = mix;`,
    );
  });

  it.each([
    'uniform',
    'in',
    'out',
    'void',
    'float',
    'vec2',
    'vec3',
    'vec4',
    'mat3',
    'precision',
    'highp',
    'mediump',
    'lowp',
    'return',
    'if',
    'else',
    'for',
    'layout',
    'location',
    'const',
    'int',
    'bool',
    'discard',
  ])('marks %s as a keyword', (word) => {
    expect(GlslHighlighter.highlight(word)).toBe(keyword(word));
  });

  it.each([
    'main',
    'smoothstep',
    'mix',
    'dot',
    'length',
    'normalize',
    'max',
    'min',
    'step',
    'pow',
    'exp',
    'sqrt',
    'clamp',
    'fract',
    'abs',
    'sin',
    'cos',
    'fwidth',
    'cross',
    'reflect',
  ])('marks %s( as a built-in', (word) => {
    expect(GlslHighlighter.highlight(`${word}(x)`)).toBe(`${fn(word)}(x)`);
  });

  it('does not mark a keyword inside a longer word', () => {
    expect(GlslHighlighter.highlight('vec3 inside;')).toBe(`${keyword('vec3')} inside;`);
    expect(GlslHighlighter.highlight('outColor vDepth')).toBe('outColor vDepth');
  });

  it('does not mark digits that belong to a name', () => {
    expect(GlslHighlighter.highlight('h1 = vec3(2.0)')).toBe(
      `h1 = ${keyword('vec3')}(${number('2.0')})`,
    );
  });

  it('marks integers and decimals, but not a number that starts with a dot', () => {
    expect(GlslHighlighter.highlight('a = 10 + 0.25 + .5;')).toBe(
      `a = ${number('10')} + ${number('0.25')} + .5;`,
    );
  });

  it('turns everything after // into a comment, including a second //', () => {
    expect(GlslHighlighter.highlight('x = 1.0; // note: 2.0 // more')).toBe(
      `x = ${number('1.0')}; ${comment('// note: 2.0 // more')}`,
    );
  });

  it('leaves the words of a comment alone', () => {
    expect(GlslHighlighter.highlight('// uniform float 3')).toBe(comment('// uniform float 3'));
  });

  it('wraps a whole preprocessor line in a comment span', () => {
    expect(GlslHighlighter.highlight('#version 300 es')).toBe(
      comment(`#version ${number('300')} es`),
    );
  });

  it('escapes & and < so shader code cannot become markup', () => {
    expect(GlslHighlighter.highlight('if (a < b && c) {}')).toBe(
      `${keyword('if')} (a &lt; b &amp;&amp; c) {}`,
    );
  });

  it('trims the source and keeps its line structure', () => {
    expect(GlslHighlighter.highlight('\n\n  void main() {\n  return;\n}\n\n')).toBe(
      `${keyword('void')} ${fn('main')}() {\n  ${keyword('return')};\n}`,
    );
  });

  it('keeps the text of the source exactly: only spans are added', () => {
    const source =
      '#version 300 es\nprecision mediump float;\nuniform vec3 uColor; // tint\nvoid main() { outColor = vec4(mix(uColor, vec3(1.0), 0.5), 1.0); }';
    const probe = document.createElement('pre');
    probe.innerHTML = GlslHighlighter.highlight(source);
    expect(probe.textContent).toBe(source);
  });
});
