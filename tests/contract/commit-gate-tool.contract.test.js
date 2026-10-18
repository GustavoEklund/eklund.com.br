// cspell:ignore keyborad misspeled displai xyzzyqux gpgsign EDITMSG -- the misspellings are the samples the gate must catch
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  CommitConvention,
  CommitGate,
  CommitGateCheck,
  CommitMessage,
  CommitSpelling,
  GitHistory,
  PushUpdates,
} from '../../tools/commit-gate.mjs';
import { SiteSource } from '../support/site-source.js';

// The first spell check of a run loads the dictionaries and every git call starts a process, so a loaded machine needs time.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const TOOL = join(import.meta.dirname, '..', '..', 'tools', 'commit-gate.mjs');
const ZERO = '0'.repeat(40);
const SCOPE_LIST =
  'scope must be one of [accessibility, architecture-map, command-palette, contact, cursor, dashboard, globe, hero, history, i18n, load-test, marquee, navigation, scrollbar, shared, status-page, theme, trace-viewer, build, ci, deps, docs, hooks, release, security, seo, site, tests, tools] [scope-enum]';

describe('CommitMessage', () => {
  it('takes the git comments and the trailing spaces out, and names itself by its short hash and its subject', () => {
    const message = new CommitMessage({
      sha: 'abcdef0123456789',
      text: 'fix(hero): keep the title visible   \n\nBody line.\n# Please enter the commit message\n#\n',
    });
    expect([message.text, message.subject, message.label]).toStrictEqual([
      'fix(hero): keep the title visible\n\nBody line.',
      'fix(hero): keep the title visible',
      'abcdef0 fix(hero): keep the title visible',
    ]);
  });

  it('names a message without a hash by its subject alone', () => {
    expect(new CommitMessage({ text: 'docs: explain the build' }).label).toBe(
      'docs: explain the build',
    );
  });

  it('knows a merge commit and a bot by what git and the author field say', () => {
    expect([
      new CommitMessage({ text: "Merge branch 'main' into feature" }).isMerge,
      new CommitMessage({ text: 'Merge pull request #4 from a/b' }).isMerge,
      new CommitMessage({ text: 'Merge the two lists' }).isMerge,
      new CommitMessage({ text: 'chore(deps): bump x', author: 'dependabot[bot]' }).isBot,
      new CommitMessage({ text: 'chore(deps): bump x', author: 'Gustavo Eklund' }).isBot,
    ]).toStrictEqual([true, true, false, true, false]);
  });

  it('hides code spans, addresses and trailers from the spell checker, keeping the lengths', () => {
    const message = new CommitMessage({
      text: 'fix(hero): use `font-displai` now\n\nSee https://example.com/xyzzy for more.\n\nCo-authored-by: Ana Silva <ana@example.com>',
    });
    expect(message.prose).toBe(
      `fix(hero): use ${' '.repeat('`font-displai`'.length)} now\n\nSee ${' '.repeat('https://example.com/xyzzy'.length)} for more.\n\n${' '.repeat('Co-authored-by: Ana Silva <ana@example.com>'.length)}`,
    );
  });
});

describe('CommitConvention', () => {
  let convention;
  beforeAll(async () => {
    convention = await CommitConvention.load();
  });
  const problems = (text) => convention.problems(new CommitMessage({ text }));

  it.each([
    'feat(globe): add a keyboard shortcut to spin the globe',
    'fix(i18n): fall back to Portuguese for unknown tags',
    'chore(deps): bump vite-plus from 1.3.0 to 1.3.1',
    'docs: explain how a release is made',
    'feat(hero)!: drop the intro animation\n\nBREAKING CHANGE: the hero no longer plays an intro.',
    'revert: undo "feat(globe): add a shortcut"\n\nThis reverts commit 0123abc.',
    'Revert "feat(globe): add a keyboard shortcut"',
    'fixup! feat(globe): add a keyboard shortcut',
  ])('accepts %j', async (text) => {
    expect(await problems(text)).toStrictEqual([]);
  });

  it('rejects a message with no type, and says what is missing', async () => {
    expect(await problems('Added stuff')).toStrictEqual([
      '✖ subject may not be empty [subject-empty]',
      '✖ type may not be empty [type-empty]',
    ]);
  });

  it('rejects a scope the project does not have, and lists the ones it has', async () => {
    expect(await problems('feat(nope): add something that has no place')).toStrictEqual([
      `✖ ${SCOPE_LIST}`,
    ]);
  });

  it('rejects a capitalized subject and a full stop', async () => {
    expect(await problems('fix(hero): Fix the title.')).toStrictEqual([
      '✖ subject must not be sentence-case [subject-case]',
      '✖ subject may not end with full stop [subject-full-stop]',
    ]);
  });

  it('rejects a header longer than 72 characters', async () => {
    expect(
      await problems(`feat(globe): ${'spin the globe with the keyboard and the mouse '.repeat(2)}`),
    ).toStrictEqual([
      '✖ header must not be longer than 72 characters, current length is 106 [header-max-length]',
    ]);
  });

  it('asks for a blank line before the body', async () => {
    expect(await problems('feat(globe): add a shortcut\nThe body starts too soon.')).toStrictEqual([
      '✖ body must have leading blank line [body-leading-blank]',
    ]);
  });

  it('keeps one scope for each feature folder of the site, so a change to a feature can always say where it is', () => {
    const folders = [
      ...new Set(
        SiteSource.files('js')
          .map((file) => file.split('/'))
          .filter((parts) => parts.length > 2)
          .map((parts) => parts[1]),
      ),
    ];
    expect(folders.filter((folder) => !convention.scopes.includes(folder))).toStrictEqual([]);
  });
});

