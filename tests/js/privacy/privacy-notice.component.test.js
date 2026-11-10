import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrivacyNotice } from '@site/js/privacy/privacy-notice.js';
import { PrivacyChoice } from '@site/js/privacy/privacy-choice.js';

const NOW = Date.UTC(2026, 10, 9, 12);
/** Enough of privacy.css to place the card: hidden unless the root asks, then 100 px tall and 16 px above the bottom. */
const STYLE =
  '.privacy-notice { display: none; } :root[data-privacy="ask"] .privacy-notice { display: block; position: fixed; inset: auto 0 16px; height: 100px; }';

/** A stand-in for Preferences that holds values in a map. */
class MemoryStorage {
  values = new Map();
  read(key) {
    return this.values.get(key) ?? null;
  }
  write(key, value) {
    this.values.set(key, String(value));
  }
}

describe('PrivacyNotice', () => {
  let root, main, style, storage, choice, onChoose;
  const html = document.documentElement;
  const notice = () => new PrivacyNotice({ root, choice, onChoose, focusAfter: main });
  const button = (action) => root.querySelector(`[data-privacy-action="${action}"]`);
  const reserved = () => html.style.getPropertyValue('--privacy-notice-height');

  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    document.body.innerHTML =
      '<main id="main" tabindex="-1"><a href="#x" id="outside">outside</a></main><section class="privacy-notice" id="notice"><p>text <a href="/privacidade/">policy</a></p><div><button type="button" data-privacy-action="accept">accept</button><button type="button" data-privacy-action="refuse">refuse</button><button type="button" data-privacy-action="choose">choose</button></div></section>';
    root = document.getElementById('notice');
    main = document.getElementById('main');
    storage = new MemoryStorage();
    choice = new PrivacyChoice({ storage, now: () => NOW });
    onChoose = vi.fn();
    html.dataset.privacy = 'ask'; // what the head script leaves for a visitor with no choice
  });

  afterEach(() => {
    style.remove();
    delete html.dataset.privacy;
    html.style.removeProperty('--privacy-notice-height');
  });

  it('stays open for a visitor with no choice, and returns itself', () => {
    const shown = notice();
    expect([shown.install(), shown.open, html.dataset.privacy]).toStrictEqual([shown, true, 'ask']);
  });

  it('reserves the room from the top of the card to the bottom of the window', () => {
    notice().install();
    expect(reserved()).toBe('116px');
  });

  it('closes at once, with no room reserved, for a visitor who already chose', () => {
    choice.refuseAll();
    const shown = notice().install();
    expect([shown.open, Object.hasOwn(html.dataset, 'privacy'), reserved()]).toStrictEqual([
      false,
      false,
      '',
    ]);
  });

  it('closes at once under Global Privacy Control, and listens to no button', () => {
    choice = new PrivacyChoice({ storage, now: () => NOW, globalPrivacyControl: true });
    const shown = notice().install();
    button('choose').click();
    expect([shown.open, onChoose.mock.calls.length, storage.values.size]).toStrictEqual([
      false,
      0,
      0,
    ]);
  });

  it.each([
    ['accept', { measurement: true, recording: true }],
    ['refuse', { measurement: false, recording: false }],
  ])('saves the choice from "%s" and closes, giving its room back', (action, expected) => {
    const shown = notice().install();
    button(action).click();
    const stored = JSON.parse(storage.values.get('privacy'));
    expect([
      shown.open,
      { measurement: stored.measurement, recording: stored.recording },
      reserved(),
    ]).toStrictEqual([false, expected, '']);
  });

  it('opens the preferences from "choose", and stays open until something is saved', () => {
    const shown = notice().install();
    button('choose').click();
    const before = shown.open;
    choice.save({ measurement: true, recording: false });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenNthCalledWith(1);
    expect([before, shown.open]).toStrictEqual([true, false]);
  });

  it('ignores a click on its text and on the link', () => {
    const shown = notice().install();
    root.querySelector('p').click();
    root.querySelector('a').addEventListener('click', (event) => event.preventDefault());
    root.querySelector('a').click();
    expect([shown.open, onChoose.mock.calls.length, storage.values.size]).toStrictEqual([
      true,
      0,
      0,
    ]);
  });

  it('hands the focus to the main content, without scrolling, when it closes holding it', () => {
    const focus = vi.spyOn(main, 'focus');
    notice().install();
    button('accept').focus();
    button('accept').click();
    expect(document.activeElement).toBe(main);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenNthCalledWith(1, { preventScroll: true });
  });

  it('leaves the focus where it is when the choice is saved elsewhere', () => {
    const outside = document.getElementById('outside');
    notice().install();
    outside.focus();
    choice.refuseAll();
    expect(document.activeElement).toBe(outside);
  });

  it('opens again on a new install after the choice runs out', () => {
    let now = NOW;
    choice = new PrivacyChoice({ storage, now: () => now });
    choice.acceptAll();
    now = PrivacyChoice.expiry(NOW);
    html.dataset.privacy = 'ask';
    expect(notice().install().open).toBe(true);
  });
});
