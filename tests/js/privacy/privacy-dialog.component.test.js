import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrivacyDialog } from '@site/js/privacy/privacy-dialog.js';
import { PrivacyChoice } from '@site/js/privacy/privacy-choice.js';
import { Translator } from '@site/js/i18n/translator.js';
import { Dictionaries } from '@site/js/i18n/dictionaries.js';
import { DictionaryText } from '../../support/dictionary-text.js';

const NOW = Date.UTC(2026, 10, 9, 12);
const SAVED = DictionaryText.entry('pt-BR', 'privacy.dialog.saved');
const DELETED = DictionaryText.entry('pt-BR', 'privacy.dialog.deleted');
const DELETE_FAILED = DictionaryText.entry('pt-BR', 'privacy.dialog.deleteFailed');
const NO_RECORDINGS = DictionaryText.entry('pt-BR', 'privacy.dialog.noRecordings');
const HELD_RECORDINGS = DictionaryText.entry('pt-BR', 'privacy.dialog.heldRecordings');
const MARKUP = `
  <main id="main" tabindex="-1"><button id="opener">open</button><a id="link" href="/privacidade/#escolha">preferences</a></main>
  <dialog id="privacy-dialog">
    <button id="privacy-close">close</button>
    <p id="inside">text</p>
    <input type="checkbox" id="privacy-measurement"><input type="checkbox" id="privacy-recording">
    <p id="privacy-signal" hidden>signal</p>
    <button data-privacy-action="save">save</button><button data-privacy-action="accept">accept</button><button data-privacy-action="refuse">refuse</button>
    <button id="privacy-delete" disabled>delete</button><p id="privacy-no-recordings" data-i18n="privacy.dialog.noRecordings">none</p>
  </dialog>`;

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

describe('PrivacyDialog.requested and withoutRequest', () => {
  it.each([
    ['?preferencias', true],
    ['?preferences', true],
    ['?utm=x&preferencias=1', true],
    ['', false],
    ['?lang=pt', false],
    ['?preferencia', false],
  ])('%s asks for the preferences: %s', (search, expected) => {
    expect(PrivacyDialog.requested(search)).toBe(expected);
  });

  it.each([
    ['https://eklund.com.br/?preferencias', '/'],
    ['https://eklund.com.br/en/?preferences', '/en/'],
    ['https://eklund.com.br/?utm=x&preferencias#contato', '/?utm=x#contato'],
    ['https://eklund.com.br/1.1.0/?preferencias=&lang=pt', '/1.1.0/?lang=pt'],
  ])('%s without the request is %s', (address, expected) => {
    expect(PrivacyDialog.withoutRequest(address)).toBe(expected);
  });
});

