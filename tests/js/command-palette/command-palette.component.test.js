import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandPalette } from '@site/js/command-palette/command-palette.js';
import { WindowListeners } from '../../support/window-listeners.js';

const key = (init) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};
const titles = (list) =>
  [...list.querySelectorAll('li')].map((item) => item.firstChild.textContent);

describe('CommandPalette', () => {
  let dialog, input, list, empty, openButton, palette, listeners, run;
  const command = (title, keywords, tag = 'go') => ({
    title,
    keywords,
    tag,
    run: (run[title] ??= vi.fn()),
  });

  beforeEach(() => {
    run = {};
    document.body.innerHTML = `
      <button id="open">open</button>
      <dialog id="dialog"><input id="input"><ul id="list"></ul><p id="empty" hidden>nothing</p></dialog>`;
    [dialog, input, list, empty, openButton] = ['dialog', 'input', 'list', 'empty', 'open'].map(
      (id) => document.getElementById(id),
    );
    listeners = new WindowListeners().track();
    palette = new CommandPalette({ dialog, input, list, emptyMessage: empty, openButton });
    palette.replace([
      command('Go to profile', 'about me'),
      command('Go to contact', 'email mail'),
      command('Toggle theme', 'dark light', 'theme'),
      command('Configurações', 'settings'),
    ]);
    palette.install();
  });

  afterEach(() => {
    if (dialog.open) dialog.close();
    listeners.release();
    vi.restoreAllMocks();
  });

  describe('opening', () => {
    it('opens as a modal with an empty, focused input and every command listed in order', () => {
      palette.open();
      expect([
        dialog.open,
        dialog.matches(':modal'),
        input.value,
        document.activeElement === input,
      ]).toStrictEqual([true, true, '', true]);
      expect(list.innerHTML).toBe(
        '<li role="option" id="command-palette-option-0" aria-selected="true" data-index="0">Go to profile<span>go</span></li>' +
          '<li role="option" id="command-palette-option-1" aria-selected="false" data-index="1">Go to contact<span>go</span></li>' +
          '<li role="option" id="command-palette-option-2" aria-selected="false" data-index="2">Toggle theme<span>theme</span></li>' +
          '<li role="option" id="command-palette-option-3" aria-selected="false" data-index="3">Configurações<span>go</span></li>',
      );
      expect(empty.hidden).toBe(true);
    });

    it('marks the option of a command that names its language, and no other', () => {
      palette.replace([
        command('Go to profile', 'about me'),
        { ...command('Mudar para português', 'idioma'), lang: 'pt-BR' },
      ]);
      palette.open();
      expect(
        [...list.querySelectorAll('li')].map((item) => item.getAttribute('lang')),
      ).toStrictEqual([null, 'pt-BR']);
    });

    it('opens from its button', () => {
      openButton.click();
      expect(dialog.open).toBe(true);
    });

    it('resets the query and the selection each time it opens', () => {
      palette.open();
      input.value = 'conf';
      input.dispatchEvent(new Event('input'));
      palette.close();
      palette.open();
      expect([input.value, titles(list)]).toStrictEqual([
        '',
        ['Go to profile', 'Go to contact', 'Toggle theme', 'Configurações'],
      ]);
    });

    it('does nothing when it is already open', () => {
      palette.open();
      input.value = 'kept';
      palette.open();
      expect(input.value).toBe('kept');
    });
  });

  describe('keyboard', () => {
    it.each([
      ['Ctrl+K', { ctrlKey: true, key: 'k' }],
      ['Cmd+K', { metaKey: true, key: 'k' }],
      ['Ctrl+Shift+K', { ctrlKey: true, key: 'K' }],
    ])('%s opens and then closes it, stopping the browser shortcut', (_label, init) => {
      const opening = key(init);
      expect([dialog.open, opening.defaultPrevented]).toStrictEqual([true, true]);
      const closing = key(init);
      expect([dialog.open, closing.defaultPrevented]).toStrictEqual([false, true]);
    });

    it('ignores a plain k', () => {
      const event = key({ key: 'k' });
      expect([dialog.open, event.defaultPrevented]).toStrictEqual([false, false]);
    });

    it('moves the selection with the arrow keys and wraps at both ends', () => {
      palette.open();
      const selected = () =>
        [...list.querySelectorAll('li')].findIndex(
          (item) => item.getAttribute('aria-selected') === 'true',
        );
      const moves = [
        ['ArrowDown', 1],
        ['ArrowDown', 2],
        ['ArrowDown', 3],
        ['ArrowDown', 0],
        ['ArrowUp', 3],
        ['ArrowUp', 2],
      ];
      expect(
        moves.map(([name]) => {
          key({ key: name });
          return selected();
        }),
      ).toStrictEqual(moves.map(([, index]) => index));
    });

    it('stops the browser from scrolling on arrows and Enter', () => {
      palette.open();
      expect(
        ['ArrowDown', 'ArrowUp', 'Enter'].map((name) => key({ key: name }).defaultPrevented),
      ).toStrictEqual([true, true, true]);
    });

    it('runs the selected command on Enter, once, and no other', () => {
      palette.open();
      key({ key: 'ArrowDown' });
      key({ key: 'Enter' });
      expect(run['Go to contact']).toHaveBeenCalledTimes(1);
      expect(run['Go to contact']).toHaveBeenNthCalledWith(1);
      expect(
        [run['Go to profile'], run['Toggle theme'], run.Configurações].map(
          (spy) => spy.mock.calls.length,
        ),
      ).toStrictEqual([0, 0, 0]);
    });

    it('does not react to the arrows while it is closed', () => {
      expect(
        ['ArrowDown', 'Enter'].map((name) => key({ key: name }).defaultPrevented),
      ).toStrictEqual([false, false]);
      expect(run['Go to profile']).toHaveBeenCalledTimes(0);
    });

    it('does nothing on Enter when no command matches', () => {
      palette.open();
      input.value = 'zzzz';
      input.dispatchEvent(new Event('input'));
      expect(key({ key: 'Enter' }).defaultPrevented).toBe(true);
      expect(Object.values(run).map((spy) => spy.mock.calls.length)).toStrictEqual([0, 0, 0, 0]);
    });
  });

  describe('filtering', () => {
    const type = (text) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    };
    beforeEach(() => palette.open());

    it('keeps only commands whose title contains the letters in order', () => {
      type('gtc');
      expect(titles(list)).toStrictEqual(['Go to contact']);
    });

    it('matches without regard to case or accents', () => {
      type('CONFIGURACOES');
      expect(titles(list)).toStrictEqual(['Configurações']);
    });

    it('matches the keywords too', () => {
      type('dark');
      expect(titles(list)).toStrictEqual(['Toggle theme']);
    });

    it('ranks consecutive letters above scattered ones', () => {
      palette.replace([command('a x b', ''), command('ab', ''), command('axxb', '')]);
      type('ab');
      expect(titles(list)).toStrictEqual(['ab', 'a x b', 'axxb']);
    });

    it('ranks a title match above the same match in keywords, which count 60%', () => {
      palette.replace([command('Other', 'theme'), command('Theme', 'other')]);
      type('theme');
      expect(titles(list)).toStrictEqual(['Theme', 'Other']);
    });

    it('selects the first result and says nothing was found when nothing matches', () => {
      type('zzzz');
      expect([titles(list), list.innerHTML, empty.hidden]).toStrictEqual([[], '', false]);
      type('prof');
      expect([titles(list), empty.hidden]).toStrictEqual([['Go to profile'], true]);
    });

    it('restarts the selection at the top when the query changes', () => {
      key({ key: 'ArrowDown' });
      key({ key: 'ArrowDown' });
      type('o');
      expect(list.querySelector('[aria-selected=true]').dataset.index).toBe('0');
    });

    it('trims the query', () => {
      type('  prof  ');
      expect(titles(list)).toStrictEqual(['Go to profile']);
    });
  });

  describe('pointer', () => {
    beforeEach(() => palette.open());

    it('selects the item under the pointer', () => {
      list
        .querySelector('[data-index="2"]')
        .dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      expect(list.querySelector('[aria-selected=true]').dataset.index).toBe('2');
    });

    it('runs the clicked command, once', () => {
      list.querySelector('[data-index="2"]').click();
      expect(run['Toggle theme']).toHaveBeenCalledTimes(1);
      expect(run['Toggle theme']).toHaveBeenNthCalledWith(1);
      expect(Object.values(run).map((spy) => spy.mock.calls.length)).toStrictEqual([0, 0, 1, 0]);
    });

    it('runs the clicked item of a filtered list, not the item at that index of the full list', () => {
      input.value = 'theme';
      input.dispatchEvent(new Event('input'));
      list.querySelector('[data-index="0"]').click();
      expect(run['Toggle theme']).toHaveBeenCalledTimes(1);
      expect(run['Go to profile']).toHaveBeenCalledTimes(0);
    });

    it('ignores a click in the list that is not on an item', () => {
      list.click();
      expect(Object.values(run).map((spy) => spy.mock.calls.length)).toStrictEqual([0, 0, 0, 0]);
    });

    it('closes when the backdrop is clicked, but not when the content is', () => {
      input.click();
      expect(dialog.open).toBe(true);
      dialog.click();
      expect(dialog.open).toBe(false);
    });
  });

  describe('as a combobox over a listbox', () => {
    const state = () => [
      input.getAttribute('aria-expanded'),
      input.getAttribute('aria-activedescendant'),
    ];

    it('says it is expanded and points at the first option when it opens', () => {
      palette.open();
      expect(state()).toStrictEqual(['true', 'command-palette-option-0']);
    });

    it('follows the arrow keys: the input keeps the focus and aria-activedescendant moves with the selection', () => {
      palette.open();
      key({ key: 'ArrowDown' });
      expect([state(), document.activeElement === input]).toStrictEqual([
        ['true', 'command-palette-option-1'],
        true,
      ]);
      key({ key: 'ArrowUp' });
      key({ key: 'ArrowUp' });
      expect(state()).toStrictEqual(['true', 'command-palette-option-3']);
    });

    it('follows the pointer too', () => {
      palette.open();
      list
        .querySelector('[data-index="2"]')
        .dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      expect(state()).toStrictEqual(['true', 'command-palette-option-2']);
    });

    it('points at the first match of a filtered list', () => {
      palette.open();
      input.value = 'conf';
      input.dispatchEvent(new Event('input'));
      expect(state()).toStrictEqual(['true', 'command-palette-option-0']);
    });

    it('says it is collapsed and points at nothing when no command matches', () => {
      palette.open();
      input.value = 'zzzz';
      input.dispatchEvent(new Event('input'));
      expect([
        input.getAttribute('aria-expanded'),
        input.hasAttribute('aria-activedescendant'),
      ]).toStrictEqual(['false', false]);
    });
  });

  describe('telling how many results there are', () => {
    it('reports the count each time the query changes, and not when it opens or the selection moves', () => {
      const onResults = vi.fn();
      palette = new CommandPalette({
        dialog,
        input,
        list,
        emptyMessage: empty,
        openButton,
        onResults,
      });
      palette.replace([
        command('Go to profile', 'about me'),
        command('Go to contact', 'email mail'),
        command('Toggle theme', 'dark light', 'theme'),
      ]);
      palette.install();
      palette.open();
      key({ key: 'ArrowDown' });
      expect(onResults).toHaveBeenCalledTimes(0);
      input.value = 'go';
      input.dispatchEvent(new Event('input'));
      input.value = 'theme';
      input.dispatchEvent(new Event('input'));
      input.value = 'zzzz';
      input.dispatchEvent(new Event('input'));
      expect(onResults).toHaveBeenCalledTimes(3);
      expect(onResults.mock.calls).toStrictEqual([[2], [1], [0]]);
    });
  });

  describe('replace', () => {
    it('re-renders at once while open, keeping the query', () => {
      palette.open();
      input.value = 'new';
      input.dispatchEvent(new Event('input'));
      palette.replace([command('New thing', 'x'), command('Old thing', 'new')]);
      expect(titles(list)).toStrictEqual(['New thing', 'Old thing']);
    });

    it('waits for the next open while closed', () => {
      palette.replace([command('Only one', 'x')]);
      expect(list.innerHTML).toBe('');
      palette.open();
      expect(titles(list)).toStrictEqual(['Only one']);
    });
  });
});
