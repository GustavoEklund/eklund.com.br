// The commit convention (Conventional Commits 1.0.0), checked on the developer's machine by the commit-msg and pre-push hooks
// and in CI for every commit of a pull request and for its title. CONTRIBUTING.md explains it to a contributor.
const FEATURES = [
  'accessibility',
  'architecture-map',
  'command-palette',
  'contact',
  'cursor',
  'dashboard',
  'globe',
  'hero',
  'history',
  'i18n',
  'load-test',
  'marquee',
  'navigation',
  'scrollbar',
  'shared',
  'status-page',
  'theme',
  'trace-viewer',
];
// What a change can touch besides a feature of the site: tests/architecture tests tie FEATURES to the folders of source/js.
const AREAS = [
  'build',
  'ci',
  'deps',
  'docs',
  'hooks',
  'release',
  'security',
  'seo',
  'site',
  'tests',
  'tools',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [...FEATURES, ...AREAS]],
    'header-max-length': [2, 'always', 72],
    'subject-min-length': [2, 'always', 8],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
  helpUrl:
    'https://github.com/GustavoEklund/eklund.com.br/blob/main/CONTRIBUTING.md#commit-messages',
};
