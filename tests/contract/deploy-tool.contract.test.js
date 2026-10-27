import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  DeployCommand,
  DeployPlan,
  Deployment,
  FtpServer,
  LiveCheck,
  Releases,
} from '../../tools/deploy.mjs';
import { SiteHeaders } from '../../tools/site-headers.mjs';
import { RepositoryFiles } from '../support/repository-files.js';

const TOOL = join(import.meta.dirname, '..', '..', 'tools', 'deploy.mjs');
const SIGNATURE = '# eklund.com.br: Hostinger (LiteSpeed / Apache)';

/** A release as the zip has it: the site for the root, and the copy of the version in its folder. */
const RELEASE = {
  '.htaccess': `${SIGNATURE}\nnew policy\n`,
  'index.html': '<p>new home</p>',
  'en/.htaccess': '# en\n',
  'en/index.html': '<p>new English home</p>',
  'assets/main-AAAAAAAA.js': 'new script',
  'assets/main-BBBBBBBB.css': 'new style',
  'assets/brand/icon-192.png': 'icon',
  'robots.txt': 'robots',
  '1.1.0/.htaccess': `${SIGNATURE}\nnew policy\n`,
  '1.1.0/index.html': '<p>new home, in its folder</p>',
  '1.1.0/assets/main-CCCCCCCC.js': 'new script, in its folder',
};

/** A folder of the server in memory, which writes down every operation that changes it. */
class MemoryServer {
  entries = new Map();
  operations = [];

  constructor(files = {}) {
    for (const [path, text] of Object.entries(files)) this.put(path, text);
  }

  /** A file (or, for a path that ends with a slash, a folder), with every folder above it. */
  put(path, text = '') {
    const names = path.split('/').filter(Boolean);
    for (let length = 1; length < names.length; length++)
      this.entries.set(`/${names.slice(0, length).join('/')}`, { type: 'folder' });
    if (path.endsWith('/')) this.entries.set(`/${names.join('/')}`, { type: 'folder' });
    else this.entries.set(path, { type: 'file', size: Buffer.byteLength(text), text });
  }

  async list(folder) {
    if (folder !== '/' && this.entries.get(folder.slice(0, -1))?.type !== 'folder')
      throw new Error(`550 ${folder}: No such file or directory`);
    return [...this.entries]
      .filter(([path]) => path.startsWith(folder) && !path.slice(folder.length).includes('/'))
      .map(([path, { type, size = 0 }]) => ({ name: path.slice(folder.length), type, size }));
  }

  async read(path) {
    if (this.entries.get(path)?.type !== 'file') throw new Error(`550 ${path}: No such file`);
    return this.entries.get(path).text;
  }

  async upload(localPath, path) {
    this.operations.push(['upload', path]);
    const text = readFileSync(localPath, 'utf8');
    this.entries.set(path, { type: 'file', size: Buffer.byteLength(text), text });
  }

  async rename(from, to) {
    this.operations.push(['rename', from, to]);
    this.entries.set(to, this.entries.get(from));
    this.entries.delete(from);
  }

  async remove(path) {
    this.operations.push(['remove', path]);
    this.entries.delete(path);
  }

  async makeFolder(path) {
    this.operations.push(['makeFolder', path]);
    this.entries.set(path, { type: 'folder' });
  }

  async removeFolder(path) {
    this.operations.push(['removeFolder', path]);
    if ([...this.entries.keys()].some((other) => other.startsWith(`${path}/`)))
      throw new Error(`550 ${path}: Directory not empty`);
    this.entries.delete(path);
  }

  close() {
    this.operations.push(['close']);
  }

  /** Every file under `folder`, with its text, sorted by path. */
  files(folder = '/') {
    return Object.fromEntries(
      [...this.entries]
        .filter(([path, { type }]) => type === 'file' && path.startsWith(folder))
        .map(([path, { text }]) => [path, text])
        .sort(([a], [b]) => DeployPlan.byName(a, b)),
    );
  }
}

