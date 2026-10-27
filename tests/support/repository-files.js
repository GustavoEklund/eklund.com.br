import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SKIPPED_FOLDERS = new Set([
  'node_modules',
  'dist',
  'reports',
  '.git',
  '.stryker-tmp',
  '.vitest',
  'fixtures',
]);
/** What `ai-memory install-instructions` writes and rewrites on every refresh, kept as it comes like a vendored folder:
 * its skills, and the block between its markers in AGENTS.md. */
const AI_MEMORY_SKILLS = /^\.(?:claude|agents)\/skills\/ai-memory-[^/]+\//;
const AI_MEMORY_BLOCK = /^<!-- ai-memory:start -->$[\s\S]*?^<!-- ai-memory:end -->$/gm;

/** Reads the repository itself: its documents, its workflows and the files around the site. */
export class RepositoryFiles {
  static get root() {
    return ROOT;
  }

  static read(path) {
    return readFileSync(join(ROOT, path), 'utf8');
  }

  static exists(path) {
    return existsSync(join(ROOT, path));
  }

  /** Every file under a folder (or the root), as paths relative to the root, sorted. */
  static files(folder = '.') {
    const found = [];
    const walk = (directory) => {
      for (const name of readdirSync(join(ROOT, directory)).sort()) {
        const path = join(directory, name);
        if (statSync(join(ROOT, path)).isDirectory()) {
          if (!SKIPPED_FOLDERS.has(name)) walk(path);
        } else found.push(path.replace(/^\.\//, ''));
      }
    };
    walk(folder);
    return found;
  }

  /** The documents a reader opens: the Markdown files of the repository, apart from tests' fixtures, vendored folders and what ai-memory manages. */
  static documents() {
    return RepositoryFiles.files().filter(
      (path) => path.endsWith('.md') && !AI_MEMORY_SKILLS.test(path),
    );
  }

  /** Each workflow: its file name, its text, and the names of its jobs. */
  static workflows() {
    return RepositoryFiles.files('.github/workflows')
      .filter((path) => path.endsWith('.yml'))
      .map((path) => {
        const text = RepositoryFiles.read(path);
        const jobs = text.slice(text.indexOf('\njobs:\n'));
        return {
          file: path,
          text,
          jobNames: [...jobs.matchAll(/^ {4}name: (.+)$/gm)].map(([, name]) => name.trim()),
          jobCount: [...jobs.matchAll(/^ {2}[\w-]+:$/gm)].length,
          /** The lists of a matrix, as { shard: ['1/2', '2/2'] }: what a job name with ${{ matrix.shard }} stands for. */
          matrix: Object.fromEntries(
            [...jobs.matchAll(/^ {8}(\w+): \[(.+?)\]/gm)].map(([, key, list]) => [
              key,
              list.split(',').map((value) => value.trim().replace(/^'|'$/g, '')),
            ]),
          ),
        };
      });
  }

  /** The workflows and the local actions: every file in which a step can say `uses:`. */
  static automation() {
    return [
      ...RepositoryFiles.workflows(),
      ...RepositoryFiles.files('.github/actions')
        .filter((path) => path.endsWith('.yml'))
        .map((path) => ({ file: path, text: RepositoryFiles.read(path) })),
    ];
  }
}

/** What a Markdown file links to, and the anchors it offers. */
export class MarkdownDocument {
  constructor(path, text) {
    this.path = path;
    this.text = text;
  }

  /** A document as people wrote it, without the block that ai-memory keeps in it. */
  static of(path) {
    return new MarkdownDocument(path, RepositoryFiles.read(path).replace(AI_MEMORY_BLOCK, ''));
  }

  /** GitHub's anchor for a heading: lower case, punctuation gone, spaces as hyphens, a number after a repeat. */
  anchors() {
    const seen = new Map();
    return [...this.text.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6} +(.+?) *#*$/gm)].map(
      ([, heading]) => {
        const slug = heading
          .toLowerCase()
          .replace(/[^\p{L}\p{N} _-]/gu, '')
          .trim()
          .replace(/ /g, '-');
        const count = seen.get(slug) ?? 0;
        seen.set(slug, count + 1);
        return count ? `${slug}-${count}` : slug;
      },
    );
  }

  /** The local targets of the links and the images, in `[text](target)` and in `src`, `href` and `srcset` attributes. */
  localTargets() {
    const body = this.text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, ''); // code is not a link, even when it shows one
    const targets = [
      ...[...body.matchAll(/!?\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)].map(
        ([, target]) => target,
      ),
      ...[...body.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)].map(([, target]) => target),
    ];
    return targets.filter((target) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target));
  }

  /** The targets that lead nowhere: a file that is not there, or a heading that the file does not have. */
  brokenTargets() {
    const broken = [];
    for (const target of this.localTargets()) {
      const [file, fragment] = target.split('#');
      const resolved =
        file === ''
          ? this.path
          : relative(ROOT, resolve(ROOT, dirname(this.path), decodeURI(file)));
      if (!RepositoryFiles.exists(resolved)) {
        broken.push(target);
        continue;
      }
      if (
        fragment &&
        resolved.endsWith('.md') &&
        !MarkdownDocument.of(resolved).anchors().includes(fragment)
      )
        broken.push(target);
    }
    return broken;
  }
}
