// Puts a release online on the hosting, over FTP with TLS (the plan has no SSH). The Deploy workflow runs it on the files of a
// release zip, once the zip has passed its checksum and its provenance attestation.
// usage: node tools/deploy.mjs upload SITE --into /FOLDER/ [--into /FOLDER/ ...] [--keep PREVIOUS] [--dry-run]
//          sends the files of SITE to each folder of the server, deletes what the release no longer has, and keeps the files of
//          PREVIOUS (the release online before this one) for one more deploy, for the pages that are still open in a browser
//        node tools/deploy.mjs check SITE --at https://HOST/FOLDER/ [--at ...]
//          compares each page of SITE with the page the server answers at that address, and the policy it sends with it
//        node tools/deploy.mjs previous TAG
//          the release whose files `upload --keep` should keep, from the tags of the published releases on standard input
// `upload` reads the connection from FTP_HOST, FTP_USER and FTP_PASSWORD, and checks the certificate of the server against
// FTP_TLS_NAME, the name it is issued to, when FTP_HOST is an address.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { Client } from 'basic-ftp';
import { SemanticVersion } from './changelog.mjs';
import { SiteHeaders } from './site-headers.mjs';

/** What one deploy does to one folder of the server, worked out from the files of the release and what the folder holds. */
export class DeployPlan {
  /** A folder named after a version: the copy a release leaves online, which the deploy of another version never touches. */
  static VERSION_FOLDER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  /** A file that Vite names by a hash of its content, so one of the same name and size on the server is that same file. */
  static HASHED = /(?:^|\/)assets\/[^/]+-[\w-]{8}\.[a-z0-9]+$/;
  /** What a page is made of besides the files it names: the pages and the .htaccess files, which carry the policy that allows their script. */
  static #SWITCH = /(?:^|\/)(?:\.htaccess|[^/]+\.html)$/;

