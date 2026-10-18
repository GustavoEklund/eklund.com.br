import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PixWalkthrough } from '@site/js/architecture-map/pix-walkthrough.js';
import { Diagram } from '@site/js/architecture-map/diagram.js';
import { OrthogonalPath } from '@site/js/architecture-map/orthogonal-path.js';
import { Dom } from '@site/js/shared/dom.js';
import { Formatter } from '@site/js/shared/format.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const STEPS = Diagram.walkthrough();
const realMs = (step) => Math.max(190, step.ms * 0.7);
/** A frame just long enough to finish a step (the extra nanosecond keeps floating point from leaving 0.9999999 of it). */
const finishing = (step) => realMs(step) / 1000 + 1e-9;
/** What the browser reads back after parsing the markup, so a stray `<` in a dictionary string compares the way it renders. */
const asMarkup = (html) => {
  const probe = document.createElement('div');
  probe.innerHTML = html;
  return probe.innerHTML;
};
const caption = (step, milliseconds, locale = 'pt-BR') =>
  asMarkup(
    `${step.milestone ? `<i>${step.milestone}</i>` : ''}<b>${Formatter.seconds(milliseconds)}</b>${DictionaryText.entry(locale, `architecture.walkthrough.${step.caption}`)}`,
  );
const roundedPoint = (circle) => [
  Number(circle.getAttribute('cx')).toFixed(3),
  Number(circle.getAttribute('cy')).toFixed(3),
];

