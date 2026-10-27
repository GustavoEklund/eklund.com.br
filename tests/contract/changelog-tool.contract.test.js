import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  Changelog,
  ChangelogCommand,
  ChangelogPolicy,
  SemanticVersion,
} from '../../tools/changelog.mjs';

// Every test here starts a process or makes a git repository, which a loaded machine does slowly.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const PROJECT = join(import.meta.dirname, '..', '..');
const TOOL = join(PROJECT, 'tools', 'changelog.mjs');
const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';

/** A changelog that follows the format, with the sections the tests then break one by one. */
const GOOD = `# Changelog

All notable changes are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A thing that was broken.

## [1.1.0] - 2026-12-01

### Added

- Another feature.

### Fixed

- A bug.

## [1.0.0] - 2026-10-18

### Added

- The first feature.

[Unreleased]: ${REPOSITORY}/compare/v1.1.0...HEAD
[1.1.0]: ${REPOSITORY}/compare/v1.0.0...v1.1.0
[1.0.0]: ${REPOSITORY}/releases/tag/v1.0.0
`;

describe('SemanticVersion', () => {
  it('orders versions as Semantic Versioning 2.0.0 does, pre-releases before their release', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
    ];
    expect(
      [...ordered]
        .reverse()
        .sort((a, b) => SemanticVersion.compare(new SemanticVersion(a), new SemanticVersion(b))),
    ).toStrictEqual(ordered);
  });

  it('ignores build metadata when it compares', () => {
    expect(
      SemanticVersion.compare(
        new SemanticVersion('1.0.0+build.1'),
        new SemanticVersion('1.0.0+build.2'),
      ),
    ).toBe(0);
  });

  it('accepts a valid version and refuses what is not one, naming it', () => {
    expect([
      SemanticVersion.isValid('1.2.3'),
      SemanticVersion.isValid('1.2.3-rc.1+exp.sha.5114f85'),
      SemanticVersion.isValid('1.2'),
      SemanticVersion.isValid('01.2.3'),
      SemanticVersion.isValid('v1.2.3'),
    ]).toStrictEqual([true, true, false, false, false]);
    expect(() => new SemanticVersion('1.2')).toThrow(
      '"1.2" is not a Semantic Versioning 2.0.0 version',
    );
  });
});

