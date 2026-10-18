import { describe, it, expect } from 'vitest';
import { Diagram, NodeKind, EdgeKind } from '@site/js/architecture-map/diagram.js';

const [, VIEW_TOP, VIEW_WIDTH, VIEW_HEIGHT] = Diagram.VIEW_BOX.split(' ').map(Number);
const nodeIds = Object.keys(Diagram.NODES);
const edges = Diagram.edges();
const steps = Diagram.walkthrough();
const rectangle = (id) => ({
  left: Diagram.NODES[id].x,
  right: Diagram.NODES[id].x + Diagram.NODES[id].width,
  top: Diagram.NODES[id].y,
  bottom: Diagram.NODES[id].y + Diagram.NODE_HEIGHT,
});
const pairs = (items) =>
  items.flatMap((first, index) => items.slice(index + 1).map((second) => [first, second]));

// id, x, y, width, kind, maxReplicas
const NODE_TABLE = [
  ['apiPix', 22, 118, 134, 'external', undefined],
  ['apps', 22, 204, 134, 'external', undefined],
  ['indirectPsp', 22, 290, 134, 'external', undefined],
  ['openFinance', 22, 376, 134, 'external', undefined],
  ['webhooksOut', 22, 462, 134, 'external', undefined],
  ['gateway', 222, 180, 110, 'service', 3],
  ['charges', 372, 118, 124, 'service', 6],
  ['accounts', 508, 118, 124, 'service', 6],
  ['indirect', 644, 118, 124, 'service', 2],
  ['recurrence', 780, 118, 124, 'service', 2],
  ['pixOut', 916, 118, 124, 'service', 10],
  ['dictService', 1052, 118, 124, 'service', 3],
  ['dictGateway', 1196, 118, 128, 'service', 2],
  ['ledger', 372, 300, 124, 'service', 8],
  ['antiFraud', 508, 300, 124, 'service', 4],
  ['reconcile', 644, 300, 124, 'service', 2],
  ['webhooks', 780, 300, 124, 'service', 4],
  ['liquidity', 916, 300, 124, 'service', 1],
  ['pixIn', 1052, 300, 124, 'service', 10],
  ['spiGateway', 1196, 300, 128, 'service', 4],
  ['keycloak', 222, 540, 110, 'platform', undefined],
  ['postgres', 372, 540, 124, 'storage', undefined],
  ['redis', 508, 540, 124, 'storage', undefined],
  ['s3', 644, 540, 124, 'storage', undefined],
  ['sqs', 780, 540, 124, 'storage', undefined],
  ['grafana', 916, 540, 124, 'platform', undefined],
  ['hsm', 1196, 540, 128, 'platform', undefined],
  ['dict', 1434, 118, 270, 'central-bank', undefined],
  ['spi', 1434, 300, 270, 'central-bank', undefined],
  ['str', 1434, 420, 270, 'central-bank', undefined],
];

