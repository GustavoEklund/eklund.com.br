import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { CspEvaluator } from 'csp_evaluator/dist/evaluator.js';
import { CspParser } from 'csp_evaluator/dist/parser.js';
import { Severity, Type } from 'csp_evaluator/dist/finding.js';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { SiteSource } from '../support/site-source.js';
import { HtaccessHeaders } from './support/htaccess-headers.js';

const HTACCESS = SiteSource.read('.htaccess');
const INDEX = SiteSource.read('index.html');
const ENGLISH = SiteSource.read('en/index.html');
const ENGLISH_HTACCESS = SiteSource.read('en/.htaccess');
/** The text of every inline classic script of the page, found without any help from SiteHeaders. */
const inlineScripts = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => code);
const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

describe('security headers', () => {
  describe('production (.htaccess) and the development server', () => {
    it('send the same headers: whatever .htaccess sets for every response is what SiteHeaders says production sends', () => {
      expect(HtaccessHeaders.global(HTACCESS)).toStrictEqual(SiteHeaders.production(INDEX));
    });

    it('mark documents with the language of the markup, in .htaccess as in the development headers', () => {
      expect([
        HtaccessHeaders.forFilesMatching(HTACCESS, '\\.html?$')['Content-Language'],
        SiteHeaders.development({ html: INDEX, isDocument: true })['Content-Language'],
      ]).toStrictEqual(['pt-BR', 'pt-BR']);
    });

    it('mark the English page with its own language: the .htaccess of its folder and the development headers say en-US', () => {
      expect([
        HtaccessHeaders.forFilesMatching(ENGLISH_HTACCESS, '\\.html?$')['Content-Language'],
        SiteHeaders.development({ html: ENGLISH, isDocument: true, pathname: '/en/' })[
          'Content-Language'
        ],
        SiteHeaders.development({ html: ENGLISH, isDocument: true, pathname: '/en' })[
          'Content-Language'
        ],
        SiteHeaders.development({ html: ENGLISH, isDocument: true, pathname: '/en/index.html' })[
          'Content-Language'
        ],
        SiteHeaders.development({ html: ENGLISH, isDocument: true, pathname: '/1.1.0/en/' })[
          'Content-Language'
        ],
      ]).toStrictEqual(['en-US', 'en-US', 'en-US', 'en-US', 'en-US']);
    });

    it('do not take a path that only starts with the letters en for the English page', () => {
      expect(
        ['/', '/index.html', '/enigma/', '/english', '/1.1.0/', '/1.1.0/english/'].map(
          (pathname) =>
            SiteHeaders.development({ html: INDEX, isDocument: true, pathname })[
              'Content-Language'
            ],
        ),
      ).toStrictEqual(['pt-BR', 'pt-BR', 'pt-BR', 'pt-BR', 'pt-BR', 'pt-BR']);
    });

    it('allow both pages with one hash: the English page carries the very same inline script', () => {
      expect([
        SiteHeaders.inlineScriptSources(ENGLISH),
        SiteHeaders.production(ENGLISH),
      ]).toStrictEqual([SiteHeaders.inlineScriptSources(INDEX), SiteHeaders.production(INDEX)]);
    });

    it('keep the HTTPS-only header out of the development server and everything else in it', () => {
      expect(
        Object.keys(SiteHeaders.development({ html: INDEX, isDocument: false })),
      ).toStrictEqual([
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Cross-Origin-Opener-Policy',
        'Content-Security-Policy',
      ]);
    });

    it('add Content-Language only for documents', () => {
      expect([
        SiteHeaders.development({ html: INDEX, isDocument: true })['Content-Language'],
        SiteHeaders.development({ html: INDEX, isDocument: false })['Content-Language'],
      ]).toStrictEqual(['pt-BR', undefined]);
    });
  });

  describe('the headers', () => {
    it('are exactly these, in this order', () => {
      expect(SiteHeaders.production(INDEX)).toStrictEqual({
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy':
          'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': `default-src 'self'; script-src 'self' ${sha256(inlineScripts[0])}; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`,
      });
    });
  });

  describe('the Content-Security-Policy', () => {
    const policy = SiteHeaders.contentSecurityPolicy(INDEX);

    it('allows the one inline classic script of the page by its hash, computed here independently of the tool', () => {
      expect([inlineScripts.length, SiteHeaders.inlineScriptSources(INDEX)]).toStrictEqual([
        1,
        [sha256(inlineScripts[0])],
      ]);
    });

    it('hashes nothing for a page without inline scripts, and skips JSON-LD, module and external scripts', () => {
      const page =
        '<script type="module" src="js/main.js"></script><script src="a.js"></script><script type="application/ld+json">{}</script>';
      expect(SiteHeaders.inlineScriptSources(page)).toStrictEqual([]);
      expect(SiteHeaders.contentSecurityPolicy(page)).toBe(SiteHeaders.contentSecurityPolicy());
    });

    it('hashes every inline script and not their neighbors', () => {
      const page = '<script>a()</script><script src="x.js"></script><script> b() </script>';
      expect(SiteHeaders.inlineScriptSources(page)).toStrictEqual([sha256('a()'), sha256(' b() ')]);
    });

    it('has no finding more serious than "script-src self could host a JSONP or Angular bypass", the one every self-only policy gets', () => {
      const findings = new CspEvaluator(new CspParser(policy).csp).evaluate();
      expect(
        findings.map(({ type, severity, directive, value }) => [type, severity, directive, value]),
      ).toStrictEqual([
        [Type.SCRIPT_ALLOWLIST_BYPASS, Severity.MEDIUM_MAYBE, 'script-src', "'self'"],
      ]);
    });

    it('declares nothing unsafe for scripts: no unsafe-inline, unsafe-eval, wildcard, data: or http: source', () => {
      const scriptSources = new CspParser(policy).csp.directives['script-src'];
      expect(scriptSources).toStrictEqual(["'self'", sha256(inlineScripts[0])]);
    });

    it('lets only style attributes be inline: style elements and stylesheets still have to come from this origin', () => {
      const { directives } = new CspParser(policy).csp;
      expect([directives['style-src'], directives['style-src-attr']]).toStrictEqual([
        ["'self'"],
        ["'unsafe-inline'"],
      ]);
    });

    it('is not weakened by the page: no inline event handler, no javascript: link, no style element, no eval', () => {
      const scripts = SiteSource.files('js')
        .filter((file) => file.endsWith('.js') && !file.endsWith('land-bitset.js'))
        .map((file) => [file, SiteSource.read(file)]);
      expect({
        handlers: [...INDEX.matchAll(/\s(on[a-z]+)="/g)].map(([, name]) => name),
        javascriptLinks: [...INDEX.matchAll(/(?:href|src)="javascript:/g)].length,
        styleElements: [...INDEX.matchAll(/<style\b/g)].length,
        evalUses: scripts
          .filter(([, code]) =>
            /\beval\(|new Function\(|setTimeout\(\s*['"`]|setInterval\(\s*['"`]/.test(code),
          )
          .map(([file]) => file),
      }).toStrictEqual({ handlers: [], javascriptLinks: 0, styleElements: 0, evalUses: [] });
    });

    it('covers every kind of resource the page loads: scripts, workers, styles, images, fonts, connections and the manifest', () => {
      const { directives } = new CspParser(policy).csp;
      expect(
        Object.fromEntries(
          [
            'default-src',
            'worker-src',
            'img-src',
            'font-src',
            'connect-src',
            'manifest-src',
            'object-src',
            'base-uri',
            'form-action',
            'frame-ancestors',
          ].map((name) => [name, directives[name]]),
        ),
      ).toStrictEqual({
        'default-src': ["'self'"],
        'worker-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'manifest-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      });
    });
  });
});