  /**
   * @param {object} state
   * @param {Map<string, number>} state.files the files of the release, by path, with their size in bytes
   * @param {Map<string, {type: 'file' | 'folder' | 'other', size: number}>} state.remote what the folder of the server holds,
   *   by path, without the inside of the folders `protects` says to leave alone
   * @param {Set<string>} [state.keep] files that stay even though the release no longer has them
   * @param {string[]} [state.nested] folders of this one that are deployed to as well (a mirror inside the site)
   */
  static make({ files, remote, keep = new Set(), nested = [] }) {
    const folders = DeployPlan.foldersOf(files);
    const leftAlone = (path) => DeployPlan.protects(path, folders, nested);
    for (const path of files.keys())
      if (remote.has(path) && remote.get(path).type !== 'file')
        throw new Error(`${path} is a file in the release and something else on the server`);
    for (const folder of folders)
      if (remote.has(folder) && remote.get(folder).type !== 'folder')
        throw new Error(`${folder}/ is a folder in the release and something else on the server`);

    const unchanged = [...files]
      .filter(([path, size]) => DeployPlan.HASHED.test(path) && remote.get(path)?.size === size)
      .map(([path]) => path);
    const uploads = [...files.keys()]
      .filter((path) => !unchanged.includes(path))
      .sort(DeployPlan.#inOrder);
    const deletions = [...remote]
      .filter(([path, { type }]) => type === 'file' && !files.has(path) && !leftAlone(path))
      .filter(([path]) => !keep.has(path))
      .map(([path]) => path)
      .sort();
    const gone = new Set(deletions);
    const emptied = [];
    for (const [folder] of [...remote]
      .filter(([path, { type }]) => type === 'folder' && !folders.has(path) && !leftAlone(path))
      .sort(([a], [b]) => DeployPlan.#depth(b) - DeployPlan.#depth(a) || DeployPlan.byName(a, b)))
      if (
        [...remote.keys()]
          .filter((path) => path.startsWith(`${folder}/`))
          .every((path) => gone.has(path))
      ) {
        emptied.push(folder);
        gone.add(folder);
      }
    return {
      folders: [...folders]
        .filter((folder) => !remote.has(folder))
        .sort((a, b) => DeployPlan.#depth(a) - DeployPlan.#depth(b) || DeployPlan.byName(a, b)),
      uploads,
      unchanged: unchanged.sort(),
      deletions,
      kept: [...remote]
        .filter(([path, { type }]) => type === 'file' && !files.has(path) && !leftAlone(path))
        .map(([path]) => path)
        .filter((path) => keep.has(path))
        .sort(),
      emptied,
    };
  }

  /** Every folder that holds a file of the release, as a path without the slash at the end. */
  static foldersOf(files) {
    const folders = new Set();
    for (const path of files.keys())
      for (let at = path.indexOf('/'); at > -1; at = path.indexOf('/', at + 1))
        folders.add(path.slice(0, at));
    return folders;
  }

  /** True for what the deploy leaves alone: the copy of another version, and a folder that is deployed to on its own. */
  static protects(path, folders, nested = []) {
    const top = path.split('/')[0];
    return (
      (DeployPlan.VERSION_FOLDER.test(top) && !folders.has(top)) ||
      nested.some((folder) => path === folder || path.startsWith(`${folder}/`))
    );
  }

  /**
   * The order of the uploads: the hashed files first, which no page names yet; then the other files; then the .htaccess
   * files and the pages, the deepest first and the page at the root last, so a visitor never gets a page that names a file
   * the server does not have yet, and the policy and the script of a page change together.
   */
  static #inOrder(a, b) {
    const stage = (path) =>
      DeployPlan.HASHED.test(path) ? 0 : DeployPlan.#SWITCH.test(path) ? 2 : 1;
    const page = (path) => (path.endsWith('.html') ? 1 : 0);
    return (
      stage(a) - stage(b) ||
      (stage(a) === 2 ? DeployPlan.#depth(b) - DeployPlan.#depth(a) || page(a) - page(b) : 0) ||
      DeployPlan.byName(a, b)
    );
  }

  static #depth(path) {
    return path.split('/').length;
  }

  /** Paths in the order of their characters, the same on every machine, whatever the locale of the runner. */
  static byName(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

/** A folder of the server as the FTP account sees it, through basic-ftp: the few operations a deploy needs. */
export class FtpServer {
  #client;

  constructor(client) {
    this.#client = client;
  }

  /** Signs in over explicit TLS, and checks the certificate against `tlsName`: the address alone names no certificate. */
  static async open({ host, user, password, tlsName = host }) {
    const client = new Client(30_000);
    await client.access({
      host,
      user,
      password,
      secure: true,
      secureOptions: { servername: tlsName, minVersion: 'TLSv1.2' },
    });
    return new FtpServer(client);
  }

  /** The entries of a folder: files, folders, and anything else (a link), with their size. */
  async list(path) {
    return (await this.#client.list(path))
      .filter(({ name }) => name !== '.' && name !== '..')
      .map(({ name, size, isFile, isDirectory }) => ({
        name,
        size,
        type: isFile ? 'file' : isDirectory ? 'folder' : 'other',
      }));
  }

  /** A small text file of the server. */
  async read(path) {
    const chunks = [];
    await this.#client.downloadTo(
      new Writable({
        write(chunk, _encoding, done) {
          chunks.push(chunk);
          done();
        },
      }),
      path,
    );
    return Buffer.concat(chunks).toString('utf8');
  }

  upload(localPath, path) {
    return this.#client.uploadFrom(localPath, path);
  }

  rename(from, to) {
    return this.#client.rename(from, to);
  }

  remove(path) {
    return this.#client.remove(path);
  }

  /**
   * A server can leave hidden folders (.well-known) out of its listings, so a folder the plan does not see may be there
   * already: MKD then fails, and the folder counts as made if the server can enter it.
   */
  async makeFolder(path) {
    try {
      await this.#client.send(`MKD ${path}`);
    } catch (error) {
      await this.#client.cd(path).catch(() => {
        throw error;
      });
    }
  }

  removeFolder(path) {
    return this.#client.removeEmptyDir(path);
  }

  close() {
    this.#client.close();
  }
}

/** Sends a release to one or more folders of the server, one folder after the other, as DeployPlan says. */
export class Deployment {
  #server;
  #log;
  #token;

  /** @param {{ server: FtpServer, log?: (line: string) => void, token?: string }} options */
  constructor({ server, log = () => {}, token = randomBytes(4).toString('hex') }) {
    this.#server = server;
    this.#log = log;
    this.#token = token;
  }

  /**
   * @param {object} release
   * @param {string} release.site the local folder with the files of the release
   * @param {string[]} release.into the folders of the server, each one written as /folder/ from the root of the FTP account
   * @param {string} [release.keep] the local folder with the files of the release before, which stay for one more deploy
   * @param {boolean} [release.dryRun] only say what would change
   */
  async upload({ site, into, keep, dryRun = false }) {
    const files = await Deployment.filesIn(site);
    const kept = keep ? new Set((await Deployment.filesIn(keep)).keys()) : new Set();
    const folders = DeployPlan.foldersOf(files);
    for (const target of into) {
      const nested = into
        .filter((other) => other !== target && other.startsWith(target))
        .map((other) => other.slice(target.length, -1));
      const missing = await this.#missing(target);
      const empty = missing.length > 0 || (await this.#server.list(target)).length === 0;
      if (!empty) await this.#checkItIsTheSite(site, target);
      const remote = empty
        ? new Map()
        : await this.#walk(target, (path) => DeployPlan.protects(path, folders, nested));
      const plan = DeployPlan.make({ files, remote, keep: kept, nested });
      this.#report(target, plan, dryRun, missing);
      if (dryRun) continue;
      for (const folder of missing) await this.#server.makeFolder(folder);
      await this.#apply(site, target, plan);
    }
  }

  /** The folders on the way to `target` that the server does not have yet, the outermost first: /1.2.0-rc.1 for a new pre-release. */
  async #missing(target) {
    const names = target.split('/').filter(Boolean);
    for (let depth = 0; depth < names.length; depth++) {
      const parent = `/${names
        .slice(0, depth)
        .map((name) => `${name}/`)
        .join('')}`;
      const there = (await this.#server.list(parent)).some(
        ({ name, type }) => name === names[depth] && type === 'folder',
      );
      if (!there)
        return names
          .slice(depth)
          .map((_, index) => `/${names.slice(0, depth + index + 1).join('/')}`);
    }
    return [];
  }

  /** The files under a local folder, hidden ones included, by path with slashes, with their size. */
  static async filesIn(folder) {
    const found = new Map();
    const walk = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile())
          found.set(relative(folder, path).split(sep).join('/'), (await stat(path)).size);
      }
    };
    await walk(folder);
    return new Map([...found].sort(([a], [b]) => DeployPlan.byName(a, b)));
  }

