// Tells the search engines that take IndexNow (Bing, Yandex, Seznam, Naver and others share what one of them receives) that a
// release changed the pages, so they fetch them again without waiting for their next visit. The Release workflow runs it once
// the release is online. The key is public by design: it is the name and the content of a text file at the root of the site,
// which proves to the engines that the site itself sent the list.
// usage: node tools/index-now.mjs 1.2.0
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE = resolve(fileURLToPath(new URL('..', import.meta.url)), 'source');
const KEY_FILE = /^([0-9a-f]{32})\.txt$/;

export class IndexNow {
  static HOST = 'eklund.com.br';
  static ENDPOINT = 'https://api.indexnow.org/indexnow';

  /** The key: the one file at the root of the site named after its own content. */
  static key(root = SOURCE) {
    const keys = readdirSync(root)
      .map((name) => KEY_FILE.exec(name)?.[1])
      .filter((key) => key && readFileSync(join(root, `${key}.txt`), 'utf8') === key);
    if (keys.length !== 1)
      throw new Error(
        `the root of the site needs one IndexNow key file, and it has ${keys.length}`,
      );
    return keys[0];
  }

  /** What a release asks the engines to fetch again: both pages and the folder of the release. */
  static body(key, version) {
    const site = `https://${IndexNow.HOST}`;
    return {
      host: IndexNow.HOST,
      key,
      keyLocation: `${site}/${key}.txt`,
      urlList: [`${site}/`, `${site}/en/`, `${site}/${version}/`],
    };
  }

  /** IndexNow answers 200 or 202 when it took the list; anything else fails the step, which says what it got. */
  static async ping({ key, version, fetch }) {
    const response = await fetch(IndexNow.ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(IndexNow.body(key, version)),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 200 && response.status !== 202)
      throw new Error(`IndexNow answered ${response.status}: ${(await response.text()).trim()}`);
    return response.status;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2] ?? '';
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.]+)?$/.test(version))
    throw new Error('usage: node tools/index-now.mjs <version>, such as 1.2.0');
  const status = await IndexNow.ping({
    key: IndexNow.key(),
    version,
    fetch: globalThis.fetch.bind(globalThis),
  });
  console.log(`IndexNow took the pages of ${version} (${status})`);
}
