import { Replayer } from './rrweb-replay.js';
import { ReplayPlayer } from './replay-player.js';

// The one script of the replay page, and its composition root: it gives the player rrweb's Replayer and the browser.
new ReplayPlayer({
  root: document.querySelector('.replay'),
  Replayer,
  fetch: globalThis.fetch.bind(globalThis),
  inflate: ReplayPlayer.inflate,
  timers: {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  },
}).start();
