// The commit gate: every commit message of this repository follows Conventional Commits (commitlint.config.mjs) and is spelled
// right (cspell.config.yaml, English). One tool serves the git hooks and CI, so a message is judged the same way everywhere.
// usage: node tools/commit-gate.mjs message FILE            the message git is about to record (commit-msg hook)
//        node tools/commit-gate.mjs pre-push REMOTE [URL]   the commits a push would send, with the refs on stdin (pre-push hook)
//        node tools/commit-gate.mjs range FROM TO           the commits in FROM..TO (CI: a pull request, a push to main);
//                                                           a FROM of zeros means every commit up to TO
//        node tools/commit-gate.mjs title TEXT              a pull request title, which becomes the message of a squash merge
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { checkText } from 'cspell';
import format from '@commitlint/format';
import lint from '@commitlint/lint';
import load from '@commitlint/load';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const COMMITLINT_CONFIG = 'commitlint.config.mjs';
const CSPELL_CONFIG = join(PROJECT, 'cspell.config.yaml');
const COMMIT_LANGUAGE = 'en-US';
const run = promisify(execFile);

/** One commit message, as git stores it or as a person typed it. */
export class CommitMessage {
  #text;
  #sha;
  #author;

  constructor({ text, sha = '', author = '' }) {
    this.#text = CommitMessage.#withoutComments(text);
    this.#sha = sha;
    this.#author = author;
  }

  get text() {
    return this.#text;
  }

  get subject() {
    return this.#text.split('\n')[0];
  }

  /** What a report calls the message: the short hash when it has one, then the subject. */
  get label() {
    return this.#sha ? `${this.#sha.slice(0, 7)} ${this.subject}` : this.subject;
  }

  /** A merge commit is written by git, not by a person, and a bot's message by its tool: neither is spell-checked. */
  get isMerge() {
    return /^Merge (branch|pull request|remote-tracking branch|tag) /.test(this.subject);
  }

  get isBot() {
    return this.#author.endsWith('[bot]');
  }

  /** The text a spell checker reads: no code spans, no addresses, no trailers (they hold names and emails, not prose). */
  get prose() {
    return this.#text
      .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
      .replace(/https?:\/\/\S+/g, (url) => ' '.repeat(url.length))
      .replace(/^[A-Za-z][A-Za-z-]*: .*<[^>]*>$/gm, (trailer) => ' '.repeat(trailer.length));
  }

