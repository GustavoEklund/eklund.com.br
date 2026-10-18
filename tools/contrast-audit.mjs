// Contrast audit of the running site: WCAG 2.2 AA (1.4.3 text, 1.4.11 components) at every accent hue, in both themes.
// Starts tools/serve.mjs and a headless Chromium, measures the page through ContrastAudit and prints a summary. Exit code 1 on any failing pair.
// usage: node tools/contrast-audit.mjs [--step 1] [--theme dark|light] [--lang pt-BR|en-US] [--json]
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { ContrastSweep } from './contrast-sweep.mjs';

const PORT = 8737;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

class Options {
  static read(argv) {
    const value = (name, fallback) =>
      argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback;
    const theme = value('theme', 'both');
    return {
      step: Number(value('step', 1)),
      themes: theme === 'both' ? ['dark', 'light'] : [theme],
      lang: value('lang', 'pt-BR'),
      json: argv.includes('--json'),
    };
  }
}

class SiteServer {
  #child = null;

  async start() {
    this.#child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(PORT)], {
      stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(ORIGIN)).ok) return;
      } catch {
        /* not listening yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`The site did not answer at ${ORIGIN}`);
  }

  stop() {
    this.#child?.kill();
  }
}

class Report {
  static print(theme, results) {
    const lowest = (key) =>
      results.reduce((worst, result) => (result[key] < worst[key] ? result : worst), results[0]);
    const text = lowest('lowestText');
    const component = lowest('lowestComponent');
    const counts = results.map((result) => result.count);
    const failing = results.flatMap((result) =>
      result.failing.map((pair) => ({ hue: result.hue, ...pair })),
    );
    console.log(
      `${theme.padEnd(5)} ${String(results.length).padStart(3)} hues, ${Math.min(...counts)}-${Math.max(...counts)} pairs each` +
        ` · text ≥ ${text.lowestText.toFixed(2)}:1 (hue ${text.hue}, ${text.lowestTextLabel})` +
        ` · components ≥ ${component.lowestComponent.toFixed(2)}:1 (hue ${component.hue}, ${component.lowestComponentLabel})` +
        ` · AAA on ${Math.min(...results.map((result) => result.enhanced))}-${Math.max(...results.map((result) => result.enhanced))}` +
        ` · ${failing.length} failing`,
    );
    for (const pair of failing.slice(0, 40)) {
      const channels = (color) =>
        `rgb(${color.r} ${color.g} ${color.b}${color.a < 1 ? ` / ${color.a.toFixed(2)}` : ''})`;
      console.log(
        `  hue ${pair.hue}: ${pair.kind} ${pair.ratio.toFixed(2)}:1 < ${pair.minimum}:1  ${pair.labels.join(', ')} (${pair.count}x)  ${channels(pair.foreground)} on ${channels(pair.background)}`,
      );
    }
    return failing.length;
  }
}

const options = Options.read(process.argv.slice(2));
const server = new SiteServer();
let failures = 0;
try {
  await server.start();
  const browser = await chromium.launch({ args: SOFTWARE_GL });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: options.lang,
    });
    await context.route(/^https?:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    const page = await context.newPage();
    await page.goto(options.lang === 'en-US' ? `${ORIGIN}/en/` : ORIGIN);
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('fonts-ready') && window.eklund !== undefined,
    );
    const sweep = new ContrastSweep(page);
    await sweep.prepare();
    const all = {};
    for (const theme of options.themes) {
      all[theme] = await sweep.sweep({ theme, hues: ContrastSweep.hues(options.step) });
      if (!options.json) failures += Report.print(theme, all[theme]);
      else failures += all[theme].reduce((total, result) => total + result.failing.length, 0);
    }
    if (options.json) console.log(JSON.stringify(all));
  } finally {
    await browser.close();
  }
} finally {
  server.stop();
}
process.exitCode = failures ? 1 : 0;
