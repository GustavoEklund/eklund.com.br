import AxeBuilder from '@axe-core/playwright';
import { InjectedStyle } from './injected-style.js';

/** Every rule that maps to a WCAG 2 success criterion up to level AA (2.0, 2.1 and 2.2), and axe's own best practices. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Runs axe-core over the whole page, with every lazily rendered section laid out first, and reports plain violations. */
export class AxeAudit {
  /** Sets the saved theme before the page loads, so there is no theme transition to wait for. */
  static async useTheme(page, theme) {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
  }

  static async run(page, { onlyRules, skipRules = [] } = {}) {
    // content-visibility: auto skips off-screen sections, and axe cannot see what is not rendered. Rendering them all
    // at once, instead of scrolling, also keeps the load test (which starts on scroll) out of the audit.
    // The reveal animations leave elements part-way transparent, and axe skips or weighs them differently from run to run,
    // so the audit looks at the page in its settled state, with every animation switched off.
    await InjectedStyle.add(
      page,
      `
      #perfil, #arquitetura, #carga, #historico, #contato { content-visibility: visible !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }`,
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const builder = new AxeBuilder({ page });
    if (onlyRules) builder.withRules(onlyRules);
    else builder.withTags(WCAG_TAGS);
    if (skipRules.length) builder.disableRules(skipRules);
    const { violations } = await builder.analyze();
    return violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
  }
}
