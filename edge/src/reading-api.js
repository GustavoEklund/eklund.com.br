import { ReadingInputs } from './reading-inputs.js';

const PREFIX = '/api/v1';

/**
 * The readings as JSON: `GET /api/v1` lists them, and `GET /api/v1/<reading>?from=…&to=…` answers one, with the inputs of
 * the MCP tool of the same name as query parameters. Nothing else is read, and a parameter given twice is refused.
 */
export class ReadingApi {
  static PREFIX = PREFIX;

  #queries;

  constructor(queries) {
    this.#queries = queries;
  }

  async handle(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return ReadingApi.#json(405, { error: 'only GET reads here' }, { allow: 'GET, HEAD' });
    const url = new URL(request.url);
    const name =
      url.pathname === PREFIX || url.pathname === `${PREFIX}/`
        ? ''
        : url.pathname.slice(PREFIX.length + 1);
    if (name === '')
      return ReadingApi.#json(200, {
        readings: ReadingInputs.NAMES.map((reading) => ({
          name: reading,
          path: `${PREFIX}/${reading}`,
          description: ReadingInputs.TOOLS[reading].description,
        })),
      });
    if (!Object.hasOwn(ReadingInputs.TOOLS, name))
      return ReadingApi.#json(404, { error: `no reading is called ${name}` });
    const keys = [...url.searchParams.keys()];
    const twice = keys.find((key, index) => keys.indexOf(key) !== index);
    if (twice) return ReadingApi.#json(400, { error: `${twice} is given more than once` });
    const parsed = ReadingInputs.parse(name, Object.fromEntries(url.searchParams));
    if (!parsed.ok) return ReadingApi.#json(400, { error: parsed.reason });
    return ReadingApi.#json(200, await this.#queries.run(name, parsed.input));
  }

  static #json(status, body, extra = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...extra,
      },
    });
  }
}
