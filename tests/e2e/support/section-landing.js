/** How close a jump to a section puts it to the top of the window, the scroll margin of the sticky header counted. */
export class SectionLanding {
  /**
   * The placeholder of a section that has not rendered yet is only as good as its calibration (tools/measure-sections.mjs), so a
   * first jump may end a pixel or two away. Beyond that the jump missed, and the section is not where the visitor was sent.
   */
  static SLACK_PX = 2;

  /**
   * How far the section ended up from where it belongs, once the scroll has stopped: 0 within the slack, and 0 for a section that
   * cannot rise any further because the page ends (the last one), otherwise the signed distance in pixels.
   */
  static async miss(site, id) {
    await site.waitForScrollToStop();
    return site.page.evaluate(
      ([selector, slack]) => {
        const section = document.querySelector(selector);
        const margin = Math.round(parseFloat(getComputedStyle(section).scrollMarginTop) || 0);
        const offset = Math.round(section.getBoundingClientRect().top) - margin;
        const atBottom =
          Math.round(scrollY + innerHeight) === document.documentElement.scrollHeight;
        return Math.abs(offset) <= slack || (atBottom && offset > 0) ? 0 : offset;
      },
      [`#${id}`, SectionLanding.SLACK_PX],
    );
  }
}