describe('PixWalkthrough', () => {
  let svg, layer, captionBox, button, edgesById, translator, walkthrough;
  const circles = () =>
    [...layer.children].map((circle) => [circle.getAttribute('class'), circle.getAttribute('r')]);
  const tracked = () => layer.querySelector('.packet-tracked');
  const halo = () => layer.querySelector('.packet-halo');
  const highlighted = () =>
    Object.keys(edgesById).filter((id) => edgesById[id].path.classList.contains('is-highlighted'));
  const pointOn = (edgeId, distanceFraction) => {
    const edge = edgesById[edgeId];
    const point = edge.path.getPointAtLength(edge.length * distanceFraction);
    return [point.x.toFixed(3), point.y.toFixed(3)];
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Formatter.use('pt-BR');
    document.body.innerHTML =
      '<svg id="svg" width="1736" height="660" viewBox="0 50 1736 660"><g id="layer"></g></svg><div id="caption" hidden></div><button id="follow">follow</button>';
    svg = document.getElementById('svg');
    layer = document.getElementById('layer');
    captionBox = document.getElementById('caption');
    button = document.getElementById('follow');
    edgesById = {};
    for (const spec of Diagram.edges()) {
      const path = Dom.svg('path', { d: OrthogonalPath.build(spec.points) });
      svg.append(path);
      edgesById[spec.id] = { ...spec, path, length: path.getTotalLength() };
    }
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    walkthrough = new PixWalkthrough({ edgesById, layer, caption: captionBox, button, translator });
  });

  afterEach(() => vi.useRealTimers());

  describe('start', () => {
    it('is idle until started', () => {
      expect([walkthrough.isActive, circles(), captionBox.hidden, button.disabled]).toStrictEqual([
        false,
        [],
        true,
        false,
      ]);
    });

    it('adds the halo and then the tracked packet, shows the caption and disables the button', () => {
      walkthrough.start();
      expect([walkthrough.isActive, circles(), captionBox.hidden, button.disabled]).toStrictEqual([
        true,
        [
          ['packet-halo', '11'],
          ['packet-tracked', '5'],
        ],
        false,
        true,
      ]);
    });

    it('does nothing when it is already running', () => {
      walkthrough.start();
      walkthrough.advance(0.05);
      const before = [circles(), captionBox.innerHTML];
      walkthrough.start();
      expect([circles(), captionBox.innerHTML]).toStrictEqual(before);
    });
  });

  describe('the first frame of a step', () => {
    beforeEach(() => {
      walkthrough.start();
    });

    it('writes the caption with the milestone and the clock at zero, and highlights only that edge', () => {
      walkthrough.advance(0.05);
      expect(captionBox.innerHTML).toBe(caption(STEPS[0], 0));
      expect(highlighted()).toStrictEqual(['apiPix>gateway']);
    });

    it('moves the packet and its halo together along the edge by the share of the step that elapsed', () => {
      walkthrough.advance(0.05);
      expect([roundedPoint(tracked()), roundedPoint(halo())]).toStrictEqual([
        pointOn('apiPix>gateway', (0.05 * 1000) / 190),
        pointOn('apiPix>gateway', (0.05 * 1000) / 190),
      ]);
      expect(Number(tracked().getAttribute('cx')).toFixed(3)).toBe('185.523'); // inside the rounded corner at (186, 149), not on the corner itself
    });

    it('takes at least 190 ms for a step, however short its simulated duration: 50 ms steps still need 190 ms', () => {
      for (const step of STEPS.slice(0, 2)) walkthrough.advance(finishing(step));
      walkthrough.advance(0.0475);
      expect(roundedPoint(tracked())).toStrictEqual(
        pointOn('pixOut>dictService', (0.0475 * 1000) / 190),
      );
    });

    it('does not run the simulated clock past the end of a step when a frame is longer than what the step still needs', () => {
      walkthrough.start();
      walkthrough.advance(5);
      walkthrough.advance(0.001);
      expect(captionBox.innerHTML).toBe(caption(STEPS[1], 150));
    });

    it('counts only the part of a long frame that the step needed, and drops the rest', () => {
      walkthrough.start();
      walkthrough.advance(0.05);
      walkthrough.advance(5);
      walkthrough.advance(0.001);
      expect(captionBox.innerHTML).toBe(caption(STEPS[1], 150));
    });

    it('takes 70% of the simulated time for long steps: 490 ms into the 1400 ms RSFN leg the packet is halfway along the edge', () => {
      for (const step of STEPS.slice(0, 17)) walkthrough.advance(finishing(step));
      walkthrough.advance(0.49);
      expect(STEPS[17].edge).toBe('spiGateway>spi');
      expect(roundedPoint(tracked())).toStrictEqual(['1379.000', '331.000']);
    });
  });

  describe('a whole run', () => {
    const run = () => {
      walkthrough.start();
      const log = { captions: [], highlighted: [], points: [] };
      let previousCaption = '';
      for (const step of STEPS) {
        walkthrough.advance(finishing(step));
        log.captions.push(captionBox.innerHTML === previousCaption ? null : captionBox.innerHTML);
        previousCaption = captionBox.innerHTML;
        log.highlighted.push(highlighted());
        log.points.push(roundedPoint(tracked()));
      }
      return log;
    };

    it('narrates the steps that have a caption, with the simulated clock at the start of each and the milestones', () => {
      let clock = 0;
      const expected = STEPS.map((step) => {
        const text = step.caption ? caption(step, clock) : null;
        clock += step.ms;
        return text;
      });
      expect(run().captions).toStrictEqual(expected);
    });

    it('highlights the edge of each step, and no edge while the packet runs along the bus', () => {
      expect(run().highlighted).toStrictEqual(STEPS.map((step) => (step.edge ? [step.edge] : [])));
    });

    it('ends every step with the packet at the far end of its track: reversed edges end where they started', () => {
      const expected = STEPS.map((step) =>
        step.bus
          ? [Number(step.bus[1]).toFixed(3), Number(Diagram.BUS.centerY).toFixed(3)]
          : pointOn(step.edge, step.reversed ? 0 : 1),
      );
      expect(run().points).toStrictEqual(expected);
    });

    it('is still active after its last step, until the next frame finds nothing left to do', () => {
      run();
      expect([walkthrough.isActive, circles().length]).toStrictEqual([true, 2]);
    });

    it('finishes on the next frame: packets removed, closing caption written, button back, edges clear', () => {
      run();
      walkthrough.advance(0.016);
      expect([
        walkthrough.isActive,
        circles(),
        captionBox.innerHTML,
        button.disabled,
        highlighted(),
      ]).toStrictEqual([
        false,
        [],
        asMarkup(DictionaryText.entry('pt-BR', 'architecture.walkthrough.done')),
        false,
        [],
      ]);
    });

    it('hides the caption 4 seconds after finishing, not before', () => {
      run();
      walkthrough.advance(0.016);
      vi.advanceTimersByTime(3999);
      expect(captionBox.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(captionBox.hidden).toBe(true);
    });

    it('can be started again after it finished', () => {
      run();
      walkthrough.advance(0.016);
      walkthrough.start();
      expect([walkthrough.isActive, circles(), button.disabled]).toStrictEqual([
        true,
        [
          ['packet-halo', '11'],
          ['packet-tracked', '5'],
        ],
        true,
      ]);
    });
  });

  describe('along an edge', () => {
    beforeEach(() => {
      walkthrough.start();
      for (const step of STEPS.slice(0, 5)) walkthrough.advance(finishing(step));
    });

    it('a reversed step walks from the end of the edge to its start: a quarter in is three quarters along it', () => {
      walkthrough.advance(0.0475);
      expect(roundedPoint(tracked())).toStrictEqual(['1406.500', '149.000']);
    });

    it('moves a quarter further on each frame; the frame that completes the step ends exactly at the start of the edge, and the next frame begins the next step', () => {
      const positions = [0.0475, 0.0475, 0.0475, 0.0475, 0.0475, 0.0475].map((delta) => {
        walkthrough.advance(delta);
        return Number(tracked().getAttribute('cx')).toFixed(3);
      });
      expect(edgesById['dictGateway>dict'].length).toBe(110);
      // Frames 1 to 4 walk dictGateway>dict backwards (x from 1434 to 1324); frames 5 and 6 are the first quarter and half of the next step,
      // dictService>dictGateway walked backwards over its 20 px (x from 1196 to 1176).
      expect(positions).toStrictEqual([
        '1406.500',
        '1379.000',
        '1351.500',
        '1324.000',
        '1191.000',
        '1186.000',
      ]);
    });
  });

  describe('captions of steps without text', () => {
    it('keep the previous caption on screen while the packet moves on', () => {
      walkthrough.start();
      for (const step of STEPS.slice(0, 6)) walkthrough.advance(finishing(step));
      const before = captionBox.innerHTML;
      walkthrough.advance(finishing(STEPS[6]));
      expect([STEPS[6].caption, captionBox.innerHTML]).toStrictEqual([undefined, before]);
    });
  });

  describe('language', () => {
    it('writes each caption in the language of the page when its step starts', () => {
      walkthrough.start();
      walkthrough.advance(finishing(STEPS[0]));
      translator.setLocale('en-US');
      walkthrough.advance(0.05);
      expect(captionBox.innerHTML).toBe(caption(STEPS[1], 150, 'en-US'));
    });

    it('writes the closing caption in the language of the page', () => {
      walkthrough.start();
      for (const step of STEPS) walkthrough.advance(finishing(step));
      translator.setLocale('en-US');
      walkthrough.advance(0.016);
      expect(captionBox.innerHTML).toBe(
        asMarkup(DictionaryText.entry('en-US', 'architecture.walkthrough.done')),
      );
    });
  });
});
