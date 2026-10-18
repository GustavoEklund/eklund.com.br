/**
 * Reference layout of a direct SPI participant. Coordinates are in the SVG's
 * viewBox. Sources: BCB's Roteiro para Participação Direta no SPI, Manual de
 * Tempos do Pix, Manual de Segurança do SFN vol. II and the DICT API docs.
 */
export const NodeKind = Object.freeze({
  EXTERNAL: 'external',
  SERVICE: 'service',
  STORAGE: 'storage',
  PLATFORM: 'platform',
  CENTRAL_BANK: 'central-bank',
  BUS: 'bus',
});

export const EdgeKind = Object.freeze({ SYNC: 'sync', EVENT: 'event', DATA: 'data', RSFN: 'rsfn' });

const SERVICE_WIDTH = 124,
  NODE_HEIGHT = 62,
  ROW_TOP = 118,
  ROW_BOTTOM = 300,
  ROW_MANAGED = 540;
const COLUMNS = [372, 508, 644, 780, 916, 1052];
const INTEGRATION_X = 1196,
  INTEGRATION_WIDTH = 128,
  BANK_X = 1434,
  BANK_WIDTH = 270;

export class Diagram {
  static VIEW_BOX = '0 50 1736 660';
  static NODE_HEIGHT = NODE_HEIGHT;
  static BUS = { x1: COLUMNS[0], x2: COLUMNS[5] + SERVICE_WIDTH, y1: 224, y2: 258, centerY: 241 };
  static TOPICS = [
    'pix.out.requested',
    'pix.in.received',
    'pix.settled',
    'pix.returned',
    'dict.claims',
    'cobranca.paga',
  ];

  static ZONES = [
    { x: 12, y: 60, width: 164, height: 640, label: 'channels' },
    { x: 194, y: 60, width: 1150, height: 640, label: 'aws' },
    { x: 210, y: 84, width: 1120, height: 400, cluster: true },
    { x: 1418, y: 60, width: 302, height: 640, label: 'centralBank' },
  ];
  static ZONE_LABELS = [
    { x: 222, y: 476, id: 'cluster' },
    { x: 222, y: 528, id: 'managed', dim: true },
  ];
  static NETWORK_BAND = {
    x: 1360,
    y: 60,
    width: 42,
    height: 640,
    label: 'rsfn',
    labelX: 1386,
    labelY: 380,
  };

  /** id → { x, y, width, kind, maxReplicas }. Titles and descriptions live in the dictionary under architecture.nodes.<id>. */
  static NODES = {
    apiPix: { x: 22, y: 118, width: 134, kind: NodeKind.EXTERNAL },
    apps: { x: 22, y: 204, width: 134, kind: NodeKind.EXTERNAL },
    indirectPsp: { x: 22, y: 290, width: 134, kind: NodeKind.EXTERNAL },
    openFinance: { x: 22, y: 376, width: 134, kind: NodeKind.EXTERNAL },
    webhooksOut: { x: 22, y: 462, width: 134, kind: NodeKind.EXTERNAL },
    gateway: { x: 222, y: 180, width: 110, kind: NodeKind.SERVICE, maxReplicas: 3 },
    charges: {
      x: COLUMNS[0],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 6,
    },
    accounts: {
      x: COLUMNS[1],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 6,
    },
    indirect: {
      x: COLUMNS[2],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 2,
    },
    recurrence: {
      x: COLUMNS[3],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 2,
    },
    pixOut: {
      x: COLUMNS[4],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 10,
    },
    dictService: {
      x: COLUMNS[5],
      y: ROW_TOP,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 3,
    },
    dictGateway: {
      x: INTEGRATION_X,
      y: ROW_TOP,
      width: INTEGRATION_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 2,
    },
    ledger: {
      x: COLUMNS[0],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 8,
    },
    antiFraud: {
      x: COLUMNS[1],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 4,
    },
    reconcile: {
      x: COLUMNS[2],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 2,
    },
    webhooks: {
      x: COLUMNS[3],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 4,
    },
    liquidity: {
      x: COLUMNS[4],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 1,
    },
    pixIn: {
      x: COLUMNS[5],
      y: ROW_BOTTOM,
      width: SERVICE_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 10,
    },
    spiGateway: {
      x: INTEGRATION_X,
      y: ROW_BOTTOM,
      width: INTEGRATION_WIDTH,
      kind: NodeKind.SERVICE,
      maxReplicas: 4,
    },
    keycloak: { x: 222, y: ROW_MANAGED, width: 110, kind: NodeKind.PLATFORM },
    postgres: { x: COLUMNS[0], y: ROW_MANAGED, width: SERVICE_WIDTH, kind: NodeKind.STORAGE },
    redis: { x: COLUMNS[1], y: ROW_MANAGED, width: SERVICE_WIDTH, kind: NodeKind.STORAGE },
    s3: { x: COLUMNS[2], y: ROW_MANAGED, width: SERVICE_WIDTH, kind: NodeKind.STORAGE },
    sqs: { x: COLUMNS[3], y: ROW_MANAGED, width: SERVICE_WIDTH, kind: NodeKind.STORAGE },
    grafana: { x: COLUMNS[4], y: ROW_MANAGED, width: SERVICE_WIDTH, kind: NodeKind.PLATFORM },
    hsm: { x: INTEGRATION_X, y: ROW_MANAGED, width: INTEGRATION_WIDTH, kind: NodeKind.PLATFORM },
    dict: { x: BANK_X, y: ROW_TOP, width: BANK_WIDTH, kind: NodeKind.CENTRAL_BANK },
    spi: { x: BANK_X, y: ROW_BOTTOM, width: BANK_WIDTH, kind: NodeKind.CENTRAL_BANK },
    str: { x: BANK_X, y: 420, width: BANK_WIDTH, kind: NodeKind.CENTRAL_BANK },
  };