  /** What a folder of the server holds, by path, without going into the folders that are left alone. */
  async #walk(target, leftAlone) {
    const found = new Map();
    const walk = async (folder) => {
      for (const { name, type, size } of await this.#server.list(`${target}${folder}`)) {
        const path = `${folder}${name}`;
        found.set(path, { type, size });
        if (type === 'folder' && !leftAlone(path)) await walk(`${path}/`);
      }
    };
    await walk('');
    return found;
  }

  /**
   * A folder that already holds something is changed only when it is this site: its .htaccess starts with the line the
   * release's .htaccess starts with. A wrong FTP folder (the home folder above public_html, say) has no such file, and the
   * deploy stops before it lists, sends or deletes anything there.
   */
  async #checkItIsTheSite(site, target) {
    const signature = (text) => text.split('\n')[0];
    const expected = signature(await readFile(join(site, '.htaccess'), 'utf8'));
    let found = '';
    try {
      found = signature(await this.#server.read(`${target}.htaccess`));
    } catch {
      // no .htaccess: nothing proves this is the site
    }
    if (found !== expected)
      throw new Error(
        `${target} holds files but not the .htaccess of this site (its first line is "${found}", not "${expected}"), so the deploy leaves it as it is. Check the folder the FTP account starts in.`,
      );
  }

  /** Folders first, then every file under a temporary name, then each one under its own name, then what goes away. */
  async #apply(site, target, plan) {
    for (const folder of plan.folders) await this.#server.makeFolder(`${target}${folder}`);
    const temporary = (path) =>
      `${target}${posix.dirname(path) === '.' ? '' : `${posix.dirname(path)}/`}.deploy-${this.#token}-${posix.basename(path)}`;
    for (const path of plan.uploads)
      await this.#server.upload(join(site, ...path.split('/')), temporary(path));
    for (const path of plan.uploads) await this.#server.rename(temporary(path), `${target}${path}`);
    for (const path of plan.deletions) await this.#server.remove(`${target}${path}`);
    for (const folder of plan.emptied) await this.#server.removeFolder(`${target}${folder}`);
  }

  #report(target, plan, dryRun, missing) {
    const would = dryRun ? 'would ' : '';
    this.#log(
      `${target}: ${would}upload ${plan.uploads.length} files (${plan.unchanged.length} already there), ${would}delete ${plan.deletions.length}, keep ${plan.kept.length} of the release before`,
    );
    for (const folder of missing) this.#log(`  + ${folder}/ (on the server)`);
    for (const folder of plan.folders) this.#log(`  + ${folder}/`);
    for (const path of plan.uploads) this.#log(`  + ${path}`);
    for (const path of plan.deletions) this.#log(`  - ${path}`);
    for (const folder of plan.emptied) this.#log(`  - ${folder}/`);
    for (const path of plan.kept) this.#log(`  = ${path}`);
  }
}

