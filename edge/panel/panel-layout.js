import { PanelHtml } from './panel-html.js';

const HTML = PanelHtml.html;
/** The pages of the panel, in the order of its menu. */
const PAGES = [
  ['/', 'Overview'],
  ['/vitals', 'Web Vitals'],
  ['/events', 'Events and errors'],
  ['/lab', 'Lab'],
  ['/recordings', 'Recordings'],
  ['/heat-map', 'Heat map'],
];
/** What a page of the panel may load: its own stylesheet and scripts, and nothing from another origin. */
const POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
/**
 * The replay rebuilds a page of the site in a sandboxed frame, without its scripts: its styles are inline, as rrweb kept
 * them, and its images come from the site. Only this page allows either.
 */
const REPLAY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://eklund.com.br https://gustavo.eklund.com.br",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The frame of every answer of the panel: the page around a section's markup, and the headers that keep it out of search
 * engines, caches and other origins' frames.
 */
export class PanelLayout {
  static PAGES = PAGES;
  static POLICY = POLICY;
  static REPLAY_POLICY = REPLAY_POLICY;

  /** The headers of every answer. */
  static headers(contentType, extra = {}) {
    return {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      ...extra,
    };
  }

  /** A whole page. `path` marks the current entry of the menu; `scripts` are module scripts of the panel. */
  static page({
    status = 200,
    title,
    path,
    body,
    email = null,
    scripts = [],
    styles = [],
    policy = POLICY,
  }) {
    const markup = HTML`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${title} · eklund.com.br panel</title>
<link rel="stylesheet" href="/assets/panel.css">
${styles.map((href) => HTML`<link rel="stylesheet" href="${href}">`)}
${scripts.map((src) => HTML`<script type="module" src="${src}"></script>`)}
</head>
<body>
<header class="top">
<a class="brand" href="/">eklund.com.br <span>panel</span></a>
<nav aria-label="Pages">
<ul>
${PAGES.map(
  ([href, name]) =>
    HTML`<li><a href="${href}"${PanelHtml.raw(PanelLayout.#current(path, href) ? ' aria-current="page"' : '')}>${name}</a></li>`,
)}
</ul>
</nav>
${email ? HTML`<p class="who">${email} · <a href="/cdn-cgi/access/logout">Sign out</a></p>` : ''}
</header>
<main>
<h1>${title}</h1>
${body}
</main>
</body>
</html>
`;
    return new Response(markup.toString(), {
      status,
      headers: PanelLayout.headers('text/html; charset=utf-8', {
        'content-security-policy': policy,
      }),
    });
  }

  /** A short answer in plain text, such as the refusal of a request without a valid token. */
  static text(status, body, extra = {}) {
    return new Response(body, {
      status,
      headers: PanelLayout.headers('text/plain; charset=utf-8', extra),
    });
  }

  /**
   * A form that reloads the page with its values in the query string. `fields` are `{ name, label, value }`, a day when
   * `options` is absent, a choice among `options` (with an empty one, `any`, unless `required`) otherwise.
   */
  static form(path, fields) {
    return HTML`<form class="filters" method="get" action="${path}">
      ${fields.map(
        ({ name, label, value, options, required = false }) => HTML`<label>${label}
          ${
            options
              ? HTML`<select name="${name}">
              ${required ? '' : HTML`<option value=""${PanelHtml.raw(value ? '' : ' selected')}>any</option>`}
              ${options.map((option) => HTML`<option${PanelHtml.raw(option === value ? ' selected' : '')}>${option}</option>`)}
            </select>`
              : HTML`<input type="date" name="${name}" value="${value}" required>`
          }
        </label>`,
      )}
      <button type="submit">Show</button>
    </form>`;
  }

  /** What a section says when its sample is below the minimum: how large it is, and that nothing should be concluded. */
  static sample({ size, minimum, enough }, what = 'values') {
    return enough
      ? HTML`<p class="sample">Sample: ${size} ${what}.</p>`
      : HTML`<p class="sample is-small">Sample too small: ${size} ${what}, and a conclusion needs at least ${minimum}.</p>`;
  }

  /** What a page answers when its query string is not one its readings accept, and why. */
  static invalid(reason) {
    return {
      status: 400,
      title: 'Not a request the panel reads',
      body: HTML`<p>${reason}.</p><p><a href="?">Start again</a> with the last ${28} days.</p>`,
    };
  }

  static #current(path, href) {
    return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  }
}