  static anchor(nodeId, side) {
    const node = Diagram.NODES[nodeId];
    switch (side) {
      case 'right':
        return [node.x + node.width, node.y + NODE_HEIGHT / 2];
      case 'left':
        return [node.x, node.y + NODE_HEIGHT / 2];
      case 'bottom':
        return [node.x + node.width / 2, node.y + NODE_HEIGHT];
      default:
        return [node.x + node.width / 2, node.y];
    }
  }

  /** Orthogonal edges: { id, points, kind, weight }. Weight drives how many packets travel it. */
  static edges() {
    const a = Diagram.anchor,
      bus = Diagram.BUS,
      edges = [];
    const add = (id, points, kind, weight = 0.5) => edges.push({ id, points, kind, weight });
    for (const id of ['apiPix', 'apps', 'indirectPsp', 'openFinance']) {
      const [x, y] = a(id, 'right');
      add(
        `${id}>gateway`,
        [
          [x, y],
          [186, y],
          [186, 211],
          [222, 211],
        ],
        EdgeKind.SYNC,
        id === 'apiPix' ? 1 : 0.5,
      );
    }
    for (const id of ['charges', 'accounts', 'indirect', 'recurrence', 'pixOut', 'dictService']) {
      const [x, y] = a(id, 'top');
      add(
        `gateway>${id}`,
        [
          [332, 211],
          [350, 211],
          [350, 102],
          [x, 102],
          [x, y],
        ],
        EdgeKind.SYNC,
        id === 'pixOut' ? 1 : id === 'charges' ? 0.7 : 0.3,
      );
    }
    add('pixOut>dictService', [a('pixOut', 'right'), a('dictService', 'left')], EdgeKind.SYNC, 0.9);
    add(
      'dictService>dictGateway',
      [a('dictService', 'right'), a('dictGateway', 'left')],
      EdgeKind.SYNC,
      0.9,
    );
    add('dictGateway>dict', [a('dictGateway', 'right'), a('dict', 'left')], EdgeKind.RSFN, 0.9);
    add('spiGateway>pixIn', [a('spiGateway', 'left'), a('pixIn', 'right')], EdgeKind.SYNC, 0.9);
    add('spiGateway>spi', [a('spiGateway', 'right'), a('spi', 'left')], EdgeKind.RSFN, 1);
    add(
      'liquidity>str',
      [a('liquidity', 'bottom'), [a('liquidity', 'bottom')[0], 451], [BANK_X, 451]],
      EdgeKind.RSFN,
      0.12,
    );
    for (const id of ['charges', 'accounts', 'indirect', 'recurrence', 'pixOut', 'dictService']) {
      const [x, y] = a(id, 'bottom');
      add(
        `${id}>bus`,
        [
          [x, y],
          [x, bus.y1],
        ],
        EdgeKind.EVENT,
        id === 'pixOut' ? 1 : 0.4,
      );
    }
    for (const id of ['ledger', 'antiFraud', 'reconcile', 'webhooks', 'liquidity', 'pixIn']) {
      const [x, y] = a(id, 'top');
      add(
        `bus>${id}`,
        [
          [x, bus.y2],
          [x, y],
        ],
        EdgeKind.EVENT,
        id === 'liquidity' ? 0.15 : 0.7,
      );
    }
    add(
      'spiGateway>bus',
      [a('spiGateway', 'top'), [a('spiGateway', 'top')[0], bus.centerY], [bus.x2, bus.centerY]],
      EdgeKind.EVENT,
      1,
    );
    add('ledger>postgres', [a('ledger', 'bottom'), a('postgres', 'top')], EdgeKind.DATA, 0.8);
    add('antiFraud>redis', [a('antiFraud', 'bottom'), a('redis', 'top')], EdgeKind.DATA, 0.5);
    add('reconcile>s3', [a('reconcile', 'bottom'), a('s3', 'top')], EdgeKind.DATA, 0.2);
    add('webhooks>sqs', [a('webhooks', 'bottom'), a('sqs', 'top')], EdgeKind.DATA, 0.6);
    add('spiGateway>hsm', [a('spiGateway', 'bottom'), a('hsm', 'top')], EdgeKind.DATA, 0.8);
    add('gateway>keycloak', [a('gateway', 'bottom'), a('keycloak', 'top')], EdgeKind.DATA, 0.1);
    add(
      'sqs>webhooksOut',
      [
        a('sqs', 'bottom'),
        [a('sqs', 'bottom')[0], 650],
        [186, 650],
        [186, 493],
        a('webhooksOut', 'right'),
      ],
      EdgeKind.EVENT,
      0.5,
    );
    return edges;
  }

