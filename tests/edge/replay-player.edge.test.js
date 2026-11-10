import { describe, it, expect } from 'vitest';
import { ReplayPlayer } from '../../edge/panel/browser/replay-player.js';
import { SessionChunks } from '../support/session-chunks.js';

/** An element with what the player touches: text, a value, a few properties and its listeners. */
class FakeElement {
  textContent = '';
  value = '0';
  max = '0';
  disabled = true;
  clientWidth = 640;
  style = {};
  listeners = {};

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

/** rrweb's Replayer, recording what the player asks of it, with a clock the test sets. */
class FakeReplayer {
  static made = [];

  calls = [];
  handlers = {};
  now = 0;

  constructor(events, config) {
    this.events = events.map(({ timestamp }) => timestamp);
    this.config = config;
    FakeReplayer.made.push(this);
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  getMetaData() {
    return { startTime: 1_000, endTime: 61_000, totalTime: 60_000 };
  }

  getCurrentTime() {
    return this.now;
  }

  play(at) {
    this.calls.push(['play', at]);
  }

  pause(at) {
    this.calls.push(at === undefined ? ['pause'] : ['pause', at]);
  }
}

describe('ReplayPlayer', () => {
  const setUp = (answers) => {
    FakeReplayer.made = [];
    const elements = Object.fromEntries(
      ['.stage', '.play', '.seek', '.clock', '.status', '.replayer-wrapper'].map((selector) => [
        selector,
        new FakeElement(),
      ]),
    );
    elements['.stage'].querySelector = (selector) => elements[selector];
    const root = {
      dataset: { chunks: Object.keys(answers).join(' ') },
      querySelector: (selector) => elements[selector],
    };
    const fetched = [];
    const timers = {
      calls: [],
      setInterval: (tick, ms) => (timers.calls.push(['set', ms]), (timers.tick = tick), 7),
      clearInterval: (id) => timers.calls.push(['clear', id]),
    };
    const player = new ReplayPlayer({
      root,
      Replayer: FakeReplayer,
      fetch: async (url, init) => {
        fetched.push([url, init]);
        return answers[url] === null ? { ok: false } : { ok: true, events: answers[url] };
      },
      inflate: async (response) => ({ events: response.events }),
      timers,
    });
    return { player, elements, fetched, timers };
  };
  const event = (timestamp) => ({ type: 3, data: {}, timestamp });

  it('fetches every chunk with the cookies of the panel, sorts the events by time, and waits paused at the start', async () => {
    const { player, elements, fetched } = setUp({
      [`/recordings/${SessionChunks.CODE}/000`]: [event(1_000), event(3_000)],
      [`/recordings/${SessionChunks.CODE}/001`]: null,
      [`/recordings/${SessionChunks.CODE}/002`]: [event(2_000)],
    });
    await player.start();
    const [replayer] = FakeReplayer.made;
    expect([
      fetched.map(([url, init]) => [url.slice(-3), init]),
      replayer.events,
      Object.keys(replayer.config),
      replayer.config.root === elements['.stage'],
      replayer.calls,
      elements['.status'].textContent,
      elements['.clock'].textContent,
      [elements['.play'].disabled, elements['.seek'].disabled, elements['.seek'].max],
    ]).toStrictEqual([
      [
        ['000', { credentials: 'same-origin' }],
        ['001', { credentials: 'same-origin' }],
        ['002', { credentials: 'same-origin' }],
      ],
      [1_000, 2_000, 3_000],
      ['root', 'skipInactive', 'mouseTail', 'showWarning'],
      true,
      [['pause', 0]],
      'Ready, without 1 chunk that could not be read.',
      '0:00 / 1:00',
      [false, false, '60000'],
    ]);
  });

  it('plays and pauses with the button, moves with the range, redraws while it plays, and stops at the end', async () => {
    const { player, elements, timers } = setUp({ '/a': [event(1_000), event(61_000)] });
    await player.start();
    const [replayer] = FakeReplayer.made;
    const play = elements['.play'];
    const seek = elements['.seek'];
    const clock = () => elements['.clock'].textContent;
    const seen = [];
    play.listeners.click();
    seen.push([play.textContent, clock()]);
    replayer.now = 5_000;
    timers.tick();
    seen.push([seek.value, clock()]);
    seek.value = '30000';
    seek.listeners.input();
    seen.push([seek.value, clock()]);
    replayer.now = 31_000;
    play.listeners.click();
    seen.push([play.textContent, clock()]);
    seek.value = '45000';
    seek.listeners.input();
    replayer.now = 60_000;
    replayer.handlers.finish();
    seen.push([play.textContent, clock()]);
    seek.value = '60000';
    play.listeners.click();
    expect([seen, replayer.calls, timers.calls]).toStrictEqual([
      [
        ['Pause', '0:00 / 1:00'],
        ['5000', '0:05 / 1:00'],
        ['30000', '0:30 / 1:00'],
        ['Play', '0:31 / 1:00'],
        ['Play', '1:00 / 1:00'],
      ],
      [['pause', 0], ['play', 0], ['play', 30_000], ['pause'], ['pause', 45_000], ['play', 0]],
      [
        ['set', ReplayPlayer.TICK_MS],
        ['clear', 7],
        ['set', ReplayPlayer.TICK_MS],
      ],
    ]);
  });

  it("scales the recorded window down to the stage's width, never up", async () => {
    const { player, elements } = setUp({ '/a': [event(1_000), event(61_000)] });
    await player.start();
    const [replayer] = FakeReplayer.made;
    replayer.handlers.resize({ width: 1280, height: 801 });
    const half = { ...elements['.replayer-wrapper'].style, stage: elements['.stage'].style.height };
    replayer.handlers.resize({ width: 320, height: 500 });
    expect([
      half,
      elements['.replayer-wrapper'].style.transform,
      elements['.stage'].style.height,
    ]).toStrictEqual([
      { transform: 'scale(0.5)', transformOrigin: 'top left', stage: '401px' },
      'scale(1)',
      '500px',
    ]);
  });

  it('says so when a recording has too little to replay, and makes no replayer', async () => {
    const { player, elements } = setUp({ '/a': [event(1_000)], '/b': null });
    await player.start();
    expect([
      elements['.status'].textContent,
      FakeReplayer.made,
      elements['.play'].disabled,
    ]).toStrictEqual(['This recording has too little to replay.', [], true]);
  });

  it('writes a clock in minutes and seconds', () => {
    expect([
      ReplayPlayer.clock(0),
      ReplayPlayer.clock(59_999),
      ReplayPlayer.clock(125_000),
    ]).toStrictEqual(['0:00', '0:59', '2:05']);
  });
});
