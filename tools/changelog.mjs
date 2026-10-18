// The changelog (CHANGELOG.md, Keep a Changelog 1.1.0) and the version it describes (package.json, Semantic Versioning 2.0.0).
// usage: node tools/changelog.mjs check                     the file keeps the format, and package.json has the newest released version
//        node tools/changelog.mjs notes VERSION             the entries of a version, as the notes of its GitHub release
//        node tools/changelog.mjs verify-release TAG        a tag like v1.2.0 names the newest released version, with a date
//        node tools/changelog.mjs release VERSION [DATE]    moves [Unreleased] into a new version and bumps package.json
//        node tools/changelog.mjs require TITLE BASE HEAD   a pull request that changes what visitors get must touch the changelog
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPOSITORY = 'https://github.com/GustavoEklund/eklund.com.br';
const KEEP_A_CHANGELOG = 'https://keepachangelog.com/en/1.1.0/';
const SEMANTIC_VERSIONING = 'https://semver.org/spec/v2.0.0.html';
const run = promisify(execFile);

/** A Semantic Versioning 2.0.0 version, and the order the specification gives versions. */
export class SemanticVersion {
  static #PATTERN =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

  constructor(text) {
    const found = SemanticVersion.#PATTERN.exec(text);
    if (!found) throw new Error(`"${text}" is not a Semantic Versioning 2.0.0 version`);
    this.text = text;
    this.numbers = [Number(found[1]), Number(found[2]), Number(found[3])];
    this.prerelease = found[4] ? found[4].split('.') : [];
  }

  static isValid(text) {
    return SemanticVersion.#PATTERN.test(text);
  }

  /** Negative when `a` comes first, positive when `b` does, zero when they have the same precedence. */
  static compare(a, b) {
    for (let index = 0; index < 3; index++)
      if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
    if (!a.prerelease.length || !b.prerelease.length)
      return b.prerelease.length - a.prerelease.length;
    for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
      const [left, right] = [a.prerelease[index], b.prerelease[index]];
      if (left === undefined) return -1;
      if (right === undefined) return 1;
      if (left === right) continue;
      const [leftNumber, rightNumber] = [/^\d+$/.test(left), /^\d+$/.test(right)];
      if (leftNumber && rightNumber) return Number(left) - Number(right);
      if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
      return left < right ? -1 : 1;
    }
    return 0;
  }
}

/** One `## [version] - date` section: its heading and the `### Added`... groups under it. */
class Release {
  constructor({ name, date, yanked, groups }) {
    this.name = name; // 'Unreleased' or a version
    this.date = date;
    this.yanked = yanked;
    this.groups = groups; // [{ heading, lines }]
  }

  get isUnreleased() {
    return this.name === 'Unreleased';
  }

  get isEmpty() {
    return this.groups.length === 0;
  }

  /** The entries as Markdown, without the section heading. */
  body() {
    return this.groups
      .map(({ heading, lines }) => `### ${heading}\n\n${lines.join('\n')}`)
      .join('\n\n');
  }
}

/** CHANGELOG.md as a document: the text before the first release, the releases, and the link references at the end. */
export class Changelog {
  static HEADINGS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
  static #RELEASE = /^## \[([^\]]+)\](?: - (\S+))?( \[YANKED\])?$/;
  static #LINK = /^\[([^\]]+)\]: (\S+)$/;

  constructor({ preface, releases, links }) {
    this.preface = preface;
    this.releases = releases;
    this.links = links;
  }

  static parse(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const links = new Map();
    const preface = [];
    const releases = [];
    let current = null;
    let group = null;
    for (const line of lines) {
      const link = Changelog.#LINK.exec(line);
      if (link) {
        links.set(link[1], link[2]);
        continue;
      }
      const release = Changelog.#RELEASE.exec(line);
      if (release) {
        current = new Release({
          name: release[1],
          date: release[2] ?? null,
          yanked: Boolean(release[3]),
          groups: [],
        });
        releases.push(current);
        group = null;
        continue;
      }
      if (!current) {
        preface.push(line);
        continue;
      }
      const heading = /^### (.+)$/.exec(line);
      if (heading) {
        group = { heading: heading[1], lines: [] };
        current.groups.push(group);
      } else if (group && line.trim() !== '') group.lines.push(line);
      else if (!group && line.trim() !== '') current.groups.push({ heading: '', lines: [line] }); // text outside any group: reported
    }
    return new Changelog({ preface: preface.join('\n').trim(), releases, links });
  }

  get unreleased() {
    return this.releases.find((release) => release.isUnreleased) ?? null;
  }

  /** The released versions, newest first as the file lists them. */
  get versions() {
    return this.releases.filter((release) => !release.isUnreleased);
  }

  release(version) {
    return this.releases.find((release) => release.name === version) ?? null;
  }