  /**
   * One cash-out, end to end. Each step: edge id (or 'bus' with [fromX, toX]),
   * reversed?, caption id (architecture.walkthrough.<id>), simulated duration in ms (p50 targets from the Manual de Tempos), milestone.
   */
  static walkthrough() {
    const topOf = (id) => Diagram.anchor(id, 'top')[0],
      bottomOf = (id) => Diagram.anchor(id, 'bottom')[0],
      bus = Diagram.BUS;
    return [
      { edge: 'apiPix>gateway', caption: 'request', ms: 150, milestone: "t0'" },
      { edge: 'gateway>pixOut', caption: 'validate', ms: 150 },
      { edge: 'pixOut>dictService', caption: 'lookupKey', ms: 50 },
      { edge: 'dictService>dictGateway', caption: 'signDictRequest', ms: 50 },
      { edge: 'dictGateway>dict', caption: 'dictAnswer', ms: 300 },
      { edge: 'dictGateway>dict', reversed: true, caption: 'cacheAnswer', ms: 100 },
      { edge: 'dictService>dictGateway', reversed: true, ms: 50 },
      { edge: 'pixOut>dictService', reversed: true, caption: 'keyResolved', ms: 50 },
      { edge: 'pixOut>bus', caption: 'publishRequested', ms: 100 },
      { bus: [bottomOf('pixOut'), topOf('antiFraud')], caption: 'antiFraud', ms: 50 },
      { edge: 'bus>antiFraud', ms: 100 },
      { edge: 'bus>antiFraud', reversed: true, caption: 'released', ms: 50 },
      { bus: [topOf('antiFraud'), topOf('ledger')], ms: 30 },
      { edge: 'bus>ledger', caption: 'ledgerDebit', ms: 150 },
      { edge: 'bus>ledger', reversed: true, caption: 'debited', ms: 50 },
      { bus: [topOf('ledger'), bus.x2], ms: 60 },
      { edge: 'spiGateway>bus', reversed: true, caption: 'buildPacs008', ms: 200, milestone: 't1' },
      { edge: 'spiGateway>spi', caption: 'rsfn', ms: 1400 },
      { edge: 'spiGateway>spi', reversed: true, caption: 'acsp', ms: 1400, milestone: 't5a' },
      { edge: 'spiGateway>bus', caption: 'settled', ms: 100 },
      { bus: [bus.x2, topOf('ledger')], ms: 60 },
      { edge: 'bus>ledger', caption: 'ledgerConfirm', ms: 150 },
      { edge: 'bus>ledger', reversed: true, ms: 30 },
      { bus: [topOf('ledger'), topOf('webhooks')], ms: 40 },
      { edge: 'bus>webhooks', caption: 'queueWebhook', ms: 100 },
      { edge: 'webhooks>sqs', caption: 'queueDelivery', ms: 100 },
      { edge: 'sqs>webhooksOut', caption: 'notified', ms: 500, milestone: 't6a' },
    ];
  }
}
