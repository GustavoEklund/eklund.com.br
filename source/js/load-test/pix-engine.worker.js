import { PixEngine } from './pix-engine.js';

/** Web Worker shell: answers the warm / tick / done messages of WorkerPool with one PixEngine. */
const engine = new PixEngine();
onmessage = ({ data }) => {
  if (data.command === 'warm') postMessage({ batchesPerTick: engine.warmUp() });
  if (data.command === 'tick') {
    const durations = engine.tick(data.fraction);
    postMessage({ durations, ...engine.counters }, [durations.buffer]);
  }
  if (data.command === 'done') postMessage(engine.report());
};