/** The files of a local folder made for a test, removed afterwards. */
const folders = [];
const localFolder = (files) => {
  const folder = mkdtempSync(join(tmpdir(), 'deploy-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, dirname(path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  folders.push(folder);
  return folder;
};
const sizes = (files) =>
  new Map(Object.entries(files).map(([path, text]) => [path, Buffer.byteLength(text)]));
const listing = (entries) =>
  new Map(
    Object.entries(entries).map(([path, size]) =>
      size === 'folder' ? [path, { type: 'folder', size: 0 }] : [path, { type: 'file', size }],
    ),
  );

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('DeployPlan', () => {
  it('uploads the hashed files first, then the other files, then the .htaccess files and the pages, the deepest first and the home page last', () => {
    expect(DeployPlan.make({ files: sizes(RELEASE), remote: new Map() }).uploads).toStrictEqual([
      '1.1.0/assets/main-CCCCCCCC.js',
      'assets/main-AAAAAAAA.js',
      'assets/main-BBBBBBBB.css',
      'assets/brand/icon-192.png',
      'robots.txt',
      '1.1.0/.htaccess',
      'en/.htaccess',
      '1.1.0/index.html',
      'en/index.html',
      '.htaccess',
      'index.html',
    ]);
  });

  it('creates the folders of the release that the server lacks, each one after the folder it is in', () => {
    expect(
      DeployPlan.make({ files: sizes(RELEASE), remote: listing({ assets: 'folder' }) }).folders,
    ).toStrictEqual(['1.1.0', 'en', '1.1.0/assets', 'assets/brand']);
  });

  it('skips a hashed file the server has with the same size, and sends every other file again, whatever its size', () => {
    const plan = DeployPlan.make({
      files: sizes(RELEASE),
      remote: listing({
        'assets/main-AAAAAAAA.js': Buffer.byteLength(RELEASE['assets/main-AAAAAAAA.js']),
        'assets/main-BBBBBBBB.css': 1,
        'robots.txt': Buffer.byteLength(RELEASE['robots.txt']),
        'index.html': Buffer.byteLength(RELEASE['index.html']),
      }),
    });
    expect([
      plan.unchanged,
      ['assets/main-BBBBBBBB.css', 'robots.txt', 'index.html'].map((path) =>
        plan.uploads.includes(path),
      ),
    ]).toStrictEqual([['assets/main-AAAAAAAA.js'], [true, true, true]]);
  });

  it('deletes what the release no longer has and the folders that end up empty, the deepest first', () => {
    const plan = DeployPlan.make({
      files: sizes(RELEASE),
      remote: listing({
        css: 'folder',
        'css/site.css': 10,
        js: 'folder',
        'js/old': 'folder',
        'js/old/main.js': 10,
        'old.html': 10,
        'assets/main-Older001.js': 10,
      }),
    });
    expect([plan.deletions, plan.emptied]).toStrictEqual([
      ['assets/main-Older001.js', 'css/site.css', 'js/old/main.js', 'old.html'],
      ['js/old', 'css', 'js'],
    ]);
  });

  it('keeps the files of the release before for one more deploy, and the folder that holds them', () => {
    const plan = DeployPlan.make({
      files: sizes(RELEASE),
      remote: listing({
        'assets/main-PREVIOUS.js': 10,
        'assets/main-Older001.js': 10,
        legacy: 'folder',
        'legacy/page.html': 10,
      }),
      keep: new Set(['assets/main-PREVIOUS.js', 'legacy/page.html']),
    });
    expect([plan.kept, plan.deletions, plan.emptied]).toStrictEqual([
      ['assets/main-PREVIOUS.js', 'legacy/page.html'],
      ['assets/main-Older001.js'],
      [],
    ]);
  });

  it('leaves alone the copies of other versions, pre-releases too, and a folder deployed to on its own, and syncs the folder of this version', () => {
    const plan = DeployPlan.make({
      files: sizes(RELEASE),
      remote: listing({
        '1.0.0': 'folder',
        '1.0.0/index.html': 10,
        '1.2.0-rc.1': 'folder',
        gustavo: 'folder',
        'gustavo/index.html': 10,
        '1.1.0': 'folder',
        '1.1.0/stale.js': 10,
      }),
      nested: ['gustavo'],
    });
    expect([plan.deletions, plan.emptied]).toStrictEqual([['1.1.0/stale.js'], []]);
  });

  it('refuses to put a file where the server has a folder, and a folder where it has a file', () => {
    expect(() =>
      DeployPlan.make({ files: sizes(RELEASE), remote: listing({ 'robots.txt': 'folder' }) }),
    ).toThrow('robots.txt is a file in the release and something else on the server');
    expect(() => DeployPlan.make({ files: sizes(RELEASE), remote: listing({ en: 10 }) })).toThrow(
      'en/ is a folder in the release and something else on the server',
    );
  });

  it('tells a hashed file and a folder named after a version by their names', () => {
    expect([
      [
        'assets/main-AbCd_-12.js',
        'assets/brand/icon-192.png',
        'main-AbCd1234.js',
        '1.1.0/assets/x-AbCd1234.woff2',
      ].map((path) => DeployPlan.HASHED.test(path)),
      ['1.1.0', '10.20.30', '1.1.0-rc.1', '1.1', 'v1.1.0', 'assets'].map((name) =>
        DeployPlan.VERSION_FOLDER.test(name),
      ),
    ]).toStrictEqual([
      [true, false, false, true],
      [true, true, true, false, false, false],
    ]);
  });
});

describe('Deployment', () => {
  const deploy = async (server, options) => {
    const lines = [];
    await new Deployment({ server, log: (line) => lines.push(line), token: 'TOKEN' }).upload(
      options,
    );
    return lines;
  };

  it('puts the release in each folder, deletes what it no longer has, and leaves the mirror and the other versions alone', async () => {
    const server = new MemoryServer({
      '/.htaccess': `${SIGNATURE}\nold policy\n`,
      '/index.html': '<p>old home</p>',
      '/css/site.css': 'old style',
      '/1.0.0/index.html': '<p>1.0.0</p>',
      '/gustavo/.htaccess': `${SIGNATURE}\nold policy\n`,
      '/gustavo/index.html': '<p>old home</p>',
      '/gustavo/1.0.0/index.html': '<p>1.0.0</p>',
    });
    await deploy(server, { site: localFolder(RELEASE), into: ['/gustavo/', '/'] });
    const expected = (folder) =>
      Object.fromEntries(Object.entries(RELEASE).map(([path, text]) => [`${folder}${path}`, text]));
    expect(server.files()).toStrictEqual(
      Object.fromEntries(
        Object.entries({
          ...expected('/'),
          '/1.0.0/index.html': '<p>1.0.0</p>',
          ...expected('/gustavo/'),
          '/gustavo/1.0.0/index.html': '<p>1.0.0</p>',
        }).sort(([a], [b]) => DeployPlan.byName(a, b)),
      ),
    );
    expect(server.entries.has('/css')).toBe(false);
  });

  it('sends every file under a temporary name first and renames them in the order of the plan, so no file is ever seen half written', async () => {
    const server = new MemoryServer({ '/.htaccess': `${SIGNATURE}\n`, '/old.txt': 'old' });
    await deploy(server, { site: localFolder(RELEASE), into: ['/'] });
    const uploads = DeployPlan.make({ files: sizes(RELEASE), remote: new Map() }).uploads;
    const temporary = (path) =>
      path.includes('/')
        ? `/${path.replace(/\/([^/]+)$/, '/.deploy-TOKEN-$1')}`
        : `/.deploy-TOKEN-${path}`;
    expect(server.operations).toStrictEqual([
      ...['/1.1.0', '/assets', '/en', '/1.1.0/assets', '/assets/brand'].map((path) => [
        'makeFolder',
        path,
      ]),
      ...uploads.map((path) => ['upload', temporary(path)]),
      ...uploads.map((path) => ['rename', temporary(path), `/${path}`]),
      ['remove', '/old.txt'],
    ]);
  });

  it('keeps the files of the release before, from the local folder that holds it', async () => {
    const server = new MemoryServer({
      '/.htaccess': `${SIGNATURE}\n`,
      '/assets/main-PREVIOUS.js': 'previous script',
      '/assets/main-Older001.js': 'older script',
    });
    await deploy(server, {
      site: localFolder(RELEASE),
      into: ['/'],
      keep: localFolder({ 'assets/main-PREVIOUS.js': 'previous script', 'index.html': '' }),
    });
    expect([
      server.entries.has('/assets/main-PREVIOUS.js'),
      server.entries.has('/assets/main-Older001.js'),
    ]).toStrictEqual([true, false]);
  });

  it('changes nothing on a dry run, and says what it would do', async () => {
    const server = new MemoryServer({
      '/.htaccess': `${SIGNATURE}\n`,
      '/old.txt': 'old',
      '/assets/main-AAAAAAAA.js': RELEASE['assets/main-AAAAAAAA.js'],
    });
    const before = server.files();
    const lines = await deploy(server, { site: localFolder(RELEASE), into: ['/'], dryRun: true });
    expect([server.files(), server.operations, lines.slice(0, 2), lines.at(-2)]).toStrictEqual([
      before,
      [],
      [
        '/: would upload 10 files (1 already there), would delete 1, keep 0 of the release before',
        '  + 1.1.0/',
      ],
      '  + index.html',
    ]);
  });

  it('changes nothing in a folder that holds files but not the .htaccess of this site, such as the home folder above public_html', async () => {
    const server = new MemoryServer({
      '/.bashrc': 'shell',
      '/public_html/index.html': 'the site',
    });
    await expect(deploy(server, { site: localFolder(RELEASE), into: ['/'] })).rejects.toThrow(
      `/ holds files but not the .htaccess of this site (its first line is "", not "${SIGNATURE}"), so the deploy leaves it as it is. Check the folder the FTP account starts in.`,
    );
    expect(server.operations).toStrictEqual([]);
  });

  it('creates the folder a pre-release goes to, in the mirror too, and asks for no .htaccess, since nothing is deleted there', async () => {
    const server = new MemoryServer({ '/gustavo/index.html': '<p>home</p>' });
    await deploy(server, {
      site: localFolder({ 'index.html': '<p>rc</p>', '.htaccess': `${SIGNATURE}\n` }),
      into: ['/gustavo/1.2.0-rc.1/', '/1.2.0-rc.1/'],
    });
    expect([
      server.files(),
      server.operations.filter(([name]) => name === 'makeFolder'),
    ]).toStrictEqual([
      {
        '/1.2.0-rc.1/.htaccess': `${SIGNATURE}\n`,
        '/1.2.0-rc.1/index.html': '<p>rc</p>',
        '/gustavo/1.2.0-rc.1/.htaccess': `${SIGNATURE}\n`,
        '/gustavo/1.2.0-rc.1/index.html': '<p>rc</p>',
        '/gustavo/index.html': '<p>home</p>',
      },
      [
        ['makeFolder', '/gustavo/1.2.0-rc.1'],
        ['makeFolder', '/1.2.0-rc.1'],
      ],
    ]);
  });

  it('lists the files of a local folder with their size, hidden ones included, in the order of their names', async () => {
    const files = await Deployment.filesIn(
      localFolder({ 'b.txt': 'bb', '.h': 'h', 'a/c.txt': 'ccc' }),
    );
    expect([...files]).toStrictEqual([
      ['.h', 1],
      ['a/c.txt', 3],
      ['b.txt', 2],
    ]);
  });
});

describe('FtpServer', () => {
  /** The commands a basic-ftp client gets, from a server that refuses MKD for some folders and lets the client enter others. */
  const client = ({ refused = [], enterable = [] }) => {
    const calls = [];
    return {
      calls,
      send: async (command) => {
        calls.push(command);
        if (refused.some((path) => command === `MKD ${path}`))
          throw new Error(`550 ${command.slice(4)}: File exists`);
      },
      cd: async (path) => {
        calls.push(`CWD ${path}`);
        if (!enterable.includes(path)) throw new Error(`550 ${path}: No such file or directory`);
      },
    };
  };

  it('makes a folder with MKD', async () => {
    const ftp = client({});
    await new FtpServer(ftp).makeFolder('/assets');
    expect(ftp.calls).toStrictEqual(['MKD /assets']);
  });

  it('takes a folder the server refuses to make as made when the server can enter it: a hidden folder its listing left out', async () => {
    const ftp = client({ refused: ['/.well-known'], enterable: ['/.well-known'] });
    await new FtpServer(ftp).makeFolder('/.well-known');
    expect(ftp.calls).toStrictEqual(['MKD /.well-known', 'CWD /.well-known']);
  });

  it('fails with the error of MKD when the folder is neither made nor there', async () => {
    const ftp = client({ refused: ['/assets'] });
    await expect(new FtpServer(ftp).makeFolder('/assets')).rejects.toThrow(
      '550 /assets: File exists',
    );
    expect(ftp.calls).toStrictEqual(['MKD /assets', 'CWD /assets']);
  });
});

describe('LiveCheck', () => {
  const page = '<html><script>x()</script></html>';
  const respond = (body, policy = SiteHeaders.contentSecurityPolicy(page), status = 200) => ({
    status,
    text: async () => body,
    headers: new Headers({ 'content-security-policy': policy }),
  });

  it('knows the pages of a release by the address each one has: index.html is the folder', () => {
    expect(
      LiveCheck.pagesOf(
        sizes({ 'index.html': '', 'en/index.html': '', '1.1.0/index.html': '', 'a.html': '' }),
      ),
    ).toStrictEqual([
      { path: 'index.html', address: '' },
      { path: '1.1.0/index.html', address: '1.1.0/' },
      { path: 'en/index.html', address: 'en/' },
    ]);
  });

  it('passes when every page answers with the page of the release and the policy that allows its script', async () => {
    const asked = [];
    const check = new LiveCheck({
      fetch: async (url) => {
        asked.push(url);
        return respond(page);
      },
      attempts: 1,
    });
    const site = localFolder({ 'index.html': page, 'en/index.html': page });
    expect(
      await check.run({ site, at: ['https://eklund.com.br/', 'https://gustavo.eklund.com.br/'] }),
    ).toStrictEqual([]);
    expect(asked).toStrictEqual([
      'https://eklund.com.br/',
      'https://eklund.com.br/en/',
      'https://gustavo.eklund.com.br/',
      'https://gustavo.eklund.com.br/en/',
    ]);
  });

  it('asks again while the server still answers with the page before', async () => {
    const answers = [respond('<p>old</p>'), respond(page)];
    const check = new LiveCheck({ fetch: async () => answers.shift(), attempts: 3, pause: 0 });
    expect(
      await check.run({
        site: localFolder({ 'index.html': page }),
        at: ['https://eklund.com.br/'],
      }),
    ).toStrictEqual([]);
  });

  it('says which page is not the release, which policy is wrong and which address does not answer', async () => {
    const answers = {
      'https://a.test/': respond('<p>old</p>'),
      'https://b.test/': respond(page, "default-src 'self'"),
      'https://c.test/': respond('', '', 404),
    };
    const check = new LiveCheck({ fetch: async (url) => answers[url], attempts: 2, pause: 0 });
    expect(
      await check.run({
        site: localFolder({ 'index.html': page }),
        at: ['https://a.test/', 'https://b.test/', 'https://c.test/'],
      }),
    ).toStrictEqual([
      'https://a.test/: the page is not the one of the release',
      'https://b.test/: the Content-Security-Policy does not allow the inline script of the page',
      'https://c.test/: status 404',
    ]);
  });
});

describe('Releases.previous', () => {
  it.each([
    [
      'v1.2.0',
      ['v1.0.0', 'v1.1.0', 'v1.2.0'],
      'v1.1.0',
      'the newest release goes up: the one before it was online',
    ],
    [
      'v1.0.0',
      ['v1.0.0', 'v1.1.0', 'v1.2.0'],
      'v1.2.0',
      'an older release goes back up: the newest was online',
    ],
    [
      'v1.10.0',
      ['v1.9.0', 'v1.10.0', 'v1.2.0'],
      'v1.9.0',
      'versions compare as numbers, not as text',
    ],
    [
      'v1.1.0',
      ['v1.1.0', 'v1.2.0-rc.1', '', 'latest', 'v1.0.0'],
      'v1.0.0',
      'pre-releases and other names do not count',
    ],
    ['v1.0.0', ['v1.0.0'], null, 'the first release has nothing before it'],
  ])('for %s among %j it is %s: %s', (tag, tags, expected) =>
    expect(Releases.previous(tag, tags)).toBe(expected),
  );
});

describe('DeployCommand', () => {
  it('reads the folder of the release, the folders of the server, the release to keep and the dry run', () => {
    expect(
      DeployCommand.options([
        'site',
        '--into',
        '/gustavo/',
        '--into',
        '/',
        '--keep',
        'previous',
        '--dry-run',
      ]),
    ).toStrictEqual({
      site: 'site',
      into: ['/gustavo/', '/'],
      at: [],
      keep: 'previous',
      dryRun: true,
    });
  });

  it.each([
    [['upload', 'site'], {}, 'say where the release goes, with --into /folder/'],
    [
      ['upload', 'site', '--into', 'gustavo'],
      {},
      'gustavo is not a folder written from the root, like / or /mirror/',
    ],
    [
      ['upload', 'site', '--into', '/'],
      { FTP_HOST: 'h' },
      'FTP_HOST, FTP_USER and FTP_PASSWORD are needed',
    ],
    [['upload', 'site', '--into', '/', '--force'], {}, 'unknown option --force'],
    [['check', 'site'], {}, 'say where to look, with --at https://host/folder/'],
  ])('refuses %j', async (argv, environment, message) => {
    await expect(new DeployCommand({ environment }).run(argv)).rejects.toThrow(message);
  });

  it('connects with the certificate name of FTP_TLS_NAME, uploads, closes the connection and says where the release went', async () => {
    const server = new MemoryServer({});
    const opened = [];
    const command = new DeployCommand({
      environment: {
        FTP_HOST: '192.0.2.1',
        FTP_USER: 'user',
        FTP_PASSWORD: 'secret',
        FTP_TLS_NAME: 'example.test',
      },
      open: async (connection) => {
        opened.push(connection);
        return server;
      },
      log: () => {},
    });
    const result = await command.run(['upload', localFolder({ 'index.html': 'x' }), '--into', '/']);
    expect([opened, result, server.operations.at(-1)]).toStrictEqual([
      [{ host: '192.0.2.1', user: 'user', password: 'secret', tlsName: 'example.test' }],
      { lines: ['upload: the release is in /'], code: 0 },
      ['close'],
    ]);
  });

  it('prints the release to keep, from the tags on standard input, as a process', () => {
    const result = spawnSync(process.execPath, [TOOL, 'previous', 'v1.1.0'], {
      input: 'v1.0.0\nv1.1.0\nv1.1.1-rc.1\n',
      encoding: 'utf8',
    });
    expect([result.status, result.stdout, result.stderr]).toStrictEqual([0, 'v1.0.0\n', '']);
  });

  it('prints its usage and exits with 2 without a command', () => {
    const result = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      2,
      '',
      'usage: node tools/deploy.mjs upload SITE --into /FOLDER/ | check SITE --at URL | previous TAG\n',
    ]);
  });
});

