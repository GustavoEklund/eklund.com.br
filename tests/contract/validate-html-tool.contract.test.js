import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const PROJECT = new URL('../../', import.meta.url).pathname;
const TOOL = join(PROJECT, 'tools', 'validate-html.mjs');
const PAGE = (body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>t</title></head>\n<body>${body}</body></html>\n`;
const TIMEOUT_MS = 60_000;

describe('tools/validate-html.mjs --only-static', () => {
  let folder;
  const check = (name, body) => {
    writeFileSync(join(folder, name), PAGE(body));
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [TOOL, '--only-static', join(folder, name)],
      { encoding: 'utf8' },
    );
    return { status, stdout, stderr };
  };

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'validate-html-'));
  });
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it(
    'exits 0 for a valid page and says so',
    () => {
      expect(
        check('valid.html', '<main><h1>Hello</h1><img src="a.png" alt=""></main>'),
      ).toStrictEqual({ status: 0, stdout: 'ok   valid.html: 0 findings\n', stderr: '' });
    },
    TIMEOUT_MS,
  );

  it(
    'exits 1 for an invalid page, naming each error with its line and column and the markup around it',
    () => {
      expect(check('invalid.html', '<button><div>x</div></button><img src="a.png">')).toStrictEqual(
        {
          status: 1,
          stdout: [
            '  invalid.html:3:15 error: Element “div” not allowed as child of element “button” in this context. (Suppressing further errors from this subtree.)',
            '    y><button><div>x</div',
            '  invalid.html:3:36 error: An “img” element must have an “alt” attribute, except under certain conditions. For details, consult guidance on providing text alternatives for images.',
            '    ></button><img src="a.png"></body',
            'FAIL invalid.html: 2 findings',
            '',
          ].join('\n'),
          stderr: '',
        },
      );
    },
    TIMEOUT_MS,
  );

  it(
    'lets the ARIA 1.2 combobox point at an option of its listbox, which the checker still warns about',
    () => {
      const body =
        '<input type="text" role="combobox" aria-label="Search" aria-controls="list" aria-expanded="true" aria-activedescendant="o1"><ul id="list" role="listbox" aria-label="Results"><li id="o1" role="option" aria-selected="true">One</li></ul>';
      expect(check('combobox.html', body)).toStrictEqual({
        status: 0,
        stdout: 'ok   combobox.html: 0 findings\n',
        stderr: '',
      });
    },
    TIMEOUT_MS,
  );

  it(
    'still reports that warning for any other element, and counts a warning as a failure',
    () => {
      expect(
        check(
          'other.html',
          '<input type="text" aria-label="Other" aria-activedescendant="o1"><p id="o1">One</p>',
        ),
      ).toStrictEqual({
        status: 1,
        stdout: [
          '  other.html:3:7 warning: Attribute “aria-activedescendant” value should either refer to a descendant element, or should be accompanied by attribute “aria-owns”.',
          '    ad> <body><input type="text" aria-label="Other" aria-activedescendant="o1"><p id=',
          'FAIL other.html: 1 finding',
          '',
        ].join('\n'),
        stderr: '',
      });
    },
    TIMEOUT_MS,
  );
});
