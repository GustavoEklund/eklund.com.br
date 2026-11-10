import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrivacyChoice } from '@site/js/privacy/privacy-choice.js';

const NOW = new Date(2026, 10, 9, 12).getTime();
const SIX_MONTHS_LATER = new Date(2027, 4, 9, 12).getTime();

/** A stand-in for Preferences: a map, and every write it received. */
class MemoryStorage {
  values = new Map();
  writes = [];

  read(key) {
    return this.values.get(key) ?? null;
  }

  write(key, value) {
    this.writes.push([key, value]);
    this.values.set(key, String(value));
  }
}

describe('PrivacyChoice', () => {
  let storage, now;
  const choice = (options = {}) => new PrivacyChoice({ storage, now: () => now, ...options });
  const saved = (fields) =>
    storage.values.set(
      'privacy',
      JSON.stringify({
        version: PrivacyChoice.VERSION,
        measurement: true,
        recording: false,
        expires: NOW + 1,
        ...fields,
      }),
    );
  const state = (subject) => [
    subject.decided,
    subject.measurementAllowed,
    subject.recordingAllowed,
  ];

  beforeEach(() => {
    storage = new MemoryStorage();
    now = NOW;
  });

  it('stores under a key with no tracker word in it, and starts at version 1', () => {
    expect([PrivacyChoice.STORAGE_KEY, PrivacyChoice.VERSION]).toStrictEqual(['privacy', 1]);
  });

  it('keeps a choice for six calendar months', () => {
    expect([
      PrivacyChoice.expiry(NOW),
      PrivacyChoice.expiry(new Date(2026, 7, 31).getTime()),
    ]).toStrictEqual([SIX_MONTHS_LATER, new Date(2027, 2, 3).getTime()]);
  });

  describe('before anything is saved', () => {
    it('asks, measures by legitimate interest and records nothing', () => {
      expect(state(choice())).toStrictEqual([false, true, false]);
    });
  });

  describe('a saved choice', () => {
    it.each([
      ['accepting everything', { measurement: true, recording: true }, [true, true, true]],
      ['refusing everything', { measurement: false, recording: false }, [true, false, false]],
      [
        'measurement without recording',
        { measurement: true, recording: false },
        [true, true, false],
      ],
      [
        'recording without measurement',
        { measurement: false, recording: true },
        [true, false, true],
      ],
      ['fields that are not true', { measurement: 'yes', recording: 1 }, [true, false, false]],
    ])('%s', (_description, fields, expected) => {
      saved(fields);
      expect(state(choice())).toStrictEqual(expected);
    });

    it.each([
      ['runs out at its expiry', { expires: NOW }],
      ['ran out before', { expires: NOW - 1 }],
      ['has no expiry', { expires: undefined }],
      ['is of an older version', { version: PrivacyChoice.VERSION - 1 }],
      ['is of a newer version', { version: PrivacyChoice.VERSION + 1 }],
    ])('is asked again when it %s, as if nothing were saved', (_description, fields) => {
      saved({ ...fields, measurement: false, recording: true });
      expect(state(choice())).toStrictEqual([false, true, false]);
    });

    it.each([['not json'], ['null'], ['42'], ['"text"'], ['[]']])(
      'is ignored when the stored value is %s',
      (value) => {
        storage.values.set('privacy', value);
        expect(state(choice())).toStrictEqual([false, true, false]);
      },
    );

    it('runs out while the page is open, when its expiry passes', () => {
      saved({ measurement: false });
      const subject = choice();
      const before = state(subject);
      now = NOW + 1;
      expect([before, state(subject)]).toStrictEqual([
        [true, false, false],
        [false, true, false],
      ]);
    });
  });

  describe('Global Privacy Control', () => {
    it('counts as refusing everything, so nothing is asked', () => {
      expect(state(choice({ globalPrivacyControl: true }))).toStrictEqual([true, false, false]);
    });

    it('wins over a saved acceptance', () => {
      saved({ measurement: true, recording: true });
      const subject = choice({ globalPrivacyControl: true });
      expect([subject.globalPrivacyControl, ...state(subject)]).toStrictEqual([
        true,
        true,
        false,
        false,
      ]);
    });

    it.each([[false], [undefined], ['true'], [1]])('is only the value true, not %s', (signal) => {
      expect(choice({ globalPrivacyControl: signal }).globalPrivacyControl).toBe(false);
    });
  });

  describe('saving', () => {
    it('writes the version, both purposes and the expiry six months ahead, as JSON', () => {
      choice().save({ measurement: true, recording: false });
      expect(storage.writes).toStrictEqual([
        [
          'privacy',
          JSON.stringify({
            version: 1,
            measurement: true,
            recording: false,
            expires: SIX_MONTHS_LATER,
          }),
        ],
      ]);
    });

    it('accepts all, and refuses all', () => {
      const subject = choice();
      subject.acceptAll();
      const accepted = state(subject);
      subject.refuseAll();
      expect([accepted, state(subject)]).toStrictEqual([
        [true, true, true],
        [true, false, false],
      ]);
    });

    it('tells every listener what is allowed now, until it stops listening', () => {
      const subject = choice();
      const first = vi.fn();
      const second = vi.fn();
      const stopFirst = subject.onChange(first);
      subject.onChange(second);
      subject.acceptAll();
      stopFirst();
      subject.save({ measurement: true, recording: false });
      expect(first).toHaveBeenCalledTimes(1);
      expect(first).toHaveBeenNthCalledWith(1, { measurement: true, recording: true });
      expect(second).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenNthCalledWith(1, { measurement: true, recording: true });
      expect(second).toHaveBeenNthCalledWith(2, { measurement: true, recording: false });
    });

    it('tells the listeners that nothing is allowed under Global Privacy Control, whatever was saved', () => {
      const subject = choice({ globalPrivacyControl: true });
      const listener = vi.fn();
      subject.onChange(listener);
      subject.acceptAll();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenNthCalledWith(1, { measurement: false, recording: false });
    });
  });

  describe('with the browser storage', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    it('reads and writes localStorage through Preferences, on the clock of the page', () => {
      new PrivacyChoice().refuseAll();
      expect([
        JSON.parse(localStorage.getItem('privacy')),
        state(new PrivacyChoice()),
      ]).toStrictEqual([
        { version: 1, measurement: false, recording: false, expires: SIX_MONTHS_LATER },
        [true, false, false],
      ]);
    });
  });
});
