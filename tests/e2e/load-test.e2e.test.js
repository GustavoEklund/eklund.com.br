import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const LOG = PT_BR.loadTest.log;
const SCENARIO_SECONDS = 20; // 5 s up, 10 s hold, 5 s down: RampScenario.STAGES
// batch_duration is the one line the dictionary does not own (LoadTest#finish writes it in code).
const BATCH_DURATION =
  'batch_duration avg {average} ms · min {min} · med {median} · p90 {p90} · p95 {p95} · p99 {p99} · max {max}';

test.describe('load test (desktop)', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'the full run takes 20 s of CPU, so one project runs it; the page layout on mobile is covered elsewhere',
  );

  test('waits for its section and says so in the terminal', async ({ site }) => {
    await site.open('/');
    await expect(site.terminalLines).toHaveCount(1);
    await expect(site.terminalLines.locator('span')).toHaveText(PT_BR.loadTest.placeholder.auto);
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.waiting);
    await expect(site.loadTestRun).toHaveText(PT_BR.loadTest.run);
    await expect(site.summaryCell('checks')).toHaveText('—/5');
  });

  test('uses one worker per core, up to four, leaving one core for the page', async ({
    site,
    page,
  }) => {
    await site.open('/');
    const workers = await page.evaluate(() =>
      Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1)),
    );
    await expect(site.loadTestWorkers).toHaveText(String(workers));
  });

  test('starts by itself when the section scrolls into view, then runs to the end with every check passing', async ({
    site,
    page,
    health,
  }) => {
    test.setTimeout(120_000);
    await site.open('/');
    const { workers, cores } = await page.evaluate(() => ({
      workers: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1)),
      cores: navigator.hardwareConcurrency || '?',
    }));

    await site.jumpTo('carga');
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.running);
    await expect(site.loadTestRun).toBeDisabled();
    await expect(site.loadTestRoot).toHaveClass('panel load-test reveal is-running');

    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.done, { timeout: 60_000 });
    await expect(site.loadTestRun).toHaveText(PT_BR.loadTest.runAgain);
    await expect(site.loadTestRun).toBeEnabled();
    await expect(site.loadTestRoot).toHaveClass('panel load-test reveal is-done');
    expect(await site.loadTestProgress.evaluate((bar) => bar.style.width)).toBe('100%');

    // --- the summary tiles -----------------------------------------------------------------
    await expect(site.summaryCell('checks')).toHaveText('5 ✓/5');
    const processed = await site.summaryNumber('processed');
    const peak = await site.summaryNumber('peak');
    const p95 = await site.summaryNumber('p95');
    const p99 = await site.summaryNumber('p99');
    const perPix = await site.summaryNumber('per-pix');
    const duplicates = await site.summaryNumber('duplicates');
    const insufficient = await site.summaryNumber('insufficient-funds');
    const done = DictionaryText.parseInteger(processed, 'pt-BR');
    await expect(site.summaryCell('peak')).toHaveText(`${peak}/s`);
    await expect(site.summaryCell('p95')).toHaveText(`${p95}ms`);
    await expect(site.summaryCell('p99')).toHaveText(`${p99}ms`);
    await expect(site.summaryCell('per-pix')).toHaveText(`${perPix}µs`);

    // --- the terminal: the kinds of lines, in order -----------------------------------------
    const kinds = await site.terminalLines.evaluateAll((lines) =>
      lines.map((line) => line.className.replace('terminal-line ', '')),
    );
    expect(kinds.slice(0, 4)).toStrictEqual(['is-command', 'is-info', 'is-info', 'is-dim']);
    // One "running" line per elapsed second sits in between; how many depends on how the ticks fall, so only the kind is exact.
    const running = kinds.slice(4, -11);
    expect(running.every((kind) => kind === 'is-running')).toBe(true);
    expect(kinds.slice(-11)).toStrictEqual([
      'is-blank',
      'is-ok',
      'is-ok',
      'is-ok',
      'is-ok',
      'is-ok',
      'is-blank',
      'is-metric',
      'is-metric',
      'is-metric',
      'is-metric',
    ]);
    await expect(site.terminalFail).toHaveCount(0);
    await expect(site.terminalOk).toHaveCount(5);

    // --- the header lines, from the dictionary --------------------------------------------------
    const lineText = (index) => site.terminalLines.nth(index).locator('span').textContent();
    const workerWord = DictionaryText.plain(
      LOG.workers[new Intl.PluralRules('pt-BR').select(workers)],
      { count: workers },
    );
    expect(await lineText(0)).toBe(
      DictionaryText.plain(LOG.header, { workers: workerWord, cores }),
    );
    expect(await lineText(1)).toBe(DictionaryText.plain(LOG.scenario));
    expect(await lineText(2)).toBe(DictionaryText.plain(LOG.checks));
    const warmup = DictionaryText.extract(LOG.warmup, await lineText(3)); // the budget is measured on this machine
    expect(DictionaryText.plain(LOG.warmup, warmup)).toBe(await lineText(3));

    // --- the five checks: the numbers come from the summary, the words from the dictionary ---------
    const checks = await site.terminalOk.allTextContents();
    const payload = DictionaryText.extract(LOG.checkPayload, checks[0]);
    expect(DictionaryText.plain(LOG.checkPayload, payload)).toBe(checks[0]);
    expect(
      DictionaryText.parseInteger(payload.ok, 'pt-BR') +
        DictionaryText.parseInteger(payload.invalid, 'pt-BR'),
    ).toBe(done);
    expect(checks[1]).toBe(DictionaryText.plain(LOG.checkIdempotency, { duplicates }));
    expect(checks[2]).toBe(DictionaryText.plain(LOG.checkBalance, { rejected: insufficient }));
    expect(checks[3]).toBe(
      DictionaryText.plain(LOG.checkConservation[new Intl.PluralRules('pt-BR').select(workers)], {
        count: workers,
      }),
    );
    const journal = DictionaryText.extract(LOG.checkJournal, checks[4]);
    expect(DictionaryText.plain(LOG.checkJournal, journal)).toBe(checks[4]);
    expect(journal.hash.split(' ').map((chain) => /^[0-9a-f]{8}$/.test(chain))).toStrictEqual(
      Array(workers).fill(true),
    ); // one 32-bit chain per worker

    // --- the metric lines ---------------------------------------------------------------------
    const metrics = await site.terminalLines
      .locator('xpath=self::*[contains(@class, "is-metric")]/span')
      .allTextContents();
    expect(metrics).toHaveLength(4);
    const iterations = DictionaryText.extract(LOG.iterations, metrics[0]);
    expect(DictionaryText.plain(LOG.iterations, iterations)).toBe(metrics[0]);
    expect(iterations.rate).toBe(
      DictionaryText.formatInteger(
        DictionaryText.parseInteger(iterations.count, 'pt-BR') / SCENARIO_SECONDS,
        'pt-BR',
      ),
    );
    const totals = DictionaryText.extract(LOG.processed, metrics[1]);
    expect(totals).toStrictEqual({
      done: processed,
      average: DictionaryText.formatInteger(done / SCENARIO_SECONDS, 'pt-BR'),
      peak,
    });
    expect(DictionaryText.plain(LOG.processed, totals)).toBe(metrics[1]);
    const batches = DictionaryText.extract(BATCH_DURATION, metrics[2]);
    expect(DictionaryText.plain(BATCH_DURATION, batches)).toBe(metrics[2]);
    expect({ average: batches.average, p95: batches.p95, p99: batches.p99 }).toStrictEqual({
      average: perPix,
      p95,
      p99,
    });
    expect(metrics[3]).toBe(DictionaryText.plain(LOG.pixDuration, { average: perPix }));

    // --- the charts ------------------------------------------------------------------------------
    await expect(page.locator('#load-test-throughput svg')).toHaveAttribute(
      'aria-label',
      PT_BR.loadTest.charts.throughputAria,
    );
    await expect(page.locator('#load-test-latency svg')).toHaveAttribute(
      'aria-label',
      PT_BR.loadTest.charts.latencyAria,
    );
    await expect(page.locator('#load-test-histogram svg')).toHaveAttribute(
      'aria-label',
      PT_BR.loadTest.charts.histogramAria,
    );
    expect(health.problems).toStrictEqual(PageHealth.NONE);

    // --- changing language afterwards: the numbers and labels follow, the log keeps the language it was written in ---
    await site.localeLink('en-US').click();
    await expect(site.loadTestState).toHaveText(EN_US.loadTest.states.done);
    await expect(site.loadTestRun).toHaveText(EN_US.loadTest.runAgain);
    await expect(site.summaryCell('processed')).toHaveText(
      DictionaryText.formatInteger(done, 'en-US'),
    );
    await expect(site.page.locator('#load-test-throughput svg')).toHaveAttribute(
      'aria-label',
      EN_US.loadTest.charts.throughputAria,
    );
    expect(await lineText(1)).toBe(DictionaryText.plain(LOG.scenario));
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });
});

