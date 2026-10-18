import { Numbers } from '../shared/math.js';
import { Formatter } from '../shared/format.js';
import { Environment } from '../shared/environment.js';
import { Dom } from '../shared/dom.js';
import { RampScenario } from './ramp-scenario.js';
import { SeriesResampler } from './series-resampler.js';
import { LoadTestCharts } from './load-test-charts.js';
import { TerminalLog } from './terminal-log.js';
import { WorkerPool } from './worker-pool.js';
import { DurationSummary } from './duration-summary.js';

const LATENCY_WINDOW = 600;

/** Runs the toy Pix engine in Web Workers through a ramp scenario and reports it like k6. */
export class LoadTest {
  #root;
  #log;
  #charts;
  #state;
  #progress;
  #summary;
  #runButton;
  #pool;
  #resampler = new SeriesResampler(RampScenario.totalSeconds);
  #onFinished;
  #translator;
  #result = null;
  #running = false;
  #hasRun = false;
  #pausedAt = null; // when the visitor paused motion in the middle of a run
  #pausedTotal = 0; // the milliseconds this run has spent paused
  #resume = null; // lets the loop go on when motion is played again
  #waiting = null;
  #samples = [];
  #series = { tps: [], p95: [], p99: [] };
  #batchDurations = [];
  #counters = LoadTest.#emptyCounters();

