import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalLog } from '@site/js/load-test/terminal-log.js';
import { Formatter } from '@site/js/shared/format.js';

const NOW = new Date(2026, 9, 17, 9, 5, 7);

describe('TerminalLog', () => {
  let element, output, cursor, log;
  const lines = () => [...output.children].map((line) => line.outerHTML);
  const line = (kind, time, html) =>
    `<div class="terminal-line is-${kind}"><time>${time}</time><i aria-hidden="true"></i><span>${html}</span></div>`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    Formatter.use('pt-BR');
    document.body.innerHTML =
      '<div id="terminal" style="height:100px;overflow:auto"><div class="terminal-output"></div><span class="terminal-cursor"></span></div>';
    element = document.getElementById('terminal');
    output = element.querySelector('.terminal-output');
    cursor = element.querySelector('.terminal-cursor');
    log = new TerminalLog(element);
  });

  afterEach(() => vi.useRealTimers());

  describe('write', () => {
    it('appends a line with the time, an icon slot and the text, as an info line by default', () => {
      log.write('hello');
      expect(lines()).toStrictEqual([line('info', '09:05:07', 'hello')]);
    });

    it.each([['command'], ['info'], ['running'], ['ok'], ['fail'], ['metric'], ['dim']])(
      'marks a %s line with its own class',
      (kind) => {
        log.write('text', kind);
        expect(lines()).toStrictEqual([line(kind, '09:05:07', 'text')]);
      },
    );

    it('takes the text as markup, so the dictionary can bold or emphasize parts of a line', () => {
      log.write('<b>payload</b> <em>ok</em>', 'ok');
      expect(output.firstElementChild.querySelector('span').innerHTML).toBe(
        '<b>payload</b> <em>ok</em>',
      );
    });

    it('stamps each line with the time it was written', () => {
      log.write('first');
      vi.setSystemTime(new Date(2026, 9, 17, 9, 5, 8));
      log.write('second');
      vi.setSystemTime(new Date(2026, 9, 17, 23, 59, 59));
      log.write('third');
      expect(lines()).toStrictEqual([
        line('info', '09:05:07', 'first'),
        line('info', '09:05:08', 'second'),
        line('info', '23:59:59', 'third'),
      ]);
    });

    it('keeps lines in the order they were written', () => {
      for (const word of ['a', 'b', 'c']) log.write(word);
      expect([...output.querySelectorAll('span')].map((span) => span.textContent)).toStrictEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });

  describe('blank', () => {
    it('appends an empty spacer line', () => {
      log.write('x');
      log.blank();
      expect(lines()).toStrictEqual([
        line('info', '09:05:07', 'x'),
        '<div class="terminal-line is-blank"></div>',
      ]);
    });
  });

  describe('clear', () => {
    it('removes every line', () => {
      log.write('a');
      log.blank();
      log.clear();
      expect(lines()).toStrictEqual([]);
    });
  });

  describe('setPlaceholder', () => {
    it('replaces everything with a single dim line', () => {
      log.write('old');
      log.blank();
      log.setPlaceholder('waiting');
      expect(lines()).toStrictEqual([line('dim', '09:05:07', 'waiting')]);
    });
  });

  describe('setBusy', () => {
    it('blinks the cursor while busy and stops when not', () => {
      log.setBusy(true);
      expect(cursor.classList.contains('is-blinking')).toBe(true);
      log.setBusy(false);
      expect(cursor.classList.contains('is-blinking')).toBe(false);
    });

    it('scrolls to the bottom', () => {
      for (let number = 0; number < 30; number++) log.write(`line ${number}`);
      element.scrollTop = 0;
      log.setBusy(false);
      expect(element.scrollTop).toBe(element.scrollHeight - element.clientHeight);
    });
  });

  describe('keeping the screen', () => {
    it('keeps the last 60 lines and drops the oldest first', () => {
      for (let number = 1; number <= 75; number++) log.write(`line ${number}`);
      const texts = [...output.querySelectorAll('span')].map((span) => span.textContent);
      expect(texts).toStrictEqual(Array.from({ length: 60 }, (_, index) => `line ${index + 16}`));
    });

    it('counts blank lines against the 60 as well', () => {
      for (let number = 1; number <= 30; number++) {
        log.write(`line ${number}`);
        log.blank();
      }
      expect(output.childElementCount).toBe(60);
      expect(output.firstElementChild.className).toBe('terminal-line is-info');
    });

    it('follows the output: after each write the screen sits at the bottom', () => {
      const positions = [];
      for (let number = 0; number < 40; number++) {
        log.write(`line ${number}`);
        positions.push(element.scrollTop === element.scrollHeight - element.clientHeight);
      }
      expect(positions.slice(30)).toStrictEqual(Array.from({ length: 10 }, () => true));
    });
  });
});
