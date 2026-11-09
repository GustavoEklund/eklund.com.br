import { describe, it, expect } from 'vitest';
import { Sample } from '../../edge/src/sample.js';

describe('Sample', () => {
  it('needs twenty values in a group, and fourteen nights in a series', () => {
    expect([Sample.MINIMUM, Sample.SERIES_MINIMUM]).toStrictEqual([20, 14]);
  });

  it('says how large a sample is and whether it reaches the minimum, the group one unless another is given', () => {
    expect([Sample.of(19), Sample.of(20), Sample.of(13, Sample.SERIES_MINIMUM)]).toStrictEqual([
      { size: 19, minimum: 20, enough: false },
      { size: 20, minimum: 20, enough: true },
      { size: 13, minimum: 14, enough: false },
    ]);
  });
});