// id, kind, weight, points
const EDGE_TABLE = [
  [
    'apiPix>gateway',
    'sync',
    1,
    [
      [156, 149],
      [186, 149],
      [186, 211],
      [222, 211],
    ],
  ],
  [
    'apps>gateway',
    'sync',
    0.5,
    [
      [156, 235],
      [186, 235],
      [186, 211],
      [222, 211],
    ],
  ],
  [
    'indirectPsp>gateway',
    'sync',
    0.5,
    [
      [156, 321],
      [186, 321],
      [186, 211],
      [222, 211],
    ],
  ],
  [
    'openFinance>gateway',
    'sync',
    0.5,
    [
      [156, 407],
      [186, 407],
      [186, 211],
      [222, 211],
    ],
  ],
  [
    'gateway>charges',
    'sync',
    0.7,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [434, 102],
      [434, 118],
    ],
  ],
  [
    'gateway>accounts',
    'sync',
    0.3,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [570, 102],
      [570, 118],
    ],
  ],
  [
    'gateway>indirect',
    'sync',
    0.3,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [706, 102],
      [706, 118],
    ],
  ],
  [
    'gateway>recurrence',
    'sync',
    0.3,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [842, 102],
      [842, 118],
    ],
  ],
  [
    'gateway>pixOut',
    'sync',
    1,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [978, 102],
      [978, 118],
    ],
  ],
  [
    'gateway>dictService',
    'sync',
    0.3,
    [
      [332, 211],
      [350, 211],
      [350, 102],
      [1114, 102],
      [1114, 118],
    ],
  ],
  [
    'pixOut>dictService',
    'sync',
    0.9,
    [
      [1040, 149],
      [1052, 149],
    ],
  ],
  [
    'dictService>dictGateway',
    'sync',
    0.9,
    [
      [1176, 149],
      [1196, 149],
    ],
  ],
  [
    'dictGateway>dict',
    'rsfn',
    0.9,
    [
      [1324, 149],
      [1434, 149],
    ],
  ],
  [
    'spiGateway>pixIn',
    'sync',
    0.9,
    [
      [1196, 331],
      [1176, 331],
    ],
  ],
  [
    'spiGateway>spi',
    'rsfn',
    1,
    [
      [1324, 331],
      [1434, 331],
    ],
  ],
  [
    'liquidity>str',
    'rsfn',
    0.12,
    [
      [978, 362],
      [978, 451],
      [1434, 451],
    ],
  ],
  [
    'charges>bus',
    'event',
    0.4,
    [
      [434, 180],
      [434, 224],
    ],
  ],
  [
    'accounts>bus',
    'event',
    0.4,
    [
      [570, 180],
      [570, 224],
    ],
  ],
  [
    'indirect>bus',
    'event',
    0.4,
    [
      [706, 180],
      [706, 224],
    ],
  ],
  [
    'recurrence>bus',
    'event',
    0.4,
    [
      [842, 180],
      [842, 224],
    ],
  ],
  [
    'pixOut>bus',
    'event',
    1,
    [
      [978, 180],
      [978, 224],
    ],
  ],
  [
    'dictService>bus',
    'event',
    0.4,
    [
      [1114, 180],
      [1114, 224],
    ],
  ],
  [
    'bus>ledger',
    'event',
    0.7,
    [
      [434, 258],
      [434, 300],
    ],
  ],
  [
    'bus>antiFraud',
    'event',
    0.7,
    [
      [570, 258],
      [570, 300],
    ],
  ],
  [
    'bus>reconcile',
    'event',
    0.7,
    [
      [706, 258],
      [706, 300],
    ],
  ],
  [
    'bus>webhooks',
    'event',
    0.7,
    [
      [842, 258],
      [842, 300],
    ],
  ],
  [
    'bus>liquidity',
    'event',
    0.15,
    [
      [978, 258],
      [978, 300],
    ],
  ],
  [
    'bus>pixIn',
    'event',
    0.7,
    [
      [1114, 258],
      [1114, 300],
    ],
  ],
  [
    'spiGateway>bus',
    'event',
    1,
    [
      [1260, 300],
      [1260, 241],
      [1176, 241],
    ],
  ],
  [
    'ledger>postgres',
    'data',
    0.8,
    [
      [434, 362],
      [434, 540],
    ],
  ],
  [
    'antiFraud>redis',
    'data',
    0.5,
    [
      [570, 362],
      [570, 540],
    ],
  ],
  [
    'reconcile>s3',
    'data',
    0.2,
    [
      [706, 362],
      [706, 540],
    ],
  ],
  [
    'webhooks>sqs',
    'data',
    0.6,
    [
      [842, 362],
      [842, 540],
    ],
  ],
  [
    'spiGateway>hsm',
    'data',
    0.8,
    [
      [1260, 362],
      [1260, 540],
    ],
  ],
  [
    'gateway>keycloak',
    'data',
    0.1,
    [
      [277, 242],
      [277, 540],
    ],
  ],
  [
    'sqs>webhooksOut',
    'event',
    0.5,
    [
      [842, 602],
      [842, 650],
      [186, 650],
      [186, 493],
      [156, 493],
    ],
  ],
];

