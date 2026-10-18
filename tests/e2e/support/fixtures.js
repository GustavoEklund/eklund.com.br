import { test as base, expect } from '@playwright/test';
import { PageHealth } from './page-health.js';
import { SitePage } from './site-page.js';

/**
 * `health` watches the page from the first request, including any request that leaves the machine; `site` is the
 * page object. The site loads nothing from other hosts, so no test depends on the network.
 */
export const test = base.extend({
  health: async ({ page }, use) => {
    await use(new PageHealth(page));
  },
  site: async ({ page, health: _health }, use) => {
    await use(new SitePage(page));
  },
});

export { expect };
