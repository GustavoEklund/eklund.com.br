/**
 * Mutation testing runs on the modules that execute in Node; browser-only code is covered by E2E and component tests.
 *
 * The command runner starts `vitest run` once per mutant, with the mutant switched on by an environment variable.
 * The Vitest runner plugin is not used: with Vitest 5 it records coverage but never activates a mutant, so every
 * mutant survives. `--bail 1` stops a run at the first failing test, which is what kills a mutant.
 */
export default {
  testRunner: 'command',
  commandRunner: { command: 'pnpm exec vitest run --config vitest.mutation.config.js --bail 1' },
  coverageAnalysis: 'off',
  concurrency: 4,
  mutate: [
    'source/js/shared/math.js',
    'source/js/shared/svg-chart.js',
    'source/js/shared/format.js',
    'source/js/i18n/locale.js',
    'source/js/i18n/document-metadata.js',
    'source/js/i18n/translator.js',
    'source/js/load-test/ramp-scenario.js',
    'source/js/load-test/duration-summary.js',
    'source/js/load-test/series-resampler.js',
    'source/js/load-test/pix-engine.js',
    'source/js/architecture-map/orthogonal-path.js',
    'source/js/architecture-map/traffic-simulation.js',
    'source/js/globe/geometry.js',
    'source/js/globe/land-decoder.js',
    'source/js/dashboard/synthetic-day-series.js',
  ],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  // The sandbox copy only needs the sources and the Node-side tests; reports and browser suites change while other tools run.
  ignorePatterns: [
    'reports',
    'test-results',
    '.vitest',
    '.stryker-tmp',
    '.idea',
    'tools',
    'tests/e2e',
    'tests/features',
    'tests/contract',
  ],
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  timeoutMS: 60000,
  thresholds: { high: 90, low: 75, break: 70 },
};
