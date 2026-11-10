import { describe, it, expect } from 'vitest';
import { ReportText } from '@site/js/field-report/report-text.js';

const ORIGIN = 'https://eklund.com.br';

describe('ReportText', () => {
  it('keeps a label in printable ASCII, every other character as a question mark, and cuts it at 200', () => {
    expect([
      ReportText.label('section#hero>h1'),
      ReportText.label('div.café\n'),
      ReportText.label(undefined),
      ReportText.label(42),
      ReportText.label('x'.repeat(250)).length,
    ]).toStrictEqual(['section#hero>h1', 'div.caf??', '', '42', 200]);
  });

  it('keeps an error message in any language, with its control characters as spaces, at most 200 characters', () => {
    expect([
      ReportText.message("TypeError: Cannot read properties of undefined (reading 'width')"),
      ReportText.message('linha um\nlinha dois\tfim'),
      ReportText.message('não é uma função'),
      ReportText.message(null),
      [...ReportText.message('😀'.repeat(201))].length,
      ReportText.message('😀'.repeat(201)).length,
    ]).toStrictEqual([
      "TypeError: Cannot read properties of undefined (reading 'width')",
      'linha um linha dois fim',
      'não é uma função',
      '',
      200,
      400,
    ]);
  });

  it('turns an address into the path of this site, without query or fragment, or into other, or into nothing', () => {
    expect([
      ReportText.path('https://eklund.com.br/assets/main-AbC123.js?v=2#x', ORIGIN),
      ReportText.path('/js/main.js', ORIGIN),
      ReportText.path('https://eklund.com.br/a b/ç.js', ORIGIN),
      ReportText.path('https://cdn.example.com/lib.js', ORIGIN),
      ReportText.path('chrome-extension://abcdef/content.js', ORIGIN),
      ReportText.path('data:image/png;base64,AAAA', ORIGIN),
      ReportText.path('http://[bad', ORIGIN),
      ReportText.path('', ORIGIN),
      ReportText.path(undefined, ORIGIN),
      ReportText.path(`https://eklund.com.br/${'a'.repeat(300)}`, ORIGIN).length,
    ]).toStrictEqual([
      '/assets/main-AbC123.js',
      '/js/main.js',
      '/a%20b/%C3%A7.js',
      'other',
      'other',
      'other',
      'other',
      '',
      '',
      200,
    ]);
  });

  it('keeps only the host of the page a visitor came from, in lower case, when it is a web address with a dot', () => {
    expect([
      ReportText.host('https://www.Google.com/search?q=gustavo+eklund'),
      ReportText.host('http://news.example.org/item?id=1'),
      ReportText.host('https://bücher.example/'),
      ReportText.host('http://localhost:8734/'),
      ReportText.host('android-app://com.linkedin.android/'),
      ReportText.host(''),
      ReportText.host('not an address'),
    ]).toStrictEqual([
      'www.google.com',
      'news.example.org',
      // cspell:disable-next-line
      'xn--bcher-kva.example',
      '',
      '',
      '',
      '',
    ]);
  });

  it('keeps a number between 0 and the maximum, and has none for what is not a finite number', () => {
    expect([
      ReportText.number(12.5, 100),
      ReportText.number(-3, 100),
      ReportText.number(250, 100),
      ReportText.number(Number.NaN, 100),
      ReportText.number(Number.POSITIVE_INFINITY, 100),
      ReportText.number('12', 100),
      ReportText.number(undefined, 100),
    ]).toStrictEqual([12.5, 0, 100, null, null, null, null]);
  });

  it('rounds a whole number into its range, and counts a missing one as 0', () => {
    expect([
      ReportText.integer(12.5, 100),
      ReportText.integer(12.4, 100),
      ReportText.integer(-1, 100),
      ReportText.integer(1e9, 100),
      ReportText.integer(undefined, 100),
    ]).toStrictEqual([13, 12, 0, 100, 0]);
  });
});
