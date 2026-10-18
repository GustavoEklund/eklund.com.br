import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { LoadTest } from '@site/js/load-test/load-test.js';
import { RampScenario } from '@site/js/load-test/ramp-scenario.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { Formatter } from '@site/js/shared/format.js';
import { LoadTestFixture, EngineScript } from '../../support/load-test-fixture.js';
import { FakeIntersectionObserver } from '../../support/fake-observers.js';
import { DictionaryText } from '../../support/dictionary-text.js';
import { RecordingWorker } from '../../contract/support/fake-workers.js';

const ORIGINAL_STAGES = RampScenario.STAGES;
const t = (key, params, locale = 'pt-BR') => DictionaryText.fill(locale, key, params);
const asMarkup = (html) => {
  const probe = document.createElement('div');
  probe.innerHTML = html;
  return probe.innerHTML;
};
const posted = () =>
  RecordingWorker.log
    .filter((entry) => entry.call === 'postMessage')
    .map((entry) => [entry.worker, entry.message]);
const calls = () => RecordingWorker.log.map((entry) => [entry.worker, entry.call]);
const serialized = (width) => {
  const probe = document.createElement('div');
  probe.style.width = width;
  return probe.style.width;
};

/** Builds the section, the scripted workers and a LoadTest on top of them. */
const prepare = ({ hardwareConcurrency = 3, reduced = false, stages = null } = {}) => {
  Formatter.use('pt-BR');
  const fixture = LoadTestFixture.mount();
  const translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' });
  const poolSize = Math.min(4, Math.max(1, (hardwareConcurrency || 4) - 1));
  const script = new EngineScript(fixture, { poolSize });
  script.install();
  vi.stubGlobal('navigator', hardwareConcurrency === null ? {} : { hardwareConcurrency });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)' })),
  );
  FakeIntersectionObserver.install();
  if (stages) RampScenario.STAGES = stages;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  const results = []; // recorded by hand: Vitest wipes mock history before every test, and a shared run outlives the first test
  const onFinished = (result) => {
    results.push(result);
    finish(result);
  };
  const loadTest = new LoadTest({ root: fixture.root, onFinished, translator });
  return { fixture, translator, script, loadTest, results, finished };
};
const release = () => {
  delete document.documentElement.dataset.motion;
  RampScenario.STAGES = ORIGINAL_STAGES;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Formatter.use('pt-BR');
};

// A full 20-second scenario: tick m (from 0) is requested at elapsed second max(0, m - 1), and the first tick takes no time.
const TICKS = 21;
const elapsedAt = (tick) => (tick === 0 ? 0 : tick - 1);
const fractionAt = (tick) => RampScenario.fractionAt(elapsedAt(tick));
const runningLine = (tick) => [
  'terminal-line is-running',
  asMarkup(
    t('loadTest.log.running', {
      elapsed: Formatter.decimal(elapsedAt(tick) % 60, 1).padStart(4, '0'),
      percent: Math.round(fractionAt(tick) * 100)
        .toString()
        .padStart(3),
      done: Formatter.integer(200 * tick).padStart(11),
      rate: Formatter.integer(200).padStart(9),
      p95: Formatter.decimal(4),
    }),
  ),
];

describe('LoadTest.isSupported', () => {
  it('is true where Web Workers exist', () => expect(LoadTest.isSupported()).toBe(true));
});