  static #withoutComments(text) {
    return text
      .replace(/^#.*$/gm, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

/** The Conventional Commits rules of commitlint.config.mjs. */
export class CommitConvention {
  #config;

  constructor(config) {
    this.#config = config;
  }

  static async load() {
    return new CommitConvention(await load({}, { file: COMMITLINT_CONFIG, cwd: PROJECT }));
  }

  get scopes() {
    return this.#config.rules['scope-enum'][2];
  }

  /** The problems of a message, one line each, as commitlint words them. */
  async problems(message) {
    const report = await lint(message.text, this.#config.rules, {
      parserOpts: this.#config.parserPreset?.parserOpts,
      ignores: this.#config.ignores,
      defaultIgnores: this.#config.defaultIgnores,
      plugins: this.#config.plugins,
    });
    if (report.valid && !report.warnings.length) return [];
    return [format({ results: [{ ...report, input: message.text }] }, { color: false })]
      .flat()
      .join('\n')
      .split('\n')
      .filter((line) => /^\s*[✖⚠]/.test(line) && !/found \d+ problems/.test(line))
      .map((line) => line.trim().replace(/^([✖⚠])\s+/, '$1 '));
  }
}

/** The words of a message that the project dictionaries (English, plus the project vocabulary) do not know. */
export class CommitSpelling {
  async misspellings(message) {
    const folder = await mkdtemp(join(tmpdir(), 'commit-gate-'));
    const file = join(folder, 'message.txt');
    try {
      await writeFile(file, message.prose);
      const { items } = await checkText(file, {
        config: CSPELL_CONFIG,
        locale: COMMIT_LANGUAGE,
      });
      return [...new Set(items.filter((item) => item.isError).map((item) => item.text))];
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}

/** A message and what is wrong with it. */
class Verdict {
  constructor(message, problems) {
    this.message = message;
    this.problems = problems;
  }

  get ok() {
    return this.problems.length === 0;
  }
}

/** Convention and spelling, for one message at a time. */
export class CommitGateCheck {
  #convention;
  #spelling;

  constructor(convention, spelling) {
    this.#convention = convention;
    this.#spelling = spelling;
  }

  static async create() {
    return new CommitGateCheck(await CommitConvention.load(), new CommitSpelling());
  }

  async check(message) {
    if (message.isMerge) return new Verdict(message, []);
    const problems = await this.#convention.problems(message);
    if (!message.isBot) {
      const words = await this.#spelling.misspellings(message);
      if (words.length)
        problems.push(
          `✖ misspelled: ${words.join(', ')} (add real vocabulary to .cspell/project-words.txt)`,
        );
    }
    return new Verdict(message, problems);
  }
}

/** The commits git has, read with `git log`. */
export class GitHistory {
  static #FORMAT = '%H%x1f%an%x1f%B%x1e';
  #folder;

  /** The repository git runs in: the one the hook or the CI step runs from. */
  constructor(folder = process.cwd()) {
    this.#folder = folder;
  }

  /** The commits that `git log` selects with these revision arguments, oldest first. */
  async commits(revisions) {
    const { stdout } = await run(
      'git',
      ['log', '--reverse', `--format=${GitHistory.#FORMAT}`, ...revisions],
      {
        cwd: this.#folder,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return stdout
      .split('\x1e')
      .map((record) => record.replace(/^\n/, ''))
      .filter((record) => record.trim() !== '')
      .map((record) => {
        const [sha, author, text] = record.split('\x1f');
        return new CommitMessage({ sha, author, text });
      });
  }
}

/** The refs a push is about to update: git writes one line per ref on the stdin of the pre-push hook. */
export class PushUpdates {
  static #ZERO = /^0+$/;

  static parse(text) {
    return text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
        return { localRef, localSha, remoteRef, remoteSha };
      });
  }

  /** What a push sends, as `git log` arguments; null when nothing is sent that has a message to check (a deleted branch, a tag). */
  static revisions({ localSha, remoteRef, remoteSha }, remote) {
    if (PushUpdates.#ZERO.test(localSha) || remoteRef.startsWith('refs/tags/')) return null;
    if (PushUpdates.#ZERO.test(remoteSha)) return [localSha, '--not', `--remotes=${remote}`];
    return [`${remoteSha}..${localSha}`];
  }

  /** The same push when the remote's old commit is not here to compare with: whatever the remote does not have under that name. */
  static fallbackRevisions({ localSha }, remote) {
    return [localSha, '--not', `--remotes=${remote}`];
  }
}

/** What the gate says, line by line, and whether the run failed. */
class GateReport {
  #verdicts = [];

  add(verdict) {
    this.#verdicts.push(verdict);
  }

  get failed() {
    return this.#verdicts.some((verdict) => !verdict.ok);
  }

  lines() {
    const lines = [];
    for (const { message, problems } of this.#verdicts.filter((verdict) => !verdict.ok)) {
      lines.push(`✖ ${message.label}`);
      for (const problem of problems) lines.push(`    ${problem}`);
    }
    const bad = this.#verdicts.filter((verdict) => !verdict.ok).length;
    const total = this.#verdicts.length;
    lines.push(
      bad
        ? `commit-gate: ${bad} of ${total} message${total === 1 ? '' : 's'} failed (convention: CONTRIBUTING.md#commit-messages)`
        : `commit-gate: ${total} message${total === 1 ? '' : 's'} checked, all good`,
    );
    return lines;
  }
}

/** The command line: which messages to check, and the exit code. */
export class CommitGate {
  #check;
  #history;

  constructor(check, history) {
    this.#check = check;
    this.#history = history;
  }

  static async create() {
    return new CommitGate(await CommitGateCheck.create(), new GitHistory());
  }

  /** Runs one command and returns what to print and the exit code. */
  async run(argv, readStdin) {
    const [command, ...args] = argv;
    const messages = await this.#messagesOf(command, args, readStdin);
    const report = new GateReport();
    for (const message of messages) report.add(await this.#check.check(message));
    return { lines: report.lines(), code: report.failed ? 1 : 0 };
  }

  async #messagesOf(command, args, readStdin) {
    switch (command) {
      case 'message':
        return [new CommitMessage({ text: await readFile(args[0], 'utf8') })];
      case 'title':
        return [new CommitMessage({ text: args.join(' ') })];
      case 'range':
        // A push that creates the branch has no commit before it (git writes forty zeros): every commit is new.
        return this.#history.commits(/^0*$/.test(args[0]) ? [args[1]] : [`${args[0]}..${args[1]}`]);
      case 'pre-push':
        return this.#pushed(args[0] ?? 'origin', await readStdin());
      default:
        throw new Error(
          `unknown command "${command ?? ''}"; see the usage at the top of tools/commit-gate.mjs`,
        );
    }
  }

  async #pushed(remote, stdin) {
    const seen = new Set();
    const messages = [];
    for (const update of PushUpdates.parse(stdin)) {
      const revisions = PushUpdates.revisions(update, remote);
      if (!revisions) continue;
      let commits;
      try {
        commits = await this.#history.commits(revisions);
      } catch {
        commits = await this.#history.commits(PushUpdates.fallbackRevisions(update, remote));
      }
      for (const commit of commits)
        if (!seen.has(commit.label)) {
          seen.add(commit.label);
          messages.push(commit);
        }
    }
    return messages;
  }
}

const readStdin = async () => {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { lines, code } = await (await CommitGate.create()).run(process.argv.slice(2), readStdin);
    for (const line of lines) (code ? console.error : console.log)(line);
    process.exitCode = code;
  } catch (error) {
    console.error(`commit-gate: ${error.message}`);
    process.exitCode = 2;
  }
}