/** Whether the server answers each page of a release with that very page, and with the policy that allows its script. */
export class LiveCheck {
  #fetch;
  #attempts;
  #pause;

  /** The server and its cache can take a moment: each page is asked for again, `attempts` times, `pause` milliseconds apart. */
  constructor({ fetch = globalThis.fetch, attempts = 10, pause = 6_000 } = {}) {
    this.#fetch = fetch;
    this.#attempts = attempts;
    this.#pause = pause;
  }

  /** The pages of a release, by the address each one has under the folder it is deployed to (en/index.html is en/), the home page first. */
  static pagesOf(files) {
    const depth = ({ address }) => address.split('/').length;
    return [...files.keys()]
      .filter((path) => path === 'index.html' || path.endsWith('/index.html'))
      .map((path) => ({ path, address: path.slice(0, -'index.html'.length) }))
      .sort((a, b) => depth(a) - depth(b) || DeployPlan.byName(a.address, b.address));
  }

  /** @returns {Promise<string[]>} one line for each page that differs, empty when every page is the release's */
  async run({ site, at }) {
    const pages = LiveCheck.pagesOf(await Deployment.filesIn(site));
    const problems = [];
    for (const base of at)
      for (const { path, address } of pages) {
        const html = await readFile(join(site, ...path.split('/')), 'utf8');
        const problem = await this.#compare(new URL(address, base).href, html);
        if (problem) problems.push(problem);
      }
    return problems;
  }

  async #compare(url, html) {
    const policy = SiteHeaders.contentSecurityPolicy(html);
    let problem = '';
    for (let attempt = 1; attempt <= this.#attempts; attempt++) {
      if (attempt > 1) await new Promise((done) => setTimeout(done, this.#pause));
      try {
        const response = await this.#fetch(url, { redirect: 'manual' });
        const body = await response.text();
        if (response.status !== 200) problem = `${url}: status ${response.status}`;
        else if (body !== html) problem = `${url}: the page is not the one of the release`;
        else if (response.headers.get('content-security-policy') !== policy)
          problem = `${url}: the Content-Security-Policy does not allow the inline script of the page`;
        else return '';
      } catch (error) {
        problem = `${url}: ${error.message}`;
      }
    }
    return problem;
  }
}

/** The published releases, as their tags. */
export class Releases {
  /**
   * The release online before `tag` goes up: the newest other release that is not a pre-release. When `tag` is the newest,
   * that is the one before it; when `tag` is an older release put back online, it is the newest, which is what was online.
   */
  static previous(tag, tags) {
    const others = tags
      .map((name) => name.trim())
      .filter(
        (name) => name !== tag && name.startsWith('v') && SemanticVersion.isValid(name.slice(1)),
      )
      .map((name) => new SemanticVersion(name.slice(1)))
      .filter((version) => version.prerelease.length === 0)
      .sort(SemanticVersion.compare);
    return others.length ? `v${others.at(-1).text}` : null;
  }
}

/** The command line: reads the arguments and the environment, and answers with the lines to print and the exit code. */
export class DeployCommand {
  #environment;
  #input;
  #open;
  #check;
  #log;

