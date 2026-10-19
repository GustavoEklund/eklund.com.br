import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';
import { PT_BR } from '@site/js/i18n/locales/pt-br.js';

// Every test here starts a process or makes a git repository, which a loaded machine does slowly.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const PROJECT = new URL('../../', import.meta.url).pathname;

class KeyCounter {
  static count(node) {
    return Object.values(node).reduce(
      (total, value) => total + (value && typeof value === 'object' ? KeyCounter.count(value) : 1),
      0,
    );
  }
}

/** A throwaway copy of the tool next to a copy of the site, so a broken dictionary can be provoked without touching the real one. */
class SiteCopy {
  root = mkdtempSync(join(tmpdir(), 'i18n-check-'));

  constructor() {
    for (const tool of ['i18n-check.mjs', 'html-defaults.mjs', 'english-page.mjs'])
      cpSync(join(PROJECT, 'tools', tool), join(this.root, 'tools', tool));
    cpSync(join(PROJECT, 'source', 'index.html'), join(this.root, 'source', 'index.html'));
    cpSync(join(PROJECT, 'source', 'en'), join(this.root, 'source', 'en'), { recursive: true });
    cpSync(join(PROJECT, 'source', 'js'), join(this.root, 'source', 'js'), { recursive: true });
  }

  edit(relativePath, change) {
    const path = join(this.root, 'source', relativePath);
    writeFileSync(path, change(readFileSync(path, 'utf8')));
  }

  run(...args) {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [join(this.root, 'tools', 'i18n-check.mjs'), ...args],
      { encoding: 'utf8' },
    );
    return { status, stdout, stderr };
  }

  remove() {
    rmSync(this.root, { recursive: true, force: true });
  }
}

describe('tools/i18n-check.mjs', () => {
  const KEYS = KeyCounter.count(PT_BR);

  it('exits 0 and reports every key of the real site with no errors and no warnings', () => {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [join(PROJECT, 'tools', 'i18n-check.mjs')],
      { encoding: 'utf8' },
    );
    expect({ status, stdout, stderr }).toStrictEqual({
      status: 0,
      stdout: `${KEYS} keys · 0 errors · 0 warnings\n`,
      stderr: '',
    });
  });

  describe('on a copy of the site', () => {
    const inCopy = (change) => {
      const copy = new SiteCopy();
      try {
        change(copy);
        const { status, stdout, stderr } = copy.run();
        return { status, stdout, stderr };
      } finally {
        copy.remove();
      }
    };

    it('exits 1 and names the key that exists in pt-BR but not in en-US', () => {
      const result = inCopy((copy) =>
        copy.edit('js/i18n/locales/en-us.js', (code) =>
          code.replace("    navigate: 'navigate',\n", ''),
        ),
      );
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr: 'error    missing in en-US: palette.navigate\n',
      });
    });

    it('exits 1 and shows both placeholder lists when a translation drops a {placeholder}', () => {
      const result = inCopy((copy) =>
        copy.edit('js/i18n/locales/en-us.js', (code) =>
          code.replace('Spin the globe to {city}', 'Spin the globe'),
        ),
      );
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr: 'error    placeholders differ: palette.commands.goHome.title  pt {city}  en {}\n',
      });
    });

    it('exits 1 when the code asks for a key that no dictionary defines', () => {
      const result = inCopy((copy) =>
        copy.edit(
          'js/main.js',
          (code) =>
            `${code}\nexport const probe = (translator) => translator.t('hero.nothingHere');\n`,
        ),
      );
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr: 'error    referenced but not defined: hero.nothingHere\n',
      });
    });

    it('exits 1 when the pt-BR text in index.html no longer matches the dictionary', () => {
      const result = inCopy((copy) =>
        copy.edit('index.html', (code) => code.replace('Nada por aqui.', 'Nada aqui.')),
      );
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr:
          'error    index.html default differs from pt-BR (run with --fix-html): palette.empty\n',
      });
    });

    it('exits 1 when en/index.html is not what index.html and the en-US dictionary give', () => {
      const result = inCopy((copy) =>
        copy.edit('en/index.html', (code) => code.replace('Nothing here.', 'Nothing in here.')),
      );
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr:
          'error    en/index.html is not what index.html and en-US give (run with --fix-html)\n',
      });
    });

    it('exits 1 when en/index.html does not exist', () => {
      const result = inCopy((copy) => rmSync(join(copy.root, 'source', 'en'), { recursive: true }));
      expect(result).toStrictEqual({
        status: 1,
        stdout: `${KEYS} keys · 1 errors · 0 warnings\n`,
        stderr:
          'error    en/index.html is not what index.html and en-US give (run with --fix-html)\n',
      });
    });

    it('writes en/index.html again with --fix-html, as index.html and en-US give it', () => {
      const copy = new SiteCopy();
      try {
        const original = readFileSync(join(copy.root, 'source', 'en', 'index.html'), 'utf8');
        copy.edit('en/index.html', (code) => code.replace('Nothing here.', 'Nothing in here.'));
        const { status, stdout } = copy.run('--fix-html');
        expect([
          status,
          stdout,
          readFileSync(join(copy.root, 'source', 'en', 'index.html'), 'utf8') === original,
        ]).toStrictEqual([
          0,
          `index.html: 0 default texts rewritten from pt-BR\nen/index.html: written from index.html and en-US\n${KEYS} keys · 0 errors · 0 warnings\n`,
          true,
        ]);
      } finally {
        copy.remove();
      }
    });

    it('warns, and still exits 0, about a key nobody references', () => {
      const result = inCopy((copy) => {
        copy.edit('js/i18n/locales/pt-br.js', (code) =>
          code.replace(
            "    navigate: 'navegar',\n",
            "    navigate: 'navegar',\n    orphan: 'sem uso',\n",
          ),
        );
        copy.edit('js/i18n/locales/en-us.js', (code) =>
          code.replace(
            "    navigate: 'navigate',\n",
            "    navigate: 'navigate',\n    orphan: 'unused',\n",
          ),
        );
      });
      expect(result).toStrictEqual({
        status: 0,
        stdout: `${KEYS + 1} keys · 0 errors · 1 warnings\n`,
        stderr: 'warning  never referenced: palette.orphan\n',
      });
    });
  });
});