  /** What is wrong with the file, one sentence each. `packageVersion` is the one in package.json. */
  problems(packageVersion) {
    const found = [];
    if (!this.preface.startsWith('# Changelog'))
      found.push('the file must start with "# Changelog"');
    const linked = new Set(
      [...this.preface.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map(([, address]) => address),
    );
    if (!linked.has(KEEP_A_CHANGELOG) || !linked.has(SEMANTIC_VERSIONING))
      found.push('the introduction must link Keep a Changelog and Semantic Versioning');
    if (this.releases[0]?.name !== 'Unreleased')
      found.push('the first section must be "## [Unreleased]"');
    found.push(...this.#versionProblems());
    for (const release of this.releases) found.push(...Changelog.#groupProblems(release));
    found.push(...this.#linkProblems());
    const newest = this.versions[0];
    if (newest && packageVersion !== newest.name)
      found.push(
        `package.json says ${packageVersion} but the newest released version is ${newest.name}`,
      );
    return found;
  }

  #versionProblems() {
    const found = [];
    const versions = this.versions;
    for (const release of versions) {
      if (!SemanticVersion.isValid(release.name))
        found.push(`"${release.name}" is not a Semantic Versioning version`);
      if (!release.date || !/^\d{4}-\d{2}-\d{2}$/.test(release.date))
        found.push(`version ${release.name} needs an ISO 8601 date (YYYY-MM-DD) after its name`);
    }
    for (let index = 1; index < versions.length; index++) {
      const [newer, older] = [versions[index - 1], versions[index]];
      if (SemanticVersion.isValid(newer.name) && SemanticVersion.isValid(older.name)) {
        if (
          SemanticVersion.compare(
            new SemanticVersion(newer.name),
            new SemanticVersion(older.name),
          ) <= 0
        )
          found.push(
            `${newer.name} is listed above ${older.name}: versions go from the newest to the oldest`,
          );
        else if (newer.date && older.date && newer.date < older.date)
          found.push(`${newer.name} is dated ${newer.date}, before ${older.name} (${older.date})`);
      }
    }
    return found;
  }

  static #groupProblems(release) {
    const found = [];
    const order = [];
    for (const { heading, lines } of release.groups) {
      if (heading === '') {
        found.push(
          `${release.name} has text outside a group: put it under ### ${Changelog.HEADINGS.join(', ### ')}`,
        );
        continue;
      }
      if (!Changelog.HEADINGS.includes(heading)) {
        found.push(
          `${release.name} has the group "${heading}", which Keep a Changelog does not define`,
        );
        continue;
      }
      order.push(Changelog.HEADINGS.indexOf(heading));
      if (!lines.some((line) => /^\s*[-*] /.test(line)))
        found.push(`${release.name} has an empty group "${heading}"`);
    }
    if (order.some((position, index) => index > 0 && position <= order[index - 1]))
      found.push(
        `${release.name} lists its groups out of order or twice: use ${Changelog.HEADINGS.join(', ')}`,
      );
    return found;
  }

  #linkProblems() {
    const found = [];
    const versions = this.versions;
    const expectedUnreleased = versions[0]
      ? `${REPOSITORY}/compare/v${versions[0].name}...HEAD`
      : `${REPOSITORY}/commits/main`;
    if (this.links.get('Unreleased') !== expectedUnreleased)
      found.push(`[Unreleased] must link ${expectedUnreleased}`);
    versions.forEach((release, index) => {
      const older = versions[index + 1];
      const expected = older
        ? `${REPOSITORY}/compare/v${older.name}...v${release.name}`
        : `${REPOSITORY}/releases/tag/v${release.name}`;
      if (this.links.get(release.name) !== expected)
        found.push(`[${release.name}] must link ${expected}`);
    });
    return found;
  }

  /** The notes of one version: its groups, then the link to what changed since the version before it. */
  notes(version) {
    const release = this.release(version);
    if (!release) throw new Error(`CHANGELOG.md has no section for ${version}`);
    const index = this.versions.indexOf(release);
    const older = this.versions[index + 1];
    const footer = older
      ? `**Full changelog**: ${REPOSITORY}/compare/v${older.name}...v${release.name}`
      : `**Full changelog**: ${REPOSITORY}/commits/v${release.name}`;
    return `${release.body()}\n\n${footer}\n`;
  }

  /** The file with [Unreleased] moved into a new version section dated `date`. */
  released(version, date) {
    const unreleased = this.unreleased;
    if (!unreleased || unreleased.isEmpty)
      throw new Error('[Unreleased] has no entries to release');
    if (!SemanticVersion.isValid(version))
      throw new Error(`"${version}" is not a Semantic Versioning 2.0.0 version`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error(`"${date}" is not a date like 2026-10-18`);
    const newest = this.versions[0];
    if (
      newest &&
      SemanticVersion.compare(new SemanticVersion(version), new SemanticVersion(newest.name)) <= 0
    )
      throw new Error(`${version} is not newer than ${newest.name}`);
    const release = new Release({ name: version, date, yanked: false, groups: unreleased.groups });
    const releases = [
      new Release({ name: 'Unreleased', date: null, yanked: false, groups: [] }),
      release,
      ...this.versions,
    ];
    const links = new Map([['Unreleased', `${REPOSITORY}/compare/v${version}...HEAD`]]);
    releases.slice(1).forEach((item, index, all) => {
      const older = all[index + 1];
      links.set(
        item.name,
        older
          ? `${REPOSITORY}/compare/v${older.name}...v${item.name}`
          : `${REPOSITORY}/releases/tag/v${item.name}`,
      );
    });
    return new Changelog({ preface: this.preface, releases, links });
  }

  toString() {
    const sections = this.releases.map((release) => {
      const heading = release.isUnreleased
        ? '## [Unreleased]'
        : `## [${release.name}] - ${release.date}${release.yanked ? ' [YANKED]' : ''}`;
      return release.isEmpty ? heading : `${heading}\n\n${release.body()}`;
    });
    const links = [...this.links].map(([name, url]) => `[${name}]: ${url}`);
    return `${this.preface}\n\n${sections.join('\n\n')}\n\n${links.join('\n')}\n`;
  }
}

/** Which pull requests must come with a changelog line: the ones whose type says a visitor or a reader will notice. */
export class ChangelogPolicy {
  static TYPES = ['feat', 'fix', 'perf', 'revert', 'security'];

  static requires(title) {
    const found = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(title.trim());
    if (!found) return false;
    return found[2] === '!' || ChangelogPolicy.TYPES.includes(found[1]);
  }
}

/** The files this tool reads and writes, and git. */
class Project {
  static async changelog() {
    return Changelog.parse(await readFile(join(PROJECT, 'CHANGELOG.md'), 'utf8'));
  }

  static async version() {
    return JSON.parse(await readFile(join(PROJECT, 'package.json'), 'utf8')).version;
  }

  static async changedFiles(base, head) {
    const { stdout } = await run('git', ['diff', '--name-only', `${base}...${head}`], {
      cwd: process.cwd(),
    });
    return stdout.split('\n').filter(Boolean);
  }
}

/** The command line. Returns what to print and the exit code. */
export class ChangelogCommand {
  async run([command, ...args]) {
    switch (command) {
      case 'check':
        return this.#check();
      case 'notes':
        return { lines: [(await Project.changelog()).notes(args[0]).trimEnd()], code: 0 };
      case 'verify-release':
        return this.#verifyRelease(args[0]);
      case 'release':
        return this.#release(args[0], args[1] ?? new Date().toISOString().slice(0, 10));
      case 'require':
        return this.#require(args[0], args[1], args[2]);
      default:
        throw new Error(
          `unknown command "${command ?? ''}"; see the usage at the top of tools/changelog.mjs`,
        );
    }
  }

  async #check() {
    const problems = (await Project.changelog()).problems(await Project.version());
    return problems.length
      ? {
          lines: [
            ...problems.map((problem) => `✖ ${problem}`),
            `changelog: ${problems.length} problem${problems.length === 1 ? '' : 's'}`,
          ],
          code: 1,
        }
      : {
          lines: ['changelog: CHANGELOG.md follows Keep a Changelog and matches package.json'],
          code: 0,
        };
  }

  async #verifyRelease(tag) {
    const version = String(tag ?? '').replace(/^v/, '');
    const changelog = await Project.changelog();
    const problems = changelog.problems(await Project.version());
    if (changelog.versions[0]?.name !== version)
      problems.push(
        `the tag ${tag} is not the newest released version (${changelog.versions[0]?.name})`,
      );
    if ((await Project.version()) !== version)
      problems.push(`package.json says ${await Project.version()}, the tag says ${version}`);
    return problems.length
      ? {
          lines: [...problems.map((problem) => `✖ ${problem}`), `release: ${tag} is not ready`],
          code: 1,
        }
      : { lines: [`release: ${tag} matches package.json and CHANGELOG.md`], code: 0 };
  }

