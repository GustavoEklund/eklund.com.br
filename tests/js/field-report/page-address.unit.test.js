import { describe, it, expect } from 'vitest';
import { PageAddress } from '@site/js/field-report/page-address.js';

describe('PageAddress', () => {
  it('names the page without its release folder or index.html, and only the pages that run scripts', () => {
    expect(
      [
        '/',
        '/en/',
        '/index.html',
        '/en/index.html',
        '/1.1.0/',
        '/1.2.0-rc.1/en/',
        '/privacidade/',
        '/en/privacy/',
        '/1.1.0',
        '/x/',
      ].map((pathname) => PageAddress.of(pathname)),
    ).toStrictEqual(['/', '/en/', '/', '/en/', '/', '/en/', null, null, null, null]);
  });
});
