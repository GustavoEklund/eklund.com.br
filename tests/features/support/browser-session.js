import { spawn } from 'node:child_process';
import { SiteSource } from './site-source.js';

const PORT = 8736;
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

/** One static server (tools/serve.mjs on its own port) and one Chromium on software GL, started on first use and shared by every browser scenario. */
export class BrowserSession {
  static #server = null;
  static #browser = null;

  static get baseUrl() {
    return `http://127.0.0.1:${PORT}`;
  }

  static async newContext(options) {
    await BrowserSession.#startServer();
    BrowserSession.#browser ??= await (
      await import('playwright')
    ).chromium.launch({ headless: true, args: SOFTWARE_GL });
    return BrowserSession.#browser.newContext({
      baseURL: BrowserSession.baseUrl,
      viewport: { width: 1280, height: 800 },
      timezoneId: 'America/Sao_Paulo',
      serviceWorkers: 'block',
      ...options,
    });
  }

  static async shutdown() {
    await BrowserSession.#browser?.close();
    BrowserSession.#browser = null;
    await BrowserSession.#stopServer();
  }

  static #startServer() {
    if (BrowserSession.#server) return BrowserSession.#ready;
    const server = spawn(process.execPath, ['tools/serve.mjs', '--port', String(PORT)], {
      cwd: SiteSource.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    BrowserSession.#server = server;
    process.once('exit', () => server.kill('SIGTERM'));
    BrowserSession.#ready = new Promise((resolve, reject) => {
      let errors = '';
      server.stderr.on('data', (chunk) => {
        errors += chunk;
      });
      server.stdout.on('data', (chunk) => {
        if (String(chunk).startsWith('serving ')) resolve();
      });
      server.once('exit', (code) =>
        reject(new Error(`tools/serve.mjs exited with ${code} before it was ready: ${errors}`)),
      );
    });
    return BrowserSession.#ready;
  }

  static async #stopServer() {
    const server = BrowserSession.#server;
    if (!server) return;
    BrowserSession.#server = null;
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }

  static #ready = null;
}
