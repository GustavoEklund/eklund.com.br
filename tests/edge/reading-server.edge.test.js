import { describe, it, expect, beforeEach } from 'vitest';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { ReadingInputs } from '../../edge/src/reading-inputs.js';
import { ReadingServer } from '../../edge/src/reading-server.js';
import { ReadingSession } from '../support/reading-session.js';

describe('ReadingServer, served by the stateless handler of the MCP SDK', () => {
  let calls;
  let failure;
  /** The queries: each call recorded, answered with what it was asked, or with `failure` thrown. */
  const queries = {
    run: async (name, input) => {
      calls.push([name, input]);
      if (failure) throw failure;
      return { reading: name, input, sample: { size: 3, minimum: 20, enough: false } };
    },
  };
  /** One JSON-RPC request, as a 2025-11-25 client sends it, and the message that answers it. */
  const rpc = async (id, method, params) =>
    ReadingSession.message(
      await createMcpHandler(() => new ReadingServer(queries).create()).fetch(
        new Request('https://eklund.example.workers.dev/mcp', {
          method: 'POST',
          headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
            'mcp-protocol-version': '2025-11-25',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
        }),
      ),
    );

  beforeEach(() => {
    [calls, failure] = [[], null];
  });

  it('introduces itself with a name, a version, tools and instructions that ask to respect small samples', async () => {
    const { result } = await rpc(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'a-client', version: '1.0.0' },
    });
    expect([
      result.protocolVersion,
      result.serverInfo,
      Object.keys(result.capabilities),
      result.instructions.split('\n').at(-1),
    ]).toStrictEqual([
      '2025-11-25',
      { name: 'eklund.com.br', version: '1.0.0' },
      ['tools'],
      'when it is too small, say so instead of drawing a conclusion. Days are UTC.',
    ]);
  });

  it('lists one read-only tool for each reading, whose input refuses any field it does not name', async () => {
    const { tools } = (await rpc(2, 'tools/list')).result;
    expect([
      tools.map(({ name }) => name),
      [...new Set(tools.map(({ annotations }) => JSON.stringify(annotations)))],
      [...new Set(tools.map(({ inputSchema }) => inputSchema.additionalProperties))],
      tools.find(({ name }) => name === 'compare_lab').inputSchema.required,
    ]).toStrictEqual([
      ReadingInputs.NAMES,
      ['{"readOnlyHint":true,"idempotentHint":true,"openWorldHint":false}'],
      [false],
      ['before_from', 'before_to', 'after_from', 'after_to', 'metric', 'page', 'form_factor'],
    ]);
  });

  it('answers a call with the reading as text and as structured content', async () => {
    const { result } = await rpc(3, 'tools/call', {
      name: 'lab',
      arguments: { from: '2026-11-01', to: '2026-11-08', page: '/en/' },
    });
    const answer = {
      reading: 'lab',
      input: { from: '2026-11-01', to: '2026-11-08', page: '/en/' },
      sample: { size: 3, minimum: 20, enough: false },
    };
    expect([result, calls]).toStrictEqual([
      { content: [{ type: 'text', text: JSON.stringify(answer) }], structuredContent: answer },
      [['lab', { from: '2026-11-01', to: '2026-11-08', page: '/en/' }]],
    ]);
  });

  it('refuses arguments that the reading does not accept before any query runs', async () => {
    const answers = [
      await rpc(4, 'tools/call', {
        name: 'uptime',
        arguments: { from: '2026-11-09', to: '2026-11-08' },
      }),
      await rpc(5, 'tools/call', {
        name: 'overview',
        arguments: { from: '2026-11-01', to: '2026-11-08', sql: 'DROP TABLE page_view' },
      }),
    ];
    expect([answers.map(({ result }) => result), calls]).toStrictEqual([
      [
        {
          content: [
            {
              type: 'text',
              text: 'Input validation error: Invalid arguments for tool uptime: to: to comes before from',
            },
          ],
          isError: true,
        },
        {
          content: [
            {
              type: 'text',
              text: 'Input validation error: Invalid arguments for tool overview: Unrecognized key: "sql"',
            },
          ],
          isError: true,
        },
      ],
      [],
    ]);
  });

  it('answers a 2026-07-28 client too, which sends its version in each request instead of a handshake', async () => {
    const response = await createMcpHandler(() => new ReadingServer(queries).create()).fetch(
      new Request('https://eklund.example.workers.dev/mcp', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': 'certificates',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'certificates',
            arguments: {},
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'a-client', version: '2.0.0' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
    );
    const { result } = await ReadingSession.message(response);
    expect([response.status, result.structuredContent.reading, calls]).toStrictEqual([
      200,
      'certificates',
      [['certificates', {}]],
    ]);
  });

  it('answers a failed query as an error of the tool, with its message', async () => {
    failure = new Error('D1 is unavailable');
    expect(
      (await rpc(6, 'tools/call', { name: 'certificates', arguments: {} })).result,
    ).toStrictEqual({
      content: [{ type: 'text', text: 'D1 is unavailable' }],
      isError: true,
    });
  });
});
