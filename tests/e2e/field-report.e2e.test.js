import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { test, expect } from './support/fixtures.js';
import { DictionaryText } from './support/dictionary-text.js';
import { PageHealth } from './support/page-health.js';
import { SiteVersion } from '../../source/js/field-report/site-version.js';

const SCHEMA = JSON.parse(
  readFileSync(new URL('../contract/schemas/page-report.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(SCHEMA);
const PT_BR = DictionaryText.of('pt-BR');
/** The measurement's own files: its module and web-vitals in source/, the chunk the build makes of them in dist/. */
const MEASUREMENT_CODE = /field-report|web-vitals/;
const VIEW = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A browser that sends Global Privacy Control, as Brave, DuckDuckGo or Firefox with the setting on. */
const sendGlobalPrivacyControl = (page) =>
  page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  );
/** Every request the page makes for the measurement's code, kept from the first one. */
const watchMeasurementCode = (page) => {
  const requested = [];
  page.on('request', (request) => {
    if (MEASUREMENT_CODE.test(new URL(request.url()).pathname)) requested.push(request.url());
  });
  return requested;
};
/** Waits until the measurement runs: App loads it once the page has loaded and gone idle. */
const measurementStarted = (page) =>
  page.waitForFunction(() => window.eklund.measurement() !== null, null, { timeout: 15_000 });
/** Waits past the moment the measurement would have started: after the load, an idle callback and its timeout. */
const pastTheStart = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const idle = () =>
          requestIdleCallback(() => setTimeout(resolve, 1_000), { timeout: 5_000 });
        if (document.readyState === 'complete') idle();
        else addEventListener('load', idle, { once: true });
      }),
  );
/** Hides the page as switching to another tab does: the visibility says hidden, and the event goes out. */
const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });

test.describe('the anonymous measurement', () => {
  test('loads after the page has loaded, and sends a report of the load when the page hides', async ({
    site,
    page,
    collector,
    health,
  }) => {
    const requested = watchMeasurementCode(page);
    await site.open('/');
    await measurementStarted(page);
    await site.themeToggle.click();
    await expect(site.html).toHaveAttribute('data-theme', 'light');
    await hide(page);
    await expect.poll(() => collector.reports.length).toBe(1);
    const [report] = collector.reports;
    const [request] = collector.requests;
    const loadedAfterTheLoad = await page.evaluate((pattern) => {
      const loadEnd = performance.getEntriesByType('navigation')[0].loadEventEnd;
      const files = performance
        .getEntriesByType('resource')
        .filter(({ name }) => new RegExp(pattern).test(new URL(name).pathname));
      return files.length > 0 && files.every(({ startTime }) => startTime >= loadEnd);
    }, MEASUREMENT_CODE.source);
    expect({
      valid: validate(report),
      errors: validate.errors,
      fields: [
        report.v,
        VIEW.test(report.view),
        report.seq,
        report.version,
        report.page,
        report.language,
        report.referrer,
        report.navigation,
        report.device.colorScheme,
      ],
      // INP comes only when the browser timed an interaction long enough, which one click does not promise.
      vitals: report.vitals
        .map(({ name }) => name)
        .filter((name) => name !== 'INP')
        .sort(),
      events: report.events
        .filter(({ name }) => name !== 'section')
        .map(({ name, detail }) => [name, detail]),
      request: [
        request.method,
        request.url,
        request.headers['content-type'],
        request.headers.cookie,
        request.headers.referer,
      ],
      loadedAfterTheLoad,
      codeRequested: requested.length > 0,
    }).toStrictEqual({
      valid: true,
      errors: null,
      fields: [1, true, 0, SiteVersion.NUMBER, '/', 'pt-BR', '', 'navigate', 'light'],
      vitals: ['CLS', 'FCP', 'LCP', 'TTFB'],
      events: [['theme', 'light']],
      request: [
        'POST',
        'http://127.0.0.1:8787/v1/page',
        'text/plain;charset=UTF-8',
        undefined,
        undefined,
      ],
      loadedAfterTheLoad: true,
      codeRequested: true,
    });
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('names the English page and its language', async ({ site, page, collector }) => {
    await site.open('/en/');
    await measurementStarted(page);
    await hide(page);
    await expect.poll(() => collector.reports.length).toBe(1);
    const [report] = collector.reports;
    expect([validate(report), report.page, report.language]).toStrictEqual([true, '/en/', 'en-US']);
  });

  test('records the palette, its commands and the sections reached, and sends them in the next report', async ({
    site,
    page,
    collector,
  }) => {
    await site.open('/');
    await measurementStarted(page);
    await hide(page);
    await expect.poll(() => collector.reports.length).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.contact.title);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => Math.round(scrollY) > 0)).toBe(true);
    await site.waitForScrollToStop();
    await hide(page);
    await expect.poll(() => collector.reports.length).toBe(2);
    const second = collector.reports[1];
    expect([
      validate(second),
      second.seq,
      second.view === collector.reports[0].view,
      second.events
        .map(({ name, detail }) => [name, detail])
        .filter(([name]) => name !== 'section'),
      second.events.some(({ name, detail }) => name === 'section' && detail === 'contato'),
    ]).toStrictEqual([
      true,
      1,
      true,
      [
        ['palette-open', 'shortcut'],
        ['palette-command', 'contact'],
      ],
      true,
    ]);
  });

  test('sends nothing more once the visitor refuses it in the preferences', async ({
    site,
    page,
    collector,
  }) => {
    await site.open('/');
    await measurementStarted(page);
    await site.privacyPreferencesLink.click();
    await site.privacyDialog.locator('[data-privacy-action="refuse"]').click();
    await expect.poll(() => page.evaluate(() => window.eklund.measurement())).toBe(null);
    await site.themeToggle.click();
    await hide(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(500);
    expect(collector.requests).toStrictEqual([]);
  });

  test.describe('for a visitor who refused it', () => {
    test.use({ privacyChoice: null });

    test('"Refuse all" in the notice: nothing is sent, and the next visit does not even download it', async ({
      site,
      page,
      collector,
    }) => {
      await site.open('/');
      await site.privacyNotice.locator('[data-privacy-action="refuse"]').click();
      await pastTheStart(page);
      await hide(page);
      await page.waitForTimeout(500);
      const requested = watchMeasurementCode(page);
      await site.open('/');
      await pastTheStart(page);
      await hide(page);
      await page.waitForTimeout(500);
      expect([
        collector.requests,
        requested,
        await page.evaluate(() => window.eklund.measurement()),
      ]).toStrictEqual([[], [], null]);
    });
  });

  test.describe('under Global Privacy Control', () => {
    test('never downloads it and sends nothing', async ({ site, page, collector }) => {
      await sendGlobalPrivacyControl(page);
      const requested = watchMeasurementCode(page);
      await site.open('/');
      await pastTheStart(page);
      await hide(page);
      await page.waitForTimeout(500);
      expect([collector.requests, requested]).toStrictEqual([[], []]);
    });
  });
});
