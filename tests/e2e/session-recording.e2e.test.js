import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { test, expect } from './support/fixtures.js';
import { DictionaryText } from './support/dictionary-text.js';
import { PageHealth } from './support/page-health.js';
import { SiteVersion } from '../../source/js/field-report/site-version.js';

const schema = (name) =>
  JSON.parse(
    readFileSync(new URL(`../contract/schemas/${name}.schema.json`, import.meta.url), 'utf8'),
  );
const ajv = new Ajv({ allErrors: true, strict: true });
const validChunk = ajv.compile(schema('session-chunk'));
const validDeletion = ajv.compile(schema('session-deletion'));
const PT_BR = DictionaryText.of('pt-BR');
/** The recording's own files: its module and rrweb in source/, the chunk the build makes of them in dist/. */
const RECORDING_CODE = /session-recording|vendor\/record\.js/;
const CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** What the tests type: none of it may reach the collector, nor how long it is. */
const TYPED = 'segredo-digitado-42';
const CONSENTED = { measurement: true, recording: true };

/** Every request the page makes for the recording's code, kept from the first one. */
const watchRecordingCode = (page) => {
  const requested = [];
  page.on('request', (request) => {
    if (RECORDING_CODE.test(new URL(request.url()).pathname)) requested.push(request.url());
  });
  return requested;
};
/** Waits until the recording runs: App loads it once the page has loaded and gone idle. */
const recordingStarted = (page) =>
  page.waitForFunction(() => window.eklund.recording()?.recording === true, null, {
    timeout: 15_000,
  });
/** Waits past the moment the recording would have started: after the load, an idle callback and its timeout. */
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
/** Hides the page as switching to another tab does. */
const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
const heldCodes = (page) =>
  page.evaluate(() =>
    (JSON.parse(localStorage.getItem('recordings')) ?? []).map(({ code }) => code),
  );

