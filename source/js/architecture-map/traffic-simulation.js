import { Numbers } from '../shared/math.js';

const PEAK_TPS = 500;

/** A slow wave with periodic spikes, in 0..1, driving sparklines, replicas and packet density. */
export class TrafficSimulation {
  static load(seconds) {
    const spike = (seconds % 23) - 17;
    return Numbers.clamp(
      0.42 +
        0.3 * Math.sin(seconds * 0.21) +
        0.18 * Math.sin(seconds * 0.53 + 1) +
        0.12 * Math.exp(-spike * spike * 2),
      0.08,
      1,
    );
  }

  static throughput(load) {
    return Math.round(load * PEAK_TPS);
  }

  static sampleService(load) {
    return Numbers.clamp(load * (0.7 + 0.5 * Math.random()), 0.05, 1);
  }

  static replicasFor(load, maxReplicas) {
    return Numbers.clamp(Math.ceil(load * maxReplicas + 0.2), 1, maxReplicas);
  }

  static topicActivity(load, topicIndex) {
    return Numbers.clamp(load * (1.1 - topicIndex * 0.15) + (Math.random() - 0.5) * 0.15, 0.05, 1);
  }
}
