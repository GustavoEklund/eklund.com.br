/** Architecture rules for source/js: Screaming Architecture with features that only know shared/ and i18n/. */
const FEATURES =
  'architecture-map|command-palette|contact|cursor|dashboard|globe|hero|history|load-test|marquee|navigation|scrollbar|status-page|theme|trace-viewer';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Modules must not depend on each other in a loop.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-feature-to-feature',
      severity: 'error',
      comment: 'A feature may only use shared/ and i18n/. Only main.js composes features.',
      from: { path: `^source/js/(${FEATURES})/` },
      to: { path: `^source/js/(${FEATURES})/`, pathNot: '^source/js/$1/' },
    },
    {
      name: 'shared-stays-low-level',
      severity: 'error',
      comment: 'shared/ must not reach into a feature.',
      from: { path: '^source/js/shared/' },
      to: { path: `^source/js/(${FEATURES})/` },
    },
    {
      name: 'i18n-stays-low-level',
      severity: 'error',
      comment: 'i18n/ must not reach into a feature.',
      from: { path: '^source/js/i18n/' },
      to: { path: `^source/js/(${FEATURES})/` },
    },
    {
      name: 'nothing-imports-main',
      severity: 'error',
      comment: 'main.js is the composition root.',
      from: { pathNot: '^source/js/main\\.js$' },
      to: { path: '^source/js/main\\.js$' },
    },
    {
      name: 'no-dependencies',
      severity: 'error',
      comment: 'The site ships without runtime dependencies.',
      from: { path: '^source/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-unknown', 'core'],
      },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'Every module is imported by something. The worker is spawned by URL, so it is exempt.',
      from: {
        orphan: true,
        path: '^source/js/',
        pathNot: ['^source/js/main\\.js$', '^source/js/load-test/pix-engine\\.worker\\.js$'],
      },
      to: {},
    },
    {
      name: 'tests-not-in-source',
      severity: 'error',
      comment: 'Tests live in tests/, never in source/.',
      from: { path: '^source/' },
      to: { path: '^tests/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^source/js/globe/land-bitset\\.js$' },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
  },
};
