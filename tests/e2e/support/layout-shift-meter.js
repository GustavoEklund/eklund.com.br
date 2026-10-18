/** Records every layout shift the page makes without a recent user input, from the first paint on. */
export class LayoutShiftMeter {
  static async install(page) {
    await page.addInitScript(() => {
      window.__layoutShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput)
            window.__layoutShifts.push({
              value: entry.value,
              sources: entry.sources.map((source) =>
                source.node
                  ? `${source.node.nodeName.toLowerCase()}${source.node.id ? `#${source.node.id}` : ''}${source.node.classList?.length ? `.${[...source.node.classList].join('.')}` : ''}`
                  : null,
              ),
            });
      }).observe({ type: 'layout-shift', buffered: true });
    });
  }

  static shifts(page) {
    return page.evaluate(() => window.__layoutShifts);
  }
}
