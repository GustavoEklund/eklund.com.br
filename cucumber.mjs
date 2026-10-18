// Profiles: `domain` drives the Pix engine and the pure rules in Node, `ui` drives the page through Playwright,
// and the default runs both.
//   pnpm exec cucumber-js
//   pnpm exec cucumber-js --profile domain
//   pnpm exec cucumber-js --profile ui
const common = {
  format: ['progress-bar', 'html:reports/cucumber/report.html'],
  language: 'pt',
};
const support = 'tests/features/support/**/*.js';

export default {
  ...common,
  paths: ['tests/features/domain/**/*.feature', 'tests/features/ui/**/*.feature'],
  import: [support, 'tests/features/steps/**/*.js'],
};

export const domain = {
  ...common,
  paths: ['tests/features/domain/**/*.feature'],
  import: [support, 'tests/features/steps/domain/**/*.js'],
};

export const ui = {
  ...common,
  paths: ['tests/features/ui/**/*.feature'],
  import: [support, 'tests/features/steps/ui/**/*.js'],
};
