/**
 * What the collector keeps of a User-Agent: whether it is a robot, the kind of device, and the browser with its major version.
 * The string itself is never stored.
 */
export class VisitorAgent {
  /** Crawlers, link previews, monitors, scripts and automated browsers, Lighthouse and PageSpeed Insights among them. */
  static ROBOT =
    /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|embedly|whatsapp|telegram|discord|curl\/|wget\/|python|java\/|go-http|axios\/|node-fetch|undici/i;

  /** In order: Edge, Opera and Samsung Internet also say Chrome, and Chrome also says Safari. */
  static BROWSERS = [
    ['edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['opera', /(?:OPR|OPT|Opera)\/(\d+)/],
    ['samsung', /SamsungBrowser\/(\d+)/],
    ['firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['safari', /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
  ];

  static TABLET = /iPad|Tablet|PlayBook|Silk\/|Android(?!.*Mobile)/i;
  static PHONE = /Mobi|iPhone|iPod|Windows Phone/i;

  /** `mobileHint` is the Sec-CH-UA-Mobile header that Chromium sends: `?1` on a phone. */
  static of(userAgent, mobileHint = null) {
    const [browser, version] = VisitorAgent.#browser(userAgent);
    return {
      robot: userAgent.trim() === '' || VisitorAgent.ROBOT.test(userAgent),
      device: VisitorAgent.TABLET.test(userAgent)
        ? 'tablet'
        : VisitorAgent.PHONE.test(userAgent) || mobileHint === '?1'
          ? 'phone'
          : 'desktop',
      browser,
      version,
    };
  }

  static #browser(userAgent) {
    for (const [name, pattern] of VisitorAgent.BROWSERS) {
      const match = pattern.exec(userAgent);
      if (match) return [name, Number(match[1])];
    }
    return ['other', null];
  }
}