test.describe('load test, English page (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only, like the rest of this file');

  test('waits for its section in English', async ({ site }) => {
    await site.open('/en/');
    await expect(site.terminalLines.locator('span')).toHaveText(EN_US.loadTest.placeholder.auto);
    await expect(site.loadTestState).toHaveText(EN_US.loadTest.states.waiting);
    await expect(site.loadTestRun).toHaveText(EN_US.loadTest.run);
  });
});

test.describe('load test with reduced motion (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only, like the rest of this file');
  test.use({ reducedMotion: 'reduce' });

  test('does not start by itself, and the run button starts it', async ({ site }) => {
    await site.open('/');
    await expect(site.terminalLines.locator('span')).toHaveText(PT_BR.loadTest.placeholder.manual);
    await site.jumpTo('carga');
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.waiting);
    await expect(site.terminalLines).toHaveCount(1);
    await site.loadTestRun.click();
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.running);
    await expect(site.loadTestRun).toBeDisabled();
  });
});

test.describe('load test from the command palette (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only, like the rest of this file');

  test('"run the load test" scrolls there and starts it', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('rodar o teste');
    await expect(site.paletteSelected).toHaveText(
      PT_BR.palette.commands.runLoad.title + PT_BR.palette.tags.action,
    );
    await page.keyboard.press('Enter');
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.running, { timeout: 15_000 });
  });
});
