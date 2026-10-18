/**
 * What ContrastAudit checks besides text, WCAG 2.2 1.4.11 Non-text Contrast (3:1): the parts of the interface
 * that carry state or data and the colors they are drawn with.
 * Left out on purpose, because a label or a number already says the same thing or they are decoration: the faint
 * borders and dividers (--line), the marquee, the globe and its arcs, the moving packets, the film grain, the
 * translucent bands of the trace (their durations are written in the columns), and the glow around a focused node.
 */
export class ContrastTargets {
  /**
   * Elements whose own paint (a background, a stroke) must stand out from what is behind them. `against` names the
   * surface tokens to use when the element floats over the page and its DOM parent is not what is behind it.
   */
  static COMPONENTS = [
    {
      label: 'active language',
      selector: '.locale-switcher a[aria-current="true"]',
      property: 'background-color',
    },
    {
      label: 'scrollbar thumb',
      selector: '.scrollbar-thumb',
      property: 'background-color',
      against: ['--bg', '--bg-2'],
    },
    {
      label: 'status strip',
      selector: '.status-cells i[data-level]',
      property: 'background-color',
    },
    { label: 'status dot', selector: '.status-dot', property: 'background-color' },
    {
      label: 'chart legend',
      selector: '.chart-legend i:not(.is-dashed)',
      property: 'background-color',
    },
    { label: 'chart line', selector: '.series-line', property: 'stroke' },
    { label: 'progress bar', selector: '.load-test-progress i', property: 'background-color' },
    { label: 'map edge', selector: '.edge', property: 'stroke' },
    { label: 'map health dot', selector: '.node-health', property: 'fill' },
    { label: 'map sparkline', selector: '.node-sparkline', property: 'stroke' },
    { label: 'uptime strip', selector: '.uptime-strip i', property: 'background-color' },
    { label: 'trace bar', selector: '.depth-2 .span-bar', property: 'background-color' },
    {
      label: 'icon',
      selector: 'button svg :is(path, circle, line), a svg :is(path, circle, line)',
      property: 'stroke',
    },
  ];

  /** Pairs of design tokens: a color that draws an indicator, and a surface it lands on. */
  static TOKENS = [
    { label: 'focus ring on page', foreground: '--accent', background: '--bg' },
    { label: 'focus ring on panel', foreground: '--accent', background: '--bg-2' },
  ];
}
