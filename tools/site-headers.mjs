// The response headers the site depends on: a strict Content-Security-Policy, a few other security headers and the
// document language. Production sets them in source/.htaccess; tools/serve.mjs (development, Playwright, Cucumber)
// sets the same ones from this class, and tests/contract/security-headers.contract.test.js fails when the two differ.
import { createHash } from 'node:crypto';

/**
 * The policy, as ordered directives. Everything comes from this origin. The two relaxations are deliberate:
 * - script-src allows the one inline script in index.html that sets the theme before first paint, by hash, so
 *   there is no 'unsafe-inline' for scripts. The hash is computed from the page, so editing that script changes it.
 * - style-src-attr allows style="" attributes. Layout widgets carry data-driven values in them (--i, --brand, left
 *   and width of the trace minimap) and the scripts build some of them through innerHTML. Attributes cannot load
 *   anything or run script, and every style element and stylesheet still has to come from this origin.
 * data: images are the noise texture in tokens.css; worker-src is the load test's module workers.
 */
const DIRECTIVES = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'"]],
  ['style-src-attr', ["'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:']],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['worker-src', ["'self'"]],
  ['manifest-src', ["'self'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['upgrade-insecure-requests', []],
];

export class SiteHeaders {
  /** Sent with every response, in this order. */
  static ALWAYS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };

  /** Only meaningful over HTTPS, so the plain-HTTP development server leaves it out. */
  static PRODUCTION_ONLY = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' };

  /** The language of the markup as served. Each language has its own page: / is Portuguese and /en/ is English. */
  static DOCUMENT_LANGUAGE = 'pt-BR';
  static ENGLISH_LANGUAGE = 'en-US';

  /** The Content-Language of the document at `pathname`. */
  static documentLanguage(pathname = '/') {
    return pathname === '/en' || pathname.startsWith('/en/')
      ? SiteHeaders.ENGLISH_LANGUAGE
      : SiteHeaders.DOCUMENT_LANGUAGE;
  }

  /** The `'sha256-…'` source of every inline classic script in the page (JSON-LD and other data blocks are not scripts). */
  static inlineScriptSources(html) {
    const scripts = [
      ...html.matchAll(/<script(?![^>]*\s(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g),
    ];
    return scripts.map(
      ([, code]) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`,
    );
  }

  /** The Content-Security-Policy value for a page. */
  static contentSecurityPolicy(html = '') {
    const inline = SiteHeaders.inlineScriptSources(html);
    return DIRECTIVES.map(([name, sources]) =>
      [name, name === 'script-src' ? [...sources, ...inline] : sources].flat().join(' '),
    ).join('; ');
  }

  /** What production sends with every response, for the document in `html`. */
  static production(html) {
    return {
      ...SiteHeaders.ALWAYS,
      ...SiteHeaders.PRODUCTION_ONLY,
      'Content-Security-Policy': SiteHeaders.contentSecurityPolicy(html),
    };
  }

  /** What the development server sends: the production headers without the HTTPS-only ones, plus the language of the document at `pathname`. */
  static development({ html, isDocument, pathname }) {
    return {
      ...SiteHeaders.ALWAYS,
      'Content-Security-Policy': SiteHeaders.contentSecurityPolicy(html),
      ...(isDocument ? { 'Content-Language': SiteHeaders.documentLanguage(pathname) } : {}),
    };
  }
}
