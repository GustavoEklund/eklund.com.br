/** American English. Same key set as pt-br.js (tools/i18n-check.mjs). BCB terms (SPI, DICT, Pix, pacs.008…) stay as in Portuguese. */
export const EN_US = {
  meta: {
    title: 'Gustavo Eklund | Backend developer, Pix and payments',
    description:
      'Gustavo Eklund is a backend developer in Taubaté, Brazil. He develops payment systems, mostly with Pix, that handle more than 2 million transactions a day.',
    imageAlt:
      'Gustavo Eklund in large letters on a dark background, with the green "e" mark, the words Backend and Pix, and the address eklund.com.br.',
  },

  nav: {
    skip: 'Skip to content',
    home: 'eklund.com.br, home',
    main: 'Main',
    status: 'Status',
    profile: 'Profile',
    architecture: 'Architecture',
    load: 'Load',
    history: 'History',
    contact: 'Contact',
    paletteLabel: 'Open command palette',
    paletteTitle: 'Command palette (Ctrl K)',
    sourceLabel: 'Source code on GitHub',
    sourceTitle: 'Source code of this site on GitHub',
    themeLabel: 'Dark theme',
    themeTitle: 'Theme',
    motionLabel: 'Pause animations',
    motionTitle: 'Pause animations and live updates',
    language: 'Language',
  },

  scrollbar: {
    hero: 'top',
    status: 'status',
    profile: 'profile',
    architecture: 'architecture',
    load: 'load',
    history: 'history',
    contact: 'contact',
  },

  cursor: { drag: 'drag', copy: 'copy', open: 'open' },

  hero: {
    eyebrow: 'Senior backend developer · Taubaté, Brazil',
    localTime: 'local time in Taubaté',
    tagline: 'I develop payment systems, mostly with Pix.',
    rotating: {
      label:
        'More than 2 million transactions a day, peaks of 500 per second, 99% of responses within 300 milliseconds, 99.9% availability',
      volume: 'more than 2 million transactions/day',
      peak: 'peaks of ~500 transactions/s',
      latency: '99% of responses under 300 ms',
      uptime: '99.9% availability',
    },
    shortcut: 'navigate',
    globe:
      'WebGL 3D globe with land points and arcs leaving Taubaté. Drag or use the arrow keys to spin.',
    scrollCue: 'scroll',
    chips: {
      network: 'KB over the wire',
      networkNote: '0 dependencies',
      points: 'points',
      pointsNote: 'WebGL2 · drawn point by point',
      fpsNote: 'measured now, in your browser',
    },
    controls: {
      label: 'Globe controls',
      title: 'globe',
      hue: 'hue',
      speed: 'speed',
      points: 'points',
      hueAria: 'hue',
      speedAria: 'speed',
      pointsAria: 'point multiplier',
    },
  },

  marquee: { microservices: 'Microservices', messaging: 'Messaging' },

  status: {
    eyebrow: "This page's status",
    title: 'Live monitoring, <em>measured in your browser.</em>',
    lead: "This section is the status page for this site. The components, incidents and trace come from your browser's Performance API, measured on this visit, and no value is hard-coded.",
    components: 'Components',
    updated: 'updated',
    levels: ['operational', 'degraded', 'unavailable'],
    banners: ['All systems operational', 'Degraded performance', 'Partial outage'],
    history: { title: 'Last 90 seconds of this visit', quiet: '{percent}% incident-free' },
    incidents: {
      title: 'Incidents',
      none: 'No incidents on this visit.',
      resolved: 'resolved',
      layoutShift: 'Layout shift of {value}',
      longTask: 'Long task of {duration} ms on the main thread',
      lowFps: 'Globe below {threshold} fps ({fps} fps)',
      loadTest: 'Load test: {done} Pix in {seconds} s',
    },
    checks: {
      document: {
        name: 'Document',
        detail: '{kilobytes} KB over the wire · {requests} · {files} site files',
        requests: { one: '{count} request', other: '{count} requests' },
      },
      fonts: { name: 'Fonts', detail: '{loaded}/3 families loaded · self-hosted WOFF2' },
      globe: {
        name: 'WebGL2 globe',
        unavailable: 'WebGL2 unavailable in this browser',
        paused: 'paused off-screen',
        detail: '{points} points · {fps} · {dpr}× DPR',
      },
      mainThread: {
        name: 'Main thread',
        detail: { one: '{count} long task above 50 ms', other: '{count} long tasks above 50 ms' },
      },
      layoutShift: { name: 'Layout shift', detail: 'CLS {value} · worst 5 s window' },
      dependencies: {
        name: 'Dependencies',
        detail:
          '0 packages · 0 frameworks · {images} images (logos, lazy) · 0 cookies · 0 trackers',
      },
      platform: { name: 'Platform' },
      contrast: {
        name: 'Contrast (WCAG 2.2)',
        measuring: 'measuring this page’s colors…',
        detail:
          '{passing}/{pairs} pairs pass AA · text ≥ {text}:1 · components ≥ {component}:1 · {theme} {hue}°',
        themes: { dark: 'dark', light: 'light' },
      },
    },
  },

  trace: {
    label: 'Trace of this visit',
    meta: { spans: 'spans', services: 'services', start: 'start' },
    services: {
      navigation: 'navigation',
      network: 'network',
      document: 'document',
      script: 'script',
      assets: 'assets',
      fonts: 'fonts',
    },
    columns: { span: 'Span', service: 'Service', duration: 'Duration', share: '% of total' },
    reset: 'reset zoom',
    rows: 'Trace spans',
    zoomIn: 'zoom in',
    zoomOut: 'zoom out',
    hint: 'Hover a span, or use ↑↓, to see its attributes. Drag on the timeline or use + and − to zoom. Esc clears.',
    detail: { start: 'start', duration: 'duration', share: 'of total' },
    spans: {
      connection: 'connection',
      parse: 'HTML parse',
      globeSetup: 'globe: setup',
      globeFirstFrame: 'globe: 1st frame',
    },
    attributes: {
      type: 'type',
      protocol: 'protocol',
      status: 'status',
      transferred: 'transferred',
      compressedBody: 'compressed body',
      rawBody: 'raw body',
      redirects: 'redirects',
      delivery: 'delivery',
      host: 'host',
      tls: 'tls',
      domNodes: 'DOM nodes',
      modules: 'modules',
      dependencies: 'dependencies',
      points: 'points',
      shaders: 'shaders',
      drawCalls: 'draw calls',
      dpr: 'dpr',
      canvas: 'canvas',
      blocksRender: 'blocks render',
      spans: 'spans',
      webgl2: 'webgl2',
    },
    values: {
      network: 'network',
      handshake: 'handshake',
      reused: 'reused/none',
      unavailable: 'unavailable',
    },
  },

  profile: {
    eyebrow: 'Profile',
    title:
      'Seven years building software, <em>five of them in payments.</em> <span class="heading-note">More than 10 years in IT overall.</span>',
    p1: "I'm a senior backend developer. I've worked at a digital bank, at a credit platform for banking correspondents and, since 2024, at OKTO Payments, a multinational payments company.",
    p2: "At OKTO, the Brazil payments team rebuilt the company's Pix. OKTO is a direct participant in the SPI, the Central Bank system that settles Pix payments. We delivered sending and receiving Pix, key lookups, QR Code, Pix Automático and biometric Pix through Open Finance, all approved by the Central Bank.",
    p3: 'Before that, I led two teams, one of 4 people and one of 5. Each delivered a complete platform, from architecture and back end to apps, infrastructure and deployment.',
    p4: 'Day to day I write Go and TypeScript. I use DDD, Clean Architecture, CQRS and Event Sourcing to model systems, and Grafana, Loki, Prometheus and k6 to monitor and test them. I also develop with coding agents, such as Claude Code, Codex and Cursor, and write the specifications they follow.',
    board: {
      label: 'Current status',
      title: 'Status',
      state: 'operational',
      role: 'Role',
      roleValue: 'Senior backend engineer',
      roleNote: 'OKTO Payments · since Aug 2024',
      volume: 'Volume',
      volumeValue: 'more than 2 million transactions/day',
      volumeNote: 'peaks of ~500 TPS',
      latency: 'Latency',
      latencyNote: 'critical Pix services',
      uptime: 'Uptime',
      uptimeValue: '99.9%',
      uptimeNote: 'availability',
      base: 'Base',
      remote: 'remote',
      languages: 'Languages',
      languagesValue: 'Portuguese · English',
      languagesNote: 'advanced English, CCAA',
      education: 'Education',
      educationNote: 'Systems Analysis and Development, 2023',
    },
  },

  dashboard: {
    label: 'Observability dashboard',
    title: 'Observability · OKTO Payments · Pix',
    note: 'numbers from my résumé, illustrative curves',
    range: 'last 24 h',
    tiles: {
      transactions: 'Transactions / day',
      transactionsValue: '2 million',
      peak: 'Peak',
      p95: 'p95 latency',
      p99: 'p99 latency',
      availability: 'Availability',
      availabilityValue: '99.9',
      countries: 'Countries',
    },
    throughput: {
      title: 'Throughput',
      subtitle: 'transactions per second · Pix',
      aria: 'Throughput in transactions per second over 24 hours, with peaks of about 500 TPS',
    },
    latency: {
      title: 'Latency',
      subtitle: 'ms · critical Pix services',
      reference: 'reference 300 ms',
      aria: 'p95 latency around 200 ms and p99 around 300 ms over 24 hours',
    },
    uptime: {
      title: 'Availability',
      subtitle: 'last 30 days · 99.9% · one partial degradation',
      degradedDay: 'partial degradation · 43 min · 97.0%',
      fullDay: '100%',
    },
    table: {
      summary: 'View as a table (hourly)',
      hour: 'Hour',
      averageTps: 'Avg TPS',
      maximumTps: 'Max TPS',
    },
  },

  architecture: {
    eyebrow: 'Architecture',
    title: 'Architecture of a Pix, <em>from the app to the Central Bank.</em>',
    lead: "This map is a simplified version of how a payments company connected directly to the SPI processes a Pix. I built it from the Central Bank's Direct Participation Roadmap, Timing Manual and Pix Security Manual. The traffic is simulated. Hover a service to see what it does, or click follow a Pix to watch one payment from start to finish.",
    header: {
      traffic: 'simulated traffic',
      load: 'load',
      replicas: 'replicas',
      synchronous: 'synchronous',
      event: 'event',
      data: 'data',
      follow: '▶ follow a Pix',
    },
    map: 'Architecture map of a direct SPI participant: channels enter through the api-gateway; charges, accounts, indirect-psp, recurrence, pix-out and dict-service publish to Kafka; ledger, anti-fraud, reconciliation, webhooks, liquidity and pix-in consume; spi-gateway and dict-gateway sign with the HSM and talk to the SPI, DICT and STR over the RSFN.',
    canvas: 'Architecture map, scroll sideways',
    list: {
      summary: 'View as a list of services',
      sendsTo: 'Sends to: {targets}.',
      receivesFrom: 'Receives from: {sources}.',
    },
    zones: {
      channels: 'Channels',
      aws: 'AWS · sa-east-1',
      cluster: 'EKS · namespace pix · HPA · 3 AZs',
      managed: 'managed services',
      centralBank: 'Central Bank of Brazil',
      rsfn: 'RSFN · SFN private network · mTLS · ICP-Brasil',
    },
    bus: 'Domain event bus, partitioned by EndToEndId (ordering per transaction). Transactional outbox on the producers, replay per topic, DLQ per consumer.',
    tooltip: 'replicas ×{replicas}/{max} · {rps} rps · p95 {p95} ms · errors {errors}%',
    nodes: {
      apiPix: {
        title: 'API Pix',
        subtitle: 'cob · cobv · pix',
        subtitle2: 'BCB standard · mTLS',
        description:
          'API standardized by the BCB: charges (cob/cobv), lookup of received Pix and webhooks. This is how stores and platforms integrate.',
      },
      apps: {
        title: 'Apps · portal',
        subtitle: 'iOS · Android',
        subtitle2: 'web · B2C · B2B',
        description: 'Own channels: Pix initiation, keys, statement, limits.',
      },
      indirectPsp: {
        title: 'Indirect PSPs',
        subtitle: 'settled through us',
        subtitle2: 'routed by ISPB',
        description:
          'Indirect participants use the direct participant as their settlement agent: their orders enter the same flow, identified by ISPB.',
      },
      openFinance: {
        title: 'Open Finance',
        subtitle: 'ITP · JSR',
        subtitle2: 'Pix initiation',
        description:
          'Payment initiator (ITP) on the Journey Without Redirect (JSR): the Pix is authorized by biometrics and arrives as a payment order.',
      },
      webhooksOut: {
        title: 'Webhooks',
        subtitle: 'clients and PSPs',
        subtitle2: 'Pix received',
        description:
          'Asynchronous notifications to Pix API clients and indirect PSPs, with retries and a DLQ.',
      },
      gateway: {
        title: 'api-gateway',
        subtitle: 'mTLS · JWT',
        description:
          "Single entry point. Validates the JWT against Keycloak's public keys (JWKS), applies per-client rate limits and routes by path and version.",
      },
      charges: {
        title: 'charges',
        subtitle: 'cob · cobv · QR',
        description:
          'Immediate and due-date charges, dynamic QR Code with txid, location and expiry. Publishes cobranca.criada / paga.',
      },
      accounts: {
        title: 'accounts',
        subtitle: 'balance · limits',
        description:
          "The customer's transactional account: available balance, statement, limits by time of day (overnight) and by transaction type.",
      },
      indirect: {
        title: 'indirect-psp',
        subtitle: 'ISPB routing',
        description:
          'Orchestrates indirect participants: identifies the ISPB, applies the settlement-contract limits and routes into the same cash-out / cash-in flow.',
      },
      recurrence: {
        title: 'recurrence',
        subtitle: 'Pix Automático',
        description:
          'Pix Automático authorizations and recurring schedules. A scheduler fires the orders on the due date, through the normal cash-out flow.',
      },
      pixOut: {
        title: 'pix-out',
        subtitle: 'cash-out · DICT',
        description:
          'Pix initiation: validates the payload, generates the EndToEndId, locks idempotency in Redis, looks up the key, reserves the balance and publishes pix.out.requested through the outbox.',
      },
      dictService: {
        title: 'dict-service',
        subtitle: 'keys · claims',
        description:
          'Key management (creation, deletion), claims and portability, infraction notifications and MED. Caches lookups for their regulatory validity.',
      },
      dictGateway: {
        title: 'dict-gateway',
        subtitle: 'mTLS · signing',
        description:
          'The only DICT client: mTLS with an ICP-Brasil certificate, XMLDSig signature at the root on writes, and a local token bucket mirroring the BCB policies (e.g. ENTRIES_READ).',
      },
      ledger: {
        title: 'ledger',
        subtitle: 'double entry',
        description:
          'Double-entry postings per event: reserve, debit, credit, reversal. Balance never negative. Transactional outbox to Kafka.',
      },
      antiFraud: {
        title: 'anti-fraud',
        subtitle: 'score · limits',
        description:
          'Rules and score per transaction, limits per account and time of day, DICT fraud markers, AML. Can hold a Pix before the pacs.008.',
      },
      reconcile: {
        title: 'reconciliation',
        subtitle: 'matches pacs.002',
        description:
          'Matches each pacs.002 to its ledger posting, checks the status of anything that did not answer in time and reconciles the PI Account statement. A mismatch becomes an incident.',
      },
      webhooks: {
        title: 'webhooks',
        subtitle: 'retries · DLQ',
        description:
          'Consumes pix.settled / pix.returned and delivers to clients through SQS, with exponential retry and a DLQ.',
      },
      liquidity: {
        title: 'liquidity',
        subtitle: 'PI Account · STR',
        description:
          'PI Account treasury: balance projection, deposits and withdrawals through STR (LPI0001/LPI0003) or Selic, including nights and weekends.',
      },
      pixIn: {
        title: 'pix-in',
        subtitle: 'cash-in · 200 ms',
        description:
          "Receiving side: validates the recipient's account, credits it and answers the pacs.002 (ACSP / RJCT). The BCB capacity test requires consuming 99% of messages within 200 ms.",
      },
      spiGateway: {
        title: 'spi-gateway',
        subtitle: 'ISO 20022 · HSM',
        description:
          'SPI messaging gateway: builds and validates the ISO 20022 XML, signs the BAH (Sgntr) through the HSM, mTLS with the ICOM, primary and secondary channels, pibr.001/002 as connectivity echo.',
      },
      keycloak: {
        title: 'Keycloak',
        subtitle: 'IdP · OAuth2',
        description:
          'Platform identity: issues tokens for Pix API clients and internal users. It stays out of the Pix path: the gateway validates JWTs locally with the public keys.',
      },
      postgres: {
        title: 'Aurora',
        subtitle: 'PostgreSQL',
        description:
          'Ledger and outbox in the same transaction. Multi-AZ, read replicas for statements and reports.',
      },
      redis: {
        title: 'Redis',
        subtitle: 'idempotency',
        description: 'Idempotency key per EndToEndId, limit counters, DICT lookup cache.',
      },
      s3: {
        title: 'S3',
        subtitle: 'XML · statements',
        description:
          'Signed XML sent and received (evidence), PI Account statements, reports for treasury and audit.',
      },
      sqs: {
        title: 'SQS',
        subtitle: 'delivery · DLQ',
        description: 'Webhook delivery queues with retry and a per-client dead-letter queue.',
      },
      grafana: {
        title: 'Grafana',
        subtitle: 'OpenTelemetry',
        description:
          'Traces and metrics through OpenTelemetry, per-client success-rate dashboards, latency percentiles per stage (t0’ → t6a), logs in Loki.',
      },
      hsm: {
        title: 'CloudHSM',
        subtitle: 'ICP-Brasil keys',
        description:
          'Private keys of the signing (CERTPIA) and encryption certificates never leave the HSM. Signs pacs.* for the SPI and DICT requests.',
      },
      dict: {
        title: 'DICT',
        subtitle: 'key directory · REST API',
        subtitle2: 'mTLS · signing · token bucket',
        description:
          'Directory of Transactional Account Identifiers: key → ISPB + account. Lookup, creation, claims, portability, infractions and MED. Limits per policy (e.g. 600/min, bucket of 18,000).',
      },
      spi: {
        title: 'SPI',
        subtitle: 'ICOM · pacs.008 / 002 / 004 · pibr',
        subtitle2: 'PI Account · real-time settlement',
        description:
          'Instant Payment System: settles each Pix between PI Accounts, message by message, with no closing window. 40 s limit per operation; payer experience p99 10 s.',
      },
      str: {
        title: 'STR · Selic',
        subtitle: 'LPI0001 / LPI0003 · SEL1009',
        subtitle2: 'PI Account deposit and withdrawal',
        description:
          'PI Account liquidity comes from the Reserves account (STR) or from Selic operations. Without balance in the PI Account, the SPI rejects the pacs.008.',
      },
    },
    walkthrough: {
      request: "POST /pix · mTLS + JWT (validated against Keycloak's JWKS)",
      validate:
        'pix-out validates the payload, generates the EndToEndId and locks idempotency in Redis',
      lookupKey: "looks up the recipient's key",
      signDictRequest:
        'dict-gateway signs the request and spends 1 token from the ENTRIES_READ bucket',
      dictAnswer: "DICT answers with the recipient's ISPB + account (p99 1 s)",
      cacheAnswer: 'response cached for its regulatory validity',
      keyResolved: 'key resolved',
      publishRequested: 'pix.out.requested · transactional outbox',
      antiFraud: 'anti-fraud: score, time-of-day limits, AML',
      released: 'cleared',
      ledgerDebit: 'ledger reserves and debits the payer (double entry)',
      debited: 'pix.out.debited',
      buildPacs008: 'spi-gateway builds the pacs.008 (ISO 20022) and signs the BAH through the HSM',
      rsfn: "RSFN · primary channel · SPI receives (t1'), delivers to the receiving PSP (t2)",
      acsp: 'pacs.002 ACSP: recipient confirmed, PI Accounts settled (t4) · consumed in < 200 ms',
      settled: 'pix.settled',
      ledgerConfirm: 'ledger confirms the settlement',
      queueWebhook: 'webhooks queues the notification',
      queueDelivery: 'SQS · retry + DLQ',
      notified: 'payer and recipient notified · p50 6 s · p99 10 s',
      done: '<b>end</b> one Pix, end to end · simulated clock using the p50 targets from the Pix Timing Manual',
    },
  },

  loadTest: {
    eyebrow: 'Load test',
    title: 'I wrote a load test <em>that runs in your browser.</em>',
    lead: 'The test fires payments at a simplified Pix engine that I also wrote. Both run in the background of your browser, using Web Workers, and the output imitates k6, a load-testing tool. The engine validates each payment, rejects duplicates, tracks the balance of 10 thousand accounts and records everything in a hash-chained journal. The numbers are measured on your computer, on this visit.',
    toolbar: { scenario: 'scenario', ramp: 'ramp', stages: 'stages' },
    states: {
      waiting: 'waiting',
      warming: 'warming up',
      running: 'running',
      paused: 'paused',
      done: 'done',
    },
    run: 'run',
    runAgain: 'run again',
    terminalLabel: 'Load test output',
    announcement: 'Load test finished: {done} Pix processed, peak of {peak} per second.',
    placeholder: {
      auto: 'The test starts when this section scrolls into view.',
      manual: 'Click "run" to start the load test.',
    },
    charts: {
      throughputSubtitle: 'Pix per second · dashed line = ramp stage',
      throughputAria: 'Throughput over the test',
      latencyTitle: 'Latency per batch',
      latencySubtitle: 'ms per batch of 1,000 Pix · rolling p95 and p99',
      latencyAria: 'p95 and p99 latency per batch',
      distributionTitle: 'Distribution',
      distributionSubtitle: 'batches per latency bucket',
      histogramAria: 'Latency histogram per batch',
    },
    summary: {
      processed: 'Pix processed',
      peak: 'Peak',
      p95: 'p95 per batch',
      p99: 'p99 per batch',
      perPix: 'Per Pix',
      duplicates: 'Duplicates blocked',
      insufficient: 'Insufficient funds',
    },
    log: {
      workers: { one: '{count} Web Worker', other: '{count} Web Workers' },
      header: 'k6-ish · Pix engine on <b>{workers}</b> · {cores} cores',
      scenario:
        'scenario <b>ramp</b> · 5s ↑ 100% · 10s = 100% · 5s ↓ 0% · 1 iteration = batch of 1,000 Pix',
      checks:
        'checks: valid payload · idempotency · balance ≥ 0 · balance conservation · chained hash',
      warmup: 'warm-up: budget of {rate} Pix/s on this machine',
      running:
        'running <em>{elapsed}s</em> {percent}% of ramp  <b>{done}</b> Pix  {rate}/s  p95 {p95} ms',
      checkPayload: '<b>valid payload</b> {ok} ok · {invalid} invalid rejected',
      checkIdempotency: '<b>idempotency</b> {duplicates} duplicates detected and ignored',
      checkBalance: '<b>balance never negative</b> {rejected} insufficient-funds rejected',
      checkConservation: {
        one: '<b>balance conservation</b> Σ balances equal to the initial in {count} ledger',
        other: '<b>balance conservation</b> Σ balances equal to the initial in {count} ledgers',
      },
      checkJournal: '<b>chained journal</b> {entries} entries · hash <code>{hash}</code>',
      iterations: '<b>iterations</b> {count} batches of 1,000 · {rate}/s',
      processed: '<b>pix_processed</b> {done} · <em>{average}/s</em> average · peak {peak}/s',
      pixDuration: '<b>pix_duration</b> avg {average} µs per Pix',
    },
  },

  history: {
    eyebrow: 'History',
    title: "Where I've <em>worked.</em>",
    lead: 'Four companies in seven years. The cards advance on their own, or click one to open it.',
    today: 'today',
    tags: { commissions: 'Commissions', networking: 'Networking' },
    jobs: {
      okto: {
        role: 'Senior backend engineer',
        p1: 'OKTO Payments is a payments company operating in 7 countries and processing more than €17 billion a year. We rebuilt its Pix infrastructure so the company could be a direct participant in the SPI. Today that means more than 2 million transactions a day, with peaks of about 500 per second and 95% of responses within 200 ms.',
        p2: 'We went through the Central Bank certifications for receiving Pix, sending Pix, QR Code, key lookups on the DICT (with a token bucket), Recurring Scheduled Pix and Pix Automático. We also delivered biometric Pix through Open Finance (JSR) with ITP, and boletos through BaaS. We use Grafana, Loki and Prometheus dashboards to track success rate per client and latency percentiles, and we test load with k6.',
        event1: 'Certification completed',
        event1Note: 'Central Bank · Pix Automático',
        event2Note: '99.9% availability',
      },
      g8: {
        role: 'Full-stack engineer · tech lead',
        p1: 'An online credit system (multi-tenant SaaS) for banking correspondents, with thousands of customers. Each correspondent configures and runs its own loan portfolio, and the commission is calculated on the profit of each operation.',
        p2: 'I led a team of 4, from the multi-tenant architecture to the commission engine. I also handled the deployment and all the infrastructure on my own, on VPS.',
        event1: 'Team of 4',
        event1Note: 'tech lead, end to end',
        event2: 'Infra on VPS',
        event2Note: 'self-managed deploys',
      },
      esatto: {
        role: 'Full-stack engineer · tech lead',
        p1: 'A white-label digital bank, for Android and iOS, built for an institution that takes part in Pix through another bank (an indirect participant). It had accounts, statements, onboarding with KYC and KYB, TED and DOC transfers, boletos, investments and full Pix: receiving, sending by key, QR Code or bank details, and managing keys and portability.',
        p2: 'I led a team of 5 that delivered the whole platform in a few months, with infrastructure on Google Cloud, CI/CD and publishing on the App Store and Google Play.',
        event1: 'Apps published',
        event1Note: 'App Store · Google Play',
        event2: 'Full Pix',
        event2Note: 'DICT · key portability',
      },
      anhanguera: {
        role: 'IT technician',
        p1: 'An internal web management system for a higher-education institution, with REST APIs, automated tests, CI/CD and automation libraries. It ran on physical Linux servers that I installed myself.',
        p2: 'I also did structured cabling, rack and switch setup, mass cloning of workstations and operations support.',
        event1: 'Servers up',
        event1Note: 'physical Linux · cron · local git',
        event2: 'Green CI',
        event2Note: 'automated tests',
      },
    },
    education: {
      degrees:
        '<b>Education</b> · Fatec Taubaté, Systems Analysis and Development (2023) · Etec Pindamonhangaba, IT Technician (2018)',
      courses:
        '<b>Courses</b> · Clean Code and Clean Architecture, Rodrigo Branas (2022) · Advanced Node.js with TDD and Clean Architecture, Rodrigo Manguinho (2021)',
    },
  },

  contact: {
    eyebrow: 'Contact',
    title: "Let's <em>talk.</em>",
    lead: 'Send me an email. Click the address to copy it.',
    copied: 'email copied ✓',
    copiedAnnouncement: 'Email copied.',
  },

  footer: {
    stack: 'Built with just HTML, CSS and JavaScript, no frameworks and no libraries ·',
    uncompressed: 'of code, uncompressed ·',
    source: 'Source code on GitHub',
  },

  shader: {
    label: 'Globe code',
    title: 'GLSL ES 3.0 · exactly what is running on the globe',
    close: 'Close',
    source: 'Shader source code',
  },

  palette: {
    label: 'Command palette',
    placeholder: 'Where to?',
    search: 'Search commands',
    list: 'Commands',
    empty: 'Nothing here. Try "theme" or "globe".',
    results: { one: '{count} command', other: '{count} commands' },
    navigate: 'navigate',
    open: 'open',
    close: 'close',
    tags: {
      go: 'go',
      action: 'action',
      theme: 'theme',
      globe: 'globe',
      code: 'code',
      map: 'map',
      external: '↗',
      language: 'language',
    },
    commands: {
      status: { title: 'Go to Status', keywords: 'performance numbers stats measured' },
      profile: { title: 'Go to Profile', keywords: 'about bio who' },
      architecture: {
        title: 'Go to Architecture',
        keywords: 'infra kubernetes kafka map microservices',
      },
      followPix: { title: 'Follow a Pix on the map', keywords: 'architecture pix walkthrough spi' },
      load: { title: 'Go to Load test', keywords: 'k6 load workers benchmark' },
      runLoad: { title: 'Run the load test', keywords: 'k6 load run benchmark' },
      history: { title: 'Go to History', keywords: 'experience companies okto g8 esatto' },
      contact: { title: 'Go to Contact', keywords: 'email talk' },
      copyEmail: { title: 'Copy email', keywords: 'mail contact clipboard' },
      toggleTheme: { title: 'Toggle light / dark theme', keywords: 'theme dark light mode' },
      randomHue: { title: 'Random theme', keywords: 'color hue random' },
      goHome: { title: 'Spin the globe to {city}', keywords: 'home globe' },
      shader: { title: 'View the globe code', keywords: 'glsl webgl shader source' },
      github: { title: 'Open GitHub', keywords: 'github code repos' },
      source: {
        title: 'View the site source code',
        keywords: 'source code repository repo github site',
      },
      linkedin: { title: 'Open LinkedIn', keywords: 'linkedin work' },
      switchLocale: {
        title: 'Mudar para português',
        keywords: 'idioma language portuguese portugues',
      },
      pauseMotion: { title: 'Pause animations', keywords: 'motion stop pause animation' },
      resumeMotion: { title: 'Resume animations', keywords: 'motion continue play' },
      hueUp: { title: 'Increase the hue', keywords: 'color hue accent more' },
      hueDown: { title: 'Decrease the hue', keywords: 'color hue accent less' },
      speedUp: { title: 'Spin the globe faster', keywords: 'speed globe' },
      speedDown: { title: 'Spin the globe slower', keywords: 'speed globe' },
      pointsUp: { title: 'More points on the globe', keywords: 'multiplier instances gpu' },
      pointsDown: { title: 'Fewer points on the globe', keywords: 'multiplier instances gpu' },
      spinGlobe: { title: 'Give the globe a spin', keywords: 'rotate turn globe' },
    },
  },
};
