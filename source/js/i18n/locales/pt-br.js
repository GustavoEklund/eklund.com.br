/** Brazilian Portuguese: the source language of the site. Keep the key set identical to en-us.js (tools/i18n-check.mjs). */
export const PT_BR = {
  meta: {
    title: 'Gustavo Eklund | Desenvolvedor backend, Pix e pagamentos',
    description:
      'Gustavo Eklund é desenvolvedor backend em Taubaté, SP. Desenvolve sistemas de pagamento, principalmente com Pix, que processam mais de 2 milhões de transações por dia.',
    imageAlt:
      'Gustavo Eklund em letras grandes sobre fundo escuro, com a marca "e" em verde, as palavras Backend e Pix e o endereço eklund.com.br.',
  },

  nav: {
    skip: 'Pular pro conteúdo',
    home: 'eklund.com.br, início',
    main: 'Principal',
    status: 'Status',
    profile: 'Perfil',
    architecture: 'Arquitetura',
    load: 'Carga',
    history: 'Histórico',
    contact: 'Contato',
    paletteLabel: 'Abrir paleta de comandos',
    paletteTitle: 'Paleta de comandos (Ctrl K)',
    sourceLabel: 'Código-fonte no GitHub',
    sourceTitle: 'Código-fonte deste site no GitHub',
    themeLabel: 'Tema escuro',
    themeTitle: 'Tema',
    motionLabel: 'Pausar animações',
    motionTitle: 'Pausar animações e atualizações',
    language: 'Idioma',
  },

  scrollbar: {
    hero: 'início',
    status: 'status',
    profile: 'perfil',
    architecture: 'arquitetura',
    load: 'carga',
    history: 'histórico',
    contact: 'contato',
  },

  cursor: { drag: 'arrasta', copy: 'copiar', open: 'abrir' },

  hero: {
    eyebrow: 'Desenvolvedor backend sênior · Taubaté, SP',
    localTime: 'hora local em Taubaté',
    tagline: 'Desenvolvo sistemas de pagamento, principalmente com Pix.',
    rotating: {
      label:
        'Mais de 2 milhões de transações por dia, picos de 500 por segundo, 99% das respostas em até 300 milissegundos, 99,9% de disponibilidade',
      volume: 'mais de 2 milhões de transações/dia',
      peak: 'picos de ~500 transações/s',
      latency: '99% responde em até 300 ms',
      uptime: '99,9% de disponibilidade',
    },
    shortcut: 'navegar',
    globe:
      'Globo 3D desenhado em WebGL, com os pontos de terra e arcos saindo de Taubaté. Arraste ou use as setas pra girar.',
    scrollCue: 'rola',
    chips: {
      network: 'KB na rede',
      networkNote: '0 dependências',
      points: 'pontos',
      pointsNote: 'WebGL2 · desenhado ponto a ponto',
      fpsNote: 'medido agora, no seu navegador',
    },
    controls: {
      label: 'Controles do globo',
      title: 'globo',
      hue: 'matiz',
      speed: 'velocidade',
      points: 'pontos',
      hueAria: 'matiz',
      speedAria: 'velocidade',
      pointsAria: 'multiplicador de pontos',
    },
  },

  marquee: { microservices: 'Microsserviços', messaging: 'Mensageria' },

  status: {
    eyebrow: 'Status desta página',
    title: 'Monitoramento ao vivo, <em>medido no seu navegador.</em>',
    lead: 'Esta seção é a página de status deste site. Os componentes, os incidentes e o trace vêm da Performance API do seu navegador, medidos nesta visita, e nenhum valor está fixo no código.',
    components: 'Componentes',
    updated: 'atualizado',
    levels: ['operacional', 'degradado', 'indisponível'],
    banners: ['Todos os sistemas operacionais', 'Desempenho degradado', 'Interrupção parcial'],
    history: { title: 'Últimos 90 segundos desta visita', quiet: '{percent}% sem incidentes' },
    incidents: {
      title: 'Incidentes',
      none: 'Nenhum incidente nesta visita.',
      resolved: 'resolvido',
      layoutShift: 'Layout shift de {value}',
      longTask: 'Long task de {duration} ms na thread principal',
      lowFps: 'Globo abaixo de {threshold} fps ({fps} fps)',
      loadTest: 'Teste de carga: {done} Pix em {seconds} s',
    },
    checks: {
      document: {
        name: 'Documento',
        detail: '{kilobytes} KB na rede · {requests} · {files} arquivos do site',
        requests: { one: '{count} requisição', other: '{count} requisições' },
      },
      fonts: { name: 'Fontes', detail: '{loaded}/3 famílias carregadas · WOFF2 próprio' },
      globe: {
        name: 'Globo WebGL2',
        unavailable: 'WebGL2 indisponível neste navegador',
        paused: 'pausado fora da tela',
        detail: '{points} pontos · {fps} · {dpr}× DPR',
      },
      mainThread: {
        name: 'Thread principal',
        detail: {
          one: '{count} long task acima de 50 ms',
          other: '{count} long tasks acima de 50 ms',
        },
      },
      layoutShift: { name: 'Layout shift', detail: 'CLS {value} · pior janela de 5 s' },
      dependencies: {
        name: 'Dependências',
        detail:
          '0 pacotes · 0 frameworks · {images} imagens (logos, lazy) · 0 cookies · 0 rastreadores',
      },
      platform: { name: 'Plataforma' },
      contrast: {
        name: 'Contraste (WCAG 2.2)',
        measuring: 'medindo as cores desta página…',
        detail:
          '{passing}/{pairs} pares no AA · texto ≥ {text}:1 · componentes ≥ {component}:1 · {theme} {hue}°',
        themes: { dark: 'escuro', light: 'claro' },
      },
    },
  },

  trace: {
    label: 'Trace desta visita',
    meta: { spans: 'spans', services: 'serviços', start: 'início' },
    services: {
      navigation: 'navegação',
      network: 'rede',
      document: 'documento',
      script: 'script',
      assets: 'recursos',
      fonts: 'fontes',
    },
    columns: { span: 'Span', service: 'Serviço', duration: 'Duração', share: '% total' },
    reset: 'limpar zoom',
    rows: 'Spans do trace',
    zoomIn: 'aumentar zoom',
    zoomOut: 'reduzir zoom',
    hint: 'Passe o mouse num span, ou use ↑↓, pra ver os atributos. Arraste na linha do tempo ou use + e − pra dar zoom. Esc limpa.',
    detail: { start: 'início', duration: 'duração', share: 'do total' },
    spans: {
      connection: 'conexão',
      parse: 'parse do HTML',
      globeSetup: 'globo: setup',
      globeFirstFrame: 'globo: 1º frame',
    },
    attributes: {
      type: 'tipo',
      protocol: 'protocolo',
      status: 'status',
      transferred: 'transferido',
      compressedBody: 'corpo comprimido',
      rawBody: 'corpo cru',
      redirects: 'redirects',
      delivery: 'entrega',
      host: 'host',
      tls: 'tls',
      domNodes: 'nós no DOM',
      modules: 'módulos',
      dependencies: 'dependências',
      points: 'pontos',
      shaders: 'shaders',
      drawCalls: 'draw calls',
      dpr: 'dpr',
      canvas: 'canvas',
      blocksRender: 'bloqueia render',
      spans: 'spans',
      webgl2: 'webgl2',
    },
    values: {
      network: 'rede',
      handshake: 'handshake',
      reused: 'reuso/sem',
      unavailable: 'indisponível',
    },
  },

  profile: {
    eyebrow: 'Perfil',
    title:
      'Sete anos criando software, <em>cinco deles com pagamentos.</em> <span class="heading-note">Mais de 10 anos em T.I. no total.</span>',
    p1: 'Sou desenvolvedor backend sênior. Já trabalhei num banco digital, numa plataforma de crédito para correspondentes bancários e, desde 2024, estou na OKTO Payments, uma empresa de pagamentos multinacional.',
    p2: 'Na OKTO, o time de pagamentos do Brasil reconstruiu o Pix da empresa. A OKTO é participante direta do SPI, o sistema do Banco Central que liquida os Pix. Entregamos o envio e o recebimento de Pix, a consulta de chaves, o QR Code, o Pix Automático e o Pix por biometria via Open Finance, tudo homologado pelo Banco Central.',
    p3: 'Antes disso, liderei dois times, um de 4 e outro de 5 pessoas. Cada um entregou uma plataforma completa, da arquitetura e do back-end até os apps, a infraestrutura e o deploy.',
    p4: 'No dia a dia escrevo Go e TypeScript. Uso DDD, Clean Architecture, CQRS e Event Sourcing para modelar os sistemas, e Grafana, Loki, Prometheus e k6 para acompanhar e testar. Também desenvolvo com agentes de código, como Claude Code, Codex e Cursor, e escrevo as especificações que eles seguem.',
    board: {
      label: 'Status atual',
      title: 'Status',
      state: 'operacional',
      role: 'Cargo',
      roleValue: 'Desenvolvedor backend sênior',
      roleNote: 'OKTO Payments · desde ago/2024',
      volume: 'Volume',
      volumeValue: 'mais de 2 milhões de transações/dia',
      volumeNote: 'picos de ~500 TPS',
      latency: 'Latência',
      latencyNote: 'serviços críticos de Pix',
      uptime: 'Uptime',
      uptimeValue: '99,9%',
      uptimeNote: 'disponibilidade',
      base: 'Base',
      remote: 'remoto',
      languages: 'Idiomas',
      languagesValue: 'Português · Inglês',
      languagesNote: 'inglês avançado, CCAA',
      education: 'Formação',
      educationNote: 'Análise e Desenvolvimento de Sistemas, 2023',
    },
  },

  dashboard: {
    label: 'Painel de observabilidade',
    title: 'Observabilidade · OKTO Payments · Pix',
    note: 'números do meu currículo, curvas ilustrativas',
    range: 'últimas 24 h',
    tiles: {
      transactions: 'Transações / dia',
      transactionsValue: '2 milhões',
      peak: 'Pico',
      p95: 'Latência p95',
      p99: 'Latência p99',
      availability: 'Disponibilidade',
      availabilityValue: '99,9',
      countries: 'Países',
    },
    throughput: {
      title: 'Throughput',
      subtitle: 'transações por segundo · Pix',
      aria: 'Throughput em transações por segundo ao longo de 24 horas, com picos de cerca de 500 TPS',
    },
    latency: {
      title: 'Latência',
      subtitle: 'ms · serviços críticos de Pix',
      reference: 'referência 300 ms',
      aria: 'Latência p95 em torno de 200 ms e p99 em torno de 300 ms ao longo de 24 horas',
    },
    uptime: {
      title: 'Disponibilidade',
      subtitle: 'últimos 30 dias · 99,9% · uma degradação parcial',
      degradedDay: 'degradação parcial · 43 min · 97,0%',
      fullDay: '100%',
    },
    table: {
      summary: 'Ver como tabela (por hora)',
      hour: 'Hora',
      averageTps: 'TPS médio',
      maximumTps: 'TPS máx',
    },
  },

  architecture: {
    eyebrow: 'Arquitetura',
    title: 'Arquitetura de um Pix, <em>do app ao Banco Central.</em>',
    lead: 'Este mapa é uma versão simplificada de como uma empresa de pagamentos conectada direto ao SPI processa um Pix. Montei a partir do Roteiro de Participação Direta, do Manual de Tempos e do Manual de Segurança do Pix, todos do Banco Central. O tráfego é simulado. Passe o mouse num serviço para ver o que ele faz, ou clique em seguir um Pix para acompanhar um pagamento do começo ao fim.',
    header: {
      traffic: 'tráfego simulado',
      load: 'carga',
      replicas: 'réplicas',
      synchronous: 'síncrono',
      event: 'evento',
      data: 'dados',
      follow: '▶ seguir um Pix',
    },
    map: 'Mapa de arquitetura de um participante direto do SPI: canais entram pelo api-gateway; serviços de cobrança, contas, PSP indireto, recorrência, pix-out e dict-service publicam no Kafka; ledger, antifraude, conciliação, webhooks, liquidez e pix-in consomem; spi-gateway e dict-gateway assinam com o HSM e falam com o SPI, o DICT e o STR pela RSFN.',
    canvas: 'Mapa de arquitetura, role para os lados',
    list: {
      summary: 'Ver como lista de serviços',
      sendsTo: 'Envia para: {targets}.',
      receivesFrom: 'Recebe de: {sources}.',
    },
    zones: {
      channels: 'Canais',
      aws: 'AWS · sa-east-1',
      cluster: 'EKS · namespace pix · HPA · 3 AZs',
      managed: 'serviços gerenciados',
      centralBank: 'Banco Central do Brasil',
      rsfn: 'RSFN · rede privada do SFN · mTLS · ICP-Brasil',
    },
    bus: 'Barramento de eventos de domínio, particionado por EndToEndId (ordem por transação). Outbox transacional nos produtores, replay por tópico, DLQ por consumidor.',
    tooltip: 'réplicas ×{replicas}/{max} · {rps} rps · p95 {p95} ms · erros {errors}%',
    nodes: {
      apiPix: {
        title: 'API Pix',
        subtitle: 'cob · cobv · pix',
        subtitle2: 'padrão BCB · mTLS',
        description:
          'API padronizada pelo BCB: cobranças (cob/cobv), consulta de Pix recebidos e webhooks. É por aqui que lojas e plataformas integram.',
      },
      apps: {
        title: 'Apps · portal',
        subtitle: 'iOS · Android',
        subtitle2: 'web · PF e PJ',
        description: 'Canais próprios: iniciação de Pix, chaves, extrato, limites.',
      },
      indirectPsp: {
        title: 'PSPs indiretos',
        subtitle: 'liquidação por nós',
        subtitle2: 'roteados por ISPB',
        description:
          'Participantes indiretos usam o participante direto como liquidante: as ordens deles entram pelo mesmo fluxo, identificadas pelo ISPB.',
      },
      openFinance: {
        title: 'Open Finance',
        subtitle: 'ITP · JSR',
        subtitle2: 'iniciação de Pix',
        description:
          'Iniciadora de transação de pagamento (ITP) na Jornada sem Redirecionamento: o Pix é autorizado por biometria e chega como ordem de pagamento.',
      },
      webhooksOut: {
        title: 'Webhooks',
        subtitle: 'clientes e PSPs',
        subtitle2: 'pix recebido',
        description:
          'Notificações assíncronas aos clientes da API Pix e aos PSPs indiretos, com retentativas e DLQ.',
      },
      gateway: {
        title: 'api-gateway',
        subtitle: 'mTLS · JWT',
        description:
          'Entrada única. Valida o JWT com as chaves públicas do Keycloak (JWKS), aplica rate limit por cliente e roteia por rota e versão.',
      },
      charges: {
        title: 'cobrança',
        subtitle: 'cob · cobv · QR',
        description:
          'Cobranças imediatas e com vencimento, QR Code dinâmico com txid, location e expiração. Publica cobranca.criada / paga.',
      },
      accounts: {
        title: 'contas',
        subtitle: 'saldo · limites',
        description:
          'Conta transacional do cliente: saldo disponível, extrato, limites por horário (noturno) e por tipo de transação.',
      },
      indirect: {
        title: 'psp-indireto',
        subtitle: 'roteamento ISPB',
        description:
          'Orquestra os participantes indiretos: identifica o ISPB, aplica os limites do contrato de liquidação e roteia para o mesmo fluxo de cash-out / cash-in.',
      },
      recurrence: {
        title: 'recorrência',
        subtitle: 'Pix Automático',
        description:
          'Autorizações de Pix Automático e agendamentos recorrentes. Um scheduler dispara as ordens na data, pelo fluxo normal de cash-out.',
      },
      pixOut: {
        title: 'pix-out',
        subtitle: 'cash-out · DICT',
        description:
          'Iniciação do Pix: valida o payload, gera o EndToEndId, trava a idempotência no Redis, consulta a chave, reserva o saldo e publica pix.out.requested via outbox.',
      },
      dictService: {
        title: 'dict-service',
        subtitle: 'chaves · claims',
        description:
          'Gestão de chaves (criação, exclusão), reivindicações e portabilidade, notificações de infração e MED. Cache das consultas com validade regulatória.',
      },
      dictGateway: {
        title: 'dict-gateway',
        subtitle: 'mTLS · assinatura',
        description:
          'Único cliente do DICT: mTLS com certificado ICP-Brasil, assinatura XMLDSig na raiz nas escritas, e token bucket local espelhando as políticas do BCB (ex.: ENTRIES_READ).',
      },
      ledger: {
        title: 'ledger',
        subtitle: 'dupla entrada',
        description:
          'Lançamentos de dupla entrada por evento: reserva, débito, crédito, estorno. Saldo nunca negativo. Outbox transacional para o Kafka.',
      },
      antiFraud: {
        title: 'antifraude',
        subtitle: 'score · limites',
        description:
          'Regras e score por transação, limites por conta e horário, marcadores de fraude do DICT, PLD/AML. Pode reter o Pix antes da pacs.008.',
      },
      reconcile: {
        title: 'conciliação',
        subtitle: 'bate pacs.002',
        description:
          'Bate cada pacs.002 com o lançamento do ledger, consulta status do que não respondeu no prazo e confere o extrato da Conta PI. Divergência vira incidente.',
      },
      webhooks: {
        title: 'webhooks',
        subtitle: 'retries · DLQ',
        description:
          'Consome pix.settled / pix.returned e entrega aos clientes via SQS, com retentativa exponencial e DLQ.',
      },
      liquidity: {
        title: 'liquidez',
        subtitle: 'Conta PI · STR',
        description:
          'Tesouraria da Conta PI: projeção de saldo, aportes e retiradas via STR (LPI0001/LPI0003) ou Selic, inclusive madrugada e fim de semana.',
      },
      pixIn: {
        title: 'pix-in',
        subtitle: 'cash-in · 200 ms',
        description:
          'Recebimento: valida a conta do recebedor, credita e responde a pacs.002 (ACSP / RJCT). O teste de capacidade do BCB exige consumir 99% das mensagens em até 200 ms.',
      },
      spiGateway: {
        title: 'spi-gateway',
        subtitle: 'ISO 20022 · HSM',
        description:
          'Gateway de mensageria do SPI: monta e valida o XML ISO 20022, assina o BAH (Sgntr) via HSM, mTLS com a ICOM, canal primário e secundário, pibr.001/002 como eco de conectividade.',
      },
      keycloak: {
        title: 'Keycloak',
        subtitle: 'IdP · OAuth2',
        description:
          'Identidade da plataforma: emite tokens para clientes da API Pix e usuários internos. Fica fora do caminho do Pix: o gateway valida os JWT localmente com as chaves públicas.',
      },
      postgres: {
        title: 'Aurora',
        subtitle: 'PostgreSQL',
        description:
          'Ledger e outbox na mesma transação. Multi-AZ, réplicas de leitura para extrato e relatórios.',
      },
      redis: {
        title: 'Redis',
        subtitle: 'idempotência',
        description:
          'Chave de idempotência por EndToEndId, contadores de limite, cache das consultas ao DICT.',
      },
      s3: {
        title: 'S3',
        subtitle: 'XML · extratos',
        description:
          'XML assinados enviados e recebidos (evidência), extratos da Conta PI, relatórios para tesouraria e auditoria.',
      },
      sqs: {
        title: 'SQS',
        subtitle: 'entrega · DLQ',
        description:
          'Filas de entrega de webhooks com retentativa e dead-letter queue por cliente.',
      },
      grafana: {
        title: 'Grafana',
        subtitle: 'OpenTelemetry',
        description:
          'Traces e métricas por OpenTelemetry, painéis de taxa de sucesso por cliente, percentis de latência por etapa (t0’ → t6a), logs no Loki.',
      },
      hsm: {
        title: 'CloudHSM',
        subtitle: 'chaves ICP-Brasil',
        description:
          'Chaves privadas dos certificados de assinatura (CERTPIA) e criptografia nunca saem do HSM. Assina pacs.* para o SPI e requisições do DICT.',
      },
      dict: {
        title: 'DICT',
        subtitle: 'diretório de chaves · API REST',
        subtitle2: 'mTLS · assinatura · token bucket',
        description:
          'Diretório de Identificadores de Contas Transacionais: chave → ISPB + conta. Consulta, criação, reivindicação, portabilidade, infrações e MED. Limites por política (ex.: 600/min, balde 18.000).',
      },
      spi: {
        title: 'SPI',
        subtitle: 'ICOM · pacs.008 / 002 / 004 · pibr',
        subtitle2: 'Conta PI · liquidação em tempo real',
        description:
          'Sistema de Pagamentos Instantâneos: liquida cada Pix entre Contas PI, mensagem a mensagem, sem janela de fechamento. Limite de 40 s por operação; experiência do pagador p99 10 s.',
      },
      str: {
        title: 'STR · Selic',
        subtitle: 'LPI0001 / LPI0003 · SEL1009',
        subtitle2: 'aporte e retirada da Conta PI',
        description:
          'Liquidez da Conta PI vem da conta Reservas (STR) ou de operações no Selic. Sem saldo na Conta PI, o SPI rejeita a pacs.008.',
      },
    },
    walkthrough: {
      request: 'POST /pix · mTLS + JWT (validado com o JWKS do Keycloak)',
      validate: 'pix-out valida o payload, gera o EndToEndId e trava a idempotência no Redis',
      lookupKey: 'consulta a chave do recebedor',
      signDictRequest: 'dict-gateway assina a requisição e consome 1 token do balde ENTRIES_READ',
      dictAnswer: 'DICT responde ISPB + conta do recebedor (p99 1 s)',
      cacheAnswer: 'cache da resposta com validade regulatória',
      keyResolved: 'chave resolvida',
      publishRequested: 'pix.out.requested · outbox transacional',
      antiFraud: 'antifraude: score, limites por horário, PLD',
      released: 'liberado',
      ledgerDebit: 'ledger reserva e debita o pagador (dupla entrada)',
      debited: 'pix.out.debited',
      buildPacs008: 'spi-gateway monta a pacs.008 (ISO 20022) e assina o BAH via HSM',
      rsfn: "RSFN · canal primário · SPI recebe (t1'), entrega ao PSP recebedor (t2)",
      acsp: 'pacs.002 ACSP: recebedor confirmou, Contas PI liquidadas (t4) · consumida em < 200 ms',
      settled: 'pix.settled',
      ledgerConfirm: 'ledger confirma a liquidação',
      queueWebhook: 'webhooks enfileira a notificação',
      queueDelivery: 'SQS · retentativa + DLQ',
      notified: 'pagador e recebedor notificados · p50 6 s · p99 10 s',
      done: '<b>fim</b> um Pix de ponta a ponta · relógio simulado com os alvos p50 do Manual de Tempos do Pix',
    },
  },

  loadTest: {
    eyebrow: 'Teste de carga',
    title: 'Escrevi um teste de carga <em>que roda no seu navegador.</em>',
    lead: 'O teste dispara pagamentos contra um motor de Pix simplificado que também escrevi. Os dois rodam em segundo plano no seu navegador, com Web Workers, e a saída imita o k6, uma ferramenta de teste de carga. O motor valida cada pagamento, barra os duplicados, controla o saldo de 10 mil contas e registra tudo num histórico encadeado por hash. Os números são medidos no seu computador, nesta visita.',
    toolbar: { scenario: 'cenário', ramp: 'rampa', stages: 'estágios' },
    states: {
      waiting: 'aguardando',
      warming: 'aquecendo',
      running: 'rodando',
      paused: 'pausado',
      done: 'concluído',
    },
    run: 'rodar',
    runAgain: 'rodar de novo',
    terminalLabel: 'Saída do teste de carga',
    announcement: 'Teste de carga concluído: {done} Pix processados, pico de {peak} por segundo.',
    placeholder: {
      auto: 'O teste começa quando esta seção aparecer na tela.',
      manual: 'Clique em "rodar" pra iniciar o teste de carga.',
    },
    charts: {
      throughputSubtitle: 'Pix por segundo · linha tracejada = estágio da rampa',
      throughputAria: 'Throughput ao longo do teste',
      latencyTitle: 'Latência por lote',
      latencySubtitle: 'ms por lote de 1.000 Pix · p95 e p99 móveis',
      latencyAria: 'Latência p95 e p99 por lote',
      distributionTitle: 'Distribuição',
      distributionSubtitle: 'lotes por faixa de latência',
      histogramAria: 'Histograma de latência por lote',
    },
    summary: {
      processed: 'Pix processados',
      peak: 'Pico',
      p95: 'p95 por lote',
      p99: 'p99 por lote',
      perPix: 'Por Pix',
      duplicates: 'Duplicatas barradas',
      insufficient: 'Sem saldo',
    },
    log: {
      workers: { one: '{count} Web Worker', other: '{count} Web Workers' },
      header: 'k6-ish · motor de Pix em <b>{workers}</b> · {cores} núcleos',
      scenario:
        'cenário <b>rampa</b> · 5s ↑ 100% · 10s = 100% · 5s ↓ 0% · 1 iteração = lote de 1.000 Pix',
      checks:
        'checks: payload válido · idempotência · saldo ≥ 0 · conservação de saldos · hash encadeado',
      warmup: 'aquecimento: orçamento de {rate} Pix/s nesta máquina',
      running:
        'running <em>{elapsed}s</em> {percent}% da rampa  <b>{done}</b> Pix  {rate}/s  p95 {p95} ms',
      checkPayload: '<b>payload válido</b> {ok} ok · {invalid} inválidos rejeitados',
      checkIdempotency: '<b>idempotência</b> {duplicates} duplicatas detectadas e ignoradas',
      checkBalance: '<b>saldo nunca negativo</b> {rejected} sem saldo rejeitadas',
      checkConservation: {
        one: '<b>conservação de saldos</b> Σ saldos igual ao inicial em {count} ledger',
        other: '<b>conservação de saldos</b> Σ saldos igual ao inicial em {count} ledgers',
      },
      checkJournal: '<b>journal encadeado</b> {entries} entradas · hash <code>{hash}</code>',
      iterations: '<b>iterations</b> {count} lotes de 1.000 · {rate}/s',
      processed: '<b>pix_processed</b> {done} · <em>{average}/s</em> média · pico {peak}/s',
      pixDuration: '<b>pix_duration</b> avg {average} µs por Pix',
    },
  },

  history: {
    eyebrow: 'Histórico',
    title: 'Onde <em>trabalhei.</em>',
    lead: 'Quatro empresas em sete anos. Os cards passam sozinhos, ou clique num para abrir.',
    today: 'hoje',
    tags: { commissions: 'Comissionamento', networking: 'Redes' },
    jobs: {
      okto: {
        role: 'Desenvolvedor backend sênior',
        p1: 'A OKTO Payments é uma empresa de pagamentos que opera em 7 países e processa mais de €17 bilhões por ano. Reconstruímos a infraestrutura de Pix para ela ser participante direta do SPI. Hoje são mais de 2 milhões de transações por dia, com picos de cerca de 500 por segundo e 95% das respostas em até 200 ms.',
        p2: 'Passamos pelas homologações do Banco Central de receber Pix, enviar Pix, QR Code, consulta de chaves no DICT (com token bucket), Pix Agendado Recorrente e Pix Automático. Também entregamos Pix por biometria via Open Finance (JSR) com ITP e boletos via BaaS. Usamos painéis de Grafana, Loki e Prometheus para acompanhar a taxa de sucesso por cliente e os percentis de latência, e testamos carga com k6.',
        event1: 'Homologação concluída',
        event1Note: 'Banco Central · Pix Automático',
        event2Note: '99,9% de disponibilidade',
      },
      g8: {
        role: 'Engenheiro full stack · líder técnico',
        p1: 'Um sistema de crédito online (SaaS multi-tenant) para correspondentes bancários, com milhares de clientes. Cada correspondente configura e opera a própria carteira de empréstimos, e a comissão é calculada sobre o lucro de cada operação.',
        p2: 'Liderei um time de 4 pessoas, da arquitetura multi-tenant ao motor de comissões. Também cuidei sozinho do deploy e de toda a infraestrutura, em VPS.',
        event1: 'Time de 4',
        event1Note: 'líder técnico, ponta a ponta',
        event2: 'Infra em VPS',
        event2Note: 'deploy por conta própria',
      },
      esatto: {
        role: 'Engenheiro full stack · líder técnico',
        p1: 'Um banco digital white-label, para Android e iOS, feito para uma instituição que participa do Pix por meio de outro banco (participante indireta). Tinha conta, extrato, cadastro com KYC e KYB, TED e DOC, boletos, investimentos e Pix completo: receber, enviar por chave, QR Code ou dados bancários, e gerenciar chaves e portabilidade.',
        p2: 'Liderei um time de 5 pessoas que entregou a plataforma inteira em poucos meses, com infraestrutura no Google Cloud, CI/CD e publicação na App Store e no Google Play.',
        event1: 'Apps publicados',
        event1Note: 'App Store · Google Play',
        event2: 'Pix completo',
        event2Note: 'DICT · portabilidade de chaves',
      },
      anhanguera: {
        role: 'Técnico em TI',
        p1: 'Sistema web interno de gestão para uma instituição de ensino superior, com APIs REST, testes automatizados, CI/CD e bibliotecas de automação. Rodava em servidores Linux físicos que eu mesmo instalei.',
        p2: 'Também fiz cabeamento estruturado, montagem de racks e switches, clonagem em massa de estações e suporte à operação.',
        event1: 'Servidores no ar',
        event1Note: 'Linux físico · cron · git local',
        event2: 'CI verde',
        event2Note: 'testes automatizados',
      },
    },
    education: {
      degrees:
        '<b>Formação</b> · Fatec Taubaté, Análise e Desenvolvimento de Sistemas (2023) · Etec Pindamonhangaba, Técnico em Informática (2018)',
      courses:
        '<b>Cursos</b> · Clean Code e Clean Architecture, Rodrigo Branas (2022) · Node.js avançado com TDD e Clean Architecture, Rodrigo Manguinho (2021)',
    },
  },

  contact: {
    eyebrow: 'Contato',
    title: 'Vamos <em>conversar.</em>',
    lead: 'Me escreva por e-mail. Clique no endereço para copiar.',
    copied: 'e-mail copiado ✓',
    copiedAnnouncement: 'E-mail copiado.',
  },

  footer: {
    stack: 'Feito só com HTML, CSS e JavaScript, sem frameworks e sem bibliotecas ·',
    uncompressed: 'de código, sem comprimir ·',
    source: 'Código-fonte no GitHub',
  },

  shader: {
    label: 'Código do globo',
    title: 'GLSL ES 3.0 · exatamente o que está rodando no globo',
    close: 'Fechar',
    source: 'Código dos shaders',
  },

  palette: {
    label: 'Paleta de comandos',
    placeholder: 'Pra onde?',
    search: 'Buscar comando',
    list: 'Comandos',
    empty: 'Nada por aqui. Tenta "tema" ou "globo".',
    results: { one: '{count} comando', other: '{count} comandos' },
    navigate: 'navegar',
    open: 'abrir',
    close: 'fechar',
    tags: {
      go: 'ir',
      action: 'ação',
      theme: 'tema',
      globe: 'globo',
      code: 'código',
      map: 'mapa',
      external: '↗',
      language: 'idioma',
    },
    commands: {
      status: { title: 'Ir para Status', keywords: 'performance numeros stats medido' },
      profile: { title: 'Ir para Perfil', keywords: 'sobre bio quem' },
      architecture: {
        title: 'Ir para Arquitetura',
        keywords: 'infra kubernetes kafka mapa microsservicos',
      },
      followPix: { title: 'Seguir um Pix no mapa', keywords: 'arquitetura pix walkthrough spi' },
      load: { title: 'Ir para Teste de carga', keywords: 'k6 carga load workers benchmark' },
      runLoad: { title: 'Rodar o teste de carga', keywords: 'k6 carga rodar benchmark' },
      history: { title: 'Ir para Histórico', keywords: 'experiencia empresas okto g8 esatto' },
      contact: { title: 'Ir para Contato', keywords: 'email falar' },
      copyEmail: { title: 'Copiar e-mail', keywords: 'mail contato clipboard' },
      toggleTheme: { title: 'Alternar tema claro / escuro', keywords: 'theme dark light modo' },
      randomHue: { title: 'Tema aleatório', keywords: 'cor matiz hue random' },
      goHome: { title: 'Girar o globo até {city}', keywords: 'casa home globo' },
      shader: { title: 'Ver o código do globo', keywords: 'glsl webgl shader fonte' },
      github: { title: 'Abrir GitHub', keywords: 'github codigo repos' },
      source: {
        title: 'Ver o código-fonte do site',
        keywords: 'codigo fonte repositorio repo github site',
      },
      linkedin: { title: 'Abrir LinkedIn', keywords: 'linkedin trabalho' },
      switchLocale: { title: 'Switch to English', keywords: 'idioma language ingles english' },
      pauseMotion: {
        title: 'Pausar animações',
        keywords: 'movimento parar pausa animation motion',
      },
      resumeMotion: { title: 'Retomar animações', keywords: 'movimento continuar play motion' },
      hueUp: { title: 'Aumentar o matiz', keywords: 'cor hue accent mais' },
      hueDown: { title: 'Diminuir o matiz', keywords: 'cor hue accent menos' },
      speedUp: { title: 'Girar o globo mais rápido', keywords: 'velocidade speed globo' },
      speedDown: { title: 'Girar o globo mais devagar', keywords: 'velocidade speed globo' },
      pointsUp: { title: 'Mais pontos no globo', keywords: 'multiplicador instances gpu' },
      pointsDown: { title: 'Menos pontos no globo', keywords: 'multiplicador instances gpu' },
      spinGlobe: { title: 'Dar um giro no globo', keywords: 'girar rotate globe' },
    },
  },
};
