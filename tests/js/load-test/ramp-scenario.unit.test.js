import { describe, it, expect, afterEach } from 'vitest';
import { RampScenario } from '@site/js/load-test/ramp-scenario.js';

describe('RampScenario', () => {
  const original = RampScenario.STAGES;
  afterEach(() => {
    RampScenario.STAGES = original;
  });

  it('ramps up for 5 s, holds for 10 s and ramps down for 5 s', () => {
    expect(RampScenario.STAGES).toStrictEqual([
      [5, 1],
      [10, 1],
      [5, 0],
    ]);
    expect(RampScenario.totalSeconds).toBe(20);
  });

  it.each([
    [0, 0],
    [2.5, 0.5],
    [5, 1],
    [7, 1],
    [10, 1],
    [15, 1],
    [17.5, 0.5],
    [20, 0],
  ])('is at %f of the peak after %f s', (seconds, fraction) =>
    expect(RampScenario.fractionAt(seconds)).toBeCloseTo(fraction, 10),
  );

  it('is idle after the last stage', () => {
    expect(RampScenario.fractionAt(20.001)).toBe(0);
    expect(RampScenario.fractionAt(500)).toBe(0);
  });

  it('interpolates between the end of one stage and the end of the next', () => {
    RampScenario.STAGES = [
      [10, 0.4],
      [10, 0.8],
    ];
    expect(RampScenario.totalSeconds).toBe(20);
    expect(RampScenario.fractionAt(5)).toBeCloseTo(0.2, 10);
    expect(RampScenario.fractionAt(10)).toBeCloseTo(0.4, 10);
    expect(RampScenario.fractionAt(15)).toBeCloseTo(0.6, 10);
    expect(RampScenario.fractionAt(20)).toBeCloseTo(0.8, 10);
  });

  it('follows whatever stages are configured', () => {
    RampScenario.STAGES = [[4, 1]];
    expect(RampScenario.totalSeconds).toBe(4);
    expect(RampScenario.fractionAt(1)).toBe(0.25);
    expect(RampScenario.fractionAt(4.5)).toBe(0);
  });
});
