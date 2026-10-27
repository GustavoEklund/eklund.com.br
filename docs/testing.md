# Testing

Tooling: pnpm and Vite+ (`vp` bundles Vitest 5 and Oxlint), Playwright, fast-check, Ajv, Cucumber, dependency-cruiser and Stryker. Install the browser once with `pnpm exec playwright install chromium`. Browsers run on software GL (SwiftShader), never on the GPU, so WebGL tests are deterministic and cost the desktop nothing.

```sh
pnpm test                 # lint, every Vitest project, BDD and E2E
pnpm run test:vitest      # unit, property, component, integration, contract, architecture and build together
pnpm run test:unit | test:property | test:component | test:integration | test:contract | test:architecture | test:build
pnpm run test:bdd         # Cucumber (Gherkin in Portuguese): domain and UI profiles
pnpm run test:e2e         # Playwright, desktop and mobile projects, against tools/serve.mjs on port 8735
pnpm run test:e2e:dist    # the same suite against the production build (SITE_ROOT=dist; build first)
pnpm run test:mutation    # Stryker over the modules that run in Node
pnpm run coverage         # v8 coverage over the Vitest projects, reports/coverage/index.html
pnpm run lint             # the strict assertion rules, on tests/
pnpm run adblock          # the site against EasyList, EasyPrivacy and the uBlock Origin lists (needs network the first time)
pnpm run lint:css         # Stylelint over source/**/*.css
pnpm run a11y             # axe-core, ARIA keyboard contracts and WCAG 2.2 criteria (Playwright)
pnpm run validate:html    # W3C Nu HTML Checker on the shipped and the rendered page (Java 17+)
pnpm run contrast         # WCAG 2.2 contrast of every color pair at 361 hues, both themes
pnpm run test:standards   # contract tests plus the fonts, security and i18n E2E specs
pnpm run proofread        # cspell: spelling of every text file, English and Brazilian Portuguese
pnpm run commit-gate      # the commit convention and spelling of a message (the hooks and CI call it)
pnpm run changelog check  # CHANGELOG.md keeps its format and matches package.json
pnpm run verify           # what the pre-push hook runs
pnpm run fmt              # Oxfmt over the project
```

| Kind           | Where                                      | What it checks                                                                                                                                                                                                   |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | `tests/js/<feature>/<module>.unit.test.js` | pure modules in Node + happy-dom: exact outputs, pinned golden values                                                                                                                                            |
| Property-based | `.property.test.js`                        | fast-check invariants with exact oracles (conservation of money, round trips, identities)                                                                                                                        |
| Component      | `.component.test.js`                       | classes that touch the DOM, in real Chromium through Vitest browser mode, with spies on every collaborator                                                                                                       |
| Integration    | `tests/integration/`                       | the pieces together: dictionaries against code and markup, `index.html` against the scripts, the real worker through `WorkerPool`, land data against globe geometry                                              |
| Contract       | `tests/contract/`                          | the worker message protocol as JSON Schemas (Ajv), consumer and provider sides, the headers, the JSON-LD, the head script, and the tools of `tools/` (`i18n-check`, `validate-html`, `commit-gate`, `changelog`) |
| Build          | `tests/build/`                             | what the production build makes: it builds the site into a temporary folder and checks the files, the pages against the source, the headers, the stylesheet, the manifest, the weight and the zip of a release   |
| Architecture   | `tests/architecture/`                      | dependency-cruiser rules (and proof that each rule fires), code conventions, test layout                                                                                                                         |
| BDD            | `tests/features/`                          | business rules in Gherkin: Pix engine, locale detection, ramp scenario; four browser journeys                                                                                                                    |
| E2E            | `tests/e2e/`                               | the whole page in Chromium: language, theme, palette, load test, map, accessibility (axe), layout shift, mobile                                                                                                  |
| Mutation       | `stryker.config.mjs`                       | whether the Node-side tests notice a changed line (HTML report in `reports/mutation/`)                                                                                                                           |

Rules for writing tests (the lint block in `vite.config.js` enforces most of them):

- **Exact assertions.** `toBe` / `toStrictEqual` with the full value, in order. No `toBeTruthy`, `toBeGreaterThan`, `toContain`, `toMatchObject`, `toEqual`, `not.toBe`, `expect.any`. Loops of range checks become "the list of violations is exactly `[]`".
- **Every collaborator is asserted:** `toHaveBeenCalledTimes(n)` plus `toHaveBeenNthCalledWith` for each call, and that unrelated collaborators were not called.
- **Floating point:** `toBeCloseTo` with at least ten digits; Float32 data against `Math.fround` of the expected value.
- **Known defects stay visible:** write the test for the correct behavior and mark it `it.fails` with a comment naming the defect. It passes while the defect exists and fails the day it is fixed, so the marker has to go.
- **Copy is not frozen:** texts come from the real dictionaries (`tests/support/dictionary-text.js` fills the `{placeholders}`), so editing wording does not break tests.
- **Listeners that outlive a test** (`install()` on `window`) are tracked with `tests/support/window-listeners.js` and removed afterwards.

Mutation testing runs through Stryker's command runner (`vitest run --bail 1` once per mutant). The Vitest runner plugin is not used because, with Vitest 5, it records coverage but never switches a mutant on.

## Test without opening a browser

```sh
node tools/serve.mjs --port 8734 &     # or pnpm dev
node tools/preview.mjs '{"w":1440,"h":900,"steps":[{"wait":4000},{"shot":"hero.png"}]}'
node tools/preview.mjs '{"w":390,"h":844,"dpr":2,"mobile":true,"steps":[{"wait":4000},{"scroll":2000},{"wait":500},{"shot":"m.png"}]}'
# the custom cursor and scrollbar need a fine pointer; headless Chrome has none, so force it:
node tools/preview.mjs '{"w":1440,"h":900,"flags":["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"],"steps":[{"wait":4000},{"mouse":[130,491]},{"wait":800},{"shot":"cursor.png"}]}'
```

Steps: `wait`, `shot`, `scroll`, `click` (selector), `mouse` ([x, y]), `down` / `up` / `drag`, `tap`, `key`, `eval` (JS, prints the result). Runtime errors print as `EXCEPTION:`. Sections use `content-visibility: auto`, so scroll twice and measure with `getBoundingClientRect` before trusting a position.
