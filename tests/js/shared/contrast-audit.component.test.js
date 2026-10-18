import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContrastAudit } from '@site/js/shared/contrast-audit.js';
import { ContrastTargets } from '@site/js/shared/contrast-targets.js';
import { Contrast } from '@site/js/shared/contrast.js';

const GREY_767676 = { r: 118, g: 118, b: 118, a: 1 };
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const FRAME = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe('ContrastAudit', () => {
  const originalComponents = ContrastTargets.COMPONENTS;
  const originalTokens = ContrastTargets.TOKENS;
  let sheet;

  /** Renders a page (the body markup and the CSS) and measures it; `tokens` and `components` replace the site's targets. */
  const measure = (html, css = '', { audit = new ContrastAudit(), mode = 'sync' } = {}) => {
    sheet.textContent = `html, body { margin: 0; background: #fff; color: #000; } ${css}`;
    document.body.innerHTML = html;
    return mode === 'sync' ? audit.measure() : audit.measureWithoutBlocking();
  };
  const texts = (report) => report.pairs.filter((pair) => pair.kind === 'text');
  /** What a test says about a pair: everything but the elements' labels and the float noise of the ratio. */
  const summary = (pair) => ({
    kind: pair.kind,
    large: pair.large,
    minimum: pair.minimum,
    enhanced: pair.enhanced,
    count: pair.count,
    foreground: pair.foreground,
    background: pair.background,
  });

  beforeEach(() => {
    sheet = document.createElement('style');
    document.head.append(sheet);
    ContrastTargets.COMPONENTS = [];
    ContrastTargets.TOKENS = [];
  });

  afterEach(() => {
    sheet.remove();
    document.body.innerHTML = '';
    ContrastTargets.COMPONENTS = originalComponents;
    ContrastTargets.TOKENS = originalTokens;
    vi.restoreAllMocks();
  });

  describe('text', () => {
    it('pairs the color of a text with the background it sits on, and judges it against 4.5:1', () => {
      const [pair] = texts(measure('<p style="color:#767676;font-size:16px">Aa</p>')).map((p) => p);
      expect(summary(pair)).toStrictEqual({
        kind: 'text',
        large: false,
        minimum: 4.5,
        enhanced: 7,
        count: 1,
        foreground: GREY_767676,
        background: WHITE,
      });
      expect(pair.ratio).toBeCloseTo(4.542224959605253, 12);
      expect(pair.label).toBe('p');
    });

    it('reports the failing side of the line: #777 on white is under 4.5', () => {
      const report = measure('<p style="color:#777777">Aa</p>');
      expect(report.failing.map((pair) => pair.ratio)).toStrictEqual([4.478089453577214]);
      expect([report.count, report.passing]).toStrictEqual([1, 0]);
    });

    it("takes the background from the nearest ancestor that paints one, and the element's own first", () => {
      const html =
        '<section style="background:#000"><div style="background:#fff"><p style="color:#767676">a</p></div><p style="color:#fff">b</p></section>';
      expect(texts(measure(html)).map((pair) => [pair.foreground, pair.background])).toStrictEqual([
        [GREY_767676, WHITE],
        [WHITE, { r: 0, g: 0, b: 0, a: 1 }],
      ]);
    });

    it('lays a translucent background over what is behind it', () => {
      const html = '<div style="background:rgb(0 0 0 / .12)"><p style="color:#000">a</p></div>';
      expect(texts(measure(html))[0].background).toStrictEqual({ r: 224, g: 224, b: 224, a: 1 });
    });

    it('lays a translucent text color over its background', () => {
      const [pair] = texts(measure('<p style="color:rgb(0 0 0 / .5)">a</p>'));
      expect(pair.foreground).toStrictEqual({ r: 0, g: 0, b: 0, a: 0.5 });
      expect(pair.ratio).toBe(Contrast.ratio({ r: 128, g: 128, b: 128, a: 1 }, WHITE));
    });

    it('counts the first color of a linear gradient as the background, and ignores a radial one', () => {
      const html =
        '<header style="background:linear-gradient(rgb(255 0 0), transparent)"><p style="color:#fff">a</p></header><div style="background:radial-gradient(#000 1px, transparent 1px)"><p style="color:#000">b</p></div>';
      expect(texts(measure(html)).map((pair) => pair.background)).toStrictEqual([
        { r: 255, g: 0, b: 0, a: 1 },
        WHITE,
      ]);
    });

    it('multiplies the opacity of the element and its ancestors into the text color', () => {
      const [pair] = texts(
        measure('<div style="opacity:.5"><p style="color:#000;opacity:.5">a</p></div>'),
      );
      expect(pair.foreground).toStrictEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    });

    it('does not count an element whose opacity is zero', () => {
      expect(measure('<p style="opacity:0">a</p>').count).toBe(0);
    });

    it('treats an element whose opacity is animated as settled, at 1', async () => {
      const html = '<p style="color:#000;animation:fade 10s linear both">a</p>';
      const report = measure(html, '@keyframes fade { from { opacity: 0 } }');
      await FRAME();
      expect(texts(report)[0].foreground).toStrictEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(
        texts(measure(html, '@keyframes fade { from { opacity: 0 } }'))[0].foreground,
      ).toStrictEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it.each([
      ['display: none', '<p style="display:none">a</p>'],
      ['visibility: hidden', '<p style="visibility:hidden">a</p>'],
      ['the hidden attribute', '<p hidden>a</p>'],
      ['a hidden ancestor', '<div style="display:none"><p>a</p></div>'],
      ['a disabled button', '<button disabled>a</button>'],
      [
        'a button marked aria-disabled, which is inactive too',
        '<button aria-disabled="true">a</button>',
      ],
      ['a script and a style', '<script>1</script><style>p{}</style>'],
      ['whitespace', '<p>   </p>'],
      ['an element with no text of its own', '<div><span></span></div>'],
    ])('leaves out %s', (_name, html) => expect(measure(html).count).toBe(0));

    it('judges large text against 3:1: 24 px at any weight, 18.67 px in bold', () => {
      const html =
        '<p style="font-size:24px;color:#949494">a</p><p style="font-size:18.67px;font-weight:700;color:#949494">b</p><p style="font-size:18.66px;font-weight:700;color:#949494">c</p>';
      const report = measure(html);
      expect(
        report.pairs.map((pair) => [pair.large, pair.minimum, pair.enhanced, pair.count]),
      ).toStrictEqual([
        [true, 3, 4.5, 2],
        [false, 4.5, 7, 1],
      ]);
      expect(report.failing.map((pair) => pair.count)).toStrictEqual([1]);
    });

    it('measures a typed value and, when there is none, the placeholder, with its own color', () => {
      const css = 'input { font-size: 16px; color: #000 } input::placeholder { color: #777 }';
      const typed = texts(measure('<input value="abc" placeholder="p">', css));
      expect(typed.map((pair) => [pair.label, pair.foreground])).toStrictEqual([
        ['input', { r: 0, g: 0, b: 0, a: 1 }],
      ]);
      const placeholder = texts(measure('<input placeholder="p">', css));
      expect(placeholder.map((pair) => [pair.label, pair.foreground])).toStrictEqual([
        ['input::placeholder', { r: 119, g: 119, b: 119, a: 1 }],
      ]);
    });

    it('describes elements by tag, with the id or the first class', () => {
      const report = measure(
        '<p id="intro" class="a b">x</p><span class="note extra">y</span><b style="color:#222">z</b>',
      );
      expect(report.pairs.map((pair) => pair.labels)).toStrictEqual([
        ['p#intro', 'span.note'],
        ['b'],
      ]);
    });

    it('merges identical combinations into one pair, counting them and keeping the first six distinct labels', () => {
      const html =
        Array.from({ length: 9 }, (_, index) => `<i class="n${index}">x</i>`).join('') +
        '<i class="n0">again</i>';
      const [pair] = measure(html).pairs;
      expect([pair.count, pair.labels]).toStrictEqual([
        10,
        ['i.n0', 'i.n1', 'i.n2', 'i.n3', 'i.n4', 'i.n5'],
      ]);
    });

    it('names a label once however many elements share it', () => {
      const [pair] = measure(
        '<i class="same">a</i><i class="same">b</i><i class="same">c</i>',
      ).pairs;
      expect([pair.count, pair.labels]).toStrictEqual([3, ['i.same']]);
    });

    it('keeps combinations apart when the foreground, the background or the size differs', () => {
      const html =
        '<p>a</p><p style="color:#333">b</p><p style="background:#eee">c</p><p style="font-size:30px">d</p>';
      expect(measure(html).count).toBe(4);
    });

    it('counts a color it cannot read as skipped, without a pair', () => {
      const report = measure('<p style="color:lab(50% 0 0)">a</p>');
      expect([report.count, report.skipped]).toStrictEqual([0, 1]);
    });
  });

  describe('text from content', () => {
    it('measures what a rule puts in ::before and ::after, and nothing for an empty or absent content', () => {
      const css =
        '.mark::before { content: "★"; color: #777 } .after::after { content: attr(data-label); color: #333 } .empty::before { content: ""; color: red } .none::after { content: none }';
      const report = measure(
        '<span class="mark">a</span><span class="after" data-label="x">b</span><span class="empty">c</span><span class="none">d</span>',
        css,
      );
      expect(texts(report).map((pair) => [pair.labels, pair.foreground])).toStrictEqual([
        [['span.mark', 'span.after', 'span.empty', 'span.none'], { r: 0, g: 0, b: 0, a: 1 }],
        [['span.mark::before'], { r: 119, g: 119, b: 119, a: 1 }],
        [['span.after::after'], { r: 51, g: 51, b: 51, a: 1 }],
      ]);
    });

    it('leaves out a rule whose selector the document cannot query (a namespaced one), and still measures the others', () => {
      sheet.textContent =
        '@namespace svg url(http://www.w3.org/2000/svg); html, body { margin: 0; background: #fff; color: #000 } svg|a::before { content: "x"; color: #777 } .ok::before { content: "y"; color: #333 }';
      document.body.innerHTML = '<span class="ok">a</span>';
      const report = new ContrastAudit().measure();
      expect(texts(report).map((pair) => [pair.labels, pair.foreground])).toStrictEqual([
        [['span.ok'], { r: 0, g: 0, b: 0, a: 1 }],
        [['span.ok::before'], { r: 51, g: 51, b: 51, a: 1 }],
      ]);
    });

    it('looks up the element of a :hover rule, and finds the content only while it applies', () => {
      const css = '.go:hover::after { content: " ▸"; color: #333 }';
      expect(
        texts(measure('<span class="go">b</span>', css)).map((pair) => pair.labels),
      ).toStrictEqual([['span.go']]);
    });

    it('measures a positioned box on its own background over what is behind the element, not over the element', () => {
      const css =
        'i { position: relative; display: block; width: 1px; height: 1px; background: #000 } i::after { content: "label"; position: absolute; left: 10px; color: #777; background: #fff }';
      const [pair] = texts(measure('<i></i>', css)).filter(
        (entry) => entry.labels[0] === 'i::after',
      );
      expect(pair.background).toStrictEqual(WHITE);
    });

    it('measures an inline box over the element it is in', () => {
      const css = 'b { background: #000 } b::before { content: "x"; color: #fff }';
      const [pair] = texts(measure('<b></b>', css));
      expect([pair.foreground, pair.background]).toStrictEqual([WHITE, { r: 0, g: 0, b: 0, a: 1 }]);
    });

    it('finds the rules inside @layer, @media and @supports', () => {
      const css =
        '@layer base { @media all { @supports (color: red) { .deep::before { content: "d"; color: #777 } } } }';
      expect(
        texts(measure('<span class="deep">a</span>', css)).map((pair) => pair.labels),
      ).toStrictEqual([['span.deep'], ['span.deep::before']]);
    });

    it('ignores a pseudo-element that is display: none', () => {
      expect(
        texts(measure('<span class="x"></span>', '.x::before { content: "x"; display: none }'))
          .length,
      ).toBe(0);
    });
  });

  describe('SVG', () => {
    const svg = (body) =>
      `<div style="background:#fff"><svg width="200" height="100">${body}</svg></div>`;

    it('reads the fill of a label, over the rectangle painted just before it', () => {
      const [pair] = texts(
        measure(
          svg(
            '<g><rect width="100" height="50" fill="#000"/><text x="5" y="20" fill="#fff">n</text></g>',
          ),
        ),
      );
      expect([pair.labels, pair.foreground, pair.background]).toStrictEqual([
        ['text'],
        WHITE,
        { r: 0, g: 0, b: 0, a: 1 },
      ]);
    });

    it('uses the last rectangle before the label, not one painted after it', () => {
      const body =
        '<g><rect width="10" height="10" fill="#f00"/><rect width="10" height="10" fill="#00f"/><text fill="#fff">n</text><rect width="10" height="10" fill="#0f0"/></g>';
      expect(texts(measure(svg(body)))[0].background).toStrictEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it('lays a rectangle with fill-opacity over the surface behind the graphic', () => {
      const [pair] = texts(
        measure(
          svg(
            '<g><rect width="10" height="10" fill="#000" fill-opacity=".12"/><text fill="#000">n</text></g>',
          ),
        ),
      );
      expect(pair.background).toStrictEqual({ r: 224, g: 224, b: 224, a: 1 });
    });

    it('skips a rectangle with no fill, and a group with no rectangle, and uses the page behind', () => {
      const body =
        '<g><rect width="10" height="10" fill="none"/><text fill="#000">a</text></g><text fill="#000" fill-opacity=".5" y="40">b</text>';
      expect(
        texts(measure(svg(body))).map((pair) => [pair.foreground, pair.background]),
      ).toStrictEqual([
        [{ r: 0, g: 0, b: 0, a: 1 }, WHITE],
        [{ r: 0, g: 0, b: 0, a: 0.5 }, WHITE],
      ]);
    });
  });

  describe('components', () => {
    it('pairs the paint of an element with what is behind it, and judges it against 3:1', () => {
      ContrastTargets.COMPONENTS = [
        { label: 'badge', selector: '.badge', property: 'background-color' },
      ];
      const report = measure(
        '<div style="background:#fff"><i class="badge" style="display:block;width:4px;height:4px;background:#767676"></i></div>',
      );
      expect(report.pairs.map(summary)).toStrictEqual([
        {
          kind: 'component',
          large: false,
          minimum: 3,
          enhanced: 3,
          count: 1,
          foreground: GREY_767676,
          background: WHITE,
        },
      ]);
      expect(report.pairs[0].label).toBe('badge');
    });

    it('fails a component under 3:1', () => {
      ContrastTargets.COMPONENTS = [
        { label: 'badge', selector: '.badge', property: 'background-color' },
      ];
      const report = measure(
        '<i class="badge" style="display:block;width:4px;height:4px;background:#bbb"></i>',
      );
      expect(report.failing.map((pair) => pair.ratio)).toStrictEqual([
        Contrast.ratio({ r: 187, g: 187, b: 187, a: 1 }, WHITE),
      ]);
    });

    it('reads the stroke of an SVG shape, and skips a shape that has none', () => {
      ContrastTargets.COMPONENTS = [{ label: 'line', selector: 'path', property: 'stroke' }];
      const report = measure(
        '<svg width="50" height="50"><path d="M0 0L9 9" stroke="#000"/><path d="M0 0L9 9" stroke="none"/></svg>',
      );
      expect(
        report.pairs.map((pair) => [pair.label, pair.foreground, pair.background]),
      ).toStrictEqual([['line', { r: 0, g: 0, b: 0, a: 1 }, WHITE]]);
    });

    it('applies the stroke opacity', () => {
      ContrastTargets.COMPONENTS = [{ label: 'line', selector: 'path', property: 'stroke' }];
      const report = measure(
        '<svg width="50" height="50"><path d="M0 0L9 9" stroke="#000" stroke-opacity=".5"/></svg>',
      );
      expect(report.pairs[0].foreground).toStrictEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    });

    it('measures an SVG mark over the rectangle behind it in its group', () => {
      ContrastTargets.COMPONENTS = [{ label: 'dot', selector: 'circle', property: 'fill' }];
      const report = measure(
        '<svg width="50" height="50"><g><rect width="40" height="40" fill="#000"/><circle r="3" fill="#fff"/></g></svg>',
      );
      expect([report.pairs[0].foreground, report.pairs[0].background]).toStrictEqual([
        WHITE,
        { r: 0, g: 0, b: 0, a: 1 },
      ]);
    });

    it('measures a floating element against the surface tokens it names, not its parent', () => {
      ContrastTargets.COMPONENTS = [
        {
          label: 'thumb',
          selector: '.thumb',
          property: 'background-color',
          against: ['--surface-a', '--surface-b'],
        },
      ];
      const css =
        ':root { --surface-a: #ffffff; --surface-b: rgb(238 238 238) } .thumb { display: block; width: 4px; height: 4px; background: #767676 }';
      const report = measure('<div style="background:#000"><i class="thumb"></i></div>', css);
      expect(report.pairs.map((pair) => [pair.label, pair.background])).toStrictEqual([
        ['thumb', WHITE],
        ['thumb', { r: 238, g: 238, b: 238, a: 1 }],
      ]);
    });

    it('leaves out a component that is not shown', () => {
      ContrastTargets.COMPONENTS = [
        { label: 'badge', selector: '.badge', property: 'background-color' },
      ];
      expect(measure('<i class="badge" style="display:none;background:#000"></i>').count).toBe(0);
    });
  });

  describe('tokens', () => {
    it('resolves each pair through the custom properties, light-dark() included', () => {
      ContrastTargets.TOKENS = [{ label: 'ring', foreground: '--ring', background: '--page' }];
      const css =
        ':root { color-scheme: light; --ring: light-dark(#000, #fff); --page: light-dark(#fff, #000) }';
      const [pair] = measure('', css).pairs;
      expect([
        pair.label,
        pair.kind,
        pair.minimum,
        pair.foreground,
        pair.background,
        pair.ratio,
      ]).toStrictEqual(['ring', 'component', 3, { r: 0, g: 0, b: 0, a: 1 }, WHITE, 21]);
      const dark = measure(
        '',
        ':root { color-scheme: dark; --ring: light-dark(#000, #fff); --page: light-dark(#fff, #000) }',
      ).pairs[0];
      expect([dark.foreground, dark.background]).toStrictEqual([WHITE, { r: 0, g: 0, b: 0, a: 1 }]);
    });

    it('leaves the page as it found it: no probe element stays behind', () => {
      ContrastTargets.TOKENS = [{ label: 'ring', foreground: '--a', background: '--b' }];
      measure('<p>x</p>', ':root { --a: #000; --b: #fff }');
      expect([
        document.body.children.length,
        document.body.firstElementChild.tagName,
      ]).toStrictEqual([1, 'P']);
    });
  });

  describe('transitions', () => {
    const css = 'p { transition: color 1000000s linear }'; // so long that no slow machine gets it a whole step away from black

    it('reads a color that is part-way through a transition as it is, unless told to settle', async () => {
      const audit = new ContrastAudit();
      measure('<p style="color:#000">a</p>', css, { audit });
      document.querySelector('p').style.color = '#fff';
      await FRAME();
      expect(texts(audit.measure())[0].foreground).toStrictEqual({ r: 0, g: 0, b: 0, a: 1 }); // a fade this slow has not left black, however late the frame comes
    });

    it('finishes running color transitions first, with settleTransitions, so the end color is the one measured', async () => {
      const audit = new ContrastAudit(document, { settleTransitions: true });
      measure('<p style="color:#000">a</p>', css, { audit });
      document.querySelector('p').style.color = '#fff';
      await FRAME();
      expect(texts(audit.measure())[0].foreground).toStrictEqual(WHITE);
    });

    it('also settles the color of a section that is off screen, where the browser brings style up to date only when it is read', async () => {
      const audit = new ContrastAudit(document, { settleTransitions: true });
      measure(
        '<div style="height:4000px"></div><section class="far"><p>a</p></section>',
        `p { color: var(--ink-test, #000); transition: color 1000000s linear }
         .far { content-visibility: auto; contain-intrinsic-size: auto 600px }`,
        { audit },
      );
      try {
        document.documentElement.style.setProperty('--ink-test', '#fff'); // a theme switch changes the colors of everything at once
        await FRAME();
        expect(texts(audit.measure())[0].foreground).toStrictEqual(WHITE);
      } finally {
        document.documentElement.style.removeProperty('--ink-test');
      }
    });

    it('leaves transitions of other properties alone', async () => {
      const audit = new ContrastAudit(document, { settleTransitions: true });
      measure(
        '<p style="color:#000;margin-left:0">a</p>',
        'p { transition: margin-left 100s linear }',
        { audit },
      );
      document.querySelector('p').style.marginLeft = '100px';
      await FRAME();
      audit.measure();
      expect(
        document
          .querySelector('p')
          .getAnimations()
          .map((animation) => animation.playState),
      ).toStrictEqual(['running']);
    });
  });

  describe('measureWithoutBlocking', () => {
    const crowd = (count) =>
      Array.from(
        { length: count },
        (_, index) => `<p style="color:rgb(${index % 200} 0 0)">row ${index}</p>`,
      ).join('');

    it('gives the same report as measure()', async () => {
      const html =
        '<p style="color:#767676">a</p><p style="color:#fff;background:#000">b</p><p style="color:#777">c</p>';
      const sync = measure(html).pairs;
      const sliced = (await measure(html, '', { mode: 'async' })).pairs;
      expect(sliced).toStrictEqual(sync);
    });

    it('hands the thread back to the browser between slices, so a large page is measured in many small tasks', async () => {
      const scheduler = globalThis.scheduler ?? {};
      const yielding = vi
        .spyOn(scheduler, 'yield')
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve)));
      globalThis.scheduler = scheduler;
      const report = await measure(crowd(4000), '', { mode: 'async' });
      expect(report.count).toBe(200);
      expect(yielding.mock.calls.length > 3).toBe(true);
    });

    it('hands the thread back with a timer where the browser has no scheduler.yield, as often as it would have with it', async () => {
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (now += 10)); // every step overruns its slice
      const scheduler = { yield: vi.fn(() => Promise.resolve()) };
      vi.stubGlobal('scheduler', scheduler);
      await measure(crowd(30), '', { mode: 'async' });
      vi.stubGlobal('scheduler', undefined);
      const timers = vi.spyOn(globalThis, 'setTimeout');
      const report = await measure(crowd(30), '', { mode: 'async' });
      vi.unstubAllGlobals();
      const byTimer = timers.mock.calls.filter(([, delay]) => delay === undefined).length;
      expect([report.count, byTimer, scheduler.yield.mock.calls.length]).toStrictEqual([
        30, 30, 30,
      ]);
    });

    it('runs overlapping measurements one after the other, each on the page as it stands when it starts', async () => {
      const audit = new ContrastAudit();
      sheet.textContent = 'body { background: #fff }';
      document.body.innerHTML = '<p style="color:#000">a</p>';
      const first = audit.measureWithoutBlocking();
      const second = audit.measureWithoutBlocking();
      document.querySelector('p').style.color = '#767676';
      const [one, two] = await Promise.all([first, second]);
      expect([one.pairs.length, two.pairs.length, two.pairs[0].foreground]).toStrictEqual([
        1,
        1,
        GREY_767676,
      ]);
    });
  });
});
