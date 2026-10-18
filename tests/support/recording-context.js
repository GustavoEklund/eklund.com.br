/** A 2D canvas context that records every call and every property write, in order, instead of drawing. */
export class RecordingContext {
  calls = [];
  writes = [];

  constructor() {
    return new Proxy(this, {
      get: (target, name) => {
        if (name in target) return target[name];
        return (...args) => {
          target.calls.push([name, ...args]);
        };
      },
      set: (target, name, value) => {
        if (name === 'calls' || name === 'writes') {
          target[name] = value;
          return true;
        }
        target.writes.push([name, value]);
        return true;
      },
    });
  }

  callsTo(name) {
    return this.calls.filter(([called]) => called === name);
  }
}
