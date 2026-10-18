import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';

const PROJECT = join(import.meta.dirname, '..', '..');
const SERVER = join(PROJECT, 'tools', 'serve.mjs');

/** A running tools/serve.mjs on a free port, started as its own process. */
export class RunningServer {
  static async start(args = []) {
    const port = await RunningServer.#freePort();
    const child = spawn(process.execPath, [SERVER, '--port', String(port), ...args], {
      cwd: PROJECT,
    });
    const banner = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('\n')) resolve(output.trim());
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`server exited with ${code}: ${output}`)));
    });
    return new RunningServer(child, port, banner);
  }

  static #freePort() {
    return new Promise((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
  }

  constructor(child, port, banner) {
    this.child = child;
    this.port = port;
    this.banner = banner;
  }

  /** [status, headers subset, body] of a GET, with the path sent exactly as written. */
  get(path) {
    return new Promise((resolve, reject) => {
      request({ host: '127.0.0.1', port: this.port, path, method: 'GET' }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            type: response.headers['content-type'],
            cache: response.headers['cache-control'],
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      })
        .on('error', reject)
        .end();
    });
  }

  /** [status, Location, security headers present] of a GET that is answered with a redirect, or whatever it is answered with. */
  moved(path) {
    return new Promise((resolve, reject) => {
      request({ host: '127.0.0.1', port: this.port, path, method: 'GET' }, (response) => {
        response.resume();
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            location: response.headers.location,
            policy: response.headers['content-security-policy'],
          }),
        );
      })
        .on('error', reject)
        .end();
    });
  }

  /** The response headers of a GET, names in lower case, as the server sent them. */
  headers(path) {
    return new Promise((resolve, reject) => {
      request({ host: '127.0.0.1', port: this.port, path, method: 'GET' }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.headers));
      })
        .on('error', reject)
        .end();
    });
  }

  stop() {
    this.child.kill('SIGTERM');
  }
}
