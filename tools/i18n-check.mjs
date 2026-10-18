// usage: node tools/i18n-check.mjs
// Verifies the dictionaries: same keys in both locales, same {placeholders}, every key the markup or the code asks for exists,
// every key is used somewhere, and the pt-BR text written in index.html (what shows before the JS runs and what crawlers read)
// matches the dictionary. Exit code 1 when something is wrong.
// usage: node tools/i18n-check.mjs [--fix-html]   --fix-html rewrites the index.html defaults from the pt-BR dictionary and
// writes en/index.html, the English version of the page, from index.html and the en-US dictionary.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DictionaryLoader, HtmlDefaults, KeyFlattener, SOURCE_ROOT } from './html-defaults.mjs';
import { EnglishPage } from './english-page.mjs';

const ROOT = SOURCE_ROOT;

class KeyReferences {
  literals = new Set();
  prefixes = new Set();
  #namespaces;

  constructor(namespaces) {
    this.#namespaces = namespaces;
  }

  static scan(namespaces) {
    const references = new KeyReferences(namespaces);
    references.#scanHtml(readFileSync(join(ROOT, 'index.html'), 'utf8'));
    for (const file of KeyReferences.#sourceFiles(join(ROOT, 'js'))) {
      if (file.includes(join('js', 'i18n', 'locales'))) continue;
      references.#scanCode(readFileSync(file, 'utf8'));
    }
    return references;
  }

  isUsed(key) {
    for (const literal of this.literals)
      if (key === literal || key.startsWith(`${literal}.`)) return true;
    for (const prefix of this.prefixes) if (key.startsWith(prefix)) return true;
    return false;
  }

  #scanHtml(html) {
    for (const [, key] of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) this.literals.add(key);
    for (const [, pairs] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of pairs.split(';'))
        if (pair.includes(':')) this.literals.add(pair.slice(pair.indexOf(':') + 1).trim());
    }
  }

  #scanCode(code) {
    for (const [, key] of code.matchAll(
      /\b(?:t|plural|bind|translate|translatePlural)\(\s*'([\w.]+)'/g,
    ))
      this.literals.add(key);
    for (const [, key] of code.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) this.literals.add(key);
    for (const [, prefix] of code.matchAll(/`((?:[\w]+\.)+)\$\{/g)) this.prefixes.add(prefix);
    for (const [, key] of code.matchAll(/'((?:[a-z]\w*\.)+[a-z]\w*)'/g))
      if (this.#isInNamespace(key)) this.literals.add(key);
    for (const [, prefix] of code.matchAll(/'((?:[a-z]\w*\.)+)'\s*\+/g))
      if (this.#isInNamespace(prefix)) this.prefixes.add(prefix);
  }

  #isInNamespace(key) {
    return this.#namespaces.has(key.split('.')[0]);
  }

  static #sourceFiles(directory) {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory()
        ? KeyReferences.#sourceFiles(path)
        : path.endsWith('.js')
          ? [path]
          : [];
    });
  }
}

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

const [portuguese, english] = await Promise.all([
  DictionaryLoader.load('js/i18n/locales/pt-br.js', 'PT_BR').then((dictionary) =>
    KeyFlattener.flatten(dictionary),
  ),
  DictionaryLoader.load('js/i18n/locales/en-us.js', 'EN_US').then((dictionary) =>
    KeyFlattener.flatten(dictionary),
  ),
]);
const indexPath = join(ROOT, 'index.html');
const englishPath = join(ROOT, 'en', 'index.html');
const synced = HtmlDefaults.sync(readFileSync(indexPath, 'utf8'), portuguese);
const englishPage = EnglishPage.render(synced.html, english);
if (process.argv.includes('--fix-html')) {
  writeFileSync(indexPath, synced.html);
  mkdirSync(dirname(englishPath), { recursive: true });
  writeFileSync(englishPath, englishPage);
  console.log(`index.html: ${synced.differences.length} default texts rewritten from pt-BR`);
  console.log('en/index.html: written from index.html and en-US');
}
const references = KeyReferences.scan(
  new Set([...portuguese.keys()].map((key) => key.split('.')[0])),
);
const errors = [],
  warnings = [];

for (const key of portuguese.keys()) if (!english.has(key)) errors.push(`missing in en-US: ${key}`);
for (const key of english.keys()) if (!portuguese.has(key)) errors.push(`missing in pt-BR: ${key}`);
for (const [key, text] of portuguese)
  if (english.has(key) && placeholders(text) !== placeholders(english.get(key)))
    errors.push(
      `placeholders differ: ${key}  pt {${placeholders(text)}}  en {${placeholders(english.get(key))}}`,
    );
for (const key of references.literals)
  if (!portuguese.has(key) && ![...portuguese.keys()].some((known) => known.startsWith(`${key}.`)))
    errors.push(`referenced but not defined: ${key}`);
for (const key of portuguese.keys())
  if (!references.isUsed(key)) warnings.push(`never referenced: ${key}`);

if (!process.argv.includes('--fix-html'))
  for (const key of synced.differences)
    errors.push(`index.html default differs from pt-BR (run with --fix-html): ${key}`);

// Only when everything else is in order: with a key missing the English page differs for that reason, which is already reported.
if (
  !process.argv.includes('--fix-html') &&
  !errors.length &&
  (!existsSync(englishPath) || readFileSync(englishPath, 'utf8') !== englishPage)
)
  errors.push('en/index.html is not what index.html and en-US give (run with --fix-html)');

for (const line of warnings) console.warn(`warning  ${line}`);
for (const line of errors) console.error(`error    ${line}`);
console.log(`${portuguese.size} keys · ${errors.length} errors · ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
