// Takes the pictures the README shows, from the production build, and writes them to docs/images as WebP. The browser that
// shoots them also encodes them, so the tool needs nothing but Playwright's Chromium. Run it after a change that shows.
// usage: pnpm run build && node tools/readme-screenshots.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { EN_US } from '../source/js/i18n/locales/en-us.js';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = join(PROJECT, 'docs', 'images');
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const WEBP_QUALITY = 0.86;
const texts = EN_US;
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

/** tools/serve.mjs over dist/, on a free port, for as long as the run needs it. */
class BuiltSite {
  #child = null;
  #port = 0;

  get origin() {
    return `http://127.0.0.1:${this.#port}`;
  }

  async start() {
    if (!existsSync(join(PROJECT, 'dist', 'index.html')))
      throw new Error('dist/ is empty; run `pnpm run build` first');
    this.#port = await BuiltSite.#freePort();
    this.#child = spawn(
      process.execPath,
      [join(PROJECT, 'tools', 'serve.mjs'), '--port', String(this.#port), '--root', 'dist'],
      {
        cwd: PROJECT,
        stdio: 'ignore',
      },
    );
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fetch(this.origin).catch(() => null))?.ok) return;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('the server did not start');
  }

  stop() {
    this.#child?.kill();
  }

  static #freePort() {
    return new Promise((done, fail) => {
      const probe = createServer();
      probe.on('error', fail);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => done(port));
      });
    });
  }
}

/** One browser page, shown the way a visitor sees it. */
class Visit {
  #page;

  constructor(page) {
    this.#page = page;
  }

  static async open(context, url) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('fonts-ready') && window.eklund !== undefined,
    );
    const visit = new Visit(page);
    await visit.hideCursor();
    return visit;
  }

  /** Lets a few seconds of animation go by, so the globe has turned and the figures have settled. */
  async settle(milliseconds) {
    await this.#page.waitForTimeout(milliseconds);
  }

  async toggleTheme() {
    await this.#page.locator('#theme-toggle').click();
    await this.#page.mouse.move(720, 450); // off the button, so it does not show its hover state
    await this.#page.waitForTimeout(1500);
  }

  /** Brings a section to the top of a window of this height, as a visitor would: twice, since sections lay out when they get near. */
  async frame(selector, height, below = 0) {
    await this.#page.setViewportSize({ width: DESKTOP.viewport.width, height });
    for (let pass = 0; pass < 2; pass++) {
      await this.#page.evaluate(
        ({ target, offset }) => {
          document.querySelector(target).scrollIntoView({ behavior: 'instant', block: 'start' });
          scrollBy(0, -offset); // leaves room for the fixed header
        },
        { target: selector, offset: below },
      );
      await this.#page.waitForTimeout(1200);
    }
  }

  /** The custom cursor sits in the corner when the pointer has not moved: it is not part of the page. */
  async hideCursor() {
    await this.#page.evaluate(() =>
      document.querySelectorAll('.cursor-dot, .cursor-ring').forEach((element) => {
        element.style.display = 'none';
      }),
    );
  }

  /** The status banner goes back to operational a while after a slow task of this machine; the picture shows the usual state. */
  async waitForText(selector, text, milliseconds) {
    await this.#page
      .waitForFunction(
        ({ target, expected }) => document.querySelector(target)?.textContent.includes(expected),
        { target: selector, expected: text },
        { timeout: milliseconds },
      )
      .catch(() => {});
  }

  async waitForLoadTest() {
    await this.#page.waitForFunction(
      () => document.querySelector('#load-test')?.classList.contains('is-done'),
      null,
      { timeout: 180_000 },
    );
    await this.#page.waitForTimeout(800);
  }

  viewport() {
    return this.#page.screenshot({ type: 'png' });
  }

  close() {
    return this.#page.close();
  }
}

/** PNG in, WebP out, encoded by the browser that is already running. */
class WebpEncoder {
  #page;

  constructor(page) {
    this.#page = page;
  }

  async encode(png) {
    const base64 = await this.#page.evaluate(
      async ({ data, quality }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
        canvas.getContext('2d').drawImage(image, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = '';
        for (let index = 0; index < bytes.length; index += 0x8000)
          text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        return btoa(text);
      },
      { data: png.toString('base64'), quality: WEBP_QUALITY },
    );
    return Buffer.from(base64, 'base64');
  }
}

class Pictures {
  static async run() {
    await mkdir(OUTPUT, { recursive: true });
    const site = new BuiltSite();
    await site.start();
    const browser = await chromium.launch({ args: SOFTWARE_GL });
    try {
      const encoder = new WebpEncoder(await (await browser.newContext()).newPage());
      const save = async (name, png) => {
        const webp = await encoder.encode(png);
        await writeFile(join(OUTPUT, name), webp);
        console.log(`${name}: ${(webp.length / 1000).toFixed(0)} kB`);
      };

      const desktop = await browser.newContext({ ...DESKTOP, locale: 'en-US' });
      const hero = await Visit.open(desktop, `${site.origin}/en/`);
      await hero.settle(5000);
      await save('hero-dark.webp', await hero.viewport());
      await hero.toggleTheme();
      await save('hero-light.webp', await hero.viewport());
      await hero.toggleTheme();
      await hero.frame('#status', 1000);
      await hero.waitForText('#status-page', texts.status.banners[0], 45_000);
      await save('status-page.webp', await hero.viewport());
      await hero.frame('#arquitetura', 1000);
      await hero.settle(2000);
      await save('architecture-map.webp', await hero.viewport());
      await hero.frame('#load-test', 1000, 90);
      await hero.waitForLoadTest();
      await save('load-test.webp', await hero.viewport());
      await hero.close();

      const phone = await browser.newContext({ ...PHONE, locale: 'en-US' });
      const mobile = await Visit.open(phone, `${site.origin}/en/`);
      await mobile.settle(5000);
      await save('hero-phone.webp', await mobile.viewport());
    } finally {
      await browser.close();
      site.stop();
    }
  }
}

try {
  await Pictures.run();
} catch (error) {
  console.error(`readme-screenshots: ${error.message}`);
  process.exitCode = 1;
}
