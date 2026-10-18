import { Formatter } from '../shared/format.js';

const REFRESH_MS = 15000;

/** Shows the owner's local time wherever `render` puts it. */
export class LocalClock {
  #timeZone;

  constructor(timeZone) {
    this.#timeZone = timeZone;
  }

  start(render) {
    const tick = () => render(Formatter.hourAndMinute(new Date(), this.#timeZone));
    tick();
    setInterval(tick, REFRESH_MS);
  }
}
