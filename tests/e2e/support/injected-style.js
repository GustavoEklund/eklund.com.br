/** CSS added to a page from a test. */
export class InjectedStyle {
  /**
   * Adds the rules through a constructed stylesheet. page.addStyleTag appends a <style> element, which the site's
   * Content-Security-Policy refuses (style-src has no 'unsafe-inline'); a constructed stylesheet is not a style element.
   */
  static add(page, css) {
    return page.evaluate((text) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }, css);
  }
}
