import { EventsPage } from './events-page.js';
import { HeatMapPage } from './heat-map-page.js';
import { LabPage } from './lab-page.js';
import { OverviewPage } from './overview-page.js';
import { PanelHtml } from './panel-html.js';
import { PanelLayout } from './panel-layout.js';
import { PanelQuery } from './panel-query.js';
import { RecordingsPage } from './recordings-page.js';
import { ReplayPage } from './replay-page.js';
import { VitalsPage } from './vitals-page.js';

/** The pages that take only the query string, by their path. */
const PAGES = {
  '/': OverviewPage,
  '/vitals': VitalsPage,
  '/events': EventsPage,
  '/lab': LabPage,
  '/recordings': RecordingsPage,
  '/heat-map': HeatMapPage,
};
const REPLAY = /^\/recordings\/([^/]+)$/;
const CHUNK = /^\/recordings\/([^/]+)\/([^/]+)$/;
const ASSET = /^\/assets\/([a-z0-9.-]+)$/;

/**
 * The panel's answers. Every request, an asset or robots.txt included, first passes the panel's own check of the Access
 * token, so nothing is served to anyone but the owner even when Access is off. Only GET and HEAD read; nothing writes.
 */
export class PanelRouter {
  #access;
  #queries;
  #bucket;
  #assets;
  #clock;

  /**
   * `access` verifies a request (AccessCheck); `queries` are ReadingQueries over the read-only database; `bucket` gets a
   * chunk; `assets` are the panel's own files and the vendored replayer, `{ type, body }` by name.
   */
  constructor({ access, queries, bucket, assets, clock = Date }) {
    this.#access = access;
    this.#queries = queries;
    this.#bucket = bucket;
    this.#assets = assets;
    this.#clock = clock;
  }

  async handle(request) {
    const allowed = await this.#access.verify(request);
    if (!allowed.ok) return PanelLayout.text(403, 'This panel is only for its owner.\n');
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return PanelLayout.text(405, 'Method not allowed\n', { allow: 'GET, HEAD' });
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === '/robots.txt') return PanelLayout.text(200, 'User-agent: *\nDisallow: /\n');
    const asset = ASSET.exec(pathname);
    if (asset) return this.#asset(asset[1]);
    const chunk = CHUNK.exec(pathname);
    const replay = new ReplayPage({ queries: this.#queries, bucket: this.#bucket });
    if (chunk) return replay.chunk(chunk[1], chunk[2]);
    const code = REPLAY.exec(pathname);
    if (code) return PanelRouter.#page(await replay.render(code[1]), pathname, allowed.email);
    if (!Object.hasOwn(PAGES, pathname))
      return PanelRouter.#page(
        { status: 404, title: 'Not found', body: PanelHtml.html`<p>Nothing is here.</p>` },
        pathname,
        allowed.email,
      );
    const Page = PAGES[pathname];
    const page = new Page({ queries: this.#queries, query: new PanelQuery(url, this.#clock) });
    return PanelRouter.#page(await page.render(), pathname, allowed.email);
  }

  #asset(name) {
    if (!Object.hasOwn(this.#assets, name)) return PanelLayout.text(404, 'Not found\n');
    const { type, body } = this.#assets[name];
    return new Response(body, { headers: PanelLayout.headers(type) });
  }

  static #page(page, path, email) {
    return PanelLayout.page({ ...page, path, email });
  }
}
