import { readFileSync } from 'node:fs';
import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { SiteRoot } from './support/site-root.js';

const ORIGIN = 'http://127.0.0.1:8735';
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const FOLDER = `/${version}/`;

/**
 * The copy of this version that the build makes for its own folder, dist/1.1.0/, which a release leaves online at
 * eklund.com.br/1.1.0/. These specs run against dist/ (SITE_ROOT=dist) and are skipped on source/, which has no such folder.
 */
test.describe('the copy of the version in its own folder', () => {
  test.skip(!SiteRoot.isBuilt, 'the folder of a version is made by the build');

  test('loads every file from inside its folder, and nothing goes wrong', async ({
    site,
    page,
    health,
  }) => {
    const requested = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await site.open(FOLDER);
    expect({
      language: await site.html.getAttribute('lang'),
      outside: requested.filter((path) => !path.startsWith(FOLDER)),
      problems: health.problems,
    }).toStrictEqual({ language: 'pt-BR', outside: [], problems: PageHealth.NONE });
  });

  test('links to the pages of its own folder, and the switch in place stays in it', async ({
    site,
    page,
    health,
  }) => {
    await site.open(FOLDER);
    expect([
      await site.localeLink('pt-BR').getAttribute('href'),
      await site.localeLink('en-US').getAttribute('href'),
    ]).toStrictEqual([FOLDER, `${FOLDER}en/`]);

    await site.localeLink('en-US').click();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await expect(page).toHaveURL(`${ORIGIN}${FOLDER}en/`);

    await page.reload();
    await expect(site.html).toHaveAttribute('lang', 'en-US');
    await site.localeLink('pt-BR').click();
    await expect(site.html).toHaveAttribute('lang', 'pt-BR');
    await expect(page).toHaveURL(`${ORIGIN}${FOLDER}`);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('draws the logos that load late from its folder, after the language changed the address', async ({
    site,
    page,
    health,
  }) => {
    await site.open(FOLDER);
    await site.localeLink('en-US').click();
    await expect(page).toHaveURL(`${ORIGIN}${FOLDER}en/`);
    const logos = page.locator('#historico img');
    for (const logo of await logos.all()) await logo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => logos.evaluateAll((images) => images.every((image) => image.naturalWidth > 0)))
      .toBe(true);
    expect({
      outside: (await logos.evaluateAll((images) => images.map((image) => image.src)))
        .map((address) => new URL(address).pathname)
        .filter((path) => !path.startsWith(`${FOLDER}assets/`)),
      problems: health.problems,
    }).toStrictEqual({ outside: [], problems: PageHealth.NONE });
  });

  test('runs the load test engine from the worker file of its folder', async ({ site, page }) => {
    const workers = [];
    page.on('worker', (worker) => workers.push(new URL(worker.url()).pathname));
    await site.open(FOLDER);
    await site.loadTestRun.click();
    await expect.poll(() => workers.length > 0, { timeout: 60_000 }).toBe(true);
    const ownWorker = new RegExp(
      `^${FOLDER.replaceAll('.', '\\.')}assets/pix-engine\\.worker-[\\w-]{8}\\.js$`,
    );
    expect(workers.filter((address) => !ownWorker.test(address))).toStrictEqual([]);
  });
});
