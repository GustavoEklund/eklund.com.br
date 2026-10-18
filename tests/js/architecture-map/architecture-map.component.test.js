import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ArchitectureMap } from '@site/js/architecture-map/architecture-map.js';
import { Diagram } from '@site/js/architecture-map/diagram.js';
import { OrthogonalPath } from '@site/js/architecture-map/orthogonal-path.js';
import { PixWalkthrough } from '@site/js/architecture-map/pix-walkthrough.js';
import { TrafficSimulation } from '@site/js/architecture-map/traffic-simulation.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { FrameQueue } from '../../support/frame-queue.js';
import { FakeIntersectionObserver } from '../../support/fake-observers.js';
import { WindowListeners } from '../../support/window-listeners.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const LOAD_AT_ZERO = 0.5714647772654213;
const SAMPLE_AT_ZERO = 0.5428915384021502; // load * (0.7 + 0.5 * 0.5) with Math.random pinned at 0.5
const REPLICAS_AT_ZERO = {
  gateway: 2,
  charges: 4,
  accounts: 4,
  indirect: 2,
  recurrence: 2,
  pixOut: 6,
  dictService: 2,
  dictGateway: 2,
  ledger: 5,
  antiFraud: 3,
  reconcile: 2,
  webhooks: 3,
  liquidity: 1,
  pixIn: 6,
  spiGateway: 3,
};
const NODE_TEXT = (locale = 'pt-BR') =>
  Object.fromEntries(
    Object.keys(Diagram.NODES).map((id) => [
      id,
      DictionaryText.entry(locale, `architecture.nodes.${id}`),
    ]),
  );
const asMarkup = (html) => {
  const probe = document.createElement('div');
  probe.innerHTML = html;
  return probe.innerHTML;
};
const kindOf = (element) =>
  `${element.localName}${element.getAttribute('class') ? `.${element.getAttribute('class')}` : ''}`;
const EDGES = Diagram.edges();