describe('PrivacyDialog', () => {
  let dialog, storage, choice, announce, recordings, preferences;
  const element = (id) => document.getElementById(id);
  const button = (action) => dialog.querySelector(`[data-privacy-action="${action}"]`);
  const create = (options = {}) =>
    new PrivacyDialog({
      dialog,
      choice,
      translator: new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale: 'pt-BR' }),
      announce,
      focusAfter: element('main'),
      openLinks: [element('link')],
      ...options,
    });
  const stored = () => {
    const { measurement, recording } = JSON.parse(storage.values.get('privacy'));
    return { measurement, recording };
  };
  /** [checked, disabled] of each switch. */
  const controls = () =>
    ['privacy-measurement', 'privacy-recording'].map((id) => [
      element(id).checked,
      element(id).disabled,
    ]);
  /** Resolves once the dialog fired its close event, after its own listener. */
  const closed = () =>
    new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    dialog = element('privacy-dialog');
    storage = new MemoryStorage();
    choice = new PrivacyChoice({ storage, now: () => NOW });
    announce = vi.fn();
    recordings = { held: vi.fn(() => false), deleteAll: vi.fn(() => Promise.resolve()) };
    preferences = create({ recordings }).mount();
  });

  afterEach(() => {
    if (dialog.open) dialog.close();
  });

  it('returns itself from mount, and opens as a modal only when asked', () => {
    const before = dialog.open;
    preferences.open();
    expect([before, preferences.isOpen, dialog.matches(':modal')]).toStrictEqual([
      false,
      true,
      true,
    ]);
  });

  it('shows, before anything is saved, measurement on and recording off, with nothing to delete', () => {
    preferences.open();
    expect([
      controls(),
      element('privacy-delete').disabled,
      element('privacy-signal').hidden,
    ]).toStrictEqual([
      [
        [true, false],
        [false, false],
      ],
      true,
      true,
    ]);
  });

  it('shows the saved choice each time it opens', () => {
    choice.save({ measurement: false, recording: true });
    preferences.open();
    expect(controls()).toStrictEqual([
      [false, false],
      [true, false],
    ]);
  });

  it('saves what the switches say, closes and announces it', () => {
    preferences.open();
    element('privacy-measurement').click();
    element('privacy-recording').click();
    button('save').click();
    expect([stored(), dialog.open]).toStrictEqual([{ measurement: false, recording: true }, false]);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenNthCalledWith(1, SAVED);
  });

  it.each([
    ['accept', { measurement: true, recording: true }],
    ['refuse', { measurement: false, recording: false }],
  ])('saves everything from "%s", whatever the switches say, and closes', (action, expected) => {
    preferences.open();
    element('privacy-measurement').click();
    button(action).click();
    expect([stored(), dialog.open, announce.mock.calls.length]).toStrictEqual([expected, false, 1]);
  });

  it('closes from its close button and from the backdrop, without saving, but not from its content', () => {
    preferences.open();
    element('inside').click();
    const afterContent = dialog.open;
    element('privacy-close').click();
    const afterClose = dialog.open;
    preferences.open();
    dialog.click();
    expect([afterContent, afterClose, dialog.open, storage.values.size]).toStrictEqual([
      true,
      false,
      false,
      0,
    ]);
  });

  it('opens from its links and keeps the browser on the page', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    element('link').dispatchEvent(event);
    expect([dialog.open, event.defaultPrevented]).toStrictEqual([true, true]);
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])(
    'leaves a click on a link with %s to the browser',
    (modifier) => {
      let prevented = null;
      // The document cancels the click last, so this page never leaves.
      document.addEventListener(
        'click',
        (click) => {
          prevented = click.defaultPrevented;
          click.preventDefault();
        },
        { once: true },
      );
      element('link').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true }),
      );
      expect([dialog.open, prevented]).toStrictEqual([false, false]);
    },
  );

  it('gives the focus back to what opened it', async () => {
    element('opener').focus();
    preferences.open();
    const done = closed();
    preferences.close();
    await done;
    expect(document.activeElement).toBe(element('opener'));
  });

  it('hands the focus to the main content, without scrolling, when what opened it is gone', async () => {
    element('opener').focus();
    preferences.open();
    element('opener').hidden = true;
    const focus = vi.spyOn(element('main'), 'focus');
    const done = closed();
    button('refuse').click();
    await done;
    expect(document.activeElement).toBe(element('main'));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenNthCalledWith(1, { preventScroll: true });
  });

  it('follows a choice saved elsewhere while it is open', () => {
    preferences.open();
    choice.acceptAll();
    expect(controls()).toStrictEqual([
      [true, false],
      [true, false],
    ]);
  });

  describe('under Global Privacy Control', () => {
    beforeEach(() => {
      choice = new PrivacyChoice({ storage, now: () => NOW, globalPrivacyControl: true });
      preferences = create({ recordings }).mount();
      preferences.open();
    });

    it('shows both switches off and disabled, says why, and leaves only refusing', () => {
      expect([
        controls(),
        element('privacy-signal').hidden,
        ['save', 'accept', 'refuse'].map((action) => button(action).disabled),
      ]).toStrictEqual([
        [
          [false, true],
          [false, true],
        ],
        false,
        [true, true, false],
      ]);
    });
  });

  describe('the recordings of this browser', () => {
    const note = () => [
      element('privacy-no-recordings').dataset.i18n,
      element('privacy-no-recordings').textContent,
    ];

    it('enables deleting them while the browser holds some, and deletes them, then says so', async () => {
      recordings.held.mockReturnValueOnce(true).mockReturnValue(false);
      preferences.open();
      const enabled = [!element('privacy-delete').disabled, note()];
      element('privacy-delete').click();
      const during = element('privacy-delete').disabled;
      await vi.waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
      expect(announce).toHaveBeenNthCalledWith(1, DELETED);
      expect(recordings.deleteAll).toHaveBeenCalledTimes(1);
      expect(recordings.deleteAll).toHaveBeenNthCalledWith(1);
      expect([
        enabled,
        during,
        element('privacy-delete').disabled,
        note(),
        dialog.open,
      ]).toStrictEqual([
        [true, ['privacy.dialog.heldRecordings', HELD_RECORDINGS]],
        true,
        true,
        ['privacy.dialog.noRecordings', NO_RECORDINGS],
        true,
      ]);
    });

    it('says when the deletion failed, and keeps the button for another try', async () => {
      recordings.held.mockReturnValue(true);
      recordings.deleteAll.mockRejectedValueOnce(new Error('the collector answered 503'));
      preferences.open();
      element('privacy-delete').click();
      await vi.waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
      expect(announce).toHaveBeenNthCalledWith(1, DELETE_FAILED);
      expect([element('privacy-delete').disabled, note()]).toStrictEqual([
        false,
        ['privacy.dialog.heldRecordings', HELD_RECORDINGS],
      ]);
    });

    it('holds none until they exist, by default', async () => {
      expect([
        PrivacyDialog.NO_RECORDINGS.held(),
        await PrivacyDialog.NO_RECORDINGS.deleteAll(),
        Object.isFrozen(PrivacyDialog.NO_RECORDINGS),
      ]).toStrictEqual([false, undefined, true]);
    });
  });
});
