import { describe, it, expect } from 'vitest';
import { VisitorAgent } from '../../edge/src/visitor-agent.js';

const AGENTS = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeAndroidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  unknown: 'Mozilla/5.0 (X11; Linux x86_64) SomeBrowser/3',
};

const ROBOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp/2.23.20.0',
  'TelegramBot (like TwitterBot)',
  'curl/8.10.1',
  'python-requests/2.32.3',
  'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  '',
  '   ',
];

describe('VisitorAgent.of', () => {
  it('names the browser, its major version and the kind of device', () => {
    expect(Object.values(AGENTS).map((agent) => VisitorAgent.of(agent))).toStrictEqual([
      { robot: false, device: 'phone', browser: 'chrome', version: 130 },
      { robot: false, device: 'desktop', browser: 'chrome', version: 130 },
      { robot: false, device: 'desktop', browser: 'edge', version: 130 },
      { robot: false, device: 'desktop', browser: 'opera', version: 115 },
      { robot: false, device: 'phone', browser: 'samsung', version: 27 },
      { robot: false, device: 'desktop', browser: 'firefox', version: 131 },
      { robot: false, device: 'phone', browser: 'firefox', version: 131 },
      { robot: false, device: 'phone', browser: 'safari', version: 18 },
      { robot: false, device: 'desktop', browser: 'safari', version: 18 },
      { robot: false, device: 'tablet', browser: 'safari', version: 18 },
      { robot: false, device: 'tablet', browser: 'chrome', version: 130 },
      { robot: false, device: 'desktop', browser: 'other', version: null },
    ]);
  });

  it('takes a phone from the Sec-CH-UA-Mobile hint when the User-Agent looks like a desktop', () => {
    expect([
      VisitorAgent.of(AGENTS.chromeWindows, '?1').device,
      VisitorAgent.of(AGENTS.chromeWindows, '?0').device,
      VisitorAgent.of(AGENTS.chromeAndroidTablet, '?1').device,
    ]).toStrictEqual(['phone', 'desktop', 'tablet']);
  });

  it('tells crawlers, link previews, Lighthouse, headless browsers, scripts and an empty agent from people', () => {
    expect(ROBOTS.map((agent) => VisitorAgent.of(agent).robot)).toStrictEqual(
      ROBOTS.map(() => true),
    );
  });
});
