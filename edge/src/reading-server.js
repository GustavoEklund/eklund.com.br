import { McpServer } from '@modelcontextprotocol/server';
import { ReadingInputs } from './reading-inputs.js';

const INSTRUCTIONS = `Read-only measurements of eklund.com.br, a personal site with a Portuguese page at / and an English one at /en/.
Real visits are anonymous: no address, no cookie and nothing that links one visit to another. The collector keeps the rows of
visits 13 months, errors 90 days, and daily totals 25 months; the daily totals of a day are complete two days later. The lab job
runs PageSpeed Insights every night on / and /en/, five runs for mobile and five for desktop, and reads CrUX, Search Console
and Bing. Every answer says how large its sample is; when it is too small, say so instead of drawing a conclusion. Days are UTC.`;

/**
 * The MCP server of the readings: one read-only tool for each reading of ReadingInputs, answered by ReadingQueries. A server
 * is made for each request, as the stateless handler of the SDK expects, and keeps nothing between them.
 */
export class ReadingServer {
  static NAME = 'eklund.com.br';
  static VERSION = '1.0.0';

  #queries;

  constructor(queries) {
    this.#queries = queries;
  }

  create() {
    const server = new McpServer(
      { name: ReadingServer.NAME, version: ReadingServer.VERSION },
      { instructions: INSTRUCTIONS },
    );
    for (const name of ReadingInputs.NAMES) {
      const { description, listed } = ReadingInputs.TOOLS[name];
      server.registerTool(
        name,
        {
          description,
          inputSchema: listed,
          annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args) => {
          const answer = await this.#queries.run(name, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(answer) }],
            structuredContent: answer,
          };
        },
      );
    }
    return server;
  }
}