test.describe('the session recording, with consent', () => {
  test.use({ privacyChoice: CONSENTED });

  test('loads after the page, and sends the page, its changes and where the clicks landed, with the typing masked', async ({
    site,
    page,
    collector,
    health,
  }) => {
    const requested = watchRecordingCode(page);
    await site.open('/');
    await recordingStarted(page);
    await expect.poll(() => collector.chunks.length).toBe(1);
    await page.evaluate(() => {
      const field = Object.assign(document.createElement('input'), { id: 'probe', type: 'text' });
      document.querySelector('#contato').append(field);
    });
    await page.locator('#probe').fill(TYPED);
    await site.openPalette();
    await site.paletteInput.fill(TYPED);
    await page.keyboard.press('Escape');
    await site.section('status').scrollIntoViewIfNeeded();
    await site.section('status').click({ position: { x: 5, y: 150 } });
    await hide(page);
    await expect.poll(() => collector.chunks.length >= 2).toBe(true);
    const chunks = collector.chunks.map(({ chunk }) => chunk);
    const sent = collector.requests
      .filter(({ url }) => url.endsWith('/v1/session'))
      .map(({ headers }) => [headers.cookie, headers.referer]);
    const everything = JSON.stringify(chunks);
    const events = chunks.flatMap((chunk) => chunk.events);
    const probeInputs = events.filter(
      ({ type, data }) => type === 3 && data.source === 5 && typeof data.text === 'string',
    );
    const [code] = await heldCodes(page);
    expect({
      valid: chunks.map((chunk) => validChunk(chunk)),
      code: [CODE.test(chunks[0].code), chunks.every((chunk) => chunk.code === code)],
      order: chunks.map((chunk) => chunk.seq),
      fields: [chunks[0].v, chunks[0].version, chunks[0].page, chunks[0].language],
      firstGzip: collector.chunks[0].gzip,
      kinds: [...new Set(events.map(({ type }) => type))].sort(),
      address: events.find(({ type }) => type === 4).data.href,
      typed: [
        everything.includes(TYPED),
        everything.includes('segredo'),
        probeInputs.map(({ data }) => data.text),
      ],
      clicks: chunks
        .flatMap((chunk) => chunk.clicks)
        .map(({ region, x, y }) => [region, x < 0.2, y < 0.2]),
      privacy: [...new Set(sent.flat())],
      requested: requested.length > 0,
    }).toStrictEqual({
      valid: chunks.map(() => true),
      code: [true, true],
      order: chunks.map((_, index) => index),
      fields: [1, SiteVersion.NUMBER, '/', 'pt-BR'],
      firstGzip: true,
      kinds: [2, 3, 4],
      address: `${new URL(page.url()).origin}/`,
      typed: [false, false, probeInputs.map(() => '')],
      clicks: [['status', true, true]],
      privacy: [undefined],
      requested: true,
    });
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('keeps one new code per page load, which nothing but the recording carries', async ({
    site,
    page,
    collector,
  }) => {
    await site.open('/en/');
    await recordingStarted(page);
    await expect.poll(() => collector.chunks.length).toBe(1);
    await site.open('/en/');
    await recordingStarted(page);
    await expect.poll(() => collector.chunks.length).toBe(2);
    const codes = await heldCodes(page);
    expect([
      codes.length,
      codes[0] === codes[1],
      collector.chunks.map(({ chunk }) => [chunk.code, chunk.page, chunk.language]),
      collector.reports.some((report) => JSON.stringify(report).includes(codes[0])),
    ]).toStrictEqual([
      2,
      false,
      [
        [codes[0], '/en/', 'en-US'],
        [codes[1], '/en/', 'en-US'],
      ],
      false,
    ]);
  });

  test('withdrawing consent stops it at once, deletes the recordings of every code held, and forgets them', async ({
    site,
    page,
    collector,
  }) => {
    await site.open('/');
    await recordingStarted(page);
    await expect.poll(() => collector.chunks.length).toBe(1);
    const held = await heldCodes(page);
    await site.privacyPreferencesLink.click();
    await page.locator('#privacy-recording').uncheck();
    await site.privacyDialog.locator('[data-privacy-action="save"]').click();
    await expect.poll(() => collector.deletions.length).toBe(1);
    await expect.poll(() => heldCodes(page)).toStrictEqual([]);
    const chunksBefore = collector.chunks.length;
    await site.themeToggle.click();
    await hide(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(500);
    expect([
      collector.deletions,
      collector.deletions.map((body) => validDeletion(body)),
      collector.chunks.length,
      await page.evaluate(() => window.eklund.recording()),
    ]).toStrictEqual([[{ v: 1, codes: held }], [true], chunksBefore, null]);
  });

  test('"Delete my recordings" is enabled while codes are held, deletes them, and says so', async ({
    site,
    page,
    collector,
  }) => {
    await site.open('/');
    await recordingStarted(page);
    await expect.poll(() => collector.chunks.length).toBe(1);
    const held = await heldCodes(page);
    await site.privacyPreferencesLink.click();
    const remove = page.locator('#privacy-delete');
    const before = [
      await remove.isDisabled(),
      await page.locator('#privacy-no-recordings').textContent(),
    ];
    await remove.click();
    await expect(page.locator('#announcer')).toHaveText(PT_BR.privacy.dialog.deleted);
    expect([
      before,
      collector.deletions,
      await heldCodes(page),
      await remove.isDisabled(),
      await page.locator('#privacy-no-recordings').textContent(),
      await page.evaluate(() => window.eklund.recording()),
      await page.locator('#privacy-recording').isChecked(),
    ]).toStrictEqual([
      [false, PT_BR.privacy.dialog.heldRecordings],
      [{ v: 1, codes: held }],
      [],
      true,
      PT_BR.privacy.dialog.noRecordings,
      null,
      true,
    ]);
  });
});

test.describe('the session recording, without consent', () => {
  test('is not even downloaded while the visitor has not consented, and sends nothing', async ({
    site,
    page,
    collector,
  }) => {
    const requested = watchRecordingCode(page);
    await site.open('/');
    await pastTheStart(page);
    await site.section('status').click({ position: { x: 5, y: 150 } });
    await hide(page);
    await page.waitForTimeout(500);
    expect([requested, collector.chunks, collector.deletions, await heldCodes(page)]).toStrictEqual(
      [[], [], [], []],
    );
  });

  test.describe('after "Refuse all" in the notice', () => {
    test.use({ privacyChoice: null });

    test('is not downloaded, and nothing is sent or asked to be deleted', async ({
      site,
      page,
      collector,
    }) => {
      const requested = watchRecordingCode(page);
      await site.open('/');
      await site.privacyNotice.locator('[data-privacy-action="refuse"]').click();
      await pastTheStart(page);
      await hide(page);
      await page.waitForTimeout(500);
      expect([requested, collector.requests]).toStrictEqual([[], []]);
    });
  });

  test.describe('under Global Privacy Control, even with an old consent saved', () => {
    test.use({ privacyChoice: CONSENTED });

    test('is not downloaded and sends nothing', async ({ site, page, collector }) => {
      await page.addInitScript(() =>
        Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
      );
      const requested = watchRecordingCode(page);
      await site.open('/');
      await pastTheStart(page);
      await hide(page);
      await page.waitForTimeout(500);
      expect([requested, collector.requests]).toStrictEqual([[], []]);
    });
  });
});
