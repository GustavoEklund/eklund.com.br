import { describe, it, expect, afterEach, vi } from 'vitest';
import { TrafficSimulation } from '@site/js/architecture-map/traffic-simulation.js';

const LOAD_AT_12_5 = 0.7434777394200351;
const baseWave = (seconds) =>
  0.42 + 0.3 * Math.sin(seconds * 0.21) + 0.18 * Math.sin(seconds * 0.53 + 1);

describe('TrafficSimulation', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('load', () => {
    it.each([
      [0, 0.5714647772654213],
      [1, 0.6623882001026955],
      [5.5, 0.5686945624577466],
      [17, 0.31594401057741867],
      [23, 0.22718979930093786],
      [40, 0.7590591167172669],
    ])('is %f s into the wave -> %f', (seconds, expected) =>
      expect(TrafficSimulation.load(seconds)).toBeCloseTo(expected, 12),
    );

    it('stays between 0.08 and 1 over 3000 seconds, touching both limits', () => {
      const loads = Array.from({ length: 8109 }, (_, index) =>
        TrafficSimulation.load(index * 0.37),
      );
      expect(loads.filter((load) => load < 0.08 || load > 1)).toStrictEqual([]);
      expect([Math.min(...loads), Math.max(...loads)]).toStrictEqual([0.08, 1]);
      expect(loads.filter((load) => load === 0.08)).toHaveLength(791);
      expect(loads.filter((load) => load === 1)).toHaveLength(2);
    });

    it('is deterministic and does not touch Math.random', () => {
      const random = vi.spyOn(Math, 'random');
      expect([TrafficSimulation.load(12.5), TrafficSimulation.load(12.5)]).toStrictEqual([
        LOAD_AT_12_5,
        LOAD_AT_12_5,
      ]);
      expect(random).toHaveBeenCalledTimes(0);
    });

    it('adds exactly 0.12 on top of the wave at 17 s and 17 s into every 23 s cycle', () => {
      expect(TrafficSimulation.load(17)).toBeCloseTo(baseWave(17) + 0.12, 12);
      expect(TrafficSimulation.load(40)).toBeCloseTo(baseWave(40) + 0.12, 12);
    });

    it('adds almost nothing far from the spike, 8.5 s earlier', () => {
      expect(TrafficSimulation.load(8.5)).toBeCloseTo(
        baseWave(8.5) + 0.12 * Math.exp(-((8.5 - 17) ** 2) * 2),
        12,
      );
    });
  });

  describe('throughput', () => {
    it.each([
      [1, 500],
      [0.5714647772654213, 286],
      [0, 0],
      [0.001, 1],
      [0.0009, 0],
      [0.7, 350],
    ])('load %f is %d TPS', (load, expected) => {
      expect(TrafficSimulation.throughput(load)).toBe(expected);
    });
  });

  describe('replicasFor', () => {
    it.each([
      [0, 6, 1],
      [0.5, 6, 4],
      [1, 6, 6],
      [0.17, 6, 2],
      [0.3, 1, 1],
      [0.5, 10, 6],
      [0.15, 4, 1],
      [0.2, 4, 1],
      [0.21, 4, 2],
      [0.95, 3, 3],
    ])('load %f with max %d -> %d replicas', (load, max, expected) => {
      expect(TrafficSimulation.replicasFor(load, max)).toBe(expected);
    });

    it('stays between one and the maximum for every load and limit', () => {
      const replicas = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 1].flatMap((load) =>
        [1, 2, 3, 10].map((max) => [load, max, TrafficSimulation.replicasFor(load, max)]),
      );
      expect(replicas.filter(([, max, count]) => count < 1 || count > max)).toStrictEqual([]);
    });

    it('does not touch Math.random', () => {
      const random = vi.spyOn(Math, 'random');
      TrafficSimulation.replicasFor(0.5, 6);
      TrafficSimulation.throughput(0.5);
      expect(random).toHaveBeenCalledTimes(0);
    });
  });

  describe('sampleService', () => {
    it.each([
      [0, 0.5, 0.35],
      [0.5, 0.5, 0.475],
      [1, 0.5, 0.6],
    ])(
      'random %f at load %f gives %f, after exactly one Math.random call',
      (draw, load, expected) => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(draw);
        expect(TrafficSimulation.sampleService(load)).toBeCloseTo(expected, 12);
        expect(random).toHaveBeenCalledTimes(1);
        expect(random).toHaveBeenNthCalledWith(1);
      },
    );

    it('is clamped to 0.05 at the bottom and 1 at the top', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      expect([
        TrafficSimulation.sampleService(0.01),
        TrafficSimulation.sampleService(1),
      ]).toStrictEqual([0.05, 1]);
    });
  });

  describe('topicActivity', () => {
    it('gets quieter for later topics: 0.55 for topic 0 and 0.4 for topic 2 at load 0.5', () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(TrafficSimulation.topicActivity(0.5, 0)).toBeCloseTo(0.55, 12);
      expect(TrafficSimulation.topicActivity(0.5, 2)).toBeCloseTo(0.4, 12);
      expect(random).toHaveBeenCalledTimes(2);
    });

    it('jitters by exactly +-0.075', () => {
      const random = vi.spyOn(Math, 'random').mockReturnValueOnce(1).mockReturnValueOnce(0);
      expect(TrafficSimulation.topicActivity(0.5, 0)).toBeCloseTo(0.625, 12);
      expect(TrafficSimulation.topicActivity(0.5, 0)).toBeCloseTo(0.475, 12);
      expect(random).toHaveBeenCalledTimes(2);
    });

    it('is clamped to 0.05 at the bottom and 1 at the top', () => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);
      expect([
        TrafficSimulation.topicActivity(0, 5),
        TrafficSimulation.topicActivity(1, 0),
      ]).toStrictEqual([0.05, 1]);
    });
  });
});
