// Measures the contrast of the running site, through the same ContrastAudit class the status page uses.
// A ContrastSweep drives a Playwright page; tools/contrast-audit.mjs is the command line around it and the E2E tests reuse it.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../source/', import.meta.url));

/** What one measurement says, small enough to cross from the page to Node. */
export class ContrastSweep {
  #page;
  #serving = false;

  constructor(page) {
    this.#page = page;
  }

  /**
   * The audit is a module of the site, which the production build folds into its one script and does not ship on its own: whatever
   * folder the page comes from, the modules of js/shared/ are brought to it from source/, and it measures the colors the page really has.
   */
  async #serveAuditModules() {
    if (this.#serving) return;
    this.#serving = true;
    await this.#page.route('**/js/shared/*.js', (route) => {
      const path = `${SOURCE}${new URL(route.request().url()).pathname.slice(1)}`;
      return existsSync(path)
        ? route.fulfill({ path, contentType: 'text/javascript' })
        : route.continue();
    });
  }

  /** Hues 0 to 360 in steps, with the default hue and both ends always included. */
  static hues(step = 1) {
    const hues = new Set([0, 128, 360]);
    for (let hue = 0; hue <= 360; hue += step) hues.add(hue);
    return [...hues].sort((a, b) => a - b);
  }

  /**
   * Animations and transitions off, so computed colors are the settled ones, and every section laid out.
   * A constructed style sheet, because the site's CSP does not allow an inline <style> element.
   */
  async prepare() {
    await this.#page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`
        #perfil, #arquitetura, #carga, #historico, #contato { content-visibility: visible !important; }
        *, *::before, *::after { animation: none !important; transition: none !important; }`);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
  }

  /** Measures the page as it is, in its current theme and hue. */
  async measure() {
    await this.#serveAuditModules();
    return this.#page.evaluate(async () => {
      const { ContrastAudit } = await import('/js/shared/contrast-audit.js');
      const report = new ContrastAudit().measure();
      return {
        count: report.count,
        skipped: report.skipped,
        enhanced: report.enhanced,
        lowestText: report.lowestText,
        lowestComponent: report.lowestComponent,
        labels: report.labels,
        failing: report.failing.map(
          ({ kind, labels, count, ratio, minimum, foreground, background }) => ({
            kind,
            labels,
            count,
            ratio,
            minimum,
            foreground,
            background,
          }),
        ),
      };
    });
  }

  /** Measures once for each hue in one theme. The hue is read from --hue on the root element, as the site does. */
  async sweep({ theme, hues = ContrastSweep.hues() }) {
    await this.#serveAuditModules();
    return this.#page.evaluate(
      async ({ theme, hues }) => {
        const { ContrastAudit } = await import('/js/shared/contrast-audit.js');
        const root = document.documentElement;
        const audit = new ContrastAudit();
        const previous = [root.dataset.theme, root.style.getPropertyValue('--hue')];
        root.dataset.theme = theme;
        const results = [];
        for (const hue of hues) {
          root.style.setProperty('--hue', hue);
          const report = audit.measure();
          const lowestOf = (kind) =>
            report.pairs
              .filter((pair) => pair.kind === kind && !pair.large)
              .reduce(
                (lowest, pair) => (!lowest || pair.ratio < lowest.ratio ? pair : lowest),
                null,
              );
          results.push({
            hue,
            count: report.count,
            skipped: report.skipped,
            enhanced: report.enhanced,
            lowestText: report.lowestText,
            lowestTextLabel: lowestOf('text')?.labels[0] ?? null,
            lowestComponent: report.lowestComponent,
            lowestComponentLabel: lowestOf('component')?.labels[0] ?? null,
            failing: report.failing.map(
              ({ kind, labels, count, ratio, minimum, foreground, background }) => ({
                kind,
                labels,
                count,
                ratio,
                minimum,
                foreground,
                background,
              }),
            ),
          });
        }
        root.dataset.theme = previous[0];
        root.style.setProperty('--hue', previous[1]);
        return results;
      },
      { theme, hues },
    );
  }
}
