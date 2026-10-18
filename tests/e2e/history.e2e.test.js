import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');
const ROLES = [
  PT_BR.history.jobs.okto.role,
  PT_BR.history.jobs.g8.role,
  PT_BR.history.jobs.esatto.role,
  PT_BR.history.jobs.anhanguera.role,
];
const COMPANIES = ['OKTO Payments', 'G8 Finance', 'Esatto', 'Anhanguera'];
const AUTOPLAY_MS = 9_000;
const STEP_MS = 1_000;

/**
 * Moves the page's clock a second at a time until the cards show `expected`, and returns how many seconds that took. The timer that advances
 * a card is armed when the section is first seen, which can be a moment after the test starts waiting; stepping lets it fire whenever it was set.
 */
const advanceUntil = async (site, page, expected) => {
  for (let seconds = 0; seconds <= 3 * (AUTOPLAY_MS / STEP_MS); seconds++) {
    if (JSON.stringify(await site.expandedStates()) === JSON.stringify(expected)) return seconds;
    await page.clock.fastForward(STEP_MS);
  }
  throw new Error(`The cards never showed ${expected}`);
};

test.describe('history accordion', () => {
  test('lists the four jobs, newest first, with the first one open', async ({ site, health }) => {
    await site.open('/');
    await expect(site.jobCards).toHaveCount(4);
    await expect(site.jobCards.locator('h3 .job-company')).toHaveText(COMPANIES);
    await expect(site.jobCards.locator('.job-role')).toHaveText(ROLES);
    expect(await site.expandedStates()).toStrictEqual(['true', 'false', 'false', 'false']);
    await expect(site.jobCards.nth(0)).toHaveClass('job-card is-open');
    await expect(site.jobCards.nth(1)).toHaveClass('job-card');
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('shows the period and the dictionary text of the open job', async ({ site }) => {
    await site.open('/');
    await expect(site.jobCards.nth(0).locator('.job-period')).toHaveText(
      `2024.08 → ${PT_BR.history.today}`,
    );
    await expect(site.jobCards.nth(0).locator('.job-body p').first()).toHaveText(
      PT_BR.history.jobs.okto.p1,
    );
  });

  test('clicking a card opens it and closes the others', async ({ site }) => {
    await site.open('/');
    await site.jobHeaders.nth(2).scrollIntoViewIfNeeded();
    await site.jobHeaders.nth(2).click();
    await expect
      .poll(() => site.expandedStates())
      .toStrictEqual(['false', 'false', 'true', 'false']);
    await expect(site.jobCards.nth(2)).toHaveClass('job-card is-open');
    await expect(site.jobCards.nth(0)).toHaveClass('job-card');
    await site.jobHeaders.nth(1).click();
    await expect
      .poll(() => site.expandedStates())
      .toStrictEqual(['false', 'true', 'false', 'false']);
  });

  test('the keyboard opens a card too', async ({ site }) => {
    await site.open('/');
    await site.jobHeaders.nth(3).scrollIntoViewIfNeeded();
    await site.jobHeaders.nth(3).focus();
    await site.page.keyboard.press('Enter');
    await expect
      .poll(() => site.expandedStates())
      .toStrictEqual(['false', 'false', 'false', 'true']);
  });

  test('on a wide screen the cards advance on their own, every nine seconds', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'autoplay is only on for wide screens');
    await page.clock.install(); // the 9000 ms timer is the only time this test depends on; the clock jumps over it
    await site.open('/');
    await site.jobHeaders.nth(0).scrollIntoViewIfNeeded();
    await expect(page.locator('#history')).toHaveClass('history is-autoplaying reveal');
    await advanceUntil(site, page, ['false', 'true', 'false', 'false']);
    // The second card was opened by the timer within the last second, which re-armed it for nine more: after seven seconds
    // it has not fired, after nine it has.
    await page.clock.fastForward(AUTOPLAY_MS - 2 * STEP_MS);
    expect(await site.expandedStates()).toStrictEqual(['false', 'true', 'false', 'false']);
    await page.clock.fastForward(2 * STEP_MS);
    await expect
      .poll(() => site.expandedStates())
      .toStrictEqual(['false', 'false', 'true', 'false']);
  });

  test('on a wide screen the last card wraps around to the first', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'autoplay is only on for wide screens');
    await page.clock.install();
    await site.open('/');
    await site.jobHeaders.nth(0).scrollIntoViewIfNeeded();
    for (const expected of [
      ['false', 'true', 'false', 'false'],
      ['false', 'false', 'true', 'false'],
      ['false', 'false', 'false', 'true'],
      ['true', 'false', 'false', 'false'],
    ]) {
      await advanceUntil(site, page, expected);
    }
    expect(await site.expandedStates()).toStrictEqual(['true', 'false', 'false', 'false']);
  });

  test('on a narrow screen the open card stays open, however long the page waits', async ({
    site,
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'autoplay is only off for narrow screens');
    await page.clock.install();
    await site.open('/');
    await site.jobHeaders.nth(0).scrollIntoViewIfNeeded();
    await page.clock.fastForward(30_000);
    expect(await site.expandedStates()).toStrictEqual(['true', 'false', 'false', 'false']);
  });

  test('on a narrow screen the progress bar is not animated, since nothing advances', async ({
    site,
    isMobile,
  }) => {
    test.skip(!isMobile, 'autoplay is only off for narrow screens');
    await site.open('/');
    await expect(site.page.locator('#history')).toHaveClass('history reveal');
  });

  test('on a narrow screen a second tap on the open card collapses it', async ({
    site,
    isMobile,
  }) => {
    test.skip(!isMobile, 'collapsing only exists for narrow screens');
    await site.open('/');
    await site.jobHeaders.nth(0).scrollIntoViewIfNeeded();
    await site.jobHeaders.nth(0).click();
    await expect
      .poll(() => site.expandedStates())
      .toStrictEqual(['false', 'false', 'false', 'false']);
  });
});