describe('LoadTest, a complete 20-second run', () => {
  let context;

  beforeAll(async () => {
    context = prepare();
    context.loadTest.mount();
    await context.loadTest.run();
  });
  afterAll(release);

  it('writes the whole k6-style log, in order, in the language of the page: header, warm-up, a progress line every other second, the five checks and the metrics', () => {
    expect(context.fixture.lines()).toStrictEqual([
      [
        'terminal-line is-command',
        asMarkup(
          t('loadTest.log.header', {
            workers: DictionaryText.plural('pt-BR', 'loadTest.log.workers', 2),
            cores: 3,
          }),
        ),
      ],
      ['terminal-line is-info', asMarkup(t('loadTest.log.scenario'))],
      ['terminal-line is-info', asMarkup(t('loadTest.log.checks'))],
      ['terminal-line is-dim', asMarkup(t('loadTest.log.warmup', { rate: '80.000' }))],
      ...[2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(runningLine),
      ['terminal-line is-blank', null],
      [
        'terminal-line is-ok',
        asMarkup(t('loadTest.log.checkPayload', { ok: '3.960', invalid: '40' })),
      ],
      ['terminal-line is-ok', asMarkup(t('loadTest.log.checkIdempotency', { duplicates: '200' }))],
      ['terminal-line is-ok', asMarkup(t('loadTest.log.checkBalance', { rejected: '160' }))],
      [
        'terminal-line is-ok',
        asMarkup(DictionaryText.plural('pt-BR', 'loadTest.log.checkConservation', 2)),
      ],
      [
        'terminal-line is-ok',
        asMarkup(t('loadTest.log.checkJournal', { entries: '4.000', hash: 'aaaa1111 bbbb2222' })),
      ],
      ['terminal-line is-blank', null],
      [
        'terminal-line is-metric',
        asMarkup(t('loadTest.log.iterations', { count: '160', rate: '8' })),
      ],
      [
        'terminal-line is-metric',
        asMarkup(t('loadTest.log.processed', { done: '4.000', average: '200', peak: '200' })),
      ],
      [
        'terminal-line is-metric',
        '<b>batch_duration</b> avg 2,50 ms · min 1,00 · med 3,00 · p90 4,00 · p95 4,00 · p99 4,00 · max 4,00',
      ],
      ['terminal-line is-metric', asMarkup(t('loadTest.log.pixDuration', { average: '2,50' }))],
    ]);
  });

  it('fills the summary tiles and leaves their units alone, with all five checks passing', () => {
    expect(context.fixture.tiles()).toStrictEqual({
      processed: '4.000',
      peak: '200',
      p95: '4,00',
      p99: '4,00',
      'per-pix': '2,50',
      duplicates: '200',
      'insufficient-funds': '160',
      checks: '5 ✓',
    });
    expect(context.fixture.units()).toStrictEqual({
      processed: null,
      peak: '/s',
      p95: 'ms',
      p99: 'ms',
      'per-pix': 'µs',
      duplicates: null,
      'insufficient-funds': null,
      checks: '/5',
    });
  });

  it('tells the workers what to do, in order: spawn, warm each, a tick per worker at each point of the ramp, done, then stop them', () => {
    const tickMessages = Array.from({ length: TICKS }, (_, tick) => [
      [0, { command: 'tick', fraction: fractionAt(tick) }],
      [1, { command: 'tick', fraction: fractionAt(tick) }],
    ]).flat();
    expect(calls().filter(([, call]) => call !== 'postMessage')).toStrictEqual([
      [0, 'new'],
      [1, 'new'],
      [0, 'terminate'],
      [1, 'terminate'],
    ]);
    expect(posted()).toStrictEqual([
      [0, { command: 'warm' }],
      [1, { command: 'warm' }],
      ...tickMessages,
      [0, { command: 'done' }],
      [1, { command: 'done' }],
    ]);
    expect(calls().slice(0, 4)).toStrictEqual([
      [0, 'new'],
      [1, 'new'],
      [0, 'postMessage'],
      [1, 'postMessage'],
    ]);
    expect(calls().slice(-2)).toStrictEqual([
      [0, 'terminate'],
      [1, 'terminate'],
    ]);
  });

  it('follows the ramp: 0 and 0, then 20% to 100% over five seconds, flat for ten, then back down to 20%', () => {
    const fractions = posted()
      .filter(([worker, message]) => worker === 0 && message.command === 'tick')
      .map(([, message]) => message.fraction);
    expect(fractions.slice(0, 7)).toStrictEqual([0, 0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(fractions.map((fraction) => Math.round(fraction * 100))).toStrictEqual([
      0,
      0,
      20,
      40,
      60,
      80,
      100,
      ...Array.from({ length: 10 }, () => 100),
      80,
      60,
      40,
      20,
    ]);
  });

  it('shows the states in turn: warming while the engines warm up, running while the ticks go, done at the end', () => {
    const [warm, firstTick] = context.script.snapshots;
    expect([warm.command, warm.state, firstTick.command, firstTick.state]).toStrictEqual([
      'warm',
      t('loadTest.states.warming'),
      'tick',
      t('loadTest.states.running'),
    ]);
    expect(context.fixture.state.textContent).toBe(t('loadTest.states.done'));
    expect(context.fixture.state.dataset.i18n).toBe('loadTest.states.done');
  });

  it('locks the button and blinks the cursor while it runs, and frees them at the end, offering a rerun', () => {
    const [warm, firstTick] = context.script.snapshots;
    const done = context.script.snapshots.at(-1);
    expect([
      warm.disabled,
      warm.running,
      warm.blinking,
      firstTick.disabled,
      done.command,
      done.disabled,
      done.blinking,
    ]).toStrictEqual([true, true, true, true, 'done', true, true]);
    expect([
      context.fixture.runButton.hasAttribute('aria-disabled'),
      context.fixture.cursor.classList.contains('is-blinking'),
      context.fixture.runButton.textContent,
      context.fixture.runButton.dataset.i18n,
    ]).toStrictEqual([false, false, t('loadTest.runAgain'), 'loadTest.runAgain']);
    expect([
      context.fixture.root.classList.contains('is-running'),
      context.fixture.root.classList.contains('is-done'),
    ]).toStrictEqual([false, true]);
  });

  it('advances the progress bar each tick by the share of the 20 seconds that had elapsed, and completes it', () => {
    const widths = context.script.snapshots
      .filter((snapshot) => snapshot.command === 'tick')
      .map((snapshot) => snapshot.progress);
    const elapsedBefore = (tick) => (tick < 2 ? 0 : tick - 2);
    expect(widths).toStrictEqual(
      Array.from({ length: TICKS }, (_, tick) =>
        tick === 0 ? '' : serialized(`${(elapsedBefore(tick) / 20) * 100}%`),
      ),
    );
    expect(context.fixture.progress.style.width).toBe('100%');
  });

  it('draws the three charts from what it measured', () => {
    const text = (id, selector) =>
      [...document.querySelectorAll(`#${id} ${selector}`)].map((node) => node.textContent);
    expect(text('load-test-throughput', 'text.axis-y')).toStrictEqual(['0', '110', '220']);
    expect(text('load-test-latency', 'text.axis-y')).toStrictEqual(['0,00', '2,50', '5,00']);
    expect(
      [...document.querySelectorAll('#load-test-histogram rect')].map((bar) =>
        bar.getAttribute('height'),
      ),
    ).toStrictEqual(
      Array.from({ length: 14 }, (_, bin) => ([3, 7, 10, 13].includes(bin) ? '122.0' : '0.0')),
    );
  });

  it('reports the result to whoever asked, once', () => {
    expect(context.results).toStrictEqual([{ done: 4000, seconds: 20, peak: 200 }]);
  });
});

describe('LoadTest, a run whose engines report a broken invariant', () => {
  const REPORTS = EngineScript.REPORTS;
  let context;

  afterEach(() => {
    EngineScript.REPORTS = REPORTS;
    release();
  });
  const runWith = async (reports) => {
    EngineScript.REPORTS = reports;
    RampScenario.STAGES = [[2, 1]];
    context = prepare({ stages: [[2, 1]] });
    context.loadTest.mount();
    await context.loadTest.run();
    return context;
  };
  const checkLines = () =>
    context.fixture
      .lines()
      .filter(
        ([, html]) =>
          html?.includes('<b>saldo nunca negativo</b>') || html?.includes('<b>conservação'),
      )
      .map(([className]) => className);

  it('marks the balance check as failed, and the tile counts four checks, when a worker saw a negative balance', async () => {
    await runWith([
      { conserved: true, minimumBalance: -1, journalEntries: 10, chain: 'aaaa1111' },
      { conserved: true, minimumBalance: 5, journalEntries: 10, chain: 'bbbb2222' },
    ]);
    expect([checkLines(), context.fixture.tiles().checks]).toStrictEqual([
      ['terminal-line is-fail', 'terminal-line is-ok'],
      '4',
    ]);
  });

  it('marks the conservation check as failed, and the tile counts four checks, when a worker lost or made money', async () => {
    await runWith([
      { conserved: true, minimumBalance: 5, journalEntries: 10, chain: 'aaaa1111' },
      { conserved: false, minimumBalance: 5, journalEntries: 10, chain: 'bbbb2222' },
    ]);
    expect([checkLines(), context.fixture.tiles().checks]).toStrictEqual([
      ['terminal-line is-ok', 'terminal-line is-fail'],
      '4',
    ]);
  });

  it('counts three checks when both fail', async () => {
    await runWith([
      { conserved: false, minimumBalance: -1, journalEntries: 10, chain: 'aaaa1111' },
      { conserved: false, minimumBalance: -1, journalEntries: 10, chain: 'bbbb2222' },
    ]);
    expect([checkLines(), context.fixture.tiles().checks]).toStrictEqual([
      ['terminal-line is-fail', 'terminal-line is-fail'],
      '3',
    ]);
  });
});

describe('LoadTest, a run the visitor pauses and plays again (WCAG 2.2.2)', () => {
  afterEach(release);
  const ticksPosted = () => posted().filter(([, message]) => message.command === 'tick').length;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
  const PAUSE_AT_TICK = 8;

  /** Starts a run that pauses motion while the eighth tick is being served. */
  const startAndPause = () => {
    const context = prepare();
    context.loadTest.mount();
    context.script.onTick = (position, tick) => {
      if (position === 0 && tick === PAUSE_AT_TICK) {
        document.documentElement.dataset.motion = 'paused';
        context.loadTest.sync();
      }
    };
    context.running = context.loadTest.run();
    return context;
  };

  it('stops asking the workers for ticks while it is paused, says so, and stops the cursor blinking', async () => {
    const context = startAndPause();
    await vi.waitFor(() =>
      expect(context.fixture.state.textContent).toBe(t('loadTest.states.paused')),
    );
    await settle();
    const afterPause = ticksPosted();
    await settle();
    expect([
      afterPause,
      ticksPosted(),
      context.fixture.state.textContent,
      context.fixture.cursor.classList.contains('is-blinking'),
      context.fixture.root.classList.contains('is-running'),
    ]).toStrictEqual([
      2 * PAUSE_AT_TICK,
      2 * PAUSE_AT_TICK,
      t('loadTest.states.paused'),
      false,
      true,
    ]);
  });

  it('goes on from the same point of the ramp when motion is played again, however long it was paused', async () => {
    const context = startAndPause();
    await vi.waitFor(() =>
      expect(context.fixture.state.textContent).toBe(t('loadTest.states.paused')),
    );
    await settle();
    context.script.clock += 60_000; // a minute goes by
    document.documentElement.dataset.motion = 'full';
    context.loadTest.sync();
    expect([
      context.fixture.state.textContent,
      context.fixture.cursor.classList.contains('is-blinking'),
    ]).toStrictEqual([t('loadTest.states.running'), true]);
    await context.running;
    const fractions = posted()
      .filter(([worker, message]) => worker === 0 && message.command === 'tick')
      .map(([, message]) => message.fraction);
    expect([fractions, context.results, context.fixture.state.textContent]).toStrictEqual([
      Array.from({ length: TICKS }, (_, tick) => fractionAt(tick)),
      [{ done: 4000, seconds: 20, peak: 200 }],
      t('loadTest.states.done'),
    ]);
  });

  it('runs to its end when the visitor presses Run while motion is paused: they asked for this run, and playing motion on top of it changes nothing', async () => {
    const context = prepare();
    context.loadTest.mount();
    document.documentElement.dataset.motion = 'paused';
    context.loadTest.sync();
    expect(context.fixture.state.textContent).toBe(t('loadTest.states.waiting'));
    const running = context.loadTest.run();
    await settle();
    document.documentElement.dataset.motion = 'full';
    context.loadTest.sync();
    await running;
    expect(context.results).toStrictEqual([{ done: 4000, seconds: 20, peak: 200 }]);
  });
});

describe('LoadTest, after a run, when the language changes', () => {
  let context, linesBefore;

  beforeAll(async () => {
    context = prepare();
    context.loadTest.mount();
    await context.loadTest.run();
    linesBefore = context.fixture.lines();
    Formatter.use('en-US');
    context.translator.setLocale('en-US');
  });
  afterAll(release);

  it('redraws the summary tiles with the new number format', () => {
    expect(context.fixture.tiles()).toStrictEqual({
      processed: '4,000',
      peak: '200',
      p95: '4.00',
      p99: '4.00',
      'per-pix': '2.50',
      duplicates: '200',
      'insufficient-funds': '160',
      checks: '5 ✓',
    });
  });

  it('redraws the charts, with their labels and numbers in the new language', () => {
    expect(
      [...document.querySelectorAll('#load-test-latency text.axis-y')].map(
        (node) => node.textContent,
      ),
    ).toStrictEqual(['0.00', '2.50', '5.00']);
    expect(document.querySelector('#load-test-latency svg').getAttribute('aria-label')).toBe(
      DictionaryText.entry('en-US', 'loadTest.charts.latencyAria'),
    );
    expect(document.querySelector('#load-test-histogram svg').getAttribute('aria-label')).toBe(
      DictionaryText.entry('en-US', 'loadTest.charts.histogramAria'),
    );
    expect(
      [...document.querySelectorAll('#load-test-histogram text.axis-x')].map(
        (node) => node.textContent,
      ),
    ).toStrictEqual(['0.00 ms', '2.00 ms', '4.00 ms']);
  });

  it('keeps the log in the language it was written in', () => {
    expect(context.fixture.lines()).toStrictEqual(linesBefore);
  });

  it('retranslates the state and the button, which are bound to dictionary keys', () => {
    expect([
      context.fixture.state.textContent,
      context.fixture.runButton.textContent,
    ]).toStrictEqual([t('loadTest.states.done', {}, 'en-US'), t('loadTest.runAgain', {}, 'en-US')]);
  });
});

describe('LoadTest, a short run', () => {
  let context;
  beforeEach(() => {
    RampScenario.STAGES = [[2, 1]];
  });
  afterEach(release);
  const start = (options) => {
    context = prepare({ stages: [[2, 1]], ...options });
    return context;
  };

  describe('mount', () => {
    it('returns itself, shows the pool size and writes the waiting message that starts the test when the section appears', () => {
      start();
      expect(context.loadTest.mount()).toBe(context.loadTest);
      expect([context.fixture.workersLabel.textContent, context.fixture.lines()]).toStrictEqual([
        '2',
        [['terminal-line is-dim', asMarkup(t('loadTest.placeholder.auto'))]],
      ]);
    });

    it('asks the visitor to press run when they prefer reduced motion, and never starts the test by itself', () => {
      start({ reduced: true });
      context.loadTest.mount();
      FakeIntersectionObserver.report(true);
      expect([context.fixture.lines(), calls()]).toStrictEqual([
        [['terminal-line is-dim', asMarkup(t('loadTest.placeholder.manual'))]],
        [],
      ]);
    });

    it('does not start by itself while the visitor has paused motion, even after the panel was mounted with motion on', () => {
      start();
      context.loadTest.mount();
      document.documentElement.dataset.motion = 'paused';
      FakeIntersectionObserver.report(true);
      expect(calls()).toStrictEqual([]);
    });

    it('swaps the waiting message when the motion setting changes before the first run', () => {
      start();
      context.loadTest.mount();
      document.documentElement.dataset.motion = 'paused';
      context.loadTest.sync();
      expect(context.fixture.lines()).toStrictEqual([
        ['terminal-line is-dim', asMarkup(t('loadTest.placeholder.manual'))],
      ]);
      delete document.documentElement.dataset.motion;
      context.loadTest.sync();
      expect(context.fixture.lines()).toStrictEqual([
        ['terminal-line is-dim', asMarkup(t('loadTest.placeholder.auto'))],
      ]);
    });

    it('watches the section around the panel, from 30% of it', () => {
      start();
      context.loadTest.mount();
      expect(
        FakeIntersectionObserver.instances.map((observer) => [observer.observed, observer.options]),
      ).toStrictEqual([[[context.fixture.section], { threshold: 0.3 }]]);
    });

    it.each([
      [1, '1'],
      [2, '1'],
      [3, '2'],
      [4, '3'],
      [5, '4'],
      [16, '4'],
      [null, '3'],
    ])('uses one core for the page: %s cores means %s workers', (cores, workers) => {
      start({ hardwareConcurrency: cores });
      context.loadTest.mount();
      expect(context.fixture.workersLabel.textContent).toBe(workers);
    });
  });

  describe('starting', () => {
    it('starts when the section scrolls into view', async () => {
      start();
      context.loadTest.mount();
      expect(calls()).toStrictEqual([]);
      FakeIntersectionObserver.report(true);
      await context.finished;
      expect(calls().slice(0, 2)).toStrictEqual([
        [0, 'new'],
        [1, 'new'],
      ]);
    });

    it('does not start while the tab is hidden', () => {
      start();
      context.loadTest.mount();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      FakeIntersectionObserver.report(true);
      delete document.hidden;
      expect(calls()).toStrictEqual([]);
    });

    it('does not start when the section leaves the screen', () => {
      start();
      context.loadTest.mount();
      FakeIntersectionObserver.report(false);
      expect(calls()).toStrictEqual([]);
    });

    it('does not start by itself a second time once it has run', async () => {
      start();
      context.loadTest.mount();
      FakeIntersectionObserver.report(true);
      await context.finished;
      const before = RecordingWorker.log.length;
      FakeIntersectionObserver.report(true);
      expect(RecordingWorker.log.length).toBe(before);
    });

    it('starts from the run button', async () => {
      start({ reduced: true });
      context.loadTest.mount();
      context.fixture.runButton.click();
      await context.finished;
      expect(calls().slice(0, 2)).toStrictEqual([
        [0, 'new'],
        [1, 'new'],
      ]);
    });

    it('ignores a second request while it is running: one spawn, one report', async () => {
      start();
      context.loadTest.mount();
      const first = context.loadTest.run();
      const second = context.loadTest.run();
      await Promise.all([first, second]);
      expect([
        calls().filter(([, call]) => call === 'new').length,
        context.results.length,
      ]).toStrictEqual([2, 1]);
    });

    it('leaves the log alone when the motion setting changes after a run', async () => {
      start();
      context.loadTest.mount();
      await context.loadTest.run();
      const before = context.fixture.lines();
      document.documentElement.dataset.motion = 'paused';
      context.loadTest.sync();
      expect(context.fixture.lines()).toStrictEqual(before);
    });

    it('runs again from the button after it finished, clearing the log and starting new workers', async () => {
      start();
      context.loadTest.mount();
      await context.loadTest.run();
      const linesAfterFirst = context.fixture.lines().length;
      context.script.ticks = [];
      context.fixture.runButton.click();
      await vi.waitFor(() => expect(context.results).toHaveLength(2), { timeout: 20000 });
      expect(context.fixture.lines().length).toBe(linesAfterFirst);
      expect(calls().filter(([, call]) => call === 'new').length).toBe(4);
      expect(context.results).toStrictEqual([
        { done: 400, seconds: 2, peak: 200 },
        { done: 400, seconds: 2, peak: 200 },
      ]);
    });
  });

  describe('the log', () => {
    it('shows a question mark when the browser does not say how many cores it has', async () => {
      start({ hardwareConcurrency: null });
      context.loadTest.mount();
      await context.loadTest.run();
      expect(context.fixture.lines()[0]).toStrictEqual([
        'terminal-line is-command',
        asMarkup(
          t('loadTest.log.header', {
            workers: DictionaryText.plural('pt-BR', 'loadTest.log.workers', 3),
            cores: '?',
          }),
        ),
      ]);
    });

    it('uses the singular for one worker', async () => {
      start({ hardwareConcurrency: 2 });
      context.loadTest.mount();
      await context.loadTest.run();
      expect([context.fixture.lines()[0][1], context.fixture.lines().at(-7)[1]]).toStrictEqual([
        asMarkup(
          t('loadTest.log.header', {
            workers: DictionaryText.plural('pt-BR', 'loadTest.log.workers', 1),
            cores: 2,
          }),
        ),
        asMarkup(DictionaryText.plural('pt-BR', 'loadTest.log.checkConservation', 1)),
      ]);
    });
  });

  describe('the language changes', () => {
    it('before the first run: rewrites the waiting message', () => {
      start();
      context.loadTest.mount();
      context.translator.setLocale('en-US');
      expect(context.fixture.lines()).toStrictEqual([
        ['terminal-line is-dim', asMarkup(t('loadTest.placeholder.auto', {}, 'en-US'))],
      ]);
    });

    it('while it runs: leaves the summary, the charts and the log alone until the end', async () => {
      start();
      const seen = [];
      context.script.onTick = (index, tick) => {
        if (index !== 0) return;
        if (tick === 2) {
          Formatter.use('en-US');
          context.translator.setLocale('en-US');
        }
        if (tick === 3)
          seen.push([
            context.fixture.tiles().processed,
            document.querySelectorAll('#load-test-throughput svg').length,
            context.fixture.lines().length,
          ]);
      };
      context.loadTest.mount();
      await context.loadTest.run();
      expect(seen).toStrictEqual([['—', 0, 4]]);
      expect(context.fixture.tiles().processed).toBe('400');
    });
  });
});