describe('Changelog', () => {
  const problems = (text, version = '1.1.0') => Changelog.parse(text).problems(version);

  it('finds nothing wrong with a file that follows the format and matches package.json', () => {
    expect(problems(GOOD)).toStrictEqual([]);
  });

  it('writes the file back as it read it', () => {
    expect(Changelog.parse(GOOD).toString()).toBe(GOOD);
  });

  it('asks for the title, the two links and an [Unreleased] section first', () => {
    const broken = GOOD.replace('# Changelog', '# History')
      .replace('[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)', 'Keep a Changelog')
      .replace('## [Unreleased]\n\n### Fixed\n\n- A thing that was broken.\n\n', '');
    expect(problems(broken)).toStrictEqual([
      'the file must start with "# Changelog"',
      'the introduction must link Keep a Changelog and Semantic Versioning',
      'the first section must be "## [Unreleased]"',
    ]);
  });

  it('wants every version dated, in order, newest first', () => {
    const undated = GOOD.replace('## [1.1.0] - 2026-12-01', '## [1.1.0]');
    const unordered = GOOD.replace('## [1.1.0] - 2026-12-01', '## [0.9.0] - 2026-12-01');
    expect(problems(undated)).toStrictEqual([
      'version 1.1.0 needs an ISO 8601 date (YYYY-MM-DD) after its name',
    ]);
    expect(problems(unordered, '0.9.0')).toStrictEqual([
      '0.9.0 is listed above 1.0.0: versions go from the newest to the oldest',
      `[Unreleased] must link ${REPOSITORY}/compare/v0.9.0...HEAD`,
      `[0.9.0] must link ${REPOSITORY}/compare/v1.0.0...v0.9.0`,
    ]);
  });

  it('allows only the six groups of Keep a Changelog, each with an entry, in their order', () => {
    expect(
      problems(GOOD.replace('### Fixed\n\n- A thing that was broken.', '### Misc\n\n- A thing.')),
    ).toStrictEqual(['Unreleased has the group "Misc", which Keep a Changelog does not define']);
    expect(
      problems(
        GOOD.replace('### Fixed\n\n- A thing that was broken.', '### Fixed\n\nNothing yet.'),
      ),
    ).toStrictEqual(['Unreleased has an empty group "Fixed"']);
    expect(
      problems(
        GOOD.replace(
          '### Added\n\n- Another feature.\n\n### Fixed\n\n- A bug.',
          '### Fixed\n\n- A bug.\n\n### Added\n\n- Another feature.',
        ),
      ),
    ).toStrictEqual([
      '1.1.0 lists its groups out of order or twice: use Added, Changed, Deprecated, Removed, Fixed, Security',
    ]);
  });

  it('keeps the reference links pointing at the right comparisons', () => {
    expect(
      problems(GOOD.replace(`compare/v1.0.0...v1.1.0`, 'compare/v0.0.1...v1.1.0')),
    ).toStrictEqual([`[1.1.0] must link ${REPOSITORY}/compare/v1.0.0...v1.1.0`]);
  });

  it('wants package.json to say the newest released version', () => {
    expect(problems(GOOD, '1.0.0')).toStrictEqual([
      'package.json says 1.0.0 but the newest released version is 1.1.0',
    ]);
  });

  it('gives the notes of a version: its groups and the link to the comparison with the one before', () => {
    expect(Changelog.parse(GOOD).notes('1.1.0')).toBe(
      `### Added\n\n- Another feature.\n\n### Fixed\n\n- A bug.\n\n**Full changelog**: ${REPOSITORY}/compare/v1.0.0...v1.1.0\n`,
    );
    expect(Changelog.parse(GOOD).notes('1.0.0')).toBe(
      `### Added\n\n- The first feature.\n\n**Full changelog**: ${REPOSITORY}/commits/v1.0.0\n`,
    );
    expect(() => Changelog.parse(GOOD).notes('9.9.9')).toThrow(
      'CHANGELOG.md has no section for 9.9.9',
    );
  });

  it('moves [Unreleased] into a new version, with the date and the links', () => {
    const next = Changelog.parse(GOOD).released('1.1.1', '2026-12-15');
    expect(next.toString()).toBe(
      GOOD.replace(
        '## [Unreleased]\n\n### Fixed\n\n- A thing that was broken.\n\n',
        '## [Unreleased]\n\n## [1.1.1] - 2026-12-15\n\n### Fixed\n\n- A thing that was broken.\n\n',
      ).replace(
        `[Unreleased]: ${REPOSITORY}/compare/v1.1.0...HEAD\n`,
        `[Unreleased]: ${REPOSITORY}/compare/v1.1.1...HEAD\n[1.1.1]: ${REPOSITORY}/compare/v1.1.0...v1.1.1\n`,
      ),
    );
    expect(next.problems('1.1.1')).toStrictEqual([]);
  });

  it('keeps the blank lines inside a group, so that its paragraphs, bold labels and lists stay apart', () => {
    const prose = GOOD.replace(
      '### Fixed\n\n- A thing that was broken.',
      '### Fixed\n\nTwo kinds of fixes.\n\n**Pages**\n\n- A thing that was broken.\n\n**Tools**\n\n- A tool that was broken.',
    );
    expect(Changelog.parse(prose).toString()).toBe(prose);
    expect(Changelog.parse(prose).released('1.1.1', '2026-12-15').notes('1.1.1')).toBe(
      `### Fixed\n\nTwo kinds of fixes.\n\n**Pages**\n\n- A thing that was broken.\n\n**Tools**\n\n- A tool that was broken.\n\n**Full changelog**: ${REPOSITORY}/compare/v1.1.0...v1.1.1\n`,
    );
  });

  it('points the relative links of the notes at the tagged files, because a release page would read them from /releases/tag/', () => {
    const linked = GOOD.replace(
      '- A thing that was broken.',
      '- A thing that was broken: [notice](NOTICE.md), [docs](docs/), [policy](/SECURITY.md), [above](#unreleased), ![icon](source/icon.svg) and [site](https://eklund.com.br).',
    );
    expect(Changelog.parse(linked).released('1.1.1', '2026-12-15').notes('1.1.1')).toBe(
      `### Fixed\n\n- A thing that was broken: [notice](${REPOSITORY}/blob/v1.1.1/NOTICE.md), [docs](${REPOSITORY}/tree/v1.1.1/docs/), [policy](${REPOSITORY}/blob/v1.1.1/SECURITY.md), [above](${REPOSITORY}/blob/v1.1.1/CHANGELOG.md#unreleased), ![icon](${REPOSITORY}/raw/v1.1.1/source/icon.svg) and [site](https://eklund.com.br).\n\n**Full changelog**: ${REPOSITORY}/compare/v1.1.0...v1.1.1\n`,
    );
    expect(Changelog.parse(linked).toString()).toBe(linked);
  });

  it('refuses to release with nothing in [Unreleased], an older version or a bad date', () => {
    const empty = Changelog.parse(GOOD).released('1.1.1', '2026-12-15');
    expect(() => empty.released('1.1.2', '2026-12-16')).toThrow(
      '[Unreleased] has no entries to release',
    );
    expect(() => Changelog.parse(GOOD).released('1.1.0', '2026-12-15')).toThrow(
      '1.1.0 is not newer than 1.1.0',
    );
    expect(() => Changelog.parse(GOOD).released('1.1', '2026-12-15')).toThrow(
      '"1.1" is not a Semantic Versioning 2.0.0 version',
    );
    expect(() => Changelog.parse(GOOD).released('1.2.0', '15/12/2026')).toThrow(
      '"15/12/2026" is not a date like 2026-10-18',
    );
  });
});

