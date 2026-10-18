// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';
import { EN_US } from '@site/js/i18n/locales/en-us.js';
import { SiteSource } from '../support/site-source.js';
import { ImageHeader } from './support/image-header.js';

const ORIGIN = 'https://eklund.com.br';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('site metadata', () => {
  let page;
  beforeAll(() => {
    page = SiteSource.html();
  });
  const attributes = (selector, names) =>
    [...page.querySelectorAll(selector)].map((element) =>
      names.map((name) => element.getAttribute(name)),
    );
  const meta = (selector) => page.querySelector(selector).getAttribute('content');

  describe('Open Graph and Twitter cards', () => {
    it('describe the page as a profile with the title, description, address and language of the Portuguese markup, in this order', () => {
      expect(
        attributes('meta[property^="og:"], meta[property^="profile:"], meta[name^="twitter:"]', [
          'property',
          'name',
          'content',
        ]),
      ).toStrictEqual([
        ['og:type', null, 'profile'],
        ['og:site_name', null, 'eklund.com.br'],
        ['og:title', null, PT_BR.meta.title],
        ['og:description', null, PT_BR.meta.description],
        ['og:url', null, `${ORIGIN}/`],
        ['og:locale', null, 'pt_BR'],
        ['og:locale:alternate', null, 'en_US'],
        ['og:image', null, `${ORIGIN}/assets/brand/social-card.png`],
        ['og:image:type', null, 'image/png'],
        ['og:image:width', null, '1200'],
        ['og:image:height', null, '630'],
        ['og:image:alt', null, PT_BR.meta.imageAlt],
        ['profile:first_name', null, 'Gustavo'],
        ['profile:last_name', null, 'Eklund'],
        [null, 'twitter:card', 'summary_large_image'],
      ]);
    });

    it('ask the translator to rewrite the title, description and image description when the language changes', () => {
      expect(
        attributes('meta[data-i18n-attr]', ['name', 'property', 'data-i18n-attr']),
      ).toStrictEqual([
        ['description', null, 'content:meta.description'],
        [null, 'og:title', 'content:meta.title'],
        [null, 'og:description', 'content:meta.description'],
        [null, 'og:image:alt', 'content:meta.imageAlt'],
      ]);
    });

    it('have an English counterpart for every text they carry', () => {
      expect(
        [EN_US.meta.title, EN_US.meta.description, EN_US.meta.imageAlt].map((text) => typeof text),
      ).toStrictEqual(['string', 'string', 'string']);
    });

    it('point og:url at the canonical address, and at the pt-BR alternate', () => {
      const canonical = page.querySelector('link[rel=canonical]').getAttribute('href');
      expect([
        canonical,
        meta('meta[property="og:url"]'),
        page.querySelector('link[hreflang="pt-BR"]').getAttribute('href'),
      ]).toStrictEqual([`${ORIGIN}/`, `${ORIGIN}/`, `${ORIGIN}/`]);
    });

    it('use an image that exists, is the PNG size the tags declare, and stays under 300 KB', () => {
      const path = meta('meta[property="og:image"]').replace(`${ORIGIN}/`, '');
      const bytes = SiteSource.bytes(path);
      expect([
        ImageHeader.png(bytes),
        String(ImageHeader.png(bytes).width),
        String(ImageHeader.png(bytes).height),
      ]).toStrictEqual([
        { width: 1200, height: 630 },
        meta('meta[property="og:image:width"]'),
        meta('meta[property="og:image:height"]'),
      ]);
      expect(bytes.length <= 300 * 1024).toBe(true);
    });
  });

  describe('icons and manifest', () => {
    it('link the vector icon, the 32 pixel favicon, the touch icon and the manifest', () => {
      expect(
        attributes('link[rel~=icon], link[rel=apple-touch-icon], link[rel=manifest]', [
          'rel',
          'href',
          'type',
          'sizes',
        ]),
      ).toStrictEqual([
        ['icon', 'icon.svg', 'image/svg+xml', null],
        ['icon', 'favicon.ico', null, '32x32'],
        ['apple-touch-icon', 'apple-touch-icon.png', null, null],
        ['manifest', 'site.webmanifest', null, null],
      ]);
    });

    it('ship a vector icon that is a 64 by 64 SVG with the mark as an outline, so it needs no font', () => {
      const svg = SiteSource.read('icon.svg');
      expect([
        svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'),
        svg.includes('<text'),
        svg.includes('<path fill="#101218" d="M'),
      ]).toStrictEqual([true, false, true]);
    });

    it('ship a favicon.ico that holds one 32 by 32 PNG image, and a 180 pixel touch icon', () => {
      expect([
        ImageHeader.ico(SiteSource.bytes('favicon.ico')),
        ImageHeader.png(SiteSource.bytes('apple-touch-icon.png')),
      ]).toStrictEqual([
        [{ width: 32, height: 32, format: 'png', pngSize: { width: 32, height: 32 } }],
        { width: 180, height: 180 },
      ]);
    });

    it('declare in the manifest the name, the language, the scope and the colors, matching the page', () => {
      const manifest = JSON.parse(SiteSource.read('site.webmanifest'));
      const { icons, ...members } = manifest;
      expect(members).toStrictEqual({
        name: 'Gustavo Eklund',
        short_name: 'eklund',
        description: PT_BR.meta.description,
        lang: 'pt-BR',
        dir: 'ltr',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'browser',
        background_color: '#111318',
        theme_color: meta('meta[name=theme-color]'),
      });
      expect(icons.length).toBe(4);
    });

    it('list manifest icons that exist and are the size they declare, with a maskable one', () => {
      const { icons } = JSON.parse(SiteSource.read('site.webmanifest'));
      const described = icons.map((icon) => [
        icon.src,
        icon.sizes,
        icon.type,
        icon.purpose,
        icon.type === 'image/png' ? ImageHeader.png(SiteSource.bytes(icon.src)) : null,
      ]);
      expect(described).toStrictEqual([
        ['icon.svg', 'any', 'image/svg+xml', 'any', null],
        ['assets/brand/icon-192.png', '192x192', 'image/png', 'any', { width: 192, height: 192 }],
        ['assets/brand/icon-512.png', '512x512', 'image/png', 'any', { width: 512, height: 512 }],
        [
          'assets/brand/icon-maskable-512.png',
          '512x512',
          'image/png',
          'maskable',
          { width: 512, height: 512 },
        ],
      ]);
    });

    it('keep the browser colors: one theme-color the theme controller updates, and both color schemes allowed', () => {
      expect([
        attributes('meta[name=theme-color]', ['content']),
        meta('meta[name=color-scheme]'),
      ]).toStrictEqual([[['#111318']], 'dark light']);
    });
  });

  describe('robots.txt and sitemap.xml', () => {
    it('lets every crawler in and names the sitemap', () => {
      expect(SiteSource.read('robots.txt')).toBe(
        `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
      );
    });

    it('is well-formed XML that lists both language versions, each with the alternates the page head declares', () => {
      const sitemap = new DOMParser().parseFromString(
        SiteSource.read('sitemap.xml'),
        'application/xml',
      );
      expect(sitemap.querySelector('parsererror')).toBeNull();
      const headAlternates = attributes('link[rel=alternate][hreflang]', ['hreflang', 'href']);
      const entries = [...sitemap.getElementsByTagName('url')].map((url) => [
        url.getElementsByTagName('loc')[0].textContent,
        [...url.getElementsByTagName('xhtml:link')].map((link) => [
          link.getAttribute('rel'),
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      ]);
      expect(entries).toStrictEqual(
        [`${ORIGIN}/`, `${ORIGIN}/en/`].map((loc) => [
          loc,
          headAlternates.map(([hreflang, href]) => ['alternate', hreflang, href]),
        ]),
      );
    });

    it('declares the sitemap and xhtml namespaces on the root element', () => {
      const root = new DOMParser().parseFromString(
        SiteSource.read('sitemap.xml'),
        'application/xml',
      ).documentElement;
      expect([
        root.tagName,
        root.getAttribute('xmlns'),
        root.getAttribute('xmlns:xhtml'),
      ]).toStrictEqual([
        'urlset',
        'http://www.sitemaps.org/schemas/sitemap/0.9',
        'http://www.w3.org/1999/xhtml',
      ]);
    });
  });

  describe('security.txt', () => {
    const lines = () => SiteSource.read('.well-known/security.txt').trimEnd().split('\n');
    const fields = () =>
      lines().map((line) => [
        line.slice(0, line.indexOf(': ')),
        line.slice(line.indexOf(': ') + 2),
      ]);
    const field = (name) => fields().find(([found]) => found === name)[1];

    it('has the contact, policy, expiry, languages and canonical location, one field per line, and ends with a newline', () => {
      expect(fields().map(([name]) => name)).toStrictEqual([
        'Contact',
        'Policy',
        'Expires',
        'Preferred-Languages',
        'Canonical',
      ]);
      expect(SiteSource.read('.well-known/security.txt').endsWith('\n')).toBe(true);
    });

    it('gives the address printed in the contact section as the contact, and its own address as canonical', () => {
      const printed = page.querySelector('a.btn[data-copy]').getAttribute('data-copy');
      expect([field('Contact'), field('Canonical')]).toStrictEqual([
        `mailto:${printed}`,
        `${ORIGIN}/.well-known/security.txt`,
      ]);
    });

    it('points at the security policy of the repository, where reports go', () => {
      expect(field('Policy')).toBe(
        'https://github.com/GustavoEklund/eklund.com.br/blob/main/SECURITY.md',
      );
    });

    it('expires in the future but less than a year ahead (RFC 9116), so it must be renewed before 2027-10-16', () => {
      const expires = Date.parse(field('Expires'));
      const remaining = (expires - Date.now()) / DAY_MS;
      expect([Number.isNaN(expires), remaining > 0, remaining <= 366]).toStrictEqual([
        false,
        true,
        true,
      ]);
    });

    it('lists preferred languages as valid, canonical BCP 47 tags', () => {
      const tags = field('Preferred-Languages').split(', ');
      expect(Intl.getCanonicalLocales(tags)).toStrictEqual(['pt-BR', 'en']);
    });
  });
});
