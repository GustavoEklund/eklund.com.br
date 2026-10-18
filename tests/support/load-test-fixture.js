import { vi } from 'vitest';
import { RecordingWorker, ScriptedWorker } from '../contract/support/fake-workers.js';

/** The load test section as the page marks it up, with the elements the class reads and writes. */
export class LoadTestFixture {
  static MARKUP = `<section id="load-test-section"><div id="load-test">
    <b id="load-test-workers">—</b>
    <span id="load-test-state">aguardando</span>
    <div id="load-test-progress"><i></i></div>
    <div id="load-test-terminal" style="height:120px;overflow:auto"><div class="terminal-output"></div><div class="terminal-prompt"><span class="terminal-cursor"></span></div></div>
    <div id="load-test-throughput"></div><div id="load-test-latency"></div><div id="load-test-histogram"></div>
    <dl id="load-test-summary">
      <div data-metric="processed"><dt>Pix</dt><dd>—</dd></div>
      <div data-metric="peak"><dt>Pico</dt><dd>—<small>/s</small></dd></div>
      <div data-metric="p95"><dt>p95</dt><dd>—<small>ms</small></dd></div>
      <div data-metric="p99"><dt>p99</dt><dd>—<small>ms</small></dd></div>
      <div data-metric="per-pix"><dt>Por Pix</dt><dd>—<small>µs</small></dd></div>
      <div data-metric="duplicates"><dt>Dup</dt><dd>—</dd></div>
      <div data-metric="insufficient-funds"><dt>Saldo</dt><dd>—</dd></div>
      <div data-metric="checks"><dt>Checks</dt><dd>—<small>/5</small></dd></div>
    </dl>
    <button id="load-test-run">rodar</button></div></section>`;

  root;
  section;
  state;
  progress;
  output;
  cursor;
  runButton;
  workersLabel;

  static mount() {
    document.body.innerHTML = LoadTestFixture.MARKUP;
    const fixture = new LoadTestFixture();
    fixture.root = document.getElementById('load-test');
    fixture.section = document.getElementById('load-test-section');
    fixture.state = document.getElementById('load-test-state');
    fixture.progress = document.querySelector('#load-test-progress i');
    fixture.output = document.querySelector('.terminal-output');
    fixture.cursor = document.querySelector('.terminal-cursor');
    fixture.runButton = document.getElementById('load-test-run');
    fixture.workersLabel = document.getElementById('load-test-workers');
    return fixture;
  }

  /** Every log line as [class, inner markup of its text], without the time stamp, which depends on when the test ran. */
  lines() {
    return [...this.output.children].map((line) => [
      line.className,
      line.querySelector('span')?.innerHTML ?? null,
    ]);
  }

  /** The value of each summary tile, without its unit. */
  tiles() {
    return Object.fromEntries(
      [...document.querySelectorAll('#load-test-summary [data-metric]')].map((tile) => [
        tile.dataset.metric,
        tile.querySelector('dd').firstChild.textContent,
      ]),
    );
  }

  units() {
    return Object.fromEntries(
      [...document.querySelectorAll('#load-test-summary [data-metric]')].map((tile) => [
        tile.dataset.metric,
        tile.querySelector('small')?.textContent ?? null,
      ]),
    );
  }
}

/**
 * Stands in for the engine workers. It answers warm, tick and done like pix-engine.worker.js does, and moves a
 * clock that the test hands to performance.now(): the first tick takes no time and every later tick takes one second.
 * Counters are cumulative per worker, as the real engine's are: each tick after the first adds 90 accepted, 4 without
 * funds, 5 duplicates and 1 invalid payment per worker, which is 200 Pix per second with two workers.
 */
export class EngineScript {
  static REPORTS = [
    { conserved: true, minimumBalance: 5, journalEntries: 1900, chain: 'aaaa1111' },
    { conserved: true, minimumBalance: 5, journalEntries: 2100, chain: 'bbbb2222' },
  ];

  clock = 5000;
  ticks = [];
  snapshots = [];
  onTick = null;
  #fixture;
  #poolSize;

  /** `poolSize` is how many workers one run spawns: a new run gets new worker indices, but the same positions in the pool. */
  constructor(fixture, { poolSize = 2 } = {}) {
    this.#fixture = fixture;
    this.#poolSize = poolSize;
  }

  install() {
    RecordingWorker.reset();
    ScriptedWorker.delays = [];
    ScriptedWorker.script = (index, message) => this.respond(index, message);
    vi.stubGlobal('Worker', ScriptedWorker);
    vi.spyOn(performance, 'now').mockImplementation(() => this.clock);
  }

  respond(index, message) {
    const fixture = this.#fixture;
    const position = index % this.#poolSize;
    if (position === 0) {
      this.snapshots.push({
        command: message.command,
        state: fixture.state.textContent,
        disabled: fixture.runButton.getAttribute('aria-disabled') === 'true',
        running: fixture.root.classList.contains('is-running'),
        blinking: fixture.cursor.classList.contains('is-blinking'),
        progress: fixture.progress.style.width,
        lines: fixture.output.childElementCount,
      });
    }
    if (message.command === 'warm') return { batchesPerTick: 2 };
    if (message.command === 'done')
      return {
        ...(EngineScript.REPORTS[position] ?? {
          conserved: true,
          minimumBalance: 5,
          journalEntries: 1000,
          chain: `cccc000${position}`,
        }),
      };
    this.ticks[position] = (this.ticks[position] ?? 0) + 1;
    const tick = this.ticks[position],
      elapsedTicks = tick - 1;
    if (position === 0) this.clock += tick === 1 ? 0 : 1000;
    this.onTick?.(position, tick);
    return {
      durations: elapsedTicks ? Float32Array.of(1, 2, 3, 4) : new Float32Array(0),
      accepted: 90 * elapsedTicks,
      insufficientFunds: 4 * elapsedTicks,
      duplicates: 5 * elapsedTicks,
      invalid: elapsedTicks,
      negativeBalances: 0,
    };
  }
}