describe('the steps of the Deploy workflow', () => {
  /** The script of a step of deploy.yml, by the name of the step. */
  const script = (name) =>
    new RegExp(`- name: ${name}\\n(?: {8}.+\\n)*? {8}run: \\|\\n((?: {10}.*\\n| *\\n)+)`)
      .exec(RepositoryFiles.read('.github/workflows/deploy.yml'))[1]
      .replace(/^ {10}/gm, '');
  /** Runs a step in bash with `node` printing the arguments it would give the tool, in a folder that holds `previous` or not. */
  const run = (name, environment, { previous = false } = {}) => {
    const folder = mkdtempSync(join(tmpdir(), 'deploy-step-'));
    folders.push(folder);
    if (previous) mkdirSync(join(folder, 'previous'));
    return spawnSync('bash', ['-ec', `node() { shift; echo "$*"; }\n${script(name)}`], {
      cwd: folder,
      env: { PATH: process.env.PATH, ...environment },
      encoding: 'utf8',
    });
  };

  it.each([
    [
      'a release goes to the mirror, then to the root',
      { TAG: 'v1.2.0', DRY_RUN: '' },
      false,
      'upload site --into /gustavo/ --into /\n',
    ],
    [
      'with the files of the release before, on a dry run',
      { TAG: 'v1.2.0', DRY_RUN: 'true' },
      true,
      'upload site --into /gustavo/ --into / --keep previous --dry-run\n',
    ],
    [
      'a pre-release goes only to its own folder, in the mirror and at the root',
      { TAG: 'v1.3.0-rc.1', DRY_RUN: 'false' },
      true,
      'upload site/1.3.0-rc.1 --into /gustavo/1.3.0-rc.1/ --into /1.3.0-rc.1/\n',
    ],
  ])('Upload: %s', (_title, environment, previous, expected) => {
    const { status, stdout, stderr } = run('Upload', environment, { previous });
    expect([status, stdout, stderr]).toStrictEqual([0, expected, '']);
  });

  it.each([
    ['v1.2.0', 'check site --at https://eklund.com.br/ --at https://gustavo.eklund.com.br/\n'],
    [
      'v1.3.0-rc.1',
      'check site/1.3.0-rc.1 --at https://eklund.com.br/1.3.0-rc.1/ --at https://gustavo.eklund.com.br/1.3.0-rc.1/\n',
    ],
  ])('Check the pages online, for %s', (tag, expected) => {
    const { status, stdout, stderr } = run('Check the pages online', { TAG: tag });
    expect([status, stdout, stderr]).toStrictEqual([0, expected, '']);
  });

  it.each([['latest'], ['v1.2'], ['v1.2.0; rm -rf ~'], ['1.2.0']])(
    'Download the release and check it: refuses %j before it asks GitHub for anything',
    (tag) => {
      const { status, stdout } = run('Download the release and check it', { TAG: tag });
      expect([status, stdout]).toStrictEqual([
        1,
        `::error::"${tag}" is not the tag of a release, like v1.1.0\n`,
      ]);
    },
  );
});

describe('the Deploy workflow, when Release calls it', () => {
  it('gets each secret of the FTP account by name, and requires all three', () => {
    // A workflow that another one calls gets a secret of its environment only when the caller passes it, and an empty
    // string otherwise, with no error.
    const account = ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD'];
    const deploy = RepositoryFiles.read('.github/workflows/deploy.yml');
    const secretsOf = (text) => /^ {4}secrets:\n((?: {6}.*\n)+)/m.exec(text)?.[1] ?? '';
    expect([
      [...deploy.matchAll(/\$\{\{ secrets\.(\w+) \}\}/g)].map(([, name]) => name),
      [...secretsOf(deploy).matchAll(/^ {6}(\w+):\n(?: {8}.*\n)*? {8}required: true\n/gm)].map(
        ([, name]) => name,
      ),
      [
        ...secretsOf(RepositoryFiles.read('.github/workflows/release.yml')).matchAll(
          /^ {6}(\w+): \$\{\{ secrets\.\1 \}\}\n/gm,
        ),
      ].map(([, name]) => name),
    ]).toStrictEqual([account, account, account]);
  });
});