describe('CommitSpelling', () => {
  const spelling = new CommitSpelling();
  const misspellings = (text) => spelling.misspellings(new CommitMessage({ text }));

  it('lists the words no dictionary knows, once each', async () => {
    expect(
      await misspellings('fix(globe): the keyborad shortcut and the keyborad hint were misspeled'),
    ).toStrictEqual(['keyborad', 'misspeled']);
  });

  it('knows the vocabulary of the project, and leaves code spans, links and trailers alone', async () => {
    expect(
      await misspellings(
        'feat(status-page): show the okto settlement in the SPI row\n\nUses `xyzzyqux` from https://example.com/xyzzyqux.\n\nCo-authored-by: Zq Wvk <zq@example.com>',
      ),
    ).toStrictEqual([]);
  });
});

describe('PushUpdates', () => {
  it('reads one update per line, as git writes them on the stdin of the pre-push hook', () => {
    expect(
      PushUpdates.parse(
        `refs/heads/main aaa refs/heads/main bbb\n\nrefs/heads/work ccc refs/heads/work ${ZERO}\n`,
      ),
    ).toStrictEqual([
      {
        localRef: 'refs/heads/main',
        localSha: 'aaa',
        remoteRef: 'refs/heads/main',
        remoteSha: 'bbb',
      },
      {
        localRef: 'refs/heads/work',
        localSha: 'ccc',
        remoteRef: 'refs/heads/work',
        remoteSha: ZERO,
      },
    ]);
  });

  it('selects the commits the remote does not have: the range for a known branch, what no remote branch holds for a new one', () => {
    expect([
      PushUpdates.revisions(
        { localSha: 'aaa', remoteRef: 'refs/heads/main', remoteSha: 'bbb' },
        'origin',
      ),
      PushUpdates.revisions(
        { localSha: 'ccc', remoteRef: 'refs/heads/work', remoteSha: ZERO },
        'origin',
      ),
    ]).toStrictEqual([['bbb..aaa'], ['ccc', '--not', '--remotes=origin']]);
  });

  it('sends nothing to check for a deleted branch or a tag', () => {
    expect([
      PushUpdates.revisions(
        { localSha: ZERO, remoteRef: 'refs/heads/old', remoteSha: 'bbb' },
        'origin',
      ),
      PushUpdates.revisions(
        { localSha: 'ddd', remoteRef: 'refs/tags/v1.0.0', remoteSha: ZERO },
        'origin',
      ),
    ]).toStrictEqual([null, null]);
  });

  it('falls back to what no remote branch holds when the remote commit is not here to compare with', () => {
    expect(
      PushUpdates.fallbackRevisions(
        { localSha: 'aaa', remoteRef: 'refs/heads/main', remoteSha: 'bbb' },
        'upstream',
      ),
    ).toStrictEqual(['aaa', '--not', '--remotes=upstream']);
  });
});

