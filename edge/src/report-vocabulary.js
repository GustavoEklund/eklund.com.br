/**
 * The closed lists a page report may use: a value outside them is refused, so nothing the visitor typed or chose freely can
 * reach the database. tests/contract/schemas/page-report.schema.json says the same, and a contract test keeps them equal.
 */
export class ReportVocabulary {
  static PAGES = [
    '/',
    '/en/',
    '/privacidade/',
    '/cookies/',
    '/termos/',
    '/en/privacy/',
    '/en/cookies/',
    '/en/terms/',
  ];

  static LANGUAGES = ['pt-BR', 'en-US'];

  static NAVIGATION_TYPES = [
    'navigate',
    'reload',
    'back-forward',
    'back-forward-cache',
    'prerender',
    'restore',
  ];

  /** Ranges, never the exact values: together, exact sizes and counts could single a device out. */
  static VIEWPORT_WIDTHS = [
    '0-359',
    '360-413',
    '414-767',
    '768-1023',
    '1024-1279',
    '1280-1535',
    '1536+',
  ];
  static PIXEL_RATIOS = ['1', '1.5', '2', '3+'];
  static MEMORIES = ['0-2', '4', '8+', 'unknown'];
  static CORES = ['1-2', '3-4', '5-8', '9+', 'unknown'];
  static ROUND_TRIPS = ['0-99', '100-299', '300-599', '600+', 'unknown'];
  static COLOR_SCHEMES = ['dark', 'light'];

  static METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
  static RATINGS = ['good', 'needs-improvement', 'poor'];
  static LOAD_STATES = ['loading', 'dom-interactive', 'dom-content-loaded', 'complete'];

  /** The fields of web-vitals' attribution build that a report keeps, by metric and by kind of value. */
  static ATTRIBUTION = {
    LCP: {
      text: ['target', 'url'],
      number: [
        'timeToFirstByte',
        'resourceLoadDelay',
        'resourceLoadDuration',
        'elementRenderDelay',
      ],
      choice: {},
    },
    INP: {
      text: ['interactionTarget', 'scriptUrl', 'scriptFunction', 'scriptInvoker'],
      number: [
        'inputDelay',
        'processingDuration',
        'presentationDelay',
        'scriptDuration',
        'totalScriptDuration',
        'totalStyleAndLayoutDuration',
        'totalPaintDuration',
        'totalUnattributedDuration',
      ],
      choice: {
        interactionType: ['pointer', 'keyboard'],
        loadState: ReportVocabulary.LOAD_STATES,
        scriptSubpart: ['input-delay', 'processing-duration', 'presentation-delay'],
      },
    },
    CLS: {
      text: ['largestShiftTarget'],
      number: ['largestShiftTime', 'largestShiftValue'],
      choice: { loadState: ReportVocabulary.LOAD_STATES },
    },
    FCP: {
      text: [],
      number: ['timeToFirstByte', 'firstByteToFCP'],
      choice: { loadState: ReportVocabulary.LOAD_STATES },
    },
    TTFB: {
      text: [],
      number: [
        'waitingDuration',
        'cacheDuration',
        'dnsDuration',
        'connectionDuration',
        'requestDuration',
      ],
      choice: {},
    },
  };

  static SECTIONS = ['status', 'perfil', 'arquitetura', 'carga', 'historico', 'contato'];

  static PALETTE_COMMANDS = [
    'status',
    'profile',
    'architecture',
    'followPix',
    'load',
    'runLoad',
    'history',
    'contact',
    'copyEmail',
    'toggleTheme',
    'randomHue',
    'goHome',
    'shader',
    'github',
    'source',
    'linkedin',
    'switchLocale',
    'pauseMotion',
    'resumeMotion',
    'hueUp',
    'hueDown',
    'speedUp',
    'speedDown',
    'pointsUp',
    'pointsDown',
    'spinGlobe',
  ];

  /** Each event and the details it may carry. An empty list means the event carries no detail. */
  static EVENTS = {
    section: ReportVocabulary.SECTIONS,
    outbound: ['github', 'linkedin', 'source', 'email'],
    'copy-email': [],
    language: ReportVocabulary.LANGUAGES,
    theme: ReportVocabulary.COLOR_SCHEMES,
    hue: [],
    motion: ['paused', 'full'],
    'palette-open': ['shortcut', 'button'],
    'palette-command': ReportVocabulary.PALETTE_COMMANDS,
    'load-test': ['start', 'finish', 'stop'],
    interact: ['globe', 'architecture-map', 'trace-viewer', 'history'],
    'rage-click': [...ReportVocabulary.SECTIONS, 'header', 'footer', 'other'],
  };

  static ERROR_KINDS = ['error', 'rejection', 'worker', 'csp', 'deprecation', 'intervention'];
}