  constructor({ root, onFinished, translator }) {
    this.#root = root;
    this.#onFinished = onFinished;
    this.#translator = translator;
    this.#log = new TerminalLog(root.querySelector('#load-test-terminal'));
    this.#charts = new LoadTestCharts({
      throughput: root.querySelector('#load-test-throughput'),
      latency: root.querySelector('#load-test-latency'),
      histogram: root.querySelector('#load-test-histogram'),
      translator,
    });
    this.#state = root.querySelector('#load-test-state');
    this.#progress = root.querySelector('#load-test-progress i');
    this.#summary = root.querySelector('#load-test-summary');
    this.#runButton = root.querySelector('#load-test-run');
    this.#pool = new WorkerPool(Numbers.clamp((navigator.hardwareConcurrency || 4) - 1, 1, 4));
  }

  static isSupported() {
    return 'Worker' in window;
  }

  static #emptyCounters() {
    return { accepted: 0, insufficientFunds: 0, duplicates: 0, invalid: 0, negativeBalances: 0 };
  }

  mount() {
    Dom.setText(this.#root.querySelector('#load-test-workers'), this.#pool.size);
    this.#runButton.addEventListener('click', () => this.run());
    this.#writePlaceholder();
    this.#translator.onChange(() => this.#relocalize());
    const section = this.#root.closest('section') ?? this.#root;
    Dom.observeVisibility(
      section,
      (visible) => {
        if (visible && !document.hidden && !this.#hasRun && !Environment.prefersReducedMotion)
          this.run();
      },
      0.3,
    );
    return this;
  }

  /**
   * Before the first run, only the placeholder depends on the motion setting: with motion off the test waits for the Run button.
   * A run in progress pauses when motion is paused (WCAG 2.2.2) and goes on from where it was when motion is played again.
   */
  sync() {
    if (!this.#hasRun) this.#writePlaceholder();
    if (this.#running) this.#followMotion();
  }

  #followMotion() {
    const paused = Environment.prefersReducedMotion;
    if (paused === (this.#pausedAt !== null)) return;
    if (paused) {
      this.#pausedAt = performance.now();
      this.#waiting = new Promise((resolve) => {
        this.#resume = resolve;
      });
    } else {
      this.#pausedTotal += performance.now() - this.#pausedAt;
      this.#pausedAt = null;
      this.#resume();
    }
    this.#log.setBusy(!paused);
    this.#showRunState();
  }

  /** The run's clock: it stands still while the run is paused, so the ramp picks up where it stopped. */
  #clock() {
    return (this.#pausedAt ?? performance.now()) - this.#pausedTotal;
  }

  #showRunState() {
    this.#translator.bind(
      this.#state,
      this.#pausedAt === null ? 'loadTest.states.running' : 'loadTest.states.paused',
    );
  }

  #t(key, params) {
    return this.#translator.t(key, params);
  }

  #writePlaceholder() {
    this.#log.setPlaceholder(
      this.#t(
        Environment.prefersReducedMotion
          ? 'loadTest.placeholder.manual'
          : 'loadTest.placeholder.auto',
      ),
    );
  }

  /** The log keeps the language it was written in; everything computed from the stored results is redrawn. */
  #relocalize() {
    if (!this.#hasRun) this.#writePlaceholder();
    if (!this.#result || this.#running) return;
    this.#renderSummary(this.#result);
    this.#charts.render(this.#series);
    this.#charts.renderHistogram(this.#batchDurations);
  }

  async run() {
    if (this.#running) return;
    this.#running = this.#hasRun = true;
    this.#reset();
    this.#pool.spawn();
    this.#writeHeader();
    const budgets = await this.#pool.broadcast({ command: 'warm' });
    this.#log.write(
      this.#t('loadTest.log.warmup', {
        rate: Formatter.integer(
          budgets.reduce((sum, { batchesPerTick }) => sum + batchesPerTick, 0) * 20 * 1000,
        ),
      }),
      'dim',
    );
    this.#showRunState();
    await this.#drive();
    await this.#finish();
  }

  #reset() {
    this.#root.classList.add('is-running');
    this.#root.classList.remove('is-done');
    this.#samples = [];
    this.#series = { tps: [], p95: [], p99: [] };
    this.#batchDurations = [];
    this.#counters = LoadTest.#emptyCounters();
    this.#pausedAt = null;
    this.#pausedTotal = 0;
    this.#log.clear();
    this.#charts.clear();
    this.#result = null;
    this.#translator.bind(this.#state, 'loadTest.states.warming');
    this.#runButton.setAttribute('aria-disabled', 'true'); // not `disabled`: the button keeps the focus and its place in the tab order
  }

  #writeHeader() {
    const workers = this.#pool.size;
    this.#log.write(
      this.#t('loadTest.log.header', {
        workers: this.#translator.plural('loadTest.log.workers', workers),
        cores: navigator.hardwareConcurrency || '?',
      }),
      'command',
    );
    this.#log.write(this.#t('loadTest.log.scenario'));
    this.#log.write(this.#t('loadTest.log.checks'));
    this.#log.setBusy(true);
  }

  async #drive() {
    const startedAt = this.#clock();
    const totalSeconds = RampScenario.totalSeconds;
    let lastLogAt = 0,
      doneAtLastLog = 0,
      recentDurations = [];
    for (;;) {
      if (this.#pausedAt !== null) await this.#waiting;
      const elapsed = (this.#clock() - startedAt) / 1000;
      if (elapsed >= totalSeconds) return;
      const fraction = RampScenario.fractionAt(elapsed);
      const replies = await this.#pool.broadcast({ command: 'tick', fraction });
      const durations = replies.flatMap((reply) => [...reply.durations]);
      this.#counters = replies.reduce(
        (total, reply) => ({
          accepted: total.accepted + reply.accepted,
          insufficientFunds: total.insufficientFunds + reply.insufficientFunds,
          duplicates: total.duplicates + reply.duplicates,
          invalid: total.invalid + reply.invalid,
          negativeBalances: total.negativeBalances + reply.negativeBalances,
        }),
        LoadTest.#emptyCounters(),
      );
      const done = this.#processedCount(),
        now = (this.#clock() - startedAt) / 1000;
      recentDurations = [...recentDurations, ...durations].slice(-LATENCY_WINDOW);
      this.#batchDurations.push(...durations);
      this.#samples.push({
        time: now,
        done,
        p95: Numbers.percentile(recentDurations, 0.95),
        p99: Numbers.percentile(recentDurations, 0.99),
      });
      this.#progress.style.width = `${(elapsed / totalSeconds) * 100}%`;
      if (elapsed - lastLogAt >= 1) {
        const rate = (done - doneAtLastLog) / (now - lastLogAt);
        lastLogAt = now;
        doneAtLastLog = done;
        this.#log.write(
          this.#t('loadTest.log.running', {
            elapsed: Formatter.decimal(elapsed % 60, 1).padStart(4, '0'),
            percent: Math.round(fraction * 100)
              .toString()
              .padStart(3),
            done: Formatter.integer(done).padStart(11),
            rate: Formatter.integer(rate).padStart(9),
            p95: Formatter.decimal(this.#samples.at(-1).p95),
          }),
          'running',
        );
        this.#series = this.#resampler.resample(this.#samples);
        this.#charts.render(this.#series);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async #finish() {
    const reports = await this.#pool.broadcast({ command: 'done' });
    this.#pool.terminate();
    this.#series = this.#resampler.resample(this.#samples);
    const counters = this.#counters,
      done = this.#processedCount(),
      seconds = RampScenario.totalSeconds;
    const stats = new DurationSummary(this.#batchDurations),
      averageMs = stats.average;
    const conserved = reports.every((report) => report.conserved);
    const neverNegative =
      reports.every((report) => report.minimumBalance >= 0) && counters.negativeBalances === 0;
    const peak = Math.round(Math.max(...this.#series.tps));
    const log = this.#log,
      p = (fraction) => Formatter.decimal(stats.percentile(fraction));
    log.blank();
    log.write(
      this.#t('loadTest.log.checkPayload', {
        ok: Formatter.integer(done - counters.invalid),
        invalid: Formatter.integer(counters.invalid),
      }),
      'ok',
    );
    log.write(
      this.#t('loadTest.log.checkIdempotency', {
        duplicates: Formatter.integer(counters.duplicates),
      }),
      'ok',
    );
    log.write(
      this.#t('loadTest.log.checkBalance', {
        rejected: Formatter.integer(counters.insufficientFunds),
      }),
      neverNegative ? 'ok' : 'fail',
    );
    log.write(
      this.#translator.plural('loadTest.log.checkConservation', this.#pool.size),
      conserved ? 'ok' : 'fail',
    );
    log.write(
      this.#t('loadTest.log.checkJournal', {
        entries: Formatter.integer(reports.reduce((sum, report) => sum + report.journalEntries, 0)),
        hash: reports.map((report) => report.chain).join(' '),
      }),
      'ok',
    );
    log.blank();
    log.write(
      this.#t('loadTest.log.iterations', {
        count: Formatter.integer(stats.count),
        rate: Formatter.integer(stats.count / seconds),
      }),
      'metric',
    );
    log.write(
      this.#t('loadTest.log.processed', {
        done: Formatter.integer(done),
        average: Formatter.integer(done / seconds),
        peak: Formatter.integer(peak),
      }),
      'metric',
    );
    log.write(
      `<b>batch_duration</b> avg ${Formatter.decimal(averageMs)} ms · min ${Formatter.decimal(stats.min)} · med ${p(0.5)} · p90 ${p(0.9)} · p95 ${p(0.95)} · p99 ${p(0.99)} · max ${Formatter.decimal(stats.max)}`,
      'metric',
    );
    log.write(
      this.#t('loadTest.log.pixDuration', { average: Formatter.decimal(averageMs) }),
      'metric',
    );
    log.setBusy(false);
    this.#charts.render(this.#series);
    this.#charts.renderHistogram(this.#batchDurations);
    this.#result = { done, peak, stats, counters, conserved, neverNegative };
    this.#renderSummary(this.#result);
    this.#translator.bind(this.#state, 'loadTest.states.done');
    this.#root.classList.remove('is-running');
    this.#root.classList.add('is-done');
    this.#translator.bind(this.#runButton, 'loadTest.runAgain');
    this.#runButton.removeAttribute('aria-disabled');
    this.#progress.style.width = '100%';
    this.#running = false;
    this.#onFinished?.({ done, seconds, peak });
  }

  /** The tiles exist in the markup with their units; only the values change, so nothing moves. */
  #renderSummary({ done, peak, stats, counters, conserved, neverNegative }) {
    const passed = 3 + (neverNegative ? 1 : 0) + (conserved ? 1 : 0);
    const values = {
      processed: Formatter.integer(done),
      peak: Formatter.integer(peak),
      p95: Formatter.decimal(stats.percentile(0.95)),
      p99: Formatter.decimal(stats.percentile(0.99)),
      'per-pix': Formatter.decimal(stats.average),
      duplicates: Formatter.integer(counters.duplicates),
      'insufficient-funds': Formatter.integer(counters.insufficientFunds),
      checks: `${passed}${passed === 5 ? ' ✓' : ''}`,
    };
    for (const [key, value] of Object.entries(values)) {
      const output = this.#summary.querySelector(`[data-metric="${key}"] dd`);
      output.firstChild.textContent = value;
    }
  }

  #processedCount() {
    const c = this.#counters;
    return c.accepted + c.insufficientFunds + c.duplicates + c.invalid;
  }
}
