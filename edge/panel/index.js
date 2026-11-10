import { ReadingQueries } from '../src/reading-queries.js';
import { AccessCheck } from './access-check.js';
import { AccessKeys } from './access-keys.js';
import { PanelRouter } from './panel-router.js';
import { ReadOnlyBindings } from './read-only-bindings.js';
import PANEL_CSS from './browser/panel.css';
import REPLAY_PLAYER from './browser/replay-player.js';
import REPLAY_START from './browser/replay-start.js';
import RRWEB_REPLAY from './vendor/rrweb-replay.js';
import RRWEB_REPLAY_CSS from './vendor/rrweb-replay.css';

const CSS = 'text/css; charset=utf-8';
const SCRIPT = 'text/javascript; charset=utf-8';
/** The files the panel serves, imported as text by the rules of edge/panel.wrangler.jsonc. */
const ASSETS = {
  'panel.css': { type: CSS, body: PANEL_CSS },
  'replay-player.js': { type: SCRIPT, body: REPLAY_PLAYER },
  'replay-start.js': { type: SCRIPT, body: REPLAY_START },
  'rrweb-replay.js': { type: SCRIPT, body: RRWEB_REPLAY },
  'rrweb-replay.css': { type: CSS, body: RRWEB_REPLAY_CSS },
};

/**
 * The owner's panel (docs/decisions/0015-the-panel-behind-cloudflare-access.md): a second Worker on its own workers.dev
 * address, behind Cloudflare Access, that reads the collector's D1 and R2 and never writes to them. It checks the Access
 * token of every request itself. ACCESS_CERTIFICATES only points the tests at keys of their own.
 */
export default {
  fetch(request, env) {
    const fetch = globalThis.fetch.bind(globalThis);
    const db = ReadOnlyBindings.database(env.DB);
    return new PanelRouter({
      access: new AccessCheck({
        teamDomain: env.ACCESS_TEAM_DOMAIN,
        audience: env.ACCESS_AUD,
        allowedEmails: (env.ALLOWED_EMAILS ?? '')
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean),
        keys: new AccessKeys({
          url: env.ACCESS_CERTIFICATES ?? AccessCheck.certificates(env.ACCESS_TEAM_DOMAIN),
          fetch,
        }),
      }),
      queries: new ReadingQueries({ db }),
      bucket: ReadOnlyBindings.bucket(env.REPORTS),
      assets: ASSETS,
    }).handle(request);
  },
};
