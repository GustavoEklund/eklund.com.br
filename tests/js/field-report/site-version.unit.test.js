import { describe, it, expect } from 'vitest';
import { SiteVersion } from '@site/js/field-report/site-version.js';

describe('SiteVersion', () => {
  it('is a version in the form the collector reads, x.y.z with an optional pre-release', () => {
    expect(/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.]{1,20})?$/.test(SiteVersion.NUMBER)).toBe(true);
  });
});
