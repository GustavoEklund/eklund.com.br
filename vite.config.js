import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

const SOURCE = fileURLToPath(new URL('./source', import.meta.url));

/** One Vitest project per kind of test; the file suffix says which project runs a file. */
const node = (name, include, environment = 'node') => ({
  extends: true,
  test: { name, include, environment },
});
// Software GL keeps WebGL deterministic and off the developer's GPU.
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const browser = (name, include) => ({
  extends: true,
  test: {
    name,
    include,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { args: SOFTWARE_GL } }),
      instances: [{ browser: 'chromium' }],
      viewport: { width: 1280, height: 800 },
    },
  },
});

/** Matchers that pass for many different values. A test says exactly what it expects, in the order it expects it. */
const WEAK_MATCHERS = {
  toBeTruthy: 'Assert the exact value: toBe(true) or the full expected value.',
  toBeFalsy: 'Assert the exact value: toBe(false), toBeNull() or the full expected value.',
  toBeDefined: 'Assert the exact value instead of "anything but undefined".',
  toBeGreaterThan: 'Assert the exact number with toBe, or derive it from an oracle.',
  toBeGreaterThanOrEqual: 'Assert the exact number with toBe, or derive it from an oracle.',
  toBeLessThan: 'Assert the exact number with toBe, or derive it from an oracle.',
  toBeLessThanOrEqual: 'Assert the exact number with toBe, or derive it from an oracle.',
  toContain: 'Assert the whole array or string with toStrictEqual / toBe, in order.',
  toContainEqual: 'Assert the whole array with toStrictEqual, in order.',
  toContainText: 'Assert the whole text with toHaveText.',
  toMatch: 'Assert the whole string with toBe.',
  toMatchObject: 'Assert the whole object with toStrictEqual so extra fields fail.',
  toEqual: 'Use toStrictEqual: it also checks undefined fields and types.',
  toHaveBeenCalled: 'Assert toHaveBeenCalledTimes(n) and every call with toHaveBeenNthCalledWith.',
  toHaveBeenCalledWith:
    'Assert toHaveBeenCalledTimes(n) and every call with toHaveBeenNthCalledWith.',
  toHaveBeenLastCalledWith:
    'Assert toHaveBeenCalledTimes(n) and every call with toHaveBeenNthCalledWith.',
  'not.toBe': 'A negative passes for every other value. Assert the value that is expected.',
  'not.toStrictEqual':
    'A negative passes for every other value. Assert the value that is expected.',
  'not.toBeNull': 'A negative passes for every other value. Assert the value that is expected.',
  'not.toBeUndefined':
    'A negative passes for every other value. Assert the value that is expected.',
  'not.toBeCloseTo': 'A negative passes for every other value. Assert the value that is expected.',
};

export default defineConfig({
  // Oxfmt, which follows Prettier's style. The generated land data and the HTML that tools/i18n-check.mjs rewrites (index.html and en/index.html) stay as they are.
  fmt: {
    singleQuote: true,
    printWidth: 100,
    ignorePatterns: [
      'source/index.html',
      'source/en/index.html',
      'dist/**',
      'source/js/globe/land-bitset.js',
      'tools/land.json',
      'pnpm-lock.yaml',
      'reports/**',
      '.stryker-tmp/**',
      '.vitest/**',
      // What `ai-memory install-instructions` writes and rewrites on every refresh. Its block in AGENTS.md sits between
      // prettier-ignore comments instead, because the rest of that file is ours.
      '.claude/skills/ai-memory-*/**',
      '.agents/skills/ai-memory-*/**',
    ],
  },
  // What `vp staged` runs on the files of a commit (the pre-commit hook). The slower suites run on push and in CI.
  staged: {
    '*.{js,mjs,cjs}': [
      'vp check --fix',
      'vp test related --run --passWithNoTests --project unit --project property --project integration --project architecture',
    ],
    '*.{json,css,md,yml,yaml}': 'vp fmt',
    'source/{index.html,js/i18n/locales/*.js}': 'node tools/i18n-check.mjs',
    '*': 'cspell lint --no-progress --no-summary --no-must-find-files',
  },
  lint: {
    ignorePatterns: [
      'source/js/globe/land-bitset.js',
      'dist/**',
      'reports/**',
      'node_modules/**',
      '.stryker-tmp/**',
    ],
    overrides: [
      {
        files: ['tests/**'],
        plugins: ['vitest'],
        rules: {
          'vitest/no-restricted-matchers': ['error', WEAK_MATCHERS],
          'vitest/prefer-strict-equal': 'error',
          'vitest/require-to-throw-message': 'error',
          'vitest/no-conditional-expect': 'error',
          'vitest/no-conditional-tests': 'error',
          'vitest/expect-expect': 'error',
          'vitest/valid-expect': ['error', { maxArgs: 2 }],
          'vitest/no-standalone-expect': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/no-disabled-tests': 'error',
          'vitest/no-focused-tests': 'error',
        },
      },
    ],
  },
  resolve: { alias: { '@site': SOURCE } },
  test: {
    setupFiles: [],
    coverage: {
      provider: 'v8',
      include: ['source/js/**/*.js'],
      exclude: ['source/js/globe/land-bitset.js'],
      reportsDirectory: 'reports/coverage',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
    },
    projects: [
      node('unit', ['tests/js/**/*.unit.test.js'], 'happy-dom'),
      node('property', ['tests/js/**/*.property.test.js']),
      browser('component', ['tests/js/**/*.component.test.js']),
      node('integration', ['tests/integration/**/*.integration.test.js'], 'happy-dom'),
      browser('integration-browser', ['tests/integration/**/*.integration.browser.test.js']),
      node('contract', ['tests/contract/**/*.contract.test.js']),
      node('architecture', ['tests/architecture/**/*.architecture.test.js']),
      node('build', ['tests/build/**/*.build.test.js']),
    ],
  },
});
