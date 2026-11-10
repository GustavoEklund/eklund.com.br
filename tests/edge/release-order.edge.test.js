import { describe, it, expect } from 'vitest';
import { ReleaseOrder } from '../../edge/panel/release-order.js';

describe('ReleaseOrder', () => {
  it('puts releases newest first by their numbers, each once, with a release candidate before its release', () => {
    expect(
      ReleaseOrder.newestFirst(['1.9.2', '1.10.0', '1.2.0', '1.2.0-rc.1', '1.10.0', '0.9.0']),
    ).toStrictEqual(['1.10.0', '1.9.2', '1.2.0', '1.2.0-rc.1', '0.9.0']);
  });

  it('compares two versions, and two candidates of the same release by their names', () => {
    expect([
      Math.sign(ReleaseOrder.compare('1.2.0', '1.2.0')),
      Math.sign(ReleaseOrder.compare('1.2.0-rc.1', '1.2.0-rc.2')),
      Math.sign(ReleaseOrder.compare('2.0.0', '1.99.99')),
      Math.sign(ReleaseOrder.compare('1.2.0', '1.2.0-rc.1')),
    ]).toStrictEqual([0, -1, 1, 1]);
  });

  it('gives an empty list for no versions', () => {
    expect(ReleaseOrder.newestFirst([])).toStrictEqual([]);
  });
});
