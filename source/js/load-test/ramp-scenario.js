/** Load stages like k6's ramping-vus: [durationSeconds, targetFraction at the end of the stage]. */
export class RampScenario {
  static STAGES = [
    [5, 1],
    [10, 1],
    [5, 0],
  ];

  static get totalSeconds() {
    return RampScenario.STAGES.reduce((sum, [duration]) => sum + duration, 0);
  }

  static fractionAt(seconds) {
    let elapsed = 0,
      previous = 0;
    for (const [duration, target] of RampScenario.STAGES) {
      if (seconds <= elapsed + duration)
        return previous + (target - previous) * ((seconds - elapsed) / duration);
      elapsed += duration;
      previous = target;
    }
    return 0;
  }
}