describe('ChangelogPolicy', () => {
  it.each([
    ['feat(globe): add a shortcut', true],
    ['fix(hero): keep the title visible', true],
    ['perf(build): split the bundle', true],
    ['revert: undo the shortcut', true],
    ['refactor(shared)!: rename Formatter', true],
    ['docs: explain the build', false],
    ['chore(deps): bump vite-plus', false],
    ['ci: pin the actions', false],
    ['test(globe): cover the spin', false],
    ['not a conventional title', false],
  ])('for the title %j says %s', (title, expected) => {
    expect(ChangelogPolicy.requires(title)).toBe(expected);
  });
});

describe('the changelog of this repository', () => {
  it('follows the format and matches the version in package.json', () => {
    const version = JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8')).version;
    expect(
      Changelog.parse(readFileSync(join(PROJECT, 'CHANGELOG.md'), 'utf8')).problems(version),
    ).toStrictEqual([]);
  });
});

describe('tools/changelog.mjs as a command', () => {
  let folder;
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
  const run = (...args) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [TOOL, ...args], {
      cwd: folder,
      encoding: 'utf8',
    });
    return { status, stdout, stderr };
  };

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'changelog-repo-'));
    git('init', '-b', 'main');
    writeFileSync(join(folder, 'CHANGELOG.md'), GOOD);
    git('add', '.');
    git('commit', '-m', 'chore: start');
    git('tag', 'base');
    writeFileSync(join(folder, 'page.html'), '<p>x</p>');
    git('add', '.');
    git('commit', '-m', 'feat(hero): add a page');
    git('tag', 'without');
    writeFileSync(join(folder, 'CHANGELOG.md'), `${GOOD}\n`);
    git('add', '.');
    git('commit', '-m', 'docs: touch the changelog');
  });
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('asks for a changelog line when the title says visitors will notice and the diff has none', () => {
    expect(run('require', 'feat(hero): add a page', 'base', 'without')).toStrictEqual({
      status: 1,
      stdout: '',
      stderr:
        '✖ "feat(hero): add a page" changes what visitors get: add a line under [Unreleased] in CHANGELOG.md, or label the pull request skip-changelog\n',
    });
  });

  it('is satisfied when the diff touches CHANGELOG.md, and asks nothing of a title that changes nothing visible', () => {
    expect(run('require', 'feat(hero): add a page', 'base', 'HEAD')).toStrictEqual({
      status: 0,
      stdout: 'changelog: CHANGELOG.md changed, as the title asks\n',
      stderr: '',
    });
    expect(run('require', 'docs: explain the build', 'base', 'without')).toStrictEqual({
      status: 0,
      stdout: 'changelog: "docs: explain the build" needs no entry\n',
      stderr: '',
    });
  });

  it('exits 2 for a command it does not know', () => {
    expect(run('bogus')).toStrictEqual({
      status: 2,
      stdout: '',
      stderr:
        'changelog: unknown command "bogus"; see the usage at the top of tools/changelog.mjs\n',
    });
  });

  it('is the same class the tests use', async () => {
    expect(await new ChangelogCommand().run(['require', 'docs: x', 'a', 'b'])).toStrictEqual({
      lines: ['changelog: "docs: x" needs no entry'],
      code: 0,
    });
  });
});