describe('CommitGate in a repository', () => {
  let folder;
  let gate;
  const git = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: folder,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
    }).trim();
  const commit = (message) => git('commit', '--allow-empty', '-m', message);
  const noStdin = async () => '';

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'commit-gate-repo-'));
    git('init', '-b', 'main');
    commit('chore: initialize the repository');
    git('tag', 'base');
    commit('feat(globe): add a keyboard shortcut');
    commit('fixed some stuff');
    commit('docs: explain the keyborad shortcut');
    gate = new CommitGate(await CommitGateCheck.create(), new GitHistory(folder));
  });
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('checks the commits of a range, oldest first, and fails naming each bad one', async () => {
    const [, , third, fourth] = git('log', '--reverse', '--format=%h').split('\n');
    expect(await gate.run(['range', 'base', 'HEAD'], noStdin)).toStrictEqual({
      code: 1,
      lines: [
        `✖ ${third} fixed some stuff`,
        '    ✖ subject may not be empty [subject-empty]',
        '    ✖ type may not be empty [type-empty]',
        `✖ ${fourth} docs: explain the keyborad shortcut`,
        '    ✖ misspelled: keyborad (add real vocabulary to .cspell/project-words.txt)',
        'commit-gate: 2 of 3 messages failed (convention: CONTRIBUTING.md#commit-messages)',
      ],
    });
  });

  it('checks every commit up to the end when the start is zeros, as when a push creates the branch', async () => {
    const result = await gate.run(['range', '0'.repeat(40), 'HEAD'], noStdin);
    expect([result.code, result.lines.at(-1)]).toStrictEqual([
      1,
      'commit-gate: 2 of 4 messages failed (convention: CONTRIBUTING.md#commit-messages)',
    ]);
  });

  it('passes a range that holds only good messages', async () => {
    expect(await gate.run(['range', 'base', 'HEAD~2'], noStdin)).toStrictEqual({
      code: 0,
      lines: ['commit-gate: 1 message checked, all good'],
    });
  });

  it('checks what a push to a new branch would send, once even when two refs carry the same commits', async () => {
    const head = git('rev-parse', 'HEAD');
    const base = git('rev-parse', 'base');
    const stdin = async () =>
      `refs/heads/work ${head} refs/heads/work ${ZERO}\nrefs/heads/other ${head} refs/heads/other ${base}\nrefs/heads/old ${ZERO} refs/heads/old ${head}\n`;
    const result = await gate.run(['pre-push', 'origin'], stdin);
    expect([result.code, result.lines.at(-1)]).toStrictEqual([
      1,
      'commit-gate: 2 of 4 messages failed (convention: CONTRIBUTING.md#commit-messages)',
    ]);
  });

  it('reads the message a person is typing from a file, without the git comments', async () => {
    const file = join(folder, 'COMMIT_EDITMSG');
    execFileSync('node', [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(file)}, 'fix(hero): keep the title visible\\n# comment\\n')`,
    ]);
    expect(await gate.run(['message', file], noStdin)).toStrictEqual({
      code: 0,
      lines: ['commit-gate: 1 message checked, all good'],
    });
  });

  it('checks a pull request title as the message a squash merge will have', async () => {
    expect(
      await gate.run(['title', 'feat(globe):', 'add', 'a', 'shortcut'], noStdin),
    ).toStrictEqual({
      code: 0,
      lines: ['commit-gate: 1 message checked, all good'],
    });
  });

  it('refuses a command it does not know', async () => {
    await expect(gate.run(['bogus'], noStdin)).rejects.toThrow(
      'unknown command "bogus"; see the usage at the top of tools/commit-gate.mjs',
    );
  });
});

describe('tools/commit-gate.mjs as a command', () => {
  const run = (...args) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [TOOL, ...args], {
      encoding: 'utf8',
    });
    return { status, stdout, stderr };
  };

  it('exits 0 and says how many messages it checked when the title is good', () => {
    expect(run('title', 'fix(hero): keep the title visible')).toStrictEqual({
      status: 0,
      stdout: 'commit-gate: 1 message checked, all good\n',
      stderr: '',
    });
  });

  it('exits 1 and writes the problems to stderr when the title is not', () => {
    expect(run('title', 'Fix the hero')).toStrictEqual({
      status: 1,
      stdout: '',
      stderr:
        '✖ Fix the hero\n    ✖ subject may not be empty [subject-empty]\n    ✖ type may not be empty [type-empty]\ncommit-gate: 1 of 1 message failed (convention: CONTRIBUTING.md#commit-messages)\n',
    });
  });

  it('exits 2 for a command it does not know', () => {
    expect(run('bogus')).toStrictEqual({
      status: 2,
      stdout: '',
      stderr:
        'commit-gate: unknown command "bogus"; see the usage at the top of tools/commit-gate.mjs\n',
    });
  });
});
