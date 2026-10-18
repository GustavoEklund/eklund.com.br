import { describe, it, expect } from 'vitest';
import { ContrastTargets } from '@site/js/shared/contrast-targets.js';
import { SiteSource } from '../../support/site-source.js';

const TOKENS_CSS = SiteSource.read('css/foundation/tokens.css');
const DEFINED = [...TOKENS_CSS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(([, name]) => name);
const PROPERTIES = ['background-color', 'fill', 'stroke'];

describe('ContrastTargets', () => {
  it('names every component once, in lower case', () => {
    const labels = ContrastTargets.COMPONENTS.map((target) => target.label);
    expect(
      labels.filter(
        (label, index) =>
          labels.indexOf(label) !== index || label !== label.toLowerCase() || label.trim() === '',
      ),
    ).toStrictEqual([]);
  });

  it('reads each component from a property that paints a color', () => {
    expect(
      ContrastTargets.COMPONENTS.map((target) => target.property).filter(
        (property) => !PROPERTIES.includes(property),
      ),
    ).toStrictEqual([]);
  });

  it('uses selectors that every browser parses', () => {
    for (const { selector } of ContrastTargets.COMPONENTS)
      expect(() => document.querySelector(selector)).not.toThrow();
  });

  it('only names surfaces, in `against`, that are design tokens', () => {
    const surfaces = ContrastTargets.COMPONENTS.flatMap((target) => target.against ?? []);
    expect(surfaces.filter((name) => !DEFINED.includes(name))).toStrictEqual([]);
  });

  it('pairs tokens that tokens.css defines, one pair per label', () => {
    const names = ContrastTargets.TOKENS.flatMap((pair) => [pair.foreground, pair.background]);
    expect(names.filter((name) => !DEFINED.includes(name))).toStrictEqual([]);
    const labels = ContrastTargets.TOKENS.map((pair) => pair.label);
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toStrictEqual([]);
  });

  it('covers the focus ring on the page and on a panel, which is the accent drawn two pixels thick', () => {
    expect(ContrastTargets.TOKENS).toStrictEqual([
      { label: 'focus ring on page', foreground: '--accent', background: '--bg' },
      { label: 'focus ring on panel', foreground: '--accent', background: '--bg-2' },
    ]);
  });
});