  /** `log` prints the plan of each folder as the upload goes, so a deploy that stops halfway still shows how far it got. */
  constructor({
    environment = process.env,
    input = () => readFileSync(0, 'utf8'),
    open = (connection) => FtpServer.open(connection),
    check = new LiveCheck(),
    log = console.log,
  } = {}) {
    this.#environment = environment;
    this.#input = input;
    this.#open = open;
    this.#check = check;
    this.#log = log;
  }

  async run([command, ...rest]) {
    if (command === 'upload') return this.#upload(DeployCommand.options(rest));
    if (command === 'check') return this.#checkLive(DeployCommand.options(rest));
    if (command === 'previous' && rest.length === 1) {
      const previous = Releases.previous(rest[0], (await this.#input()).split('\n'));
      return { lines: previous ? [previous] : [], code: 0 };
    }
    return {
      lines: [
        'usage: node tools/deploy.mjs upload SITE --into /FOLDER/ | check SITE --at URL | previous TAG',
      ],
      code: 2,
    };
  }

  /** `SITE --into a --into b --keep c --dry-run` as { site, into: [a, b], keep: c, dryRun: true }. */
  static options([site, ...rest]) {
    const options = { site, into: [], at: [], keep: undefined, dryRun: false };
    for (let index = 0; index < rest.length; index++) {
      const name = rest[index];
      if (name === '--dry-run') options.dryRun = true;
      else if (name === '--into' || name === '--at') options[name.slice(2)].push(rest[++index]);
      else if (name === '--keep') options.keep = rest[++index];
      else throw new Error(`unknown option ${name}`);
    }
    if (!site) throw new Error('the folder with the files of the release is missing');
    return options;
  }

  async #upload({ site, into, keep, dryRun }) {
    if (!into.length) throw new Error('say where the release goes, with --into /folder/');
    for (const folder of into)
      if (!/^\/(?:[^/]+\/)*$/.test(folder))
        throw new Error(`${folder} is not a folder written from the root, like / or /mirror/`);
    const { FTP_HOST: host, FTP_USER: user, FTP_PASSWORD: password } = this.#environment;
    if (!host || !user || !password)
      throw new Error('FTP_HOST, FTP_USER and FTP_PASSWORD are needed');
    const server = await this.#open({
      host,
      user,
      password,
      tlsName: this.#environment.FTP_TLS_NAME || host,
    });
    try {
      await new Deployment({ server, log: this.#log }).upload({ site, into, keep, dryRun });
    } finally {
      server.close();
    }
    return {
      lines: [
        dryRun
          ? 'upload: a dry run, nothing changed'
          : `upload: the release is in ${into.join(' and ')}`,
      ],
      code: 0,
    };
  }

  async #checkLive({ site, at }) {
    if (!at.length) throw new Error('say where to look, with --at https://host/folder/');
    const problems = await this.#check.run({ site, at });
    return problems.length
      ? { lines: problems, code: 1 }
      : {
          lines: [`check: every page answers as the release has it, at ${at.join(' and ')}`],
          code: 0,
        };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { lines, code } = await new DeployCommand().run(process.argv.slice(2));
    for (const line of lines) (code ? console.error : console.log)(line);
    process.exitCode = code;
  } catch (error) {
    console.error(`deploy: ${error.message}`);
    process.exitCode = 2;
  }
}
