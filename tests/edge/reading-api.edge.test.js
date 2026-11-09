import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingApi } from '../../edge/src/reading-api.js';
import { ReadingInputs } from '../../edge/src/reading-inputs.js';

const WORKER = 'https://eklund.example.workers.dev';

describe('ReadingApi', () => {
  let calls;
  const queries = {
    run: async (name, input) => {
      calls.push([name, input]);
      return { reading: name };
    },
  };
  const get = async (path, method = 'GET') => {
    const response = await new ReadingApi(queries).handle(
      new Request(`${WORKER}${path}`, { method }),
    );
    return [
      response.status,
      response.headers.get('content-type'),
      response.headers.get('cache-control'),
      await response.json(),
    ];
  };

  beforeEach(() => {
    calls = [];
  });

  it('lists every reading with its path and what it answers', async () => {
    expect([await get('/api/v1'), await get('/api/v1/')]).toStrictEqual(
      Array(2).fill([
        200,
        'application/json; charset=utf-8',
        'no-store',
        {
          readings: ReadingInputs.NAMES.map((name) => ({
            name,
            path: `/api/v1/${name}`,
            description: ReadingInputs.TOOLS[name].description,
          })),
        },
      ]),
    );
  });

  it('answers a reading with the inputs of its query string, checked like the MCP tool of the same name', async () => {
    expect([await get('/api/v1/overview?from=2026-11-01&to=2026-11-08'), calls]).toStrictEqual([
      [200, 'application/json; charset=utf-8', 'no-store', { reading: 'overview' }],
      [['overview', { from: '2026-11-01', to: '2026-11-08' }]],
    ]);
  });

  it('refuses a reading it does not have, wrong inputs, a parameter given twice and any method but GET', async () => {
    const answers = [
      await get('/api/v1/tables'),
      await get('/api/v1/overview?from=2026-11-08&to=2026-11-01'),
      await get('/api/v1/vitals?from=2026-11-01&to=2026-11-08&device=fridge'),
      await get('/api/v1/overview?from=2026-11-01&to=2026-11-08&to=2026-11-09'),
      await get('/api/v1/overview?from=2026-11-01&to=2026-11-08', 'POST'),
    ];
    expect([answers.map(([status, , , body]) => [status, body]), calls]).toStrictEqual([
      [
        [404, { error: 'no reading is called tables' }],
        [400, { error: 'to: to comes before from' }],
        [400, { error: 'device: Invalid option: expected one of "phone"|"tablet"|"desktop"' }],
        [400, { error: 'to is given more than once' }],
        [405, { error: 'only GET reads here' }],
      ],
      [],
    ]);
  });
});
