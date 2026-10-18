import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MarkdownDocument, RepositoryFiles } from '../support/repository-files.js';

const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';
const CONTACT = 'gustavo@eklund.com.br';
/** What GitHub's community profile asks for, what OpenSSF asks for, and what this project adds. */
const REQUIRED = [
  'README.md',
  'README.pt-BR.md',
  'LICENSE',
  'NOTICE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'CHANGELOG.md',
  '.editorconfig',
  '.gitattributes',
  '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/accessibility.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/copy_or_translation.yml',
  '.github/dependabot.yml',
  '.github/rulesets/main.json',
  '.github/rulesets/release-tags.json',
  'commitlint.config.mjs',
  'cspell.config.yaml',
  'docs/README.md',
  'docs/images/social-preview.png',
];

describe('the files of an open source repository', () => {
  it('has every one of them', () => {
    expect(REQUIRED.filter((path) => !RepositoryFiles.exists(path))).toStrictEqual([]);
  });

  it('has the MIT license text, in the name of the author and with nothing added, so that GitHub names it', () => {
    const license = RepositoryFiles.read('LICENSE');
    expect([
      license.split('\n').slice(0, 3),
      license.includes(
        'Permission is hereby granted, free of charge, to any person obtaining a copy',
      ),
      license.endsWith('SOFTWARE.\n'),
    ]).toStrictEqual([['MIT License', '', 'Copyright (c) 2026 Gustavo Eklund'], true, true]);
  });

  it('says the same about itself in package.json: license, repository, address, issues', () => {
    const {
      license,
      repository,
      homepage,
      bugs,
      private: isPrivate,
    } = JSON.parse(RepositoryFiles.read('package.json'));
    expect({ license, repository, homepage, bugs, isPrivate }).toStrictEqual({
      license: 'MIT',
      repository: { type: 'git', url: `git+${REPOSITORY}.git` },
      homepage: 'https://eklund.com.br',
      bugs: { url: `${REPOSITORY}/issues` },
      isPrivate: true,
    });
  });

  it('names the same license for the words and the images in NOTICE.md and in both READMEs', () => {
    expect(
      ['NOTICE.md', 'README.md', 'README.pt-BR.md'].map((path) =>
        RepositoryFiles.read(path).includes('CC BY-NC-ND 4.0'),
      ),
    ).toStrictEqual([true, true, true]);
  });

  it('gives the same address for contact in the places that ask people to write', () => {
    const security = RepositoryFiles.read('source/.well-known/security.txt');
    expect(
      ['SECURITY.md', 'SUPPORT.md', 'CODE_OF_CONDUCT.md', 'source/.well-known/security.txt'].map(
        (path) => RepositoryFiles.read(path).includes(CONTACT),
      ),
    ).toStrictEqual([true, true, true, true]);
    expect(security.includes(`Contact: mailto:${CONTACT}`)).toBe(true);
  });

  it('leaves the owner as the code owner of everything', () => {
    expect(
      RepositoryFiles.read('.github/CODEOWNERS')
        .split('\n')
        .find((line) => line.startsWith('*')),
    ).toBe('*                               @GustavoEklund');
  });

  it('turns blank issues off and offers the private report and the discussions instead', () => {
    const config = RepositoryFiles.read('.github/ISSUE_TEMPLATE/config.yml');
    expect([
      config.includes('blank_issues_enabled: false'),
      config.includes(`${REPOSITORY}/security/advisories/new`),
      config.includes(`${REPOSITORY}/discussions`),
    ]).toStrictEqual([true, true, true]);
  });
});

