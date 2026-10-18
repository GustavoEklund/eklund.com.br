import { Dom } from '../shared/dom.js';
import { Numbers } from '../shared/math.js';
import { Formatter } from '../shared/format.js';
import { Environment } from '../shared/environment.js';
import { RenderLoop } from '../shared/render-loop.js';
import { Diagram, EdgeKind, NodeKind } from './diagram.js';
import { OrthogonalPath } from './orthogonal-path.js';
import { TrafficSimulation } from './traffic-simulation.js';
import { PixWalkthrough } from './pix-walkthrough.js';

const SAMPLE_INTERVAL_MS = 420;
const MAX_PACKETS = 80;
const SPARKLINE_POINTS = 16;
const TOOLTIP_WIDTH = 330;
const TOOLTIP_GAP = 6;
const TOOLTIP_HIDE_DELAY_MS = 220; // long enough to cross from the node to its tooltip

/** The SVG map: zones, orthogonal edges, nodes with sparklines and HPA replicas, packets, hover and the walkthrough. */
export class ArchitectureMap {
  #svg;
  #tooltip;
  #root;
  #translator;
  #layers = {
    zones: Dom.svg('g'),
    edges: Dom.svg('g'),
    nodes: Dom.svg('g'),
    packets: Dom.svg('g'),
    tracked: Dom.svg('g'),
  };
  #edges = [];
  #edgesById = {};
  #nodes = {};
  #topicBars = [];
  #packets = [];
  #walkthrough;
  #hoveredId = null;
  #hideTimer = 0;
  #lastSampleAt = 0;

  constructor({ root, svg, tooltip, caption, followButton, translator }) {
    this.#root = root;
    this.#svg = svg;
    this.#tooltip = tooltip;
    this.#translator = translator;
    this.#walkthrough = new PixWalkthrough({
      edgesById: this.#edgesById,
      layer: this.#layers.tracked,
      caption,
      button: followButton,
      translator,
    });
    followButton.addEventListener('click', () => {
      this.#walkthrough.start();
      this.#loop.start();
    });
  }

  #loop;

  mount() {
    this.#svg.setAttribute('viewBox', Diagram.VIEW_BOX);
    this.#drawZones();
    this.#drawEdges();
    this.#drawNodes();
    this.#drawBus();
    this.#svg.append(...Object.values(this.#layers));
    for (const edge of this.#edges) edge.length = edge.path.getTotalLength();
    this.#sample(0);
    this.#bindHover();
    this.#renderList();
    this.#translator.onChange(() => this.#renderList());
    // Traffic runs while motion is on; with motion off the loop only runs for the Pix the visitor asks to follow.
    this.#loop = new RenderLoop(this.#svg, (now, delta) => this.#frame(now, delta), {
      threshold: 0.05,
      shouldRun: () => !Environment.prefersReducedMotion || this.#walkthrough.isActive,
    });
    return this;
  }

  /** Brings the traffic back when motion is switched on; switching it off clears the packets in flight. */
  sync() {
    if (!Environment.prefersReducedMotion) {
      this.#loop.start();
      return;
    }
    for (const packet of this.#packets) packet.circle.remove();
    this.#packets = [];
  }

  followPix() {
    this.#walkthrough.start();
    this.#loop.start();
  }

  /** An SVG <text> whose content comes from the dictionary; data-i18n keeps it translated when the language changes. */
  #text(key, attributes) {
    return Dom.svg('text', { ...attributes, 'data-i18n': key }, this.#translator.t(key));
  }

  #drawZones() {
    const zones = this.#layers.zones;
    for (const zone of Diagram.ZONES) {
      zones.append(
        Dom.svg('rect', {
          class: `zone${zone.cluster ? ' zone-cluster' : ''}`,
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: zone.height,
        }),
      );
      if (zone.label)
        zones.append(
          this.#text(`architecture.zones.${zone.label}`, {
            class: 'zone-label',
            x: zone.x + 12,
            y: zone.y + 17,
          }),
        );
    }
    for (const label of Diagram.ZONE_LABELS)
      zones.append(
        this.#text(`architecture.zones.${label.id}`, {
          class: `zone-label${label.dim ? ' is-dim' : ''}`,
          x: label.x,
          y: label.y,
        }),
      );
    const band = Diagram.NETWORK_BAND;
    zones.append(
      Dom.svg('rect', {
        class: 'network-band',
        x: band.x,
        y: band.y,
        width: band.width,
        height: band.height,
      }),
    );
    zones.append(
      this.#text(`architecture.zones.${band.label}`, {
        class: 'zone-label is-vertical',
        transform: `translate(${band.labelX} ${band.labelY}) rotate(-90)`,
      }),
    );
  }

  #drawEdges() {
    for (const spec of Diagram.edges()) {
      const path = Dom.svg('path', {
        class: `edge ${spec.kind}`,
        d: OrthogonalPath.build(spec.points),
        'data-id': spec.id,
      });
      this.#layers.edges.append(path);
      const [from, to] = spec.id.split('>');
      const edge = { ...spec, from, to, path, length: 0 };
      this.#edges.push(edge);
      this.#edgesById[spec.id] = edge;
    }
  }

  #drawNodes() {
    const height = Diagram.NODE_HEIGHT;
    for (const [id, spec] of Object.entries(Diagram.NODES)) {
      const group = Dom.svg('g', {
        class: `node node-${spec.kind}`,
        'data-id': id,
        transform: `translate(${spec.x},${spec.y})`,
      });
      group.append(Dom.svg('rect', { width: spec.width, height }));
      const key = (field) => `architecture.nodes.${id}.${field}`;
      group.append(this.#text(key('title'), { class: 'node-title', x: 10, y: 21 }));
      group.append(this.#text(key('subtitle'), { class: 'node-subtitle', x: 10, y: 35 }));
      if (this.#translator.has(key('subtitle2')))
        group.append(this.#text(key('subtitle2'), { class: 'node-subtitle', x: 10, y: 49 }));
      const node = { ...spec, id, group, history: Array(SPARKLINE_POINTS).fill(0.3), replicas: 1 };
      if (spec.kind === NodeKind.SERVICE) {
        node.sparklineFill = Dom.svg('path', { class: 'node-sparkline-fill' });
        node.sparkline = Dom.svg('path', { class: 'node-sparkline' });
        node.replicasText = Dom.svg(
          'text',
          { class: 'node-replicas-text', x: spec.width - 20, y: height - 9 },
          '×1',
        );
        group.append(
          node.sparklineFill,
          node.sparkline,
          Dom.svg('rect', {
            class: 'node-replicas',
            x: spec.width - 32,
            y: height - 20,
            width: 24,
            height: 14,
          }),
          node.replicasText,
        );
      }
      node.health = Dom.svg('circle', { class: 'node-health', cx: spec.width - 10, cy: 10, r: 3 });
      group.append(node.health);
      this.#layers.nodes.append(group);
      this.#nodes[id] = node;
    }
  }

  #drawBus() {
    const bus = Diagram.BUS;
    const group = Dom.svg('g', { class: 'node event-bus', 'data-id': 'bus' });
    group.append(
      Dom.svg('rect', { x: bus.x1, y: bus.y1, width: bus.x2 - bus.x1, height: bus.y2 - bus.y1 }),
    );
    group.append(
      Dom.svg('text', { class: 'node-title', x: bus.x1 + 12, y: bus.centerY + 5 }, 'Kafka'),
    );
    this.#topicBars = Diagram.TOPICS.map((topic, index) => {
      const x = bus.x1 + 84 + index * 118;
      group.append(Dom.svg('text', { class: 'bus-topic', x, y: bus.centerY - 2 }, topic));
      const bar = Dom.svg('rect', {
        class: 'bus-topic-bar',
        x,
        y: bus.centerY + 3,
        width: 6,
        height: 5,
      });
      group.append(bar);
      return bar;
    });
    this.#layers.nodes.append(group);
  }

  #sparklinePath(node) {
    const width = node.width,
      height = Diagram.NODE_HEIGHT;
    return node.history
      .map(
        (value, index) =>
          `${index ? 'L' : 'M'}${(10 + (index * (width - 44)) / (SPARKLINE_POINTS - 1)).toFixed(1)},${(height - 6 - value * 12).toFixed(1)}`,
      )
      .join('');
  }

  #sample(seconds) {
    const load = TrafficSimulation.load(seconds);
    let replicas = 0,
      capacity = 0;
    for (const node of Object.values(this.#nodes)) {
      if (node.kind !== NodeKind.SERVICE) continue;
      node.history.push(TrafficSimulation.sampleService(load));
      node.history.shift();
      const path = this.#sparklinePath(node);
      node.sparkline.setAttribute('d', path);
      node.sparklineFill.setAttribute(
        'd',
        `${path}L${node.width - 34},${Diagram.NODE_HEIGHT - 6}L10,${Diagram.NODE_HEIGHT - 6}Z`,
      );
      const target = TrafficSimulation.replicasFor(load, node.maxReplicas);
      if (target !== node.replicas) {
        node.replicas = target;
        node.replicasText.textContent = `×${target}`;
      }
      replicas += target;
      capacity += node.maxReplicas;
    }
    this.#topicBars.forEach((bar, index) =>
      bar.setAttribute('width', Math.round(6 + 80 * TrafficSimulation.topicActivity(load, index))),
    );
    this.#nodes.dictGateway.health.classList.toggle('is-warning', load > 0.92);
    Dom.setText(this.#root.querySelector('#architecture-load'), `${Math.round(load * 100)}%`);
    Dom.setText(this.#root.querySelector('#architecture-tps'), TrafficSimulation.throughput(load));
    Dom.setText(this.#root.querySelector('#architecture-replicas'), `${replicas}/${capacity}`);
  }

  #spawnPackets(delta, load) {
    if (this.#packets.length >= MAX_PACKETS) return;
    for (const edge of this.#edges) {
      if (Math.random() >= delta * 2.4 * edge.weight * load) continue;
      const circle = Dom.svg('circle', {
        class: `packet ${edge.kind}`,
        r: edge.kind === EdgeKind.DATA ? 2 : 2.6,
      });
      this.#layers.packets.append(circle);
      this.#packets.push({
        edge,
        circle,
        distance: 0,
        speed: (edge.kind === EdgeKind.DATA ? 140 : 240) * (0.8 + 0.4 * Math.random()),
      });
    }
  }

  #movePackets(delta) {
    for (let index = this.#packets.length - 1; index >= 0; index--) {
      const packet = this.#packets[index];
      packet.distance += packet.speed * delta;
      if (packet.distance >= packet.edge.length) {
        packet.circle.remove();
        this.#packets.splice(index, 1);
        continue;
      }
      const point = packet.edge.path.getPointAtLength(packet.distance);
      packet.circle.setAttribute('cx', point.x.toFixed(1));
      packet.circle.setAttribute('cy', point.y.toFixed(1));
    }
  }

  #frame(now, delta) {
    if (!Environment.prefersReducedMotion) {
      const seconds = now / 1000;
      if (now - this.#lastSampleAt > SAMPLE_INTERVAL_MS) {
        this.#lastSampleAt = now;
        this.#sample(seconds);
      }
      this.#spawnPackets(delta, TrafficSimulation.load(seconds));
      this.#movePackets(delta);
    }
    if (this.#walkthrough.isActive) this.#walkthrough.advance(delta);
  }

  /**
   * The tooltip sits next to its node, not on the pointer (WCAG 1.4.13): the pointer can move onto it to read it,
   * it stays until the pointer has left both, and Escape dismisses it.
   */
  #bindHover() {
    const svg = this.#svg,
      tooltip = this.#tooltip;
    svg.addEventListener('pointerover', (event) => {
      const id = event.target.closest('.node')?.dataset.id;
      if (id === this.#hoveredId) return;
      clearTimeout(this.#hideTimer);
      if (!id) {
        this.#hideTimer = setTimeout(() => this.#dismissTooltip(), TOOLTIP_HIDE_DELAY_MS);
        return;
      }
      this.#hoveredId = id;
      for (const edge of this.#edges)
        edge.path.classList.toggle('is-active', edge.from === id || edge.to === id);
      for (const node of Object.values(this.#nodes))
        node.group.classList.toggle('is-active', node.id === id);
      tooltip.innerHTML = this.#tooltipHtml(id);
      tooltip.hidden = false;
      this.#placeTooltip(id);
    });
    const hideSoon = () => {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = setTimeout(() => this.#dismissTooltip(), TOOLTIP_HIDE_DELAY_MS);
    };
    svg.addEventListener('pointerleave', hideSoon);
    tooltip.addEventListener('pointerenter', () => clearTimeout(this.#hideTimer));
    tooltip.addEventListener('pointerleave', hideSoon);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !tooltip.hidden) this.#dismissTooltip();
    });
  }

  #dismissTooltip() {
    clearTimeout(this.#hideTimer);
    this.#hoveredId = null;
    this.#tooltip.hidden = true;
    for (const edge of this.#edges) edge.path.classList.remove('is-active');
    for (const node of Object.values(this.#nodes)) node.group.classList.remove('is-active');
  }

  /** Below the node, or above it when the canvas would cut the tooltip off; inside the scrolled width. */
  #placeTooltip(id) {
    const canvas = this.#svg.parentElement,
      tooltip = this.#tooltip;
    const target = id === 'bus' ? this.#svg.querySelector('.event-bus') : this.#nodes[id].group;
    const box = target.getBoundingClientRect(),
      frame = canvas.getBoundingClientRect();
    const below = box.bottom - frame.top + TOOLTIP_GAP;
    const above = box.top - frame.top - tooltip.offsetHeight - TOOLTIP_GAP;
    tooltip.style.left = `${Numbers.clamp(box.left - frame.left + canvas.scrollLeft, 0, canvas.scrollWidth - TOOLTIP_WIDTH)}px`;
    tooltip.style.top = `${below + tooltip.offsetHeight > canvas.clientHeight && above >= 0 ? above : below}px`;
  }

  /** The same facts the hover shows, as a list: nothing in the map is only reachable with a pointer. */
  #renderList() {
    const t = (key, params) => this.#translator.t(key, params);
    const title = (id) => (id === 'bus' ? 'Kafka' : t(`architecture.nodes.${id}.title`));
    const flows = (id) => {
      const targets = this.#edges.filter((edge) => edge.from === id).map((edge) => title(edge.to));
      const sources = this.#edges.filter((edge) => edge.to === id).map((edge) => title(edge.from));
      return [
        targets.length && t('architecture.list.sendsTo', { targets: targets.join(', ') }),
        sources.length && t('architecture.list.receivesFrom', { sources: sources.join(', ') }),
      ]
        .filter(Boolean)
        .join(' ');
    };
    const entry = (id, details) =>
      `<div><dt>${title(id)}</dt>${details
        .filter(Boolean)
        .map((detail) => `<dd>${detail}</dd>`)
        .join('')}</div>`;
    const nodes = Object.keys(Diagram.NODES).map((id) => {
      const subtitles = ['subtitle', 'subtitle2']
        .filter((field) => this.#translator.has(`architecture.nodes.${id}.${field}`))
        .map((field) => t(`architecture.nodes.${id}.${field}`))
        .join(' · ');
      return entry(id, [subtitles, t(`architecture.nodes.${id}.description`), flows(id)]);
    });
    nodes.push(entry('bus', [t('architecture.bus'), Diagram.TOPICS.join(' · '), flows('bus')]));
    this.#root.querySelector('#architecture-list-body').innerHTML = nodes.join('');
  }

  #tooltipHtml(id) {
    const t = (key, params) => this.#translator.t(key, params);
    if (id === 'bus')
      return `<b>Kafka</b>${t('architecture.bus')}<span>${Diagram.TOPICS.join(' · ')}</span>`;
    const node = this.#nodes[id];
    const load = node.history.at(-1);
    const stats =
      node.kind === NodeKind.SERVICE
        ? `<span>${t('architecture.tooltip', { replicas: node.replicas, max: node.maxReplicas, rps: Math.round(load * 500), p95: Math.round(80 + 120 * load), errors: Formatter.decimal(load * 0.25) })}</span>`
        : '';
    return `<b>${t(`architecture.nodes.${id}.title`)}</b>${t(`architecture.nodes.${id}.description`)}${stats}`;
  }
}