const STEP_TABLE = [
  { edge: 'apiPix>gateway', caption: 'request', ms: 150, milestone: "t0'" },
  { edge: 'gateway>pixOut', caption: 'validate', ms: 150 },
  { edge: 'pixOut>dictService', caption: 'lookupKey', ms: 50 },
  { edge: 'dictService>dictGateway', caption: 'signDictRequest', ms: 50 },
  { edge: 'dictGateway>dict', caption: 'dictAnswer', ms: 300 },
  { edge: 'dictGateway>dict', reversed: true, caption: 'cacheAnswer', ms: 100 },
  { edge: 'dictService>dictGateway', reversed: true, ms: 50 },
  { edge: 'pixOut>dictService', reversed: true, caption: 'keyResolved', ms: 50 },
  { edge: 'pixOut>bus', caption: 'publishRequested', ms: 100 },
  { bus: [978, 570], caption: 'antiFraud', ms: 50 },
  { edge: 'bus>antiFraud', ms: 100 },
  { edge: 'bus>antiFraud', reversed: true, caption: 'released', ms: 50 },
  { bus: [570, 434], ms: 30 },
  { edge: 'bus>ledger', caption: 'ledgerDebit', ms: 150 },
  { edge: 'bus>ledger', reversed: true, caption: 'debited', ms: 50 },
  { bus: [434, 1176], ms: 60 },
  { edge: 'spiGateway>bus', reversed: true, caption: 'buildPacs008', ms: 200, milestone: 't1' },
  { edge: 'spiGateway>spi', caption: 'rsfn', ms: 1400 },
  { edge: 'spiGateway>spi', reversed: true, caption: 'acsp', ms: 1400, milestone: 't5a' },
  { edge: 'spiGateway>bus', caption: 'settled', ms: 100 },
  { bus: [1176, 434], ms: 60 },
  { edge: 'bus>ledger', caption: 'ledgerConfirm', ms: 150 },
  { edge: 'bus>ledger', reversed: true, ms: 30 },
  { bus: [434, 842], ms: 40 },
  { edge: 'bus>webhooks', caption: 'queueWebhook', ms: 100 },
  { edge: 'webhooks>sqs', caption: 'queueDelivery', ms: 100 },
  { edge: 'sqs>webhooksOut', caption: 'notified', ms: 500, milestone: 't6a' },
];

describe('Diagram constants', () => {
  it('describes the canvas, the bus and the topics exactly', () => {
    expect(Diagram.VIEW_BOX).toBe('0 50 1736 660');
    expect(Diagram.NODE_HEIGHT).toBe(62);
    expect(Diagram.BUS).toStrictEqual({ x1: 372, x2: 1176, y1: 224, y2: 258, centerY: 241 });
    expect(Diagram.TOPICS).toStrictEqual([
      'pix.out.requested',
      'pix.in.received',
      'pix.settled',
      'pix.returned',
      'dict.claims',
      'cobranca.paga',
    ]);
  });

  it('lays out the zones, their labels and the RSFN band exactly', () => {
    expect(Diagram.ZONES).toStrictEqual([
      { x: 12, y: 60, width: 164, height: 640, label: 'channels' },
      { x: 194, y: 60, width: 1150, height: 640, label: 'aws' },
      { x: 210, y: 84, width: 1120, height: 400, cluster: true },
      { x: 1418, y: 60, width: 302, height: 640, label: 'centralBank' },
    ]);
    expect(Diagram.ZONE_LABELS).toStrictEqual([
      { x: 222, y: 476, id: 'cluster' },
      { x: 222, y: 528, id: 'managed', dim: true },
    ]);
    expect(Diagram.NETWORK_BAND).toStrictEqual({
      x: 1360,
      y: 60,
      width: 42,
      height: 640,
      label: 'rsfn',
      labelX: 1386,
      labelY: 380,
    });
  });

  it('freezes the kind enums with their exact values', () => {
    expect(Object.isFrozen(NodeKind)).toBe(true);
    expect(Object.isFrozen(EdgeKind)).toBe(true);
    expect(NodeKind).toStrictEqual({
      EXTERNAL: 'external',
      SERVICE: 'service',
      STORAGE: 'storage',
      PLATFORM: 'platform',
      CENTRAL_BANK: 'central-bank',
      BUS: 'bus',
    });
    expect(EdgeKind).toStrictEqual({ SYNC: 'sync', EVENT: 'event', DATA: 'data', RSFN: 'rsfn' });
  });
});

