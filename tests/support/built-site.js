import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const PROJECT = join(import.meta.dirname, '..', '..');

/** The production build of the site, made by the real `pnpm run build` into a folder of its own, and what is in it. */
export class BuiltSite {
  /** Builds into a new temporary folder and returns the site there. Call `remove()` when done. */
  static build() {
    const folder = mkdtempSync(join(tmpdir(), 'built-site-'));
    const result = spawnSync(
      join(PROJECT, 'node_modules', '.bin', 'vp'),
      ['build', '--config', 'vite.build.config.js', '--outDir', folder, '--emptyOutDir'],
      { cwd: PROJECT, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(`The build failed:\n${result.stdout}\n${result.stderr}`);
    return new BuiltSite(folder);
  }

  constructor(folder) {
    this.folder = folder;
  }

  remove() {
    rmSync(this.folder, { recursive: true, force: true });
  }

  read(path) {
    return readFileSync(join(this.folder, path), 'utf8');
  }

  bytes(path) {
    return readFileSync(join(this.folder, path));
  }

  exists(path) {
    try {
      return statSync(join(this.folder, path)).isFile();
    } catch {
      return false;
    }
  }

  /** The names in a folder, sorted, hidden ones included. */
  list(folder = '') {
    return readdirSync(join(this.folder, folder)).sort();
  }

  /** Every file as a path with slashes, sorted. */
  files() {
    const found = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else found.push(relative(this.folder, path).split(sep).join('/'));
      }
    };
    walk(this.folder);
    return found.sort();
  }

  /** The files of assets/ that are not under brand/, which are the ones Vite names with a hash. */
  hashedAssets() {
    return this.list('assets').filter((name) =>
      statSync(join(this.folder, 'assets', name)).isFile(),
    );
  }

  /** A fingerprint of everything in the folder: the name and the bytes of each file. */
  fingerprint() {
    const hash = createHash('sha256');
    for (const path of this.files()) hash.update(path).update(this.bytes(path));
    return hash.digest('hex');
  }

  gzipBytes(path) {
    return gzipSync(this.bytes(path), { level: 9 }).length;
  }
}
