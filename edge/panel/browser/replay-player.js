/**
 * Replays a recording in the panel's page: fetches its chunks from the panel, inflates the gzip in the browser, puts the
 * events of every chunk in time order and hands them to rrweb's Replayer, which rebuilds the page in a sandboxed frame
 * without its scripts. The frame keeps the recorded window's size and is scaled to fit. Play, pause and the range move
 * through it. Everything it needs comes through the constructor, so a test can give it fakes.
 */
export class ReplayPlayer {
  /** How often the position and the clock are redrawn while the recording plays. */
  static TICK_MS = 250;

  #root;
  #Replayer;
  #fetch;
  #inflate;
  #timers;
  #replayer = null;
  #total = 0;
  #playing = false;
  #tick = null;

  /**
   * `root` is the `.replay` element; `Replayer` is rrweb's; `inflate` turns a response of gzip into its JSON;
   * `timers` are `{ setInterval, clearInterval }`.
   */
  constructor({ root, Replayer, fetch, inflate, timers }) {
    this.#root = root;
    this.#Replayer = Replayer;
    this.#fetch = fetch;
    this.#inflate = inflate;
    this.#timers = timers;
  }

  /** Inflates a response of gzip into the JSON inside it, with the browser's DecompressionStream. */
  static inflate(response) {
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  }

  async start() {
    const urls = this.#root.dataset.chunks.split(' ').filter(Boolean);
    const events = [];
    let missing = 0;
    for (const url of urls) {
      const response = await this.#fetch(url, { credentials: 'same-origin' });
      if (!response.ok) {
        missing += 1;
        continue;
      }
      events.push(...(await this.#inflate(response)).events);
    }
    events.sort((a, b) => a.timestamp - b.timestamp);
    if (events.length < 2) {
      this.#say('This recording has too little to replay.');
      return;
    }
    const stage = this.#root.querySelector('.stage');
    this.#replayer = new this.#Replayer(events, {
      root: stage,
      skipInactive: true,
      mouseTail: false,
      showWarning: false,
    });
    this.#replayer.on('resize', ({ width, height }) => this.#fit(stage, width, height));
    this.#replayer.on('finish', () => this.#pause());
    this.#total = this.#replayer.getMetaData().totalTime;
    const play = this.#root.querySelector('.play');
    const seek = this.#root.querySelector('.seek');
    seek.max = String(this.#total);
    play.disabled = false;
    seek.disabled = false;
    play.addEventListener('click', () => (this.#playing ? this.#pause() : this.#play()));
    seek.addEventListener('input', () => this.#seek(Number(seek.value)));
    this.#replayer.pause(0);
    this.#draw(0);
    this.#say(
      missing
        ? `Ready, without ${missing} ${missing === 1 ? 'chunk' : 'chunks'} that could not be read.`
        : 'Ready.',
    );
  }

  #play() {
    const at = Number(this.#root.querySelector('.seek').value);
    this.#replayer.play(at >= this.#total ? 0 : at);
    this.#playing = true;
    this.#root.querySelector('.play').textContent = 'Pause';
    this.#tick = this.#timers.setInterval(
      () => this.#draw(this.#replayer.getCurrentTime()),
      ReplayPlayer.TICK_MS,
    );
  }

  #pause() {
    if (this.#playing) this.#replayer.pause();
    this.#playing = false;
    this.#root.querySelector('.play').textContent = 'Play';
    if (this.#tick !== null) this.#timers.clearInterval(this.#tick);
    this.#tick = null;
    this.#draw(Math.min(this.#replayer.getCurrentTime(), this.#total));
  }

  #seek(at) {
    if (this.#playing) this.#replayer.play(at);
    else this.#replayer.pause(at);
    this.#draw(at);
  }

  #draw(at) {
    this.#root.querySelector('.seek').value = String(Math.round(at));
    this.#root.querySelector('.clock').textContent =
      `${ReplayPlayer.clock(at)} / ${ReplayPlayer.clock(this.#total)}`;
  }

  /** Scales the recorded window down to the width of the stage, and gives the stage the height it then takes. */
  #fit(stage, width, height) {
    const wrapper = stage.querySelector('.replayer-wrapper');
    if (!wrapper || !width) return;
    const scale = Math.min(1, stage.clientWidth / width);
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = 'top left';
    stage.style.height = `${Math.ceil(height * scale)}px`;
  }

  #say(text) {
    this.#root.querySelector('.status').textContent = text;
  }

  /** Milliseconds as minutes and seconds. */
  static clock(milliseconds) {
    const seconds = Math.floor(milliseconds / 1_000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