describe('the documents', () => {
  const documents = RepositoryFiles.documents();

  it('are the ones expected, so that a new one is a decision', () => {
    expect([...documents].sort()).toStrictEqual(
      [
        'CHANGELOG.md',
        'CODE_OF_CONDUCT.md',
        'CONTRIBUTING.md',
        'NOTICE.md',
        'README.md',
        'README.pt-BR.md',
        'SECURITY.md',
        'SUPPORT.md',
        '.github/PULL_REQUEST_TEMPLATE.md',
        'docs/README.md',
        'docs/accessibility.md',
        'docs/architecture.md',
        'docs/build-and-deploy.md',
        'docs/continuous-integration.md',
        'docs/decisions/0001-no-framework-everything-is-a-class.md',
        'docs/decisions/0002-one-page-per-language.md',
        'docs/decisions/0003-content-security-policy-with-a-script-hash.md',
        'docs/decisions/0004-production-build-with-vite-plus.md',
        'docs/decisions/0005-spelling-and-commit-gates.md',
        'docs/decisions/0006-licenses.md',
        'docs/decisions/0007-supply-chain-policy.md',
        'docs/decisions/README.md',
        'docs/internationalization.md',
        'docs/releasing.md',
        'docs/repository-settings.md',
        'docs/testing.md',
        'docs/web-standards.md',
      ].sort(),
    );
  });

  it('use no em dash and no en dash, like the copy of the site', () => {
    expect(documents.filter((path) => /[—–]/.test(RepositoryFiles.read(path)))).toStrictEqual([]);
  });

  it('link only to files and headings that exist', () => {
    expect(
      documents
        .map((path) => [path, MarkdownDocument.of(path).brokenTargets()])
        .filter(([, broken]) => broken.length),
    ).toStrictEqual([]);
  });

  it('read the same in both languages of the README: the same sections, pictures, badges, links and code blocks', () => {
    const shape = (path) => {
      const text = RepositoryFiles.read(path);
      return {
        sections: [...text.matchAll(/^## /gm)].length,
        pictures: [...text.matchAll(/docs\/images\/[\w.-]+/g)].map(([name]) => name),
        badges: [...text.matchAll(/<img alt="[^"]*" src="(https:\/\/[^"]+)"/g)].map(([, source]) =>
          source.split('?')[0].replace(/\/(?:pt-br\/)?badge$/, ''),
        ).length,
        localLinks: [...MarkdownDocument.of(path).localTargets()]
          .filter((target) => !target.startsWith('docs/images/'))
          .sort(),
        codeBlocks: [...text.matchAll(/^```(\w*)/gm)].map(([, language]) => language),
      };
    };
    const [english, portuguese] = [shape('README.md'), shape('README.pt-BR.md')];
    // the Portuguese page links itself and the English one the other way around
    expect([
      portuguese.sections,
      portuguese.pictures,
      portuguese.badges,
      portuguese.codeBlocks,
      portuguese.localLinks.filter((target) => !['README.md', 'README.pt-BR.md'].includes(target)),
    ]).toStrictEqual([
      english.sections,
      english.pictures,
      english.badges,
      english.codeBlocks,
      english.localLinks.filter((target) => !['README.md', 'README.pt-BR.md'].includes(target)),
    ]);
  });

  it('keep the vocabulary list sorted, in lower case and without repeats, so that a review of it is short', () => {
    const words = RepositoryFiles.read('.cspell/project-words.txt')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect([
      words.filter((word) => word !== word.toLowerCase()),
      words.filter((word, index) => words.indexOf(word) !== index),
      words.every((word, index) => index === 0 || words[index - 1] <= word),
    ]).toStrictEqual([[], [], true]);
  });
});

describe('the workflows', () => {
  const automation = RepositoryFiles.automation();
  const workflows = RepositoryFiles.workflows();

  it('pin every action to the full commit of a version they name in a comment, and nothing is run from a branch', () => {
    const unpinned = automation.flatMap(({ file, text }) =>
      [...text.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)]
        .filter(([, target]) => !target.startsWith('./') && !target.startsWith('$/'))
        .filter(
          ([, target, rest]) =>
            !/^[\w.-]+\/[\w.\-/]+@[0-9a-f]{40}$/.test(target) || !/^ # \S+/.test(rest),
        )
        .map(([, target]) => `${file}: ${target}`),
    );
    expect(unpinned).toStrictEqual([]);
  });

  it('start with no permissions, or read-only, and let each job ask for what it needs', () => {
    expect(
      workflows
        .filter(({ text }) => !/^permissions:(?: \{\}| read-all|\n {2}contents: read$)/m.test(text))
        .map(({ file }) => file),
    ).toStrictEqual([]);
  });

  it('give every job a time limit, so that a hung job does not hold a runner for hours', () => {
    expect(
      workflows
        .filter(
          ({ text, jobCount }) =>
            [...text.matchAll(/^ {4}timeout-minutes: \d+$/gm)].length !== jobCount,
        )
        .map(({ file }) => file),
    ).toStrictEqual([]);
  });

  it('check out without keeping the token, in every job', () => {
    expect(
      automation.flatMap(({ file, text }) =>
        [...text.matchAll(/uses: actions\/checkout@\S+[^\n]*\n((?: {8,}\S[^\n]*\n)*)/g)]
          .filter(([, options]) => !options.includes('persist-credentials: false'))
          .map(() => file),
      ),
    ).toStrictEqual([]);
  });

  it('are named by the jobs that the ruleset of main requires, so that no merge waits for a check that does not exist', () => {
    const required = JSON.parse(RepositoryFiles.read('.github/rulesets/main.json'))
      .rules.find((rule) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map(({ context }) => context);
    const names = workflows.flatMap(({ jobNames, matrix }) =>
      jobNames.flatMap((name) =>
        Object.entries(matrix).reduce(
          (all, [key, values]) =>
            all.flatMap((one) =>
              one.includes(`\${{ matrix.${key} }}`)
                ? values.map((value) => one.replace(`\${{ matrix.${key} }}`, value))
                : [one],
            ),
          [name],
        ),
      ),
    );
    expect(required.filter((context) => !names.includes(context))).toStrictEqual([]);
  });

  it('are three updaters in dependabot.yml: the actions, the packages and nothing else', () => {
    expect(
      [...RepositoryFiles.read('.github/dependabot.yml').matchAll(/package-ecosystem: (\S+)/g)].map(
        ([, ecosystem]) => ecosystem,
      ),
    ).toStrictEqual(['github-actions', 'npm']);
  });

  it('start the release from a tag of the form vX.Y.Z, and from nothing else', () => {
    const release = RepositoryFiles.read('.github/workflows/release.yml');
    expect(
      release
        .match(/on:\n {2}push:\n {4}tags:\n((?: {6}- .+\n)+)/)[1]
        .trim()
        .split('\n')
        .map((line) => line.trim()),
    ).toStrictEqual(["- 'v[0-9]+.[0-9]+.[0-9]+'", "- 'v[0-9]+.[0-9]+.[0-9]+-*'"]);
  });
});

describe('the commit scopes', () => {
  it('are written in commitlint.config.mjs and in CONTRIBUTING.md, the same ones', async () => {
    const { default: config } = await import(join(RepositoryFiles.root, 'commitlint.config.mjs'));
    const scopes = config.rules['scope-enum'][2];
    const areas = scopes.slice(scopes.indexOf('build'));
    const contributing = RepositoryFiles.read('CONTRIBUTING.md');
    expect(areas.filter((area) => !contributing.includes(`\`${area}\``))).toStrictEqual([]);
    expect(
      readFileSync(join(RepositoryFiles.root, 'commitlint.config.mjs'), 'utf8').includes(
        config.helpUrl.split('#')[0],
      ),
    ).toBe(true);
  });
});