describe('ArchitectureMap', () => {
  let root, svg, tooltip, caption, button, translator, frames, listeners, map;
  const layers = () => [...svg.children];
  const [ZONES, EDGE_LAYER, NODES, PACKETS, TRACKED] = [0, 1, 2, 3, 4];
  const layer = (index) => layers()[index];
  const node = (id) => svg.querySelector(`.node[data-id="${id}"]`);
  const header = (id) => root.querySelector(`#architecture-${id}`).textContent;
  const packets = () => [...layer(PACKETS).children];
  const stubMotion = (reduced) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)' })),
    );
  const build = () => {
    map = new ArchitectureMap({ root, svg, tooltip, caption, followButton: button, translator });
    return map.mount();
  };
  const enterFrame = (now) => frames.run(now);

  beforeEach(() => {
    document.body.style.margin = '0';
    document.body.innerHTML = `<div id="architecture">
      <b id="architecture-load">—</b><b id="architecture-tps">—</b><b id="architecture-replicas">—</b>
      <button id="follow">follow</button><div id="caption" hidden></div>
      <div id="canvas" style="position:relative;width:800px;height:400px"><svg id="svg" width="800" height="400"></svg><div id="tooltip" hidden style="position:absolute;width:330px"></div></div>
      <details><dl id="architecture-list-body"></dl></details></div>`;
    [root, svg, tooltip, caption, button] = [
      'architecture',
      'svg',
      'tooltip',
      'caption',
      'follow',
    ].map((id) => document.getElementById(id));
    Formatter.use('pt-BR');
    translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
    stubMotion(false);
    frames = new FrameQueue().install();
    FakeIntersectionObserver.install();
    listeners = new WindowListeners().track();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    listeners.release();
    frames.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.motion;
    document.body.removeAttribute('style');
  });

  describe('mount', () => {
    it('returns itself and sizes the drawing to the diagram', () => {
      expect([build() === map, svg.getAttribute('viewBox')]).toStrictEqual([true, '0 50 1736 660']);
    });

    it('stacks five layers: zones, edges, nodes, packets and the tracked packet', () => {
      build();
      expect(layers().map((child) => kindOf(child))).toStrictEqual(['g', 'g', 'g', 'g', 'g']);
      expect([
        layer(ZONES).childElementCount,
        layer(EDGE_LAYER).childElementCount,
        layer(NODES).childElementCount,
        layer(PACKETS).childElementCount,
        layer(TRACKED).childElementCount,
      ]).toStrictEqual([11, 36, 31, 0, 0]);
    });

    it('draws the zones in order, each followed by its translated label, then the cluster and managed labels and the RSFN band', () => {
      build();
      expect([...layer(ZONES).children].map((child) => kindOf(child))).toStrictEqual([
        'rect.zone',
        'text.zone-label',
        'rect.zone',
        'text.zone-label',
        'rect.zone zone-cluster',
        'rect.zone',
        'text.zone-label',
        'text.zone-label',
        'text.zone-label is-dim',
        'rect.network-band',
        'text.zone-label is-vertical',
      ]);
      expect(
        [...layer(ZONES).querySelectorAll('text')].map((label) => [
          label.dataset.i18n,
          label.textContent,
        ]),
      ).toStrictEqual(
        ['channels', 'aws', 'centralBank', 'cluster', 'managed', 'rsfn'].map((id) => [
          `architecture.zones.${id}`,
          DictionaryText.entry('pt-BR', `architecture.zones.${id}`),
        ]),
      );
    });

    it('places each zone and label where the diagram says', () => {
      build();
      expect(
        [...layer(ZONES).querySelectorAll('rect')].map((rect) =>
          ['x', 'y', 'width', 'height'].map((name) => rect.getAttribute(name)),
        ),
      ).toStrictEqual([
        ['12', '60', '164', '640'],
        ['194', '60', '1150', '640'],
        ['210', '84', '1120', '400'],
        ['1418', '60', '302', '640'],
        ['1360', '60', '42', '640'],
      ]);
      expect(
        [...layer(ZONES).querySelectorAll('text')].map((label) => [
          label.getAttribute('x'),
          label.getAttribute('y'),
          label.getAttribute('transform'),
        ]),
      ).toStrictEqual([
        ['24', '77', null],
        ['206', '77', null],
        ['1430', '77', null],
        ['222', '476', null],
        ['222', '528', null],
        [null, null, 'translate(1386 380) rotate(-90)'],
      ]);
    });

    it('draws one path per edge, in diagram order, with its kind, its id and its orthogonal route', () => {
      build();
      expect(
        [...layer(EDGE_LAYER).children].map((path) => [
          path.getAttribute('class'),
          path.dataset.id,
          path.getAttribute('d'),
        ]),
      ).toStrictEqual(
        EDGES.map((edge) => [`edge ${edge.kind}`, edge.id, OrthogonalPath.build(edge.points)]),
      );
    });

    it('draws the 30 nodes in diagram order and the Kafka bus last', () => {
      build();
      const groups = [...layer(NODES).children];
      expect(groups.map((group) => group.dataset.id)).toStrictEqual([
        ...Object.keys(Diagram.NODES),
        'bus',
      ]);
      expect(
        groups
          .slice(0, 30)
          .map((group) => [group.getAttribute('class'), group.getAttribute('transform')]),
      ).toStrictEqual(
        Object.values(Diagram.NODES).map((spec) => [
          `node node-${spec.kind}`,
          `translate(${spec.x},${spec.y})`,
        ]),
      );
    });

    it('gives every node its box, translated title and subtitle (and a second subtitle line where the dictionary has one)', () => {
      build();
      const withSecondLine = [
        'apiPix',
        'apps',
        'indirectPsp',
        'openFinance',
        'webhooksOut',
        'dict',
        'spi',
        'str',
      ];
      const texts = NODE_TEXT();
      const drawn = Object.keys(Diagram.NODES).map((id) => [
        id,
        [...node(id).querySelectorAll('text.node-title, text.node-subtitle')].map((text) => [
          text.dataset.i18n,
          text.textContent,
        ]),
      ]);
      expect(drawn).toStrictEqual(
        Object.keys(Diagram.NODES).map((id) => [
          id,
          [
            [`architecture.nodes.${id}.title`, texts[id].title],
            [`architecture.nodes.${id}.subtitle`, texts[id].subtitle],
            ...(withSecondLine.includes(id)
              ? [[`architecture.nodes.${id}.subtitle2`, texts[id].subtitle2]]
              : []),
          ],
        ]),
      );
    });

    it('sizes each box to the node width and the 62 px node height, with a health dot in the corner', () => {
      build();
      expect(
        Object.keys(Diagram.NODES).map((id) => [
          id,
          ...['width', 'height'].map((name) => node(id).querySelector('rect').getAttribute(name)),
          ...['cx', 'cy', 'r'].map((name) =>
            node(id).querySelector('circle.node-health').getAttribute(name),
          ),
        ]),
      ).toStrictEqual(
        Object.entries(Diagram.NODES).map(([id, spec]) => [
          id,
          String(spec.width),
          '62',
          String(spec.width - 10),
          '10',
          '3',
        ]),
      );
    });

    it('gives services a sparkline, a replica badge and a replica count; the others none', () => {
      build();
      const services = Object.entries(Diagram.NODES)
        .filter(([, spec]) => spec.kind === 'service')
        .map(([id]) => id);
      const others = Object.entries(Diagram.NODES)
        .filter(([, spec]) => spec.kind !== 'service')
        .map(([id]) => id);
      expect(
        services.map((id) => [...node(id).children].slice(-5).map((child) => kindOf(child))),
      ).toStrictEqual(
        services.map(() => [
          'path.node-sparkline-fill',
          'path.node-sparkline',
          'rect.node-replicas',
          'text.node-replicas-text',
          'circle.node-health',
        ]),
      );
      expect(
        others.map(
          (id) =>
            node(id).querySelectorAll('.node-sparkline, .node-replicas, .node-replicas-text')
              .length,
        ),
      ).toStrictEqual(others.map(() => 0));
    });

    it('draws the Kafka bus as a box, its title and the six topics each with a bar', () => {
      build();
      const bus = node('bus');
      expect(bus.getAttribute('class')).toBe('node event-bus');
      expect([...bus.children].map((child) => kindOf(child))).toStrictEqual([
        'rect',
        'text.node-title',
        ...Array.from({ length: 6 }, () => ['text.bus-topic', 'rect.bus-topic-bar']).flat(),
      ]);
      expect(
        ['x', 'y', 'width', 'height'].map((name) => bus.querySelector('rect').getAttribute(name)),
      ).toStrictEqual(['372', '224', '804', '34']);
      expect([
        bus.querySelector('.node-title').textContent,
        bus.querySelector('.node-title').getAttribute('x'),
        bus.querySelector('.node-title').getAttribute('y'),
      ]).toStrictEqual(['Kafka', '384', '246']);
      expect(
        [...bus.querySelectorAll('.bus-topic')].map((topic) => [
          topic.textContent,
          topic.getAttribute('x'),
          topic.getAttribute('y'),
        ]),
      ).toStrictEqual(
        Diagram.TOPICS.map((topic, index) => [topic, String(456 + index * 118), '239']),
      );
    });
  });

  describe('the first sample, taken on mount', () => {
    it('shows the load, the throughput and the replicas in use over the capacity of every service', () => {
      build();
      expect([header('load'), header('tps'), header('replicas')]).toStrictEqual([
        '57%',
        '286',
        '47/67',
      ]);
    });

    it('sets each service replica count to what the load needs: from 1 to its maximum', () => {
      build();
      expect(
        Object.keys(REPLICAS_AT_ZERO).map((id) => [
          id,
          node(id).querySelector('.node-replicas-text').textContent,
        ]),
      ).toStrictEqual(Object.entries(REPLICAS_AT_ZERO).map(([id, count]) => [id, `×${count}`]));
    });

    it('sizes the six topic bars by their activity, quieter for later topics', () => {
      build();
      expect(
        [...node('bus').querySelectorAll('.bus-topic-bar')].map((bar) => bar.getAttribute('width')),
      ).toStrictEqual(['56', '49', '43', '36', '29', '22']);
    });

    it('draws each service sparkline from fifteen steady samples and the new one', () => {
      build();
      const x = (index) => (10 + (index * (110 - 44)) / 15).toFixed(1);
      const path = Array.from(
        { length: 16 },
        (_, index) =>
          `${index ? 'L' : 'M'}${x(index)},${(62 - 6 - (index < 15 ? 0.3 : SAMPLE_AT_ZERO) * 12).toFixed(1)}`,
      ).join('');
      const gateway = node('gateway');
      expect(gateway.querySelector('.node-sparkline').getAttribute('d')).toBe(path);
      expect([path.slice(0, 20), path.slice(-10)]).toStrictEqual([
        'M10.0,52.4L14.4,52.4',
        'L76.0,49.5',
      ]);
      expect(gateway.querySelector('.node-sparkline-fill').getAttribute('d')).toBe(
        `${path}L76,56L10,56Z`,
      );
    });

    it('keeps the dict gateway healthy below 92% load', () => {
      build();
      expect(
        node('dictGateway').querySelector('.node-health').classList.contains('is-warning'),
      ).toBe(false);
    });

    it('asks the simulation once for the load at second 0, then for each service in diagram order', () => {
      const load = vi.spyOn(TrafficSimulation, 'load'),
        sample = vi.spyOn(TrafficSimulation, 'sampleService'),
        replicas = vi.spyOn(TrafficSimulation, 'replicasFor');
      const topics = vi.spyOn(TrafficSimulation, 'topicActivity'),
        throughput = vi.spyOn(TrafficSimulation, 'throughput');
      build();
      expect([load.mock.calls, throughput.mock.calls]).toStrictEqual([[[0]], [[LOAD_AT_ZERO]]]);
      expect(sample.mock.calls).toStrictEqual(Array.from({ length: 15 }, () => [LOAD_AT_ZERO]));
      expect(replicas.mock.calls).toStrictEqual(
        Object.keys(REPLICAS_AT_ZERO).map((id) => [LOAD_AT_ZERO, Diagram.NODES[id].maxReplicas]),
      );
      expect(topics.mock.calls).toStrictEqual(
        [0, 1, 2, 3, 4, 5].map((index) => [LOAD_AT_ZERO, index]),
      );
    });
  });

  describe('animation', () => {
    it('draws no traffic for visitors who prefer reduced motion: the loop wakes up on screen, finds nothing to do and stops', () => {
      stubMotion(true);
      build();
      FakeIntersectionObserver.report(true);
      expect(frames.pending).toBe(1);
      Math.random.mockReturnValue(0);
      enterFrame(1000);
      expect([frames.pending, packets().length, header('load')]).toStrictEqual([0, 0, '57%']);
    });

    it('draws no traffic while the visitor has paused motion either', () => {
      document.documentElement.dataset.motion = 'paused';
      build();
      FakeIntersectionObserver.report(true);
      enterFrame(1000);
      expect([frames.pending, packets().length]).toStrictEqual([0, 0]);
      delete document.documentElement.dataset.motion;
    });

    it('starts the loop again when motion is switched back on', () => {
      document.documentElement.dataset.motion = 'paused';
      build();
      FakeIntersectionObserver.report(true);
      enterFrame(1000);
      delete document.documentElement.dataset.motion;
      map.sync();
      expect(frames.pending).toBe(1);
      Math.random.mockReturnValue(0);
      enterFrame(2000);
      expect([frames.pending, packets().length]).toStrictEqual([1, 36]);
    });

    it('clears the packets in flight when motion is switched off', () => {
      build();
      FakeIntersectionObserver.report(true);
      Math.random.mockReturnValue(0);
      enterFrame(1);
      expect(packets().length).toBe(36);
      stubMotion(true);
      map.sync();
      expect([packets().length, layer(PACKETS).childElementCount]).toStrictEqual([0, 0]);
    });

    it('watches the drawing and starts its loop only once it is on screen', () => {
      build();
      expect([
        FakeIntersectionObserver.instances.map((observer) => [observer.observed, observer.options]),
        frames.pending,
      ]).toStrictEqual([[[[svg], { threshold: 0.05 }]], 0]);
      FakeIntersectionObserver.report(true);
      expect(frames.pending).toBe(1);
    });

    describe('frame by frame', () => {
      beforeEach(() => {
        build();
        FakeIntersectionObserver.report(true);
        Math.random.mockReturnValue(0);
      });

      it('samples again only when more than 420 ms have passed since the last sample: 420 ms exactly is not enough', () => {
        const load = vi.spyOn(TrafficSimulation, 'load');
        enterFrame(1);
        enterFrame(420);
        expect(load.mock.calls).toStrictEqual([[0.001], [0.42]]);
        enterFrame(421);
        expect(load.mock.calls.slice(2)).toStrictEqual([[0.421], [0.421]]);
        enterFrame(500);
        enterFrame(841);
        expect(load.mock.calls.slice(4)).toStrictEqual([[0.5], [0.841]]);
        enterFrame(842);
        expect(load.mock.calls.slice(6)).toStrictEqual([[0.842], [0.842]]);
      });

      it('updates the header from the new sample', () => {
        enterFrame(1000);
        expect([header('load'), header('tps')]).toStrictEqual(['66%', '331']);
      });

      it('spawns a packet on every edge, in diagram order, typed by the edge kind', () => {
        enterFrame(1);
        expect(
          packets().map((packet) => [packet.getAttribute('class'), packet.getAttribute('r')]),
        ).toStrictEqual(
          EDGES.map((edge) => [`packet ${edge.kind}`, edge.kind === 'data' ? '2' : '2.6']),
        );
      });

      it('moves each packet along its edge by speed x time: 192 px/s for 1 ms puts the first one at x = 156.2', () => {
        enterFrame(1);
        expect([packets()[0].getAttribute('cx'), packets()[0].getAttribute('cy')]).toStrictEqual([
          '156.2',
          '149.0',
        ]);
      });

      it('moves data packets slower than the others: 112 px/s against 192', () => {
        enterFrame(50);
        const index = EDGES.findIndex((edge) => edge.id === 'ledger>postgres');
        const start = EDGES[index].points[0];
        expect([
          packets()[index].getAttribute('cx'),
          packets()[index].getAttribute('cy'),
        ]).toStrictEqual([start[0].toFixed(1), (start[1] + 112 * 0.05).toFixed(1)]);
      });

      it('stops spawning once 80 packets are on screen: 36, 72, 108, then no more', () => {
        const counts = [1, 2, 3, 4, 5].map((now) => {
          enterFrame(now);
          return packets().length;
        });
        expect(counts).toStrictEqual([36, 72, 108, 108, 108]);
      });

      it('removes a packet that reached the end of its edge: the 20 px edge to the DICT gateway takes three 50 ms frames', () => {
        const index = EDGES.findIndex((edge) => edge.id === 'dictService>dictGateway');
        enterFrame(50);
        const first = packets()[index];
        enterFrame(100);
        expect([
          first.isConnected,
          first.getAttribute('cx'),
          first.getAttribute('cy'),
        ]).toStrictEqual([true, '1195.2', '149.0']);
        enterFrame(150);
        expect(first.isConnected).toBe(false);
      });

      it('keeps asking for the next frame', () => {
        enterFrame(1);
        expect(frames.pending).toBe(1);
      });
    });
  });

  describe('hovering a node', () => {
    const over = (target) =>
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    const activeEdges = () =>
      [...layer(EDGE_LAYER).children]
        .filter((path) => path.classList.contains('is-active'))
        .map((path) => path.dataset.id);
    const activeNodes = () =>
      [...layer(NODES).children]
        .filter((group) => group.classList.contains('is-active'))
        .map((group) => group.dataset.id);
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      build();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lights the node and every edge that starts or ends at it', () => {
      over(node('ledger').querySelector('rect'));
      expect([activeNodes(), activeEdges()]).toStrictEqual([
        ['ledger'],
        ['bus>ledger', 'ledger>postgres'],
      ]);
    });

    it('describes a service: title, description and its replicas, rate, p95 and error rate', () => {
      over(node('gateway').querySelector('.node-title'));
      const stats = DictionaryText.fill('pt-BR', 'architecture.tooltip', {
        replicas: 2,
        max: 3,
        rps: 271,
        p95: 145,
        errors: '0,14',
      });
      expect([tooltip.hidden, tooltip.innerHTML]).toStrictEqual([
        false,
        asMarkup(
          `<b>${NODE_TEXT().gateway.title}</b>${NODE_TEXT().gateway.description}<span>${stats}</span>`,
        ),
      ]);
    });

    it('describes a node that is not a service without a stats line', () => {
      over(node('postgres').querySelector('rect'));
      expect(tooltip.innerHTML).toBe(
        asMarkup(`<b>${NODE_TEXT().postgres.title}</b>${NODE_TEXT().postgres.description}`),
      );
    });

    it('describes the bus with its topics and lights the thirteen edges that touch it (the box itself is styled by :hover)', () => {
      over(node('bus').querySelector('rect'));
      expect(tooltip.innerHTML).toBe(
        asMarkup(
          `<b>Kafka</b>${DictionaryText.entry('pt-BR', 'architecture.bus')}<span>${Diagram.TOPICS.join(' · ')}</span>`,
        ),
      );
      expect(activeNodes()).toStrictEqual([]);
      expect(activeEdges()).toStrictEqual([
        'charges>bus',
        'accounts>bus',
        'indirect>bus',
        'recurrence>bus',
        'pixOut>bus',
        'dictService>bus',
        'bus>ledger',
        'bus>antiFraud',
        'bus>reconcile',
        'bus>webhooks',
        'bus>liquidity',
        'bus>pixIn',
        'spiGateway>bus',
      ]);
    });

    it('moves the highlight when the pointer moves to another node', () => {
      over(node('ledger').querySelector('rect'));
      over(node('postgres').querySelector('rect'));
      expect([activeNodes(), activeEdges()]).toStrictEqual([['postgres'], ['ledger>postgres']]);
    });

    it('does not rebuild the tooltip while the pointer stays on the same node', () => {
      over(node('ledger').querySelector('rect'));
      tooltip.innerHTML = 'kept';
      over(node('ledger').querySelector('.node-title'));
      expect(tooltip.innerHTML).toBe('kept');
    });

    it('keeps the tooltip and the highlight for 220 ms over empty canvas, long enough to reach the tooltip, then hides them', () => {
      over(node('ledger').querySelector('rect'));
      over(svg);
      vi.advanceTimersByTime(219);
      expect([tooltip.hidden, activeNodes(), activeEdges()]).toStrictEqual([
        false,
        ['ledger'],
        ['bus>ledger', 'ledger>postgres'],
      ]);
      vi.advanceTimersByTime(1);
      expect([tooltip.hidden, activeNodes(), activeEdges()]).toStrictEqual([true, [], []]);
    });

    it('keeps the tooltip when the pointer reaches another node before the delay is over', () => {
      over(node('ledger').querySelector('rect'));
      over(svg);
      over(node('postgres').querySelector('rect'));
      vi.advanceTimersByTime(1000);
      expect([tooltip.hidden, activeNodes()]).toStrictEqual([false, ['postgres']]);
    });

    it('lets the pointer cross from the drawing to the tooltip and read it: it stays while the pointer is on it', () => {
      over(node('ledger').querySelector('rect'));
      svg.dispatchEvent(new PointerEvent('pointerleave'));
      tooltip.dispatchEvent(new PointerEvent('pointerenter'));
      vi.advanceTimersByTime(1000);
      expect([tooltip.hidden, activeNodes()]).toStrictEqual([false, ['ledger']]);
      tooltip.dispatchEvent(new PointerEvent('pointerleave'));
      vi.advanceTimersByTime(219);
      expect(tooltip.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect([tooltip.hidden, activeNodes(), activeEdges()]).toStrictEqual([true, [], []]);
    });

    it('hides the tooltip 220 ms after the pointer leaves the drawing, and lights the same node again on return', () => {
      over(node('ledger').querySelector('rect'));
      svg.dispatchEvent(new PointerEvent('pointerleave'));
      vi.advanceTimersByTime(220);
      expect([tooltip.hidden, activeNodes(), activeEdges()]).toStrictEqual([true, [], []]);
      over(node('ledger').querySelector('rect'));
      expect([tooltip.hidden, activeNodes()]).toStrictEqual([false, ['ledger']]);
    });

    it('dismisses the tooltip at once on Escape, without the pointer moving', () => {
      over(node('ledger').querySelector('rect'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect([tooltip.hidden, activeNodes(), activeEdges()]).toStrictEqual([true, [], []]);
    });

    it('leaves everything alone on Escape while no tooltip is shown, and on every other key', () => {
      over(node('ledger').querySelector('rect'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect([tooltip.hidden, activeNodes()]).toStrictEqual([false, ['ledger']]);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(tooltip.hidden).toBe(true);
    });

    describe('where the tooltip goes', () => {
      // The 800 x 400 drawing shows the 1736 x 660 view box at 800 / 1736, centered vertically.
      const SCALE = 800 / 1736,
        TOP_OFFSET = (400 - 660 * SCALE) / 2,
        WIDTH = 330,
        GAP = 6;
      const nodeBox = (id) => {
        const { x, y, width } = Diagram.NODES[id];
        return {
          left: x * SCALE,
          top: (y - 50) * SCALE + TOP_OFFSET,
          bottom: (y - 50 + Diagram.NODE_HEIGHT) * SCALE + TOP_OFFSET,
          width: width * SCALE,
        };
      };
      const placed = () =>
        [Number.parseFloat(tooltip.style.left), Number.parseFloat(tooltip.style.top)].map(
          (value) => Math.round(value * 10) / 10,
        );

      it('sits under the node it describes, starting at the left edge of the node, 6 px below it', () => {
        over(node('ledger').querySelector('rect'));
        const box = nodeBox('ledger');
        expect(placed()).toStrictEqual([
          Math.round(box.left * 10) / 10,
          Math.round((box.bottom + GAP) * 10) / 10,
        ]);
      });

      it('goes above a node near the bottom of the canvas, when below would cut it off: a 120 px tooltip under the Grafana box would end at 428 px of 400', () => {
        tooltip.style.minHeight = '120px';
        over(node('grafana').querySelector('rect'));
        const box = nodeBox('grafana');
        expect([
          tooltip.offsetHeight,
          Math.round((box.bottom + GAP + 120) * 10) / 10,
        ]).toStrictEqual([120, 428.3]);
        expect(placed()[1]).toBe(Math.round((box.top - 120 - GAP) * 10) / 10);
      });

      it('stays below when there is no room above either', () => {
        tooltip.style.minHeight = '300px';
        over(node('apiPix').querySelector('rect'));
        const box = nodeBox('apiPix');
        expect(placed()[1]).toBe(Math.round((box.bottom + GAP) * 10) / 10);
      });

      it('is held inside the width of the canvas: a node at the right edge gives 800 - 330 = 470 px', () => {
        over(node('str').querySelector('rect'));
        expect(tooltip.style.left).toBe(`${800 - WIDTH}px`);
      });

      it('places the bus tooltip under the Kafka box', () => {
        over(node('bus').querySelector('rect'));
        const bus = Diagram.BUS;
        expect(placed()).toStrictEqual([
          Math.round(bus.x1 * SCALE * 10) / 10,
          Math.round(((bus.y2 - 50) * SCALE + TOP_OFFSET + GAP) * 10) / 10,
        ]);
      });
    });
  });

  describe('following a Pix', () => {
    it('starts the walkthrough and the loop when the button is clicked', () => {
      const start = vi.spyOn(PixWalkthrough.prototype, 'start');
      build();
      button.click();
      expect([start.mock.calls, button.disabled, caption.hidden, frames.pending]).toStrictEqual([
        [[]],
        true,
        false,
        1,
      ]);
    });

    it('does the same from followPix()', () => {
      const start = vi.spyOn(PixWalkthrough.prototype, 'start');
      build();
      map.followPix();
      expect([start.mock.calls, button.disabled, frames.pending]).toStrictEqual([[[]], true, 1]);
    });

    it('advances the tracked packet on every frame, with the elapsed time', () => {
      const advance = vi.spyOn(PixWalkthrough.prototype, 'advance');
      build();
      FakeIntersectionObserver.report(true);
      map.followPix();
      enterFrame(50);
      enterFrame(100);
      expect(advance.mock.calls).toStrictEqual([[0.05], [0.05]]);
      expect(layer(TRACKED).querySelectorAll('circle').length).toBe(2);
      expect(caption.innerHTML).toBe(
        asMarkup(
          `<i>t0'</i><b>0,00 s</b>${DictionaryText.entry('pt-BR', 'architecture.walkthrough.request')}`,
        ),
      );
    });

    it('does not advance anything while no walkthrough is running', () => {
      const advance = vi.spyOn(PixWalkthrough.prototype, 'advance');
      build();
      FakeIntersectionObserver.report(true);
      enterFrame(50);
      expect(advance).toHaveBeenCalledTimes(0);
    });

    it('moves only the followed Pix for visitors who prefer reduced motion: the ambient traffic stays off', () => {
      stubMotion(true);
      const start = vi.spyOn(PixWalkthrough.prototype, 'start');
      build();
      FakeIntersectionObserver.report(true);
      frames.run(0);
      map.followPix();
      expect([start.mock.calls, frames.pending]).toStrictEqual([[[]], 1]);
      enterFrame(50);
      expect([packets().length, layer(TRACKED).childElementCount, frames.pending]).toStrictEqual([
        0, 2, 1,
      ]);
    });
  });

  describe('the list of services, for anyone who cannot hover', () => {
    const list = () => root.querySelector('#architecture-list-body');
    const entry = (id) => [...list().children][Object.keys(Diagram.NODES).indexOf(id)];

    it('has one entry per node, in diagram order, and the Kafka bus last', () => {
      build();
      expect([...list().querySelectorAll('dt')].map((term) => term.textContent)).toStrictEqual([
        ...Object.keys(Diagram.NODES).map((id) => NODE_TEXT()[id].title),
        'Kafka',
      ]);
    });

    it('gives the gateway its subtitle, its description, who it sends to and who it receives from', () => {
      build();
      const sendsTo = DictionaryText.fill('pt-BR', 'architecture.list.sendsTo', {
        targets: 'cobrança, contas, psp-indireto, recorrência, pix-out, dict-service, Keycloak',
      });
      const receivesFrom = DictionaryText.fill('pt-BR', 'architecture.list.receivesFrom', {
        sources: 'API Pix, Apps · portal, PSPs indiretos, Open Finance',
      });
      expect(entry('gateway').outerHTML).toBe(
        asMarkup(
          `<div><dt>${NODE_TEXT().gateway.title}</dt><dd>${NODE_TEXT().gateway.subtitle}</dd><dd>${NODE_TEXT().gateway.description}</dd><dd>${sendsTo} ${receivesFrom}</dd></div>`,
        ),
      );
    });

    it('joins both subtitle lines, and leaves out the direction a node has no edge for: the STR only receives', () => {
      build();
      const receivesFrom = DictionaryText.fill('pt-BR', 'architecture.list.receivesFrom', {
        sources: 'liquidez',
      });
      expect(entry('str').outerHTML).toBe(
        asMarkup(
          `<div><dt>${NODE_TEXT().str.title}</dt><dd>${NODE_TEXT().str.subtitle} · ${NODE_TEXT().str.subtitle2}</dd><dd>${NODE_TEXT().str.description}</dd><dd>${receivesFrom}</dd></div>`,
        ),
      );
    });

    it('describes Kafka with its description, its topics and the services on both sides of it', () => {
      build();
      const sendsTo = DictionaryText.fill('pt-BR', 'architecture.list.sendsTo', {
        targets: 'ledger, antifraude, conciliação, webhooks, liquidez, pix-in',
      });
      const receivesFrom = DictionaryText.fill('pt-BR', 'architecture.list.receivesFrom', {
        sources: 'cobrança, contas, psp-indireto, recorrência, pix-out, dict-service, spi-gateway',
      });
      expect([...list().children].at(-1).outerHTML).toBe(
        asMarkup(
          `<div><dt>Kafka</dt><dd>${DictionaryText.entry('pt-BR', 'architecture.bus')}</dd><dd>${Diagram.TOPICS.join(' · ')}</dd><dd>${sendsTo} ${receivesFrom}</dd></div>`,
        ),
      );
    });

    it('is written again in the new language when the language changes', () => {
      build();
      translator.setLocale('en-US');
      expect([...list().querySelectorAll('dt')].map((term) => term.textContent)).toStrictEqual([
        ...Object.keys(Diagram.NODES).map((id) => NODE_TEXT('en-US')[id].title),
        'Kafka',
      ]);
      expect(entry('str').lastElementChild.textContent).toBe(
        DictionaryText.fill('en-US', 'architecture.list.receivesFrom', {
          sources: NODE_TEXT('en-US').liquidity.title,
        }),
      );
    });
  });

  describe('language', () => {
    it('retranslates every title and subtitle drawn from the dictionary when the language changes', () => {
      build();
      translator.setLocale('en-US');
      const texts = NODE_TEXT('en-US');
      expect(
        ['gateway', 'ledger', 'postgres'].map((id) => [
          node(id).querySelector('.node-title').textContent,
          node(id).querySelector('.node-subtitle').textContent,
        ]),
      ).toStrictEqual(
        ['gateway', 'ledger', 'postgres'].map((id) => [texts[id].title, texts[id].subtitle]),
      );
      expect(layer(ZONES).querySelector('text').textContent).toBe(
        DictionaryText.entry('en-US', 'architecture.zones.channels'),
      );
    });

    it('describes a node in the language of the page at hover time', () => {
      build();
      translator.setLocale('en-US');
      node('postgres')
        .querySelector('rect')
        .dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      expect(tooltip.innerHTML).toBe(
        asMarkup(
          `<b>${NODE_TEXT('en-US').postgres.title}</b>${NODE_TEXT('en-US').postgres.description}`,
        ),
      );
    });
  });
});
