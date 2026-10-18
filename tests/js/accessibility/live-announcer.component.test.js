import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveAnnouncer } from '@site/js/accessibility/live-announcer.js';

describe('LiveAnnouncer', () => {
  let region, announcer;
  const advance = (ms) => vi.advanceTimersByTime(ms);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.body.innerHTML =
      '<div id="announcer" role="status" aria-live="polite" aria-atomic="true"></div>';
    region = document.getElementById('announcer');
    announcer = new LiveAnnouncer(region);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes nothing until a message is announced', () => {
    expect([region.textContent, vi.getTimerCount()]).toStrictEqual(['', 0]);
  });

  it('empties the region at once and writes the message 60 ms later, so a screen reader notices the change', () => {
    region.textContent = 'earlier message';
    announcer.announce('E-mail copiado.');
    expect(region.textContent).toBe('');
    advance(59);
    expect(region.textContent).toBe('');
    advance(1);
    expect(region.textContent).toBe('E-mail copiado.');
  });

  it('leaves the message in place and idle once it has been read: 2.5 s later nothing is pending', () => {
    announcer.announce('Pronto.');
    advance(60 + 2500);
    expect([region.textContent, vi.getTimerCount()]).toStrictEqual(['Pronto.', 0]);
  });

  it('says the same message again when it repeats: the region is emptied first', () => {
    announcer.announce('Pronto.');
    advance(60 + 2500);
    announcer.announce('Pronto.');
    expect(region.textContent).toBe('');
    advance(60);
    expect(region.textContent).toBe('Pronto.');
  });

  it('lets each message stay 2.5 s before the next one replaces it, and keeps them all, in order', () => {
    announcer.announce('first');
    announcer.announce('second');
    announcer.announce('third');
    advance(60);
    expect(region.textContent).toBe('first');
    advance(2499);
    expect(region.textContent).toBe('first');
    advance(1);
    expect(region.textContent).toBe('');
    advance(60);
    expect(region.textContent).toBe('second');
    advance(2500 + 60);
    expect(region.textContent).toBe('third');
  });

  it('replaces a message that is still waiting when a newer one has the same topic, and never the one on show', () => {
    announcer.announce('3 results', 'results');
    advance(60);
    announcer.announce('5 results', 'results');
    announcer.announce('7 results', 'results');
    expect(region.textContent).toBe('3 results');
    advance(2500 + 60);
    expect(region.textContent).toBe('7 results');
    advance(2500 + 60);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps messages with different topics, and messages with no topic, apart', () => {
    announcer.announce('banner', 'status');
    announcer.announce('results', 'palette');
    announcer.announce('copied');
    announcer.announce('copied again');
    const shown = [];
    for (let turn = 0; turn < 4; turn++) {
      advance(60);
      shown.push(region.textContent);
      advance(2500);
    }
    expect(shown).toStrictEqual(['banner', 'results', 'copied', 'copied again']);
  });

  it('writes text, not markup', () => {
    announcer.announce('<b>bold</b>');
    advance(60);
    expect([region.textContent, region.childElementCount]).toStrictEqual(['<b>bold</b>', 0]);
  });
});