describe('Diagram nodes', () => {
  it('are exactly these 30, in this order, at these positions', () => {
    expect(
      Object.entries(Diagram.NODES).map(([id, node]) => [
        id,
        node.x,
        node.y,
        node.width,
        node.kind,
        node.maxReplicas,
      ]),
    ).toStrictEqual(NODE_TABLE);
  });

  it('give a replica limit to services and to nothing else', () => {
    expect(
      Object.entries(Diagram.NODES)
        .filter(([, node]) => (node.kind === NodeKind.SERVICE) !== (node.maxReplicas !== undefined))
        .map(([id]) => id),
    ).toStrictEqual([]);
  });

  it('stay inside the view box', () => {
    expect(
      nodeIds.filter((id) => {
        const { left, right, top, bottom } = rectangle(id);
        return left < 0 || right > VIEW_WIDTH || top < VIEW_TOP || bottom > VIEW_TOP + VIEW_HEIGHT;
      }),
    ).toStrictEqual([]);
  });

  it('never overlap one another', () => {
    expect(
      pairs(nodeIds).filter(([a, b]) => {
        const first = rectangle(a),
          second = rectangle(b);
        return (
          first.left < second.right &&
          second.left < first.right &&
          first.top < second.bottom &&
          second.top < first.bottom
        );
      }),
    ).toStrictEqual([]);
  });

  it('stay clear of the Kafka bus', () => {
    expect(
      nodeIds.filter((id) => {
        const { left, right, top, bottom } = rectangle(id);
        return (
          left < Diagram.BUS.x2 &&
          Diagram.BUS.x1 < right &&
          top < Diagram.BUS.y2 &&
          Diagram.BUS.y1 < bottom
        );
      }),
    ).toStrictEqual([]);
  });

  it('keep the zones inside the view box', () => {
    expect(
      Diagram.ZONES.filter(
        (zone) =>
          zone.x < 0 ||
          zone.x + zone.width > VIEW_WIDTH ||
          zone.y < VIEW_TOP ||
          zone.y + zone.height > VIEW_TOP + VIEW_HEIGHT,
      ),
    ).toStrictEqual([]);
  });
});

describe('Diagram.anchor', () => {
  it('finds the middle of each side of the ledger node (x 372, y 300, width 124)', () => {
    expect([
      Diagram.anchor('ledger', 'right'),
      Diagram.anchor('ledger', 'left'),
      Diagram.anchor('ledger', 'bottom'),
      Diagram.anchor('ledger', 'top'),
    ]).toStrictEqual([
      [496, 331],
      [372, 331],
      [434, 362],
      [434, 300],
    ]);
  });

  it('treats an unknown side as the top', () =>
    expect(Diagram.anchor('ledger', 'nowhere')).toStrictEqual([434, 300]));

  it('uses each node width, so a wide node anchors further right', () => {
    expect([Diagram.anchor('dict', 'right'), Diagram.anchor('dict', 'top')]).toStrictEqual([
      [1704, 149],
      [1569, 118],
    ]);
  });
});

