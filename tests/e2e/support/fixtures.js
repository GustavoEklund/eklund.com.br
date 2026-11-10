import { test as base, expect } from '@playwright/test';
import { LocalCollector } from './local-collector.js';
import { PageHealth } from './page-health.js';
import { SitePage } from './site-page.js';
import { PrivacyChoice } from '../../../source/js/privacy/privacy-choice.js';

/**
 * `health` watches the page from the first request, including any request that leaves the machine; `site` is the
 * page object. The site loads nothing from other hosts, so no test depends on the network.
 *
 * `collector` answers for the collector the pages send their reports to, and keeps what they sent: no test reaches the one
 * online, or needs `pnpm run edge:dev`.
 *
 * `privacyChoice` is what the browser has saved in the privacy notice before the first page loads: by default a current
 * choice, so the notice stays out of the suites that test something else. A test of the notice sets it to null with
 * `test.use({ privacyChoice: null })`, for a browser that never answered.
 */
/** The stand-in collector of each browser context. */
const COLLECTORS = new WeakMap();

export const test = base.extend({
  privacyChoice: [{ measurement: true, recording: false }, { option: true }],
  context: async ({ context, privacyChoice }, use) => {
    const collector = new LocalCollector();
    COLLECTORS.set(context, collector);
    await collector.attach(context);
    if (privacyChoice)
      await context.addInitScript(
        ([key, value]) => {
          try {
            if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
          } catch {
            /* a document without storage, such as about:blank */
          }
        },
        [
          PrivacyChoice.STORAGE_KEY,
          JSON.stringify({
            version: PrivacyChoice.VERSION,
            ...privacyChoice,
            expires: PrivacyChoice.expiry(Date.now()),
          }),
        ],
      );
    await use(context);
  },
  collector: async ({ context }, use) => {
    await use(COLLECTORS.get(context));
  },
  health: async ({ page }, use) => {
    await use(new PageHealth(page));
  },
  site: async ({ page, health: _health }, use) => {
    await use(new SitePage(page));
  },
});

export { expect };
