// The response headers the site depends on: a strict Content-Security-Policy, a few other security headers, the
// document language and how long each file is cached. Production sets them in source/.htaccess; tools/serve.mjs
// (development, Playwright, Cucumber) and tools/production-server.mjs (Lighthouse) set the same ones from this class, and
// tests/contract/security-headers.contract.test.js fails when they differ.
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

  /**
   * How long production lets a file be kept, as the root .htaccess writes it: pages for ten minutes, files with a hash in
   * their name for a year, the few that keep their name for a day. Apache applies every <FilesMatch> that matches, in order,
   * so the last one wins (favicon.ico is kept a day).
   */
  static CACHE_RULES = [
    [/\.html?$/, 'public, max-age=600, stale-while-revalidate=86400'],
    [
      /\.(css|js|svg|webmanifest|woff2|png|jpg|webp|avif|ico)$/,
      'public, max-age=31536000, immutable',
    ],
    [
      /^(robots\.txt|sitemap\.xml|favicon\.ico|security\.txt)$/,
      'public, max-age=86400, stale-while-revalidate=604800',
    ],
  ];

  /** The .htaccess of assets/brand/ adds a rule after those: the manifest icons and the social card keep their names. */
  static BRAND_CACHE_RULES = [
    [/\.(png|svg|ico)$/, 'public, max-age=86400, stale-while-revalidate=604800'],
  ];

  /** The Cache-Control production sends for the file at `pathname`, or undefined when no rule names it. */
  static cacheControl(pathname) {
    const rules = /(?:^|\/)assets\/brand\/[^/]+$/.test(pathname)
      ? [...SiteHeaders.CACHE_RULES, ...SiteHeaders.BRAND_CACHE_RULES]
      : SiteHeaders.CACHE_RULES;
    const name = pathname.split('/').at(-1);
    return rules.findLast(([pattern]) => pattern.test(name))?.[1];
  }

  /**
   * The language of the markup as served. Each language has its own page: / is Portuguese and /en/ is English, and so are
   * /1.1.0/ and /1.1.0/en/ in the copy of a version, where the .htaccess of en/ comes along with the folder.
   */
  static DOCUMENT_LANGUAGE = 'pt-BR';
  static ENGLISH_LANGUAGE = 'en-US';

  /** The Content-Language of the document at `pathname`: English inside an en/ folder. */
  static documentLanguage(pathname = '/') {
    return /\/en(?:\/|$)/.test(pathname)
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