describe('Diagram.edges', () => {
  it('are exactly these 36, in this order, with these kinds, weights and routes', () => {
    expect(edges.map((edge) => [edge.id, edge.kind, edge.weight, edge.points])).toStrictEqual(
      EDGE_TABLE,
    );
  });

  it('expose nothing but id, points, kind and weight', () => {
    expect(edges.map((edge) => Object.keys(edge).join())).toStrictEqual(
      edges.map(() => 'id,points,kind,weight'),
    );
  });

  it('have unique ids', () => {
    expect(
      edges.map((edge) => edge.id).filter((id, index, ids) => ids.indexOf(id) !== index),
    ).toStrictEqual([]);
  });

  it('connect nodes that exist, or the bus', () => {
    expect(
      edges.flatMap((edge) =>
        edge.id
          .split('>')
          .filter((endpoint) => endpoint !== 'bus' && !nodeIds.includes(endpoint))
          .map((endpoint) => `${edge.id}: ${endpoint}`),
      ),
    ).toStrictEqual([]);
  });

  it('use only horizontal and vertical legs', () => {
    expect(
      edges.flatMap((edge) =>
        edge.points
          .slice(1)
          .map(([x, y], index) => [
            edge.id,
            index,
            x === edge.points[index][0] || y === edge.points[index][1],
          ])
          .filter(([, , straight]) => !straight),
      ),
    ).toStrictEqual([]);
  });

  it('never repeat a point, which would draw a zero-length leg', () => {
    expect(
      edges.flatMap((edge) =>
        edge.points
          .slice(1)
          .map(([x, y], index) => [
            edge.id,
            index,
            x === edge.points[index][0] && y === edge.points[index][1],
          ])
          .filter(([, , repeated]) => repeated),
      ),
    ).toStrictEqual([]);
  });

  it('keep every point inside the view box', () => {
    expect(
      edges.flatMap((edge) =>
        edge.points
          .filter(([x, y]) => x < 0 || x > VIEW_WIDTH || y < VIEW_TOP || y > VIEW_TOP + VIEW_HEIGHT)
          .map((point) => [edge.id, point]),
      ),
    ).toStrictEqual([]);
  });

  it('start and end on the node borders for point-to-point edges', () => {
    const ledger = edges.find(({ id }) => id === 'ledger>postgres');
    expect([ledger.points[0], ledger.points.at(-1)]).toStrictEqual([
      Diagram.anchor('ledger', 'bottom'),
      Diagram.anchor('postgres', 'top'),
    ]);
  });

  it('is rebuilt fresh on every call, with equal content', () => {
    const again = Diagram.edges();
    expect(Object.is(again, edges)).toBe(false);
    expect(again).toStrictEqual(edges);
  });
});

describe('Diagram.walkthrough', () => {
  it('is exactly these 27 steps, in this order', () => expect(steps).toStrictEqual(STEP_TABLE));

  it('runs along edges that exist, or along the bus between two x positions inside it', () => {
    const edgeIds = edges.map(({ id }) => id);
    expect(
      steps
        .map((step, index) => [index, step])
        .filter(([, step]) =>
          step.edge
            ? !edgeIds.includes(step.edge)
            : step.bus.some((x) => x < Diagram.BUS.x1 || x > Diagram.BUS.x2),
        )
        .map(([index]) => index),
    ).toStrictEqual([]);
  });

  it('takes 5570 ms of simulated time, 2800 of them in the RSFN round trip', () => {
    expect(steps.reduce((sum, step) => sum + step.ms, 0)).toBe(5570);
    expect(
      steps.filter((step) => step.edge === 'spiGateway>spi').map((step) => step.ms),
    ).toStrictEqual([1400, 1400]);
  });

  it('marks the four timing milestones in order', () => {
    expect(
      steps.filter((step) => step.milestone).map((step) => [step.caption, step.milestone]),
    ).toStrictEqual([
      ['request', "t0'"],
      ['buildPacs008', 't1'],
      ['acsp', 't5a'],
      ['notified', 't6a'],
    ]);
  });

  it('only goes back along an edge it walked forward, except the pacs.008 that leaves the bus on the SPI gateway edge', () => {
    const walkedForward = new Set();
    const violations = [];
    for (const step of steps) {
      if (!step.edge) continue;
      if (!step.reversed) walkedForward.add(step.edge);
      else if (step.edge !== 'spiGateway>bus' && !walkedForward.has(step.edge))
        violations.push(step.edge);
    }
    expect(violations).toStrictEqual([]);
  });

  it('uses unique caption ids', () => {
    const captions = steps.map((step) => step.caption).filter((caption) => caption !== undefined);
    expect(captions.filter((caption, index) => captions.indexOf(caption) !== index)).toStrictEqual(
      [],
    );
  });
});
