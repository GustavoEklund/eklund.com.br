import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexNow } from '../../tools/index-now.mjs';
import { SiteBuild } from '../../tools/site-build.mjs';
import { SiteSource } from '../support/site-source.js';

/** The site's own key, read from the file at the root of source/: the tests never write a key out. */
const KEY = IndexNow.key();

describe('tools/index-now.mjs', () => {
  let folder;

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'index-now-test-'));
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it('finds the key of the site, a file at its root named after its content, which the build copies', () => {
    const key = IndexNow.key();
    expect([
      /^[0-9a-f]{32}$/.test(key),
      SiteSource.read(`${key}.txt`),
      SiteBuild.STATIC_FILES.includes(`${key}.txt`),
    ]).toStrictEqual([true, key, true]);
  });

  it('refuses a root with no key file, or with two, and ignores a file whose content is not its name', () => {
    writeFileSync(join(folder, `${'f'.repeat(32)}.txt`), 'something else');
    expect(() => IndexNow.key(folder)).toThrow(
      'the root of the site needs one IndexNow key file, and it has 0',
    );
    writeFileSync(join(folder, `${KEY}.txt`), KEY);
    writeFileSync(join(folder, `${'a'.repeat(32)}.txt`), 'a'.repeat(32));
    expect(() => IndexNow.key(folder)).toThrow(
      'the root of the site needs one IndexNow key file, and it has 2',
    );
  });

  it('posts both pages and the folder of the release, with the key and where it is', async () => {
    const asked = [];
    const status = await IndexNow.ping({
      key: KEY,
      version: '1.2.0',
      fetch: async (url, init) => {
        asked.push([url, init.method, init.headers, JSON.parse(init.body)]);
        return new Response(null, { status: 202 });
      },
    });
    expect([status, asked]).toStrictEqual([
      202,
      [
        [
          'https://api.indexnow.org/indexnow',
          'POST',
          { 'content-type': 'application/json; charset=utf-8' },
          {
            host: 'eklund.com.br',
            key: KEY,
            keyLocation: `https://eklund.com.br/${KEY}.txt`,
            urlList: [
              'https://eklund.com.br/',
              'https://eklund.com.br/en/',
              'https://eklund.com.br/1.2.0/',
            ],
          },
        ],
      ],
    ]);
  });

  it('fails the step when IndexNow does not take the list, saying what it answered', async () => {
    await expect(
      IndexNow.ping({
        key: KEY,
        version: '1.2.0',
        fetch: async () => new Response('Key not valid\n', { status: 403 }),
      }),
    ).rejects.toThrow('IndexNow answered 403: Key not valid');
  });
});
