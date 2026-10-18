import { test, expect } from './support/fixtures.js';
import { DictionaryText } from './support/dictionary-text.js';

const PT_BR = DictionaryText.of('pt-BR');

/** What the page's animations are doing: the marquee rows (WAAPI) and the ambient CSS loops. */
const marqueeStates = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.target?.classList?.contains('marquee-track'))
      .map((animation) => animation.playState),
  );
const marqueeClock = (page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .find((animation) => animation.effect?.target?.classList?.contains('marquee-track'))
        .currentTime,
  );
const loopsOf = (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).animationIterationCount);
/** Where the ring is after the browser has drawn the next frames, as the page wrote it. */
const ringAfterFrames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(document.querySelector('.cursor-ring').style.transform.split(') ')[0]),
          ),
        ),
      ),
  );

const motionButton = (page) =>
  page.getByRole('button', { name: PT_BR.nav.motionLabel, exact: true });

test.describe('a visitor who paused motion, reloaded and plays it again', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('motion', 'paused'));
  });

  test('keeps the marquee rows ready: paused while motion is off, running and moving once it is on', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await expect(site.html).toHaveAttribute('data-motion', 'paused');
    expect(await marqueeStates(page)).toStrictEqual(['paused', 'paused', 'paused', 'paused']);
    const stopped = await marqueeClock(page);
    await page.waitForTimeout(400);
    expect(await marqueeClock(page)).toBe(stopped);
    await motionButton(page).click();
    await expect(site.html).toHaveAttribute('data-motion', 'full');
    expect(await marqueeStates(page)).toStrictEqual(['running', 'running', 'running', 'running']);
    await expect.poll(async () => (await marqueeClock(page)) > stopped).toBe(true);
  });

  test('brings the ambient CSS loops back as well', async ({ site, page }) => {
    await site.open('/');
    expect(await loopsOf(page, '.rotating-text-roll')).toBe('1');
    await motionButton(page).click();
    expect(await loopsOf(page, '.rotating-text-roll')).toBe('infinite');
  });

  test('plays the marquee again after resuming from the palette too', async ({ site, page }) => {
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill(PT_BR.palette.commands.resumeMotion.title);
    await site.paletteInput.press('Enter');
    await expect(site.html).toHaveAttribute('data-motion', 'full');
    expect(await marqueeStates(page)).toStrictEqual(['running', 'running', 'running', 'running']);
  });

  test.describe('with a mouse', () => {
    test.skip(({ isMobile }) => isMobile, 'touch screens have no cursor');

    test('still has the custom cursor while paused: the dot follows the pointer and the ring sits on it, with no lag', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await expect(site.html).toHaveClass(/has-custom-cursor/);
      await page.mouse.move(300, 200);
      await page.mouse.move(640, 360);
      expect(await site.cursorDot.evaluate((dot) => dot.style.translate)).toBe(
        'calc(-50% + 640px) calc(-50% + 360px)',
      );
      expect(await ringAfterFrames(page)).toBe('translate(640px, 360px');
    });

    test('keeps the cursor when motion comes back, and the ring trails the pointer again', async ({
      site,
      page,
    }) => {
      await site.open('/');
      await page.mouse.move(100, 100);
      await ringAfterFrames(page);
      await motionButton(page).click();
      await expect(site.html).toHaveClass(/has-custom-cursor/);
      await page.mouse.move(900, 500);
      expect(await ringAfterFrames(page)).not.toBe('translate(900px, 500px');
      await expect
        .poll(() => ringAfterFrames(page), { timeout: 5000 })
        .toBe('translate(900px, 500px');
    });

    test('does not pull the email button toward the pointer while paused, and does once motion is on', async ({
      site,
      page,
    }) => {
      await site.open('/');
      const link = page.locator('#email-link');
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
      expect(await link.evaluate((element) => element.style.translate)).toBe('');
      await motionButton(page).click();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
      expect(await link.evaluate((element) => element.style.translate)).not.toBe('');
    });
  });
});

test.describe('a visitor who pauses motion on the page', () => {
  test.skip(({ isMobile }) => isMobile, 'touch screens have no cursor');

  test('keeps the cursor, which only follows the pointer, and drops its lag', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await expect(site.html).toHaveClass(/has-custom-cursor/);
    await motionButton(page).click();
    await expect(site.html).toHaveClass(/has-custom-cursor/);
    await page.mouse.move(700, 400);
    expect(await ringAfterFrames(page)).toBe('translate(700px, 400px');
  });
});

test.describe('when the system asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the play button brings motion back: the marquee runs and the ambient loops loop', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await expect(site.html).toHaveAttribute('data-motion', 'paused');
    expect(await marqueeStates(page)).toStrictEqual(['paused', 'paused', 'paused', 'paused']);
    expect(await loopsOf(page, '.rotating-text-roll')).toBe('1');
    await motionButton(page).click();
    await expect(site.html).toHaveAttribute('data-motion', 'full');
    expect(await marqueeStates(page)).toStrictEqual(['running', 'running', 'running', 'running']);
    expect(await loopsOf(page, '.rotating-text-roll')).toBe('infinite');
  });

  test('a saved choice of motion wins over the system: everything moves from the start', async ({
    site,
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('motion', 'full'));
    await site.open('/');
    await expect(site.html).toHaveAttribute('data-motion', 'full');
    expect(await marqueeStates(page)).toStrictEqual(['running', 'running', 'running', 'running']);
    expect(await loopsOf(page, '.rotating-text-roll')).toBe('infinite');
  });
});

test.describe('the load test, which runs for twenty seconds on its own (WCAG 2.2.2)', () => {
  test.skip(({ isMobile }) => isMobile, 'the full run takes 20 s of CPU, so one project runs it');

  test('pauses when motion is paused, stands still, and finishes from where it was when motion is played', async ({
    site,
    page,
  }) => {
    test.setTimeout(90_000);
    await site.open('/');
    await site.loadTestRun.scrollIntoViewIfNeeded();
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.running);
    await page.waitForFunction(
      () => document.querySelectorAll('#load-test-terminal .terminal-line').length > 8,
    ); // a few seconds into the run
    await motionButton(page).click();
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.paused);
    await page.waitForTimeout(300); // a tick that was already under way lands
    const lines = await site.terminalLines.count();
    const progress = await site.loadTestProgress.evaluate((bar) => bar.style.width);
    await page.waitForTimeout(2500);
    expect([
      await site.terminalLines.count(),
      await site.loadTestProgress.evaluate((bar) => bar.style.width),
      await site.loadTestRoot.evaluate((root) => root.classList.contains('is-running')),
    ]).toStrictEqual([lines, progress, true]);
    await motionButton(page).click();
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.running);
    await expect(site.loadTestState).toHaveText(PT_BR.loadTest.states.done, { timeout: 45_000 });
    expect(await site.loadTestProgress.evaluate((bar) => bar.style.width)).toBe('100%');
  });
});
