import { describe, it, expect, afterEach, vi } from 'vitest';
import { Preferences } from '@site/js/shared/storage.js';

describe('Preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns null for an unknown key', () => expect(Preferences.read('missing')).toBeNull());

  it('round-trips a value', () => {
    Preferences.write('theme', 'dark');
    expect(Preferences.read('theme')).toBe('dark');
  });

  it('stores non-strings as text', () => {
    Preferences.write('count', 42);
    expect(localStorage.getItem('count')).toBe('42');
  });

  it('stores false and zero rather than dropping them', () => {
    Preferences.write('flag', false);
    Preferences.write('zero', 0);
    expect([localStorage.getItem('flag'), localStorage.getItem('zero')]).toStrictEqual([
      'false',
      '0',
    ]);
  });

  it('overwrites an existing value', () => {
    Preferences.write('lang', 'pt-BR');
    Preferences.write('lang', 'en-US');
    expect(Preferences.read('lang')).toBe('en-US');
    expect(localStorage.length).toBe(1);
  });

  it('asks the storage for exactly the key it was given', () => {
    const getItem = vi.fn(() => 'dark');
    vi.stubGlobal('localStorage', { getItem });
    expect(Preferences.read('theme')).toBe('dark');
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenNthCalledWith(1, 'theme');
  });

  it('writes exactly the key and the text of the value, once', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    Preferences.write('size', 12.5);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenNthCalledWith(1, 'size', '12.5');
  });

  it('answers null when the storage throws on read, after trying once', () => {
    const getItem = vi.fn(() => {
      throw new Error('blocked');
    });
    vi.stubGlobal('localStorage', { getItem });
    expect(Preferences.read('lang')).toBeNull();
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenNthCalledWith(1, 'lang');
  });

  it('answers undefined when the storage throws on write, after trying once', () => {
    const setItem = vi.fn(() => {
      throw new Error('quota');
    });
    vi.stubGlobal('localStorage', { setItem });
    expect(Preferences.write('lang', 'en-US')).toBeUndefined();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenNthCalledWith(1, 'lang', 'en-US');
  });
});