  async #release(version, date) {
    const next = (await Project.changelog()).released(version, date);
    await writeFile(join(PROJECT, 'CHANGELOG.md'), next.toString());
    const file = join(PROJECT, 'package.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.version = version;
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
      lines: [
        `release: [Unreleased] is now ${version} (${date}); package.json says ${version}`,
        'next: review CHANGELOG.md, then commit "chore(release): ' +
          version +
          '" and tag v' +
          version,
      ],
      code: 0,
    };
  }

  async #require(title, base, head) {
    if (!ChangelogPolicy.requires(title ?? ''))
      return { lines: [`changelog: "${title}" needs no entry`], code: 0 };
    const files = await Project.changedFiles(base, head);
    return files.includes('CHANGELOG.md')
      ? { lines: ['changelog: CHANGELOG.md changed, as the title asks'], code: 0 }
      : {
          lines: [
            `✖ "${title}" changes what visitors get: add a line under [Unreleased] in CHANGELOG.md, or label the pull request skip-changelog`,
          ],
          code: 1,
        };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { lines, code } = await new ChangelogCommand().run(process.argv.slice(2));
    for (const line of lines) (code ? console.error : console.log)(line);
    process.exitCode = code;
  } catch (error) {
    console.error(`changelog: ${error.message}`);
    process.exitCode = 2;
  }
}
