// Validates the pages with the W3C Nu HTML Checker (vnu): the two files as shipped (index.html and en/index.html), and the DOM the scripts build, in both languages.
// usage: node tools/validate-html.mjs                      (needs Java 17+ on the PATH and the Playwright Chromium browser)
//        node tools/validate-html.mjs --only-static FILE   (checks one file as it is, with no browser)
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VNU_JAR = join(PROJECT, 'node_modules', 'vnu-jar', 'build', 'dist', 'vnu.jar');
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const LANGUAGES = [
  { locale: 'pt-BR', path: '/' },
  { locale: 'en-US', path: '/en/' },
];

/**
 * Messages the checker may report without failing the run, each limited to the element it is about and saying why.
 * The CSS checker of vnu is not used: it predates animation-timeline, @starting-style, rx and min() with var(),
 * which this site uses on purpose (stylelint checks the CSS instead).
 */
const ALLOWED = [
  {
    message: /^Attribute “aria-activedescendant” value should either refer to a descendant element/,
    extract: /role="combobox"/,
    why: 'ARIA 1.2 combobox pattern (APG): the input keeps the focus and points at an option of the listbox it controls, which is not its descendant. The checker still expects the ARIA 1.1 container pattern.',
  },
];

/** vnu as a child process: one JVM start for every file. */
class NuChecker {
  async check(files) {
    const output = await NuChecker.#run([
      '-jar',
      VNU_JAR,
      '--format',
      'json',
      '--exit-zero-always',
      ...files,
    ]);
    return JSON.parse(output).messages;
  }

  static #run(args) {
    return new Promise((done, fail) => {
      const child = spawn('java', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      child.stdout.on('data', (chunk) => {
        text += chunk;
      });
      child.stderr.on('data', (chunk) => {
        text += chunk;
      });
      child.on('error', (error) =>
        fail(new Error(`cannot start Java (${error.message}); install Java 17 or newer`)),
      );
      child.on('close', () => done(text));
    });
  }
}

/** tools/serve.mjs on a free port, for as long as the run needs it. */
class SiteServer {
  #child = null;
  #port = 0;

  get origin() {
    return `http://127.0.0.1:${this.#port}`;
  }

  async start() {
    this.#port = await SiteServer.#freePort();
    this.#child = spawn(
      'node',
      [join(PROJECT, 'tools', 'serve.mjs'), '--port', String(this.#port)],
      { cwd: PROJECT, stdio: 'ignore' },
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${this.origin}/`)).ok) return this;
      } catch {
        /* not listening yet */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error('the dev server did not start');
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

/** The page after its scripts ran: translated, with the trace, the status rows, the map list and the palette built. */
class RenderedPages {
  #browser;
  #origin;

  constructor(origin) {
    this.#origin = origin;
  }

  async open() {
    this.#browser = await chromium.launch({ args: SOFTWARE_GL });
    return this;
  }

  async close() {
    await this.#browser?.close();
  }

  async capture({ locale, path }) {
    const context = await this.#browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale,
    });
    await context.route(
      (url) => url.hostname !== '127.0.0.1',
      (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    ); // fonts and anything else off the machine
    try {
      const page = await context.newPage();
      await page.goto(`${this.#origin}${path}`);
      await page.waitForFunction(
        () =>
          document.documentElement.classList.contains('fonts-ready') && window.eklund !== undefined,
      );
      await page.locator('#trace-viewer').scrollIntoViewIfNeeded();
      await page.waitForSelector('#trace-rows [role=option]');
      await page.keyboard.press('Control+k');
      await page.waitForSelector('#command-palette-list [role=option]');
      return `<!DOCTYPE html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`;
    } finally {
      await context.close();
    }
  }
}

class Report {
  #failures = 0;

  /** Prints what the checker found in one document and returns how many messages count against it. */
  document(name, messages) {
    const findings = messages
      .filter((message) => message.type === 'error' || message.subType === 'warning')
      .filter((message) => !Report.#isAllowed(message));
    for (const finding of findings) {
      const kind = finding.type === 'error' ? 'error' : 'warning';
      console.log(
        `  ${name}:${finding.lastLine}:${finding.firstColumn} ${kind}: ${finding.message}\n    ${finding.extract?.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
      );
    }
    console.log(
      `${findings.length === 0 ? 'ok  ' : 'FAIL'} ${name}: ${findings.length} finding${findings.length === 1 ? '' : 's'}`,
    );
    this.#failures += findings.length;
  }

  get failed() {
    return this.#failures > 0;
  }

  static #isAllowed(message) {
    return ALLOWED.some(
      (rule) => rule.message.test(message.message) && rule.extract.test(message.extract ?? ''),
    );
  }
}

class HtmlValidation {
  static async run(argv) {
    const only = argv.indexOf('--only-static');
    if (only > -1)
      return HtmlValidation.#checkFiles([
        { name: basename(argv[only + 1]), path: resolve(argv[only + 1]) },
      ]);
    const server = await new SiteServer().start();
    const pages = await new RenderedPages(server.origin).open();
    const folder = await mkdtemp(join(tmpdir(), 'eklund-html-'));
    try {
      const files = [
        { name: 'index.html (as shipped)', path: join(PROJECT, 'source', 'index.html') },
        { name: 'en/index.html (as shipped)', path: join(PROJECT, 'source', 'en', 'index.html') },
      ];
      for (const language of LANGUAGES) {
        const path = join(folder, `rendered-${language.locale}.html`);
        await writeFile(path, await pages.capture(language));
        files.push({ name: `rendered ${language.locale}`, path });
      }
      await HtmlValidation.#checkFiles(files);
    } finally {
      await pages.close();
      server.stop();
      await rm(folder, { recursive: true, force: true });
    }
  }

  static async #checkFiles(files) {
    const messages = await new NuChecker().check(files.map((file) => file.path));
    const report = new Report();
    for (const file of files)
      report.document(
        file.name,
        messages.filter((message) => message.url === `file:${file.path}`),
      );
    process.exitCode = report.failed ? 1 : 0;
  }
}

await HtmlValidation.run(process.argv.slice(2));
