// CSS lint: Stylelint's standard ruleset. The files are formatted by Oxfmt, so this only carries the rules that are about correctness and modern syntax.
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['dist/**', 'reports/**', 'node_modules/**', '.stryker-tmp/**'],
  rules: {
    // Off on purpose. It flags a base rule that follows a state rule for another element (`.js .hero:not(.is-revealed) .eyebrow`,
    // `.col-ruler i b` and `.trace-mark b` match different elements), and the fix, reordering, would change the cascade for no gain.
    'no-descending-specificity': null,
  },
};
